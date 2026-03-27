/**
 * Gestión de estado de viajes y lógica de negocio
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingTrip = null;
    this.availableTrips = [];
    this.tripHistory = [];
    this.subscribers = [];
    this.realtimeChannel = null;
  }

  async init() {
    // Cargar viaje actual si existe
    await this.loadCurrentTrip();
    
    // Suscribirse a cambios en tiempo real
    this._subscribeToRealtime();
    
    // Programar refresco periódico
    setInterval(() => {
      if (!document.hidden) {
        this.refreshTrips();
      }
    }, CONFIG.TRIP_REFRESH_INTERVAL);

    return this;
  }

  async loadCurrentTrip() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    try {
      // Buscar viaje activo (ACEPTADO o EN_CURSO)
      const activeTrips = await supabaseService.rest.select('viajes', {
        eq: { chofer_id: driverId },
        in: { estado: [CONFIG.ESTADOS.ACEPTADO, CONFIG.ESTADOS.EN_CURSO] },
        order: 'updated_at.desc',
        limit: 1
      });

      if (activeTrips.length > 0) {
        this.currentTrip = activeTrips[0];
        this._notify('tripUpdated', this.currentTrip);
      }

      // Buscar viajes asignados pendientes
      const assigned = await supabaseService.rest.select('viajes', {
        eq: { 
          estado: CONFIG.ESTADOS.ASIGNADO,
          chofer_id: driverId 
        },
        order: 'asignado_at.desc',
        limit: 1
      });

      if (assigned.length > 0 && !this.pendingTrip && !this.currentTrip) {
        this.pendingTrip = assigned[0];
        this._notify('newPendingTrip', this.pendingTrip);
      }

    } catch (error) {
      console.error('Error loading current trip:', error);
    }
  }

  async refreshTrips() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    try {
      const [available, history] = await Promise.all([
        supabaseService.rest.select('viajes', {
          eq: { estado: CONFIG.ESTADOS.DISPONIBLE }, neq: { chofer_id: supabaseService.getCurrentDriverId() },
          order: 'created_at.desc',
          limit: 20
        }),
        supabaseService.rest.select('viajes', {
          eq: { 
            chofer_id: driverId,
            estado: CONFIG.ESTADOS.COMPLETADO 
          },
          order: 'completado_at.desc',
          limit: 10
        })
      ]);

      this.availableTrips = available;
      this.tripHistory = history;

      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

    } catch (error) {
      console.error('Error refreshing trips:', error);
    }
  }

  async acceptTrip(tripId) {
    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.ACEPTADO,
        chofer_id: supabaseService.getCurrentDriverId(),
        aceptado_at: new Date().toISOString()
      });

      this.currentTrip = result[0];
      this.pendingTrip = null;
      
      this._notify('tripAccepted', this.currentTrip);
      return { success: true, trip: this.currentTrip };

    } catch (error) {
      console.error('Error accepting trip:', error);
      return { success: false, error: error.message };
    }
  }

  async rejectTrip(tripId) {
    try {
      await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.DISPONIBLE,
        chofer_id: null,
        rechazado_por: supabaseService.getCurrentDriverId(),
        rechazado_at: new Date().toISOString()
      });

      if (this.pendingTrip?.id === tripId) {
        this.pendingTrip = null;
      }

      this._notify('tripRejected', { tripId });
      return { success: true };

    } catch (error) {
      console.error('Error rejecting trip:', error);
      return { success: false, error: error.message };
    }
  }

  async startTrip(tripId) {
    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.EN_CURSO,
        iniciado_at: new Date().toISOString()
      });

      this.currentTrip = result[0];
      this._notify('tripStarted', this.currentTrip);
      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async finishTrip(tripId, notes = '') {
    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.COMPLETADO,
        completado_at: new Date().toISOString(),
        notas_chofer: notes
      });

      const completedTrip = result[0];
      this.tripHistory.unshift(completedTrip);
      this.currentTrip = null;
      
      this._notify('tripCompleted', completedTrip);
      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cancelTrip(tripId, reason = '') {
    try {
      await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.CANCELADO,
        cancelado_at: new Date().toISOString(),
        cancelado_por: supabaseService.getCurrentDriverId(),
        motivo_cancelacion: reason
      });

      if (this.currentTrip?.id === tripId) {
        this.currentTrip = null;
      }

      this._notify('tripCancelled', { tripId });
      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _subscribeToRealtime() {
    this.realtimeChannel = supabaseService.subscribeToTrips((payload) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      switch (eventType) {
        case 'INSERT':
          if (newRecord.estado === CONFIG.ESTADOS.ASIGNADO && 
              newRecord.chofer_id === supabaseService.getCurrentDriverId()) {
            this.pendingTrip = newRecord;
            this._notify('newPendingTrip', newRecord);
          }
          break;

        case 'UPDATE':
          if (this.currentTrip?.id === newRecord.id) {
            this.currentTrip = newRecord;
            this._notify('tripUpdated', newRecord);
          }
          break;

        case 'DELETE':
          if (this.currentTrip?.id === oldRecord.id) {
            this.currentTrip = null;
            this._notify('tripDeleted', oldRecord);
          }
          break;
      }
    });
  }

  // Sistema de eventos pub/sub
  on(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }
    this.subscribers[event].push(callback);

    // Retornar función para desuscribirse
    return () => {
      this.subscribers[event] = this.subscribers[event].filter(cb => cb !== callback);
    };
  }

  _notify(event, data) {
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('Event callback error:', e);
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

  getStats() {
    const today = new Date().toDateString();
    return {
      pending: this.availableTrips.length,
      today: this.tripHistory.filter(t => 
        new Date(t.created_at).toDateString() === today
      ).length,
      total: this.tripHistory.length,
      active: this.currentTrip ? 1 : 0
    };
  }

  destroy() {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
    }
    this.subscribers = {};
  }
}

const tripManager = new TripManager();
export default tripManager;
