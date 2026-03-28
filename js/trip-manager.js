/**
 * MIMI Driver - Trip Manager (PRODUCTION FINAL)
 * Business logic for trip lifecycle
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingOffer = null;

    this.refreshInterval = null;
    this.isLoadingInitial = false;

    this.listeners = new Map();
  }

  // =========================================================
  // EVENT EMITTER SIMPLE
  // =========================================================
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);

    return () => {
      const arr = this.listeners.get(event) || [];
      this.listeners.set(event, arr.filter(cb => cb !== callback));
    };
  }

  emit(event, payload) {
    const arr = this.listeners.get(event) || [];
    arr.forEach(cb => {
      try { cb(payload); } catch (e) {}
    });
  }

  // =========================================================
  // INIT
  // =========================================================
  async init() {
    const { data: { user } } = await supabaseService.client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // aseguramos perfil
    await supabaseService.ensureDriverProfile();

    const driverId = supabaseService.getDriverId();
    if (!driverId) throw new Error('No driverId available');

    console.log('[TripManager] Initializing for driver UUID:', driverId);

    await this._loadInitialState(driverId);

    this._subscribeToRealtime(driverId);
    this._startRefreshInterval(driverId);

    return this;
  }

  // =========================================================
  // LOAD INITIAL STATE
  // =========================================================
  async _loadInitialState(driverId) {
    if (this.isLoadingInitial) return;
    this.isLoadingInitial = true;

    try {
      // 1) ACTIVE TRIP
      const { data: activeTrip, error: tripError } = await supabaseService.client
        .from('viajes')
        .select('*')
        .eq('chofer_id', driverId)
        .in('estado', ['ASIGNADO', 'ACEPTADO', 'EN_CURSO'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripError) {
        console.error('[TripManager] Error loading active trip:', tripError);
      }

      if (activeTrip) {
        console.log('[TripManager] Active trip found:', activeTrip.id);

        this.currentTrip = activeTrip;
        this.pendingOffer = null;

        if (activeTrip.estado === 'ASIGNADO') {
          this.emit('newPendingTrip', activeTrip);
        } else {
          this.emit('tripAccepted', activeTrip);
        }

        this.isLoadingInitial = false;
        return;
      }

      // 2) PENDING OFFERS
      const { data: offers, error: offerError } = await supabaseService.client
        .from('viaje_ofertas')
        .select('id, viaje_id, chofer_id, estado, expires_at, offered_at')
        .eq('chofer_id', driverId)
        .eq('estado', 'PENDIENTE')
        .gt('expires_at', new Date().toISOString())
        .order('offered_at', { ascending: false })
        .limit(1);

      if (offerError) {
        console.error('[TripManager] Error loading offers:', offerError);
      }

      if (offers && offers.length > 0) {
        const offer = offers[0];

        const { data: trip, error: tripErr } = await supabaseService.client
          .from('viajes')
          .select('*')
          .eq('id', offer.viaje_id)
          .single();

        if (tripErr) {
          console.error('[TripManager] Error fetching trip for offer:', tripErr);
        } else if (trip) {
          this.pendingOffer = {
            ...trip,
            offerId: offer.id,
            expiresAt: offer.expires_at
          };

          console.log('[TripManager] Pending offer found:', offer.id);
          this.emit('newPendingTrip', this.pendingOffer);
        }
      } else {
        this.pendingOffer = null;
        this.emit('noPendingTrips');
      }

    } catch (error) {
      console.error('[TripManager] Load error:', error);
    }

    this.isLoadingInitial = false;
  }

  // =========================================================
  // REALTIME
  // =========================================================
  _subscribeToRealtime(driverId) {
    console.log('[TripManager] Subscribing to realtime channels...');

    // OFERTAS
    supabaseService.client
      .channel(`offers-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viaje_ofertas',
          filter: `chofer_id=eq.${driverId}`
        },
        async (payload) => {
          console.log('[TripManager] Offer realtime event:', payload.eventType);
          await this._loadInitialState(driverId);
        }
      )
      .subscribe();

    // VIAJES
    supabaseService.client
      .channel(`trips-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viajes',
          filter: `chofer_id=eq.${driverId}`
        },
        (payload) => {
          const trip = payload.new;
          if (!trip) return;

          console.log('[TripManager] Trip update:', trip.id, trip.estado);

          if (trip.estado === 'ACEPTADO') this.emit('tripAccepted', trip);
          if (trip.estado === 'EN_CURSO') this.emit('tripStarted', trip);
          if (trip.estado === 'COMPLETADO') this.emit('tripCompleted', trip);
          if (trip.estado === 'CANCELADO') this.emit('tripCancelled', trip);

          this.currentTrip = trip;
        }
      )
      .subscribe();
  }

  // =========================================================
  // REFRESH
  // =========================================================
  _startRefreshInterval(driverId) {
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(() => {
      this._loadInitialState(driverId);
    }, CONFIG.TRIP_REFRESH_INTERVAL || 5000);
  }

  // =========================================================
  // ACTIONS
  // =========================================================
  async acceptTrip(tripId) {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return { success: false, error: 'No driverId' };

    const { data, error } = await supabaseService.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    if (error) {
      console.error('[TripManager] RPC accept error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.ok) {
      return { success: false, error: data?.reason || 'No se pudo aceptar el viaje' };
    }

    return { success: true };
  }

  async rejectTrip(tripId, reason = 'RECHAZADO_POR_CHOFER') {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viaje_ofertas')
      .update({
        estado: 'RECHAZADA',
        rechazo_motivo: reason,
        responded_at: new Date().toISOString()
      })
      .eq('viaje_id', tripId)
      .eq('chofer_id', driverId)
      .eq('estado', 'PENDIENTE');

    if (error) {
      console.error('[TripManager] Reject error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async startTrip(tripId) {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viajes')
      .update({
        estado: 'EN_CURSO',
        iniciado_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('chofer_id', driverId);

    if (error) {
      console.error('[TripManager] Start trip error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async finishTrip(tripId) {
    const driverId = supabaseService.getDriverId();
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viajes')
      .update({
        estado: 'COMPLETADO',
        completado_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('chofer_id', driverId);

    if (error) {
      console.error('[TripManager] Finish trip error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  // =========================================================
  // GETTERS
  // =========================================================
  getCurrentTrip() {
    return this.currentTrip;
  }

  getPendingTrip() {
    return this.pendingOffer;
  }
}

export default new TripManager();
