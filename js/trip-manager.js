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
    this.subscribers = {};
    this.realtimeChannel = null;
    this.refreshInterval = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this;

    await this.loadCurrentTrip();
    await this.refreshTrips();
    this._subscribeToRealtime();

    this.refreshInterval = setInterval(() => {
      if (!document.hidden) {
        this.refreshTrips();
      }
    }, CONFIG.TRIP_REFRESH_INTERVAL);

    this.initialized = true;
    return this;
  }

  async loadCurrentTrip() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    try {
      this.currentTrip = null;
      this.pendingTrip = null;

      // Viaje activo
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

      // Viaje asignado pendiente
      const assigned = await supabaseService.rest.select('viajes', {
        eq: {
          estado: CONFIG.ESTADOS.ASIGNADO,
          chofer_id: driverId
        },
        order: 'asignado_at.desc',
        limit: 1
      });

      if (assigned.length > 0 && !this.currentTrip) {
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
          eq: { estado: CONFIG.ESTADOS.DISPONIBLE },
          neq: { chofer_id: driverId },
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

      this.availableTrips = Array.isArray(available) ? available : [];
      this.tripHistory = Array.isArray(history) ? history : [];

      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

    } catch (error) {
      console.error('Error refreshing trips:', error);
    }
  }

  async acceptTrip(tripId) {
    if (this.currentTrip) {
      return { success: false, error: 'Ya tenés un viaje activo' };
    }

    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.ACEPTADO,
        chofer_id: supabaseService.getCurrentDriverId(),
        aceptado_at: new Date().toISOString()
      });

      this.currentTrip = result?.[0] || null;
      this.pendingTrip = null;
      this.availableTrips = this.availableTrips.filter(t => t.id !== tripId);

      this._notify('tripAccepted', this.currentTrip);
      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

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

      this.availableTrips = this.availableTrips.filter(t => t.id !== tripId);

      this._notify('tripRejected', { tripId });
      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

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

      this.currentTrip = result?.[0] || this.currentTrip;
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

      const completedTrip = result?.[0];

      if (completedTrip) {
        this.tripHistory.unshift(completedTrip);
      }

      this.currentTrip = null;
      this.pendingTrip = null;

      this._notify('tripCompleted', completedTrip);
      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

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

      if (this.pendingTrip?.id === tripId) {
        this.pendingTrip = null;
      }

      this._notify('tripCancelled', { tripId });
      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _subscribeToRealtime() {
    this.realtimeChannel = supabaseService.subscribeToTrips((payload) => {
      const { eventType, new: newRecord } = payload;
      const driverId = supabaseService.getCurrentDriverId();

      switch (eventType) {
        case 'INSERT':
          if (
            newRecord.estado === CONFIG.ESTADOS.DISPONIBLE &&
            !this.currentTrip &&
            !this.pendingTrip
          ) {
            const exists = this.availableTrips.some(t => t.id === newRecord.id);
            if (!exists) {
              this.availableTrips.unshift(newRecord);
            }

            this._notify('newAvailableTrip', newRecord);
            this._notify('tripsRefreshed', {
              available: this.availableTrips,
              history: this.tripHistory
            });
          }

          if (
            newRecord.estado === CONFIG.ESTADOS.ASIGNADO &&
            newRecord.chofer_id === driverId
          ) {
            this.pendingTrip = newRecord;
            this._notify('newPendingTrip', newRecord);
          }
          break;

        case 'UPDATE':
          // Actualizar current trip
          if (this.currentTrip?.id === newRecord.id) {
            this.currentTrip = newRecord;
            this._notify('tripUpdated', newRecord);
          }

          // Actualizar pending trip
          if (this.pendingTrip?.id === newRecord.id) {
            if (newRecord.estado === CONFIG.ESTADOS.ASIGNADO) {
              this.pendingTrip = newRecord;
            } else {
              this.pendingTrip = null;
            }
          }

          // Mantener availableTrips sincronizado
          const idx = this.availableTrips.findIndex(t => t.id === newRecord.id);

          if (newRecord.estado === CONFIG.ESTADOS.DISPONIBLE) {
            if (idx >= 0) {
              this.availableTrips[idx] = newRecord;
            } else if (!this.currentTrip && !this.pendingTrip) {
              this.availableTrips.unshift(newRecord);
            }
          } else {
            if (idx >= 0) {
              this.availableTrips.splice(idx, 1);
            }
          }

          this._notify('tripsRefreshed', {
            available: this.availableTrips,
            history: this.tripHistory
          });
          break;
      }
    });
  }

  on(event, callback) {
    if (!this.subscribers[event]) {
      this.subscribers[event] = [];
    }

    this.subscribers[event].push(callback);

    return () => {
      this.subscribers[event] =
        this.subscribers[event].filter(cb => cb !== callback);
    };
  }

  _notify(event, data) {
    if (this.subscribers[event]) {
      this.subscribers[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error('Event error:', e);
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
    return {
      currentTrip: this.currentTrip,
      pendingTrip: this.pendingTrip,
      availableCount: this.availableTrips.length,
      completedCount: this.tripHistory.length
    };
  }

  destroy() {
    if (this.realtimeChannel) {
      try {
        this.realtimeChannel.unsubscribe?.();
      } catch (e) {
        console.warn('Error cerrando realtime:', e);
      }
      this.realtimeChannel = null;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.subscribers = {};
    this.initialized = false;
  }
}

export default new TripManager();
