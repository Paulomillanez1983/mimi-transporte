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
    await this.refreshTrips(true);
    this._subscribeToRealtime();

    this.refreshInterval = setInterval(() => {
      if (!document.hidden) {
        this.refreshTrips(false);
      }
    }, CONFIG.TRIP_REFRESH_INTERVAL || 10000);

    this.initialized = true;
    return this;
  }

  // =========================================
  // CARGA INICIAL
  // =========================================
  async loadCurrentTrip() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) {
      console.warn('TripManager: no hay driverId');
      return;
    }

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

      if (Array.isArray(activeTrips) && activeTrips.length > 0) {
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

      if (Array.isArray(assigned) && assigned.length > 0 && !this.currentTrip) {
        this.pendingTrip = assigned[0];
        this._notify('newPendingTrip', this.pendingTrip);
      }

    } catch (error) {
      console.error('Error loading current trip:', error);
    }
  }

  // =========================================
  // REFRESH
  // =========================================
  async refreshTrips(isInitialLoad = false) {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    try {
      const previousIds = new Set((this.availableTrips || []).map(t => t.id));

      const [available, history] = await Promise.all([
        supabaseService.rest.select('viajes', {
          eq: { estado: CONFIG.ESTADOS.DISPONIBLE },
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

      // Filtrar viajes válidos y evitar que aparezcan viajes ya tomados
      this.availableTrips = (Array.isArray(available) ? available : []).filter(t => {
        const estado = this._normalizeState(t.estado);
        const choferId = t.chofer_id ?? null;

        return (
          estado === CONFIG.ESTADOS.DISPONIBLE &&
          (choferId === null || choferId === '' || typeof choferId === 'undefined')
        );
      });

      this.tripHistory = Array.isArray(history) ? history : [];

      // Quitar duplicados por seguridad
      this.availableTrips = this._dedupeById(this.availableTrips);
      this.tripHistory = this._dedupeById(this.tripHistory);

      console.log('[Trips refresh] disponibles:', this.availableTrips);
      console.log('[Trips refresh] historial:', this.tripHistory);

      // Detectar NUEVOS viajes disponibles
      const newTrips = this.availableTrips.filter(t => !previousIds.has(t.id));

      if (!isInitialLoad && !this.currentTrip && !this.pendingTrip && newTrips.length > 0) {
        for (const trip of newTrips) {
          this._notify('newAvailableTrip', trip);
        }
      }

      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

    } catch (error) {
      console.error('Error refreshing trips:', error);
    }
  }

  // =========================================
  // ACCIONES
  // =========================================
  async acceptTrip(tripId) {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

    if (this.currentTrip) {
      return { success: false, error: 'Ya tenés un viaje activo' };
    }

    try {
      const driverId = supabaseService.getCurrentDriverId();

      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.ACEPTADO,
        chofer_id: driverId,
        aceptado_at: new Date().toISOString()
      });

      this.currentTrip = Array.isArray(result) ? result[0] : result || null;
      this.pendingTrip = null;
      this.availableTrips = this.availableTrips.filter(t => t.id !== tripId);

      this._notify('tripAccepted', this.currentTrip);
      this._notify('tripUpdated', this.currentTrip);
      this._notify('tripsRefreshed', {
        available: this.availableTrips,
        history: this.tripHistory
      });

      return { success: true, trip: this.currentTrip };

    } catch (error) {
      console.error('Error accepting trip:', error);
      return { success: false, error: error.message || 'No se pudo aceptar el viaje' };
    }
  }

  async rejectTrip(tripId) {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

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
      return { success: false, error: error.message || 'No se pudo rechazar el viaje' };
    }
  }

  async startTrip(tripId) {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.EN_CURSO,
        iniciado_at: new Date().toISOString()
      });

      this.currentTrip = Array.isArray(result) ? result[0] : result || this.currentTrip;

      this._notify('tripStarted', this.currentTrip);
      this._notify('tripUpdated', this.currentTrip);

      return { success: true };

    } catch (error) {
      console.error('Error starting trip:', error);
      return { success: false, error: error.message || 'No se pudo iniciar el viaje' };
    }
  }

  async finishTrip(tripId, notes = '') {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

    try {
      const result = await supabaseService.rest.update('viajes', tripId, {
        estado: CONFIG.ESTADOS.COMPLETADO,
        completado_at: new Date().toISOString(),
        notas_chofer: notes
      });

      const completedTrip = Array.isArray(result) ? result[0] : result || null;

      if (completedTrip) {
        this.tripHistory.unshift(completedTrip);
        this.tripHistory = this._dedupeById(this.tripHistory);
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
      console.error('Error finishing trip:', error);
      return { success: false, error: error.message || 'No se pudo finalizar el viaje' };
    }
  }

  async cancelTrip(tripId, reason = '') {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

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
      console.error('Error cancelling trip:', error);
      return { success: false, error: error.message || 'No se pudo cancelar el viaje' };
    }
  }

  // =========================================
  // REALTIME
  // =========================================
  _subscribeToRealtime() {
    if (this.realtimeChannel) {
      try {
        this.realtimeChannel.unsubscribe?.();
      } catch (e) {
        console.warn('No se pudo limpiar canal anterior:', e);
      }
      this.realtimeChannel = null;
    }

    this.realtimeChannel = supabaseService.subscribeToTrips((payload) => {
      console.log('[Realtime payload viajes]', payload);

      const { eventType, new: newRecord, old: oldRecord } = payload;
      const driverId = supabaseService.getCurrentDriverId();

      if (!newRecord && eventType !== 'DELETE') return;

      switch (eventType) {
        case 'INSERT': {
          const estado = this._normalizeState(newRecord.estado);

          if (estado === CONFIG.ESTADOS.DISPONIBLE && !newRecord.chofer_id) {
            const exists = this.availableTrips.some(t => t.id === newRecord.id);

            if (!exists) {
              this.availableTrips.unshift(newRecord);
              this.availableTrips = this._dedupeById(this.availableTrips);
            }

            this._notify('newAvailableTrip', newRecord);
            this._notify('tripsRefreshed', {
              available: this.availableTrips,
              history: this.tripHistory
            });
          }

          if (
            estado === CONFIG.ESTADOS.ASIGNADO &&
            newRecord.chofer_id === driverId
          ) {
            this.pendingTrip = newRecord;
            this._notify('newPendingTrip', newRecord);
          }

          break;
        }

        case 'UPDATE': {
          const estado = this._normalizeState(newRecord.estado);

          if (this.currentTrip?.id === newRecord.id) {
            this.currentTrip = newRecord;
            this._notify('tripUpdated', newRecord);
          }

          if (this.pendingTrip?.id === newRecord.id) {
            if (
              estado === CONFIG.ESTADOS.ASIGNADO &&
              newRecord.chofer_id === driverId
            ) {
              this.pendingTrip = newRecord;
            } else {
              this.pendingTrip = null;
            }
          }

          const idx = this.availableTrips.findIndex(t => t.id === newRecord.id);

          if (estado === CONFIG.ESTADOS.DISPONIBLE && !newRecord.chofer_id) {
            if (idx >= 0) {
              this.availableTrips[idx] = newRecord;
            } else {
              this.availableTrips.unshift(newRecord);
            }
          } else {
            if (idx >= 0) {
              this.availableTrips.splice(idx, 1);
            }
          }

          if (
            estado === CONFIG.ESTADOS.ACEPTADO &&
            newRecord.chofer_id === driverId
          ) {
            this.currentTrip = newRecord;
            this.pendingTrip = null;
            this.availableTrips = this.availableTrips.filter(t => t.id !== newRecord.id);

            this._notify('tripAccepted', newRecord);
            this._notify('tripUpdated', newRecord);
          }

          if (
            [CONFIG.ESTADOS.COMPLETADO, CONFIG.ESTADOS.CANCELADO].includes(estado) &&
            newRecord.chofer_id === driverId
          ) {
            if (this.currentTrip?.id === newRecord.id) {
              this.currentTrip = null;
            }
            if (this.pendingTrip?.id === newRecord.id) {
              this.pendingTrip = null;
            }
          }

          this.availableTrips = this._dedupeById(this.availableTrips);

          this._notify('tripsRefreshed', {
            available: this.availableTrips,
            history: this.tripHistory
          });

          break;
        }

        case 'DELETE': {
          const deletedId = oldRecord?.id;
          if (!deletedId) break;

          this.availableTrips = this.availableTrips.filter(t => t.id !== deletedId);

          if (this.currentTrip?.id === deletedId) {
            this.currentTrip = null;
          }

          if (this.pendingTrip?.id === deletedId) {
            this.pendingTrip = null;
          }

          this._notify('tripsRefreshed', {
            available: this.availableTrips,
            history: this.tripHistory
          });

          break;
        }

        default:
          break;
      }
    });
  }

  // =========================================
  // EVENTOS
  // =========================================
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
          console.error(`Event error [${event}]:`, e);
        }
      });
    }
  }

  // =========================================
  // HELPERS
  // =========================================
  _normalizeState(state) {
    return String(state || '').toUpperCase().replace(/[-\s]/g, '_');
  }

  _dedupeById(arr) {
    const map = new Map();
    for (const item of arr || []) {
      if (item?.id) map.set(item.id, item);
    }
    return Array.from(map.values());
  }

  // =========================================
  // GETTERS
  // =========================================
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

  // =========================================
  // DESTROY
  // =========================================
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
