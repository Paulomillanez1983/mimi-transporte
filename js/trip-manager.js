/**
 * Gestión de estado de viajes y lógica de negocio
 * FASE 1 UBER-LIKE: ofertas individuales por chofer
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingTrip = null;
    this.pendingOffer = null;
    this.availableTrips = [];
    this.tripHistory = [];
    this.subscribers = {};
    this.realtimeOfferChannel = null;
    this.realtimeTripChannel = null;
    this.refreshInterval = null;
    this.presenceInterval = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this;

    await this.loadCurrentTrip();
    await this.refreshTrips();
    this._subscribeToRealtime();
    this._startPresenceHeartbeat();

    this.refreshInterval = setInterval(() => {
      if (!document.hidden) {
        this.refreshTrips();
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
      this.pendingOffer = null;

      // Viaje activo
      const activeTrips = await supabaseService.rest.select('viajes', {
        eq: { chofer_id: driverId },
        in: { estado: ['ACEPTADO', 'EN_CURSO'] },
        order: 'updated_at.desc',
        limit: 1
      });

      if (Array.isArray(activeTrips) && activeTrips.length > 0) {
        this.currentTrip = activeTrips[0];
        this._notify('tripUpdated', this.currentTrip);
        return;
      }

      // Oferta pendiente viva
      const pendingOffers = await supabaseService.rest.select('viaje_ofertas', {
        eq: {
          chofer_id: driverId,
          estado: 'PENDIENTE'
        },
        order: 'expires_at.desc',
        limit: 5
      });

      const aliveOffer = (pendingOffers || []).find(o => {
        return o?.expires_at && new Date(o.expires_at).getTime() > Date.now();
      });

      if (aliveOffer) {
        const trip = await this._fetchTripById(aliveOffer.viaje_id);

        if (trip) {
          this.pendingOffer = aliveOffer;
          this.pendingTrip = {
            ...trip,
            offer_expires_at: aliveOffer.expires_at,
            offer_id: aliveOffer.id || null
          };
          this._notify('newPendingTrip', this.pendingTrip);
        }
      }
    } catch (error) {
      console.error('Error loading current trip:', error);
    }
  }

  // =========================================
  // REFRESH
  // =========================================
  async refreshTrips() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    try {
      const [history, freshPendingOffers] = await Promise.all([
        supabaseService.rest.select('viajes', {
          eq: {
            chofer_id: driverId,
            estado: 'COMPLETADO'
          },
          order: 'completado_at.desc',
          limit: 10
        }),
        supabaseService.rest.select('viaje_ofertas', {
          eq: {
            chofer_id: driverId,
            estado: 'PENDIENTE'
          },
          order: 'expires_at.desc',
          limit: 5
        })
      ]);

      this.tripHistory = Array.isArray(history) ? history : [];
      this.tripHistory = this._dedupeById(this.tripHistory);

      const aliveOffer = (freshPendingOffers || []).find(o => {
        return o?.expires_at && new Date(o.expires_at).getTime() > Date.now();
      });

      if (!this.currentTrip && aliveOffer) {
        const trip = await this._fetchTripById(aliveOffer.viaje_id);

        if (trip) {
          const enrichedTrip = {
            ...trip,
            offer_expires_at: aliveOffer.expires_at,
            offer_id: aliveOffer.id || null
          };

          const changedTrip = this.pendingTrip?.id !== trip.id;
          this.pendingOffer = aliveOffer;
          this.pendingTrip = enrichedTrip;

          if (changedTrip) {
            this._notify('newPendingTrip', this.pendingTrip);
          }
        }
      } else if (!aliveOffer && this.pendingTrip) {
        this.pendingTrip = null;
        this.pendingOffer = null;
        this._notify('pendingTripCleared', { reason: 'EXPIRED_LOCAL' });
      }

      this._notify('tripsRefreshed', {
        available: [],
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
      const rpcResult = await supabaseService.aceptarOfertaViaje(tripId, driverId);

      if (!rpcResult?.ok) {
        return {
          success: false,
          error: rpcResult?.reason || 'No se pudo aceptar la oferta'
        };
      }

      const freshTrip = await this._fetchTripById(tripId);

      this.currentTrip = freshTrip || this.pendingTrip || null;
      this.pendingTrip = null;
      this.pendingOffer = null;

      this._notify('tripAccepted', this.currentTrip);
      this._notify('tripUpdated', this.currentTrip);
      this._notify('tripsRefreshed', {
        available: [],
        history: this.tripHistory
      });

      return { success: true, trip: this.currentTrip };

    } catch (error) {
      console.error('Error accepting trip:', error);
      return { success: false, error: error.message || 'No se pudo aceptar el viaje' };
    }
  }

  async rejectTrip(tripId, reason = 'RECHAZADO_POR_CHOFER') {
    if (!tripId) {
      return { success: false, error: 'Trip ID inválido' };
    }

    try {
      const driverId = supabaseService.getCurrentDriverId();
      await supabaseService.rechazarOfertaViaje(tripId, driverId, reason);

      if (this.pendingTrip?.id === tripId) {
        this.pendingTrip = null;
      }

      this.pendingOffer = null;

      this._notify('tripRejected', { tripId });
      this._notify('tripsRefreshed', {
        available: [],
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
      const driverId = supabaseService.getCurrentDriverId();
      await supabaseService.iniciarViaje(tripId, driverId);

      const freshTrip = await this._fetchTripById(tripId);
      this.currentTrip = freshTrip || this.currentTrip;

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
      const driverId = supabaseService.getCurrentDriverId();
      await supabaseService.completarViaje(tripId, driverId);

      const completedTrip = await this._fetchTripById(tripId);

      if (completedTrip) {
        this.tripHistory.unshift(completedTrip);
        this.tripHistory = this._dedupeById(this.tripHistory);
      }

      this.currentTrip = null;
      this.pendingTrip = null;
      this.pendingOffer = null;

      this._notify('tripCompleted', completedTrip);
      this._notify('tripsRefreshed', {
        available: [],
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
        estado: 'CANCELADO',
        cancelado_at: new Date().toISOString(),
        cancelado_por: supabaseService.getCurrentDriverId(),
        cancel_reason: reason
      });

      if (this.currentTrip?.id === tripId) {
        this.currentTrip = null;
      }

      if (this.pendingTrip?.id === tripId) {
        this.pendingTrip = null;
      }

      this.pendingOffer = null;

      this._notify('tripCancelled', { tripId });
      this._notify('tripsRefreshed', {
        available: [],
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
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    this._cleanupRealtime();

    // Escuchar SOLO ofertas de este chofer
    this.realtimeOfferChannel = supabaseService.subscribeToDriverOffers(driverId, async (payload) => {
      console.log('[Realtime oferta chofer]', payload);

      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const estado = this._normalizeState(newRecord?.estado);

        if (estado === 'PENDIENTE' && this._isOfferAlive(newRecord)) {
          const trip = await this._fetchTripById(newRecord.viaje_id);

          if (trip && !this.currentTrip) {
            const enrichedTrip = {
              ...trip,
              offer_expires_at: newRecord.expires_at,
              offer_id: newRecord.id || null
            };

            const isNewTrip = this.pendingTrip?.id !== trip.id;
            this.pendingOffer = newRecord;
            this.pendingTrip = enrichedTrip;

            if (isNewTrip) {
              this._notify('newPendingTrip', enrichedTrip);
            }
          }
        }

        if (['ACEPTADA', 'RECHAZADA', 'TIMEOUT', 'CANCELADA'].includes(estado)) {
          if (this.pendingOffer?.id === newRecord.id) {
            this.pendingOffer = null;
            this.pendingTrip = null;

            this._notify('pendingTripCleared', {
              reason: estado,
              offer: newRecord
            });
          }
        }
      }

      if (eventType === 'DELETE') {
        if (this.pendingOffer?.id === oldRecord?.id) {
          this.pendingOffer = null;
          this.pendingTrip = null;

          this._notify('pendingTripCleared', {
            reason: 'DELETE',
            offer: oldRecord
          });
        }
      }

      this._notify('tripsRefreshed', {
        available: [],
        history: this.tripHistory
      });
    });

    // Escuchar SOLO viajes de este chofer
    this.realtimeTripChannel = supabaseService.subscribeToDriverTrips(driverId, (payload) => {
      console.log('[Realtime viaje chofer]', payload);

      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        const estado = this._normalizeState(newRecord?.estado);

        if (['ACEPTADO', 'EN_CURSO'].includes(estado)) {
          this.currentTrip = newRecord;
          this.pendingTrip = null;
          this.pendingOffer = null;

          this._notify('tripUpdated', newRecord);
        }

        if (['COMPLETADO', 'CANCELADO', 'SIN_CHOFER'].includes(estado)) {
          if (this.currentTrip?.id === newRecord.id) {
            this.currentTrip = null;
          }

          if (estado === 'COMPLETADO') {
            this.tripHistory.unshift(newRecord);
            this.tripHistory = this._dedupeById(this.tripHistory);
          }

          this._notify('tripUpdated', newRecord);
        }
      }

      if (eventType === 'DELETE') {
        const deletedId = oldRecord?.id;

        if (this.currentTrip?.id === deletedId) {
          this.currentTrip = null;
        }

        if (this.pendingTrip?.id === deletedId) {
          this.pendingTrip = null;
        }
      }

      this._notify('tripsRefreshed', {
        available: [],
        history: this.tripHistory
      });
    });
  }

  _cleanupRealtime() {
    for (const ch of [this.realtimeOfferChannel, this.realtimeTripChannel]) {
      if (ch) {
        try {
          ch.unsubscribe?.();
        } catch (e) {
          console.warn('No se pudo limpiar canal realtime:', e);
        }
      }
    }

    this.realtimeOfferChannel = null;
    this.realtimeTripChannel = null;
  }

  _startPresenceHeartbeat() {
    const driverId = supabaseService.getCurrentDriverId();
    if (!driverId) return;

    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }

    this.presenceInterval = setInterval(() => {
      if (!document.hidden) {
        supabaseService.pingDriverOnline(driverId).catch((e) => {
          console.warn('Heartbeat chofer falló:', e);
        });
      }
    }, 30000);
  }

  async _fetchTripById(tripId) {
    if (!tripId) return null;

    try {
      const trip = await supabaseService.rest.select('viajes', {
        eq: { id: tripId },
        single: true
      });

      return trip || null;
    } catch (error) {
      console.error('No se pudo obtener viaje por ID:', error);
      return null;
    }
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

  _isOfferAlive(offer) {
    if (!offer?.expires_at) return false;
    return new Date(offer.expires_at).getTime() > Date.now();
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

  getPendingOffer() {
    return this.pendingOffer;
  }

  getStats() {
    return {
      currentTrip: this.currentTrip,
      pendingTrip: this.pendingTrip,
      pending: this.pendingTrip ? 1 : 0,
      today: this.tripHistory.length,
      availableCount: 0,
      completedCount: this.tripHistory.length
    };
  }

  // =========================================
  // DESTROY
  // =========================================
  destroy() {
    this._cleanupRealtime();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }

    this.subscribers = {};
    this.initialized = false;
  }
}

export default new TripManager();
