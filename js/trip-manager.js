/**
 * Gestión de viajes - Con logs de debug y manejo de errores mejorado
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingTrip = null;
    this.availableTrips = [];
    this.subscribers = {};
    this.realtimeChannels = [];
    this.refreshInterval = null;
    this.initialized = false;
    
    console.log('[TripManager] Constructor');
  }

  async init() {
    console.log('[TripManager] Iniciando...');
    
    if (this.initialized) {
      console.log('[TripManager] Ya inicializado');
      return this;
    }

    try {
      await this._loadInitialState();
      this._subscribeToRealtime();
      this._startRefreshInterval();
      
      this.initialized = true;
      console.log('[TripManager] Inicializado correctamente');
      
    } catch (error) {
      console.error('[TripManager] Error inicializando:', error);
      throw error;
    }

    return this;
  }

  async _loadInitialState() {
    console.log('[TripManager] Cargando estado inicial...');
    const driverId = supabaseService.getCurrentDriverId();
    
    if (!driverId) {
      console.warn('[TripManager] No hay driverId');
      return;
    }

    console.log('[TripManager] Driver ID:', driverId);

    try {
      // 1. Buscar viaje activo
      console.log('[TripManager] Buscando viaje activo...');
      const { data: activeTrips, error: activeError } = await supabaseService.client
        .from(CONFIG.TABLES.VIAJES)
        .select('*')
        .eq('chofer_id', driverId)
        .in('estado', ['ACEPTADO', 'EN_CURSO'])
        .order('updated_at', { ascending: false })
        .limit(1);

      if (activeError) {
        console.error('[TripManager] Error buscando viaje activo:', activeError);
      }

      console.log('[TripManager] Viajes activos encontrados:', activeTrips?.length || 0);

      if (activeTrips && activeTrips.length > 0) {
        this.currentTrip = activeTrips[0];
        console.log('[TripManager] Viaje activo asignado:', this.currentTrip.id);
        this._notify('tripUpdated', this.currentTrip);
        return;
      }

      // 2. Buscar oferta pendiente
      console.log('[TripManager] Buscando ofertas pendientes...');
      const { data: offers, error: offersError } = await supabaseService.client
        .from(CONFIG.TABLES.VIAJE_OFERTAS)
        .select('*')
        .eq('chofer_id', driverId)
        .eq('estado', 'PENDIENTE')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (offersError) {
        console.error('[TripManager] Error buscando ofertas:', offersError);
      }

      console.log('[TripManager] Ofertas encontradas:', offers?.length || 0);

      if (offers && offers.length > 0) {
        const offer = offers[0];
        console.log('[TripManager] Procesando oferta:', offer.id);
        
        // Obtener datos del viaje
        const { data: tripData, error: tripError } = await supabaseService.client
          .from(CONFIG.TABLES.VIAJES)
          .select('*')
          .eq('id', offer.viaje_id)
          .single();

        if (tripError) {
          console.error('[TripManager] Error obteniendo viaje:', tripError);
          return;
        }

        if (tripData) {
          this.pendingTrip = {
            ...tripData,
            offer_id: offer.id,
            offer_expires_at: offer.expires_at
          };
          console.log('[TripManager] Oferta pendiente establecida:', this.pendingTrip.id);
          this._notify('newPendingTrip', this.pendingTrip);
        }
      } else {
        console.log('[TripManager] No hay ofertas pendientes');
      }

    } catch (error) {
      console.error('[TripManager] Error en _loadInitialState:', error);
    }
  }

  _subscribeToRealtime() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) {
      console.warn('[TripManager] No se puede suscribir realtime: sin driverId');
      return;
    }

    console.log('[TripManager] Suscribiendo a realtime...');

    // Canal 1: Ofertas para este chofer
    const offersChannel = supabaseService.client
      .channel(`driver-offers-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CONFIG.TABLES.VIAJE_OFERTAS,
          filter: `chofer_id=eq.${driverId}`
        },
        (payload) => {
          console.log('[TripManager] [Realtime] Oferta recibida:', payload);
          this._handleOfferChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('[TripManager] [Realtime] Ofertas status:', status);
      });

    // Canal 2: Viajes asignados a este chofer
    const tripsChannel = supabaseService.client
      .channel(`driver-trips-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CONFIG.TABLES.VIAJES,
          filter: `chofer_id=eq.${driverId}`
        },
        (payload) => {
          console.log('[TripManager] [Realtime] Viaje recibido:', payload);
          this._handleTripChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('[TripManager] [Realtime] Viajes status:', status);
      });

    this.realtimeChannels.push(offersChannel, tripsChannel);
  }

  _handleOfferChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    console.log('[TripManager] Procesando cambio de oferta:', eventType);

    if (eventType === 'INSERT' && newRecord?.estado === 'PENDIENTE') {
      // Nueva oferta
      this._fetchAndSetPendingTrip(newRecord);
    } else if (eventType === 'UPDATE') {
      if (newRecord?.estado !== 'PENDIENTE') {
        // Oferta ya no está pendiente
        if (this.pendingTrip?.offer_id === newRecord.id) {
          console.log('[TripManager] Oferta ya no pendiente:', newRecord.estado);
          this.pendingTrip = null;
          this._notify('pendingTripCleared', { reason: newRecord.estado });
        }
      }
    } else if (eventType === 'DELETE') {
      if (this.pendingTrip?.offer_id === oldRecord?.id) {
        this.pendingTrip = null;
        this._notify('pendingTripCleared', { reason: 'DELETED' });
      }
    }
  }

  async _fetchAndSetPendingTrip(offer) {
    console.log('[TripManager] Fetching trip for offer:', offer.viaje_id);
    
    try {
      const { data: trip, error } = await supabaseService.client
        .from(CONFIG.TABLES.VIAJES)
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
        console.log('[TripManager] Nueva oferta pendiente:', this.pendingTrip.id);
        this._notify('newPendingTrip', this.pendingTrip);
      }
    } catch (error) {
      console.error('[TripManager] Error en _fetchAndSetPendingTrip:', error);
    }
  }

  _handleTripChange(payload) {
    const { eventType, new: newRecord } = payload;
    console.log('[TripManager] Procesando cambio de viaje:', eventType, newRecord?.estado);

    if (!newRecord) return;

    const estado = newRecord.estado;

    if (['ACEPTADO', 'EN_CURSO'].includes(estado)) {
      this.currentTrip = newRecord;
      this.pendingTrip = null;
      this._notify('tripUpdated', newRecord);
      
      if (estado === 'ACEPTADO') {
        this._notify('tripAccepted', newRecord);
      } else if (estado === 'EN_CURSO') {
        this._notify('tripStarted', newRecord);
      }
    } else if (['COMPLETADO', 'CANCELADO'].includes(estado)) {
      const wasCurrent = this.currentTrip?.id === newRecord.id;
      this.currentTrip = null;
      
      if (estado === 'COMPLETADO') {
        this._notify('tripCompleted', newRecord);
      } else {
        this._notify('tripCancelled', newRecord);
      }
    }
  }

  _startRefreshInterval() {
    console.log('[TripManager] Iniciando refresh interval');
    this.refreshInterval = setInterval(() => {
      if (!document.hidden) {
        this._loadInitialState();
      }
    }, CONFIG.TRIP_REFRESH_INTERVAL);
  }

  // Acciones públicas
  async acceptTrip(tripId) {
    console.log('[TripManager] Aceptando viaje:', tripId);
    // Implementar llamada a RPC o API
    return { success: true };
  }

  async rejectTrip(tripId) {
    console.log('[TripManager] Rechazando viaje:', tripId);
    this.pendingTrip = null;
    this._notify('pendingTripCleared', { reason: 'REJECTED' });
    return { success: true };
  }

  async startTrip(tripId) {
    console.log('[TripManager] Iniciando viaje:', tripId);
    return { success: true };
  }

  async finishTrip(tripId) {
    console.log('[TripManager] Finalizando viaje:', tripId);
    return { success: true };
  }

  // Eventos
  on(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);
    return () => this._unsubscribe(event, callback);
  }

  _unsubscribe(event, callback) {
    if (this.subscribers[event]) {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    }
  }

  _notify(event, data) {
    console.log('[TripManager] Notificando:', event, data?.id || data);
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('[TripManager] Error en callback:', e);
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

  destroy() {
    console.log('[TripManager] Destruyendo...');
    this.realtimeChannels.forEach(ch => {
      try { ch.unsubscribe(); } catch (e) {}
    });
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

export default new TripManager();
