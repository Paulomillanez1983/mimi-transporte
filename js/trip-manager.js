/**
 * Trip Manager con polling de respaldo y manejo robusto de realtime
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    console.log('[TripManager] Constructor');
    this.currentTrip = null;
    this.pendingTrip = null;
    this.subscribers = {};
    this.realtimeChannels = [];
    this.refreshInterval = null;
    this.initialized = false;
    this.lastPollTime = 0;
  }

  async init() {
    console.log('[TripManager] Iniciando...');
    
    if (this.initialized) return this;

    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) {
      console.error('[TripManager] No hay driverId, no se puede inicializar');
      throw new Error('No autenticado');
    }

    // 1. Carga inicial inmediata
    await this._loadInitialState();

    // 2. Suscribirse a realtime
    this._subscribeToRealtime();

    // 3. Polling de respaldo (cada 5 segundos, solo si no hay actividad reciente)
    this._startPolling();

    this.initialized = true;
    console.log('[TripManager] Inicializado correctamente');
    return this;
  }

  async _loadInitialState() {
    console.log('[TripManager] _loadInitialState');
    const driverId = supabaseService.getCurrentDriverId();

    try {
      // Verificar viaje activo primero
      const activeTrip = await supabaseService.getActiveTrip(driverId);
      
      if (activeTrip) {
        console.log('[TripManager] Viaje activo encontrado:', activeTrip.id);
        this.currentTrip = activeTrip;
        this._notify('tripUpdated', activeTrip);
        return;
      }

      // Buscar ofertas pendientes
      const offers = await supabaseService.getPendingOffers(driverId);
      
      if (offers && offers.length > 0) {
        // Tomar la oferta más reciente
        const offer = offers[0];
        console.log('[TripManager] Oferta pendiente encontrada:', offer.id);
        
        this.pendingTrip = {
          ...offer.viajes,
          offer_id: offer.id,
          offer_expires_at: offer.expires_at
        };
        
        this._notify('newPendingTrip', this.pendingTrip);
      } else {
        console.log('[TripManager] No hay ofertas pendientes');
        this._notify('noPendingTrips');
      }

    } catch (error) {
      console.error('[TripManager] Error en _loadInitialState:', error);
    }
  }

  _subscribeToRealtime() {
    console.log('[TripManager] Suscribiendo a realtime...');
    const driverId = supabaseService.getCurrentDriverId();

    // Limpiar suscripciones anteriores
    this._cleanupChannels();

    // Suscribirse a ofertas
    const offersChannel = supabaseService.subscribeToDriverOffers(driverId, (payload) => {
      console.log('[TripManager] [Realtime] Payload recibido:', payload);
      this._handleOfferPayload(payload);
    });

    if (offersChannel) {
      this.realtimeChannels.push(offersChannel);
    }

    // Suscribirse a viajes
    const tripsChannel = supabaseService.subscribeToDriverTrips(driverId, (payload) => {
      console.log('[TripManager] [Realtime] Viaje payload:', payload);
      this._handleTripPayload(payload);
    });

    if (tripsChannel) {
      this.realtimeChannels.push(tripsChannel);
    }
  }

  _handleOfferPayload(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    console.log(`[TripManager] Procesando ${eventType}:`, newRecord || oldRecord);

    switch (eventType) {
      case 'INSERT':
        if (newRecord?.estado === 'PENDIENTE') {
          this._fetchTripAndNotify(newRecord);
        }
        break;

      case 'UPDATE':
        // Si la oferta ya no está pendiente, limpiar
        if (newRecord?.estado !== 'PENDIENTE' && this.pendingTrip?.offer_id === newRecord.id) {
          console.log('[TripManager] Oferta ya no pendiente:', newRecord.estado);
          this.pendingTrip = null;
          this._notify('pendingTripCleared', { reason: newRecord.estado });
        }
        // Si cambió a PENDIENTE (raro pero posible)
        else if (newRecord?.estado === 'PENDIENTE' && !this.pendingTrip) {
          this._fetchTripAndNotify(newRecord);
        }
        break;

      case 'DELETE':
        if (this.pendingTrip?.offer_id === oldRecord?.id) {
          this.pendingTrip = null;
          this._notify('pendingTripCleared', { reason: 'DELETED' });
        }
        break;
    }
  }

  async _fetchTripAndNotify(offer) {
    console.log('[TripManager] Fetching trip for offer:', offer.viaje_id);
    
    try {
      const { data: trip, error } = await supabaseService.client
        .from('viajes')
        .select('*')
        .eq('id', offer.viaje_id)
        .single();

      if (error) {
        console.error('[TripManager] Error fetching trip:', error);
        return;
      }

      if (trip) {
        this.pendingTrip = {
          ...trip,
          offer_id: offer.id,
          offer_expires_at: offer.expires_at
        };
        
        console.log('[TripManager] Notificando newPendingTrip:', this.pendingTrip.id);
        this._notify('newPendingTrip', this.pendingTrip);
      }
    } catch (error) {
      console.error('[TripManager] Error en _fetchTripAndNotify:', error);
    }
  }

  _handleTripPayload(payload) {
    const { eventType, new: newRecord } = payload;
    
    if (!newRecord) return;

    const estado = newRecord.estado;
    console.log(`[TripManager] Viaje ${newRecord.id} estado: ${estado}`);

    if (['ACEPTADO', 'EN_CURSO'].includes(estado)) {
      this.currentTrip = newRecord;
      this.pendingTrip = null; // Limpiar cualquier oferta pendiente
      
      if (estado === 'ACEPTADO') {
        this._notify('tripAccepted', newRecord);
      } else {
        this._notify('tripStarted', newRecord);
      }
    } 
    else if (['COMPLETADO', 'CANCELADO'].includes(estado)) {
      const wasCurrent = this.currentTrip?.id === newRecord.id;
      this.currentTrip = null;
      
      if (wasCurrent) {
        if (estado === 'COMPLETADO') {
          this._notify('tripCompleted', newRecord);
        } else {
          this._notify('tripCancelled', newRecord);
        }
      }
    }
  }

  _startPolling() {
    console.log('[TripManager] Iniciando polling de respaldo');
    
    this.refreshInterval = setInterval(async () => {
      // Solo hacer poll si no hay actividad reciente (más de 10 segundos)
      const now = Date.now();
      if (now - this.lastPollTime > 10000) {
        console.log('[TripManager] Polling...');
        await this._loadInitialState();
        this.lastPollTime = now;
      }
    }, 5000);
  }

  // Acciones públicas
  async acceptTrip(tripId) {
    console.log('[TripManager] Aceptando viaje:', tripId);
    const driverId = supabaseService.getCurrentDriverId();
    
    try {
      const result = await supabaseService.aceptarOfertaViaje(tripId, driverId);
      console.log('[TripManager] Resultado aceptar:', result);
      
      if (result?.ok) {
        // El realtime debería notificar, pero actualizamos optimistamente
        this.pendingTrip = null;
        return { success: true };
      } else {
        return { success: false, error: result?.reason || 'Error desconocido' };
      }
    } catch (error) {
      console.error('[TripManager] Error aceptando:', error);
      return { success: false, error: error.message };
    }
  }

  async rejectTrip(tripId) {
    console.log('[TripManager] Rechazando viaje:', tripId);
    const driverId = supabaseService.getCurrentDriverId();
    
    try {
      await supabaseService.rechazarOfertaViaje(tripId, driverId, 'RECHAZADO_POR_CHOFER');
      this.pendingTrip = null;
      this._notify('pendingTripCleared', { reason: 'REJECTED' });
      return { success: true };
    } catch (error) {
      console.error('[TripManager] Error rechazando:', error);
      return { success: false, error: error.message };
    }
  }

  async startTrip(tripId) {
    const driverId = supabaseService.getCurrentDriverId();
    const result = await supabaseService.iniciarViaje(tripId, driverId);
    return result?.ok ? { success: true } : { success: false, error: 'No se pudo iniciar' };
  }

  async finishTrip(tripId) {
    const driverId = supabaseService.getCurrentDriverId();
    const result = await supabaseService.completarViaje(tripId, driverId);
    return result?.ok ? { success: true } : { success: false, error: 'No se pudo finalizar' };
  }

  async cancelTrip(tripId) {
    // Implementar si es necesario
    return { success: true };
  }

  // Event system
  on(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
    
    // Devolver función para unsubscribe
    return () => {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    };
  }

  _notify(event, data) {
    console.log(`[TripManager] Emitiendo evento: ${event}`, data?.id || '');
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[TripManager] Error en callback de ${event}:`, e);
        }
      });
    }
  }

  getCurrentTrip() {
    return this.currentTrip;
  }

  getPendingTrip() {
    return this.pendingTrip;
  }

  _cleanupChannels() {
    this.realtimeChannels.forEach(ch => {
      try {
        ch.unsubscribe();
      } catch (e) {}
    });
    this.realtimeChannels = [];
  }

  destroy() {
    console.log('[TripManager] Destruyendo...');
    this._cleanupChannels();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

export default new TripManager();
