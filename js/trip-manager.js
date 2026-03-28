/**
 * MIMI Driver - Trip Manager (PRODUCTION FINAL)
 * Business logic for trip lifecycle
 */

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingOffer = null;

    this.refreshInterval = null;
    this.isLoadingInitial = false;
  }

  async initialize() {
    const driverId = supabaseClient.getDriverId();
    if (!driverId) throw new Error('Not authenticated');

    console.log('[TripManager] Initializing for driver UID:', driverId);

    await this._loadInitialState();

    this._subscribeToRealtime(driverId);
    this._startRefreshInterval();

    return this;
  }

  // =========================================================
  // LOAD INITIAL STATE
  // =========================================================

  async _loadInitialState() {
    if (this.isLoadingInitial) return;
    this.isLoadingInitial = true;

    const driverId = supabaseClient.getDriverId();
    if (!driverId) {
      this.isLoadingInitial = false;
      return;
    }

    try {
      // 1) CHECK ACTIVE TRIP
      const { data: activeTrip, error: tripError } =
        await supabaseClient.getActiveTrip(driverId);

      if (tripError) {
        console.error('[TripManager] Error loading active trip:', tripError);
      }

      if (activeTrip) {
        console.log('[TripManager] Active trip found:', activeTrip.id);

        this.currentTrip = activeTrip;
        this.pendingOffer = null;

        stateManager.set('trip.current', activeTrip);
        stateManager.set('trip.pending', null);

        if (activeTrip.estado === 'ACEPTADO') {
          stateManager.transitionDriver(CONFIG.DRIVER_STATES.GOING_TO_PICKUP);
        } else if (activeTrip.estado === 'EN_CURSO') {
          stateManager.transitionDriver(CONFIG.DRIVER_STATES.IN_PROGRESS);
        } else {
          stateManager.transitionDriver(CONFIG.DRIVER_STATES.GOING_TO_PICKUP);
        }

        this.isLoadingInitial = false;
        return;
      }

      // 2) CHECK PENDING OFFERS
      const { data: offers, error: offerError } =
        await supabaseClient.getPendingOffers(driverId);

      if (offerError) {
        console.error('[TripManager] Error loading offers:', offerError);
      }

      if (offers && offers.length > 0) {
        const offer = offers[0];

        // Anti spam: if already loaded, skip
        if (this.pendingOffer?.offerId === offer.id) {
          console.log('[TripManager] Offer already loaded, skipping refresh');
          this.isLoadingInitial = false;
          return;
        }

        console.log('[TripManager] Pending offer found:', offer.id);

        this.pendingOffer = {
          ...offer.viajes,
          offerId: offer.id,
          expiresAt: offer.expires_at
        };

        stateManager.set('trip.pending', this.pendingOffer);

        // IMPORTANT: allow transition from OFFLINE too
        const ok = stateManager.transitionDriver(CONFIG.DRIVER_STATES.RECEIVING_OFFER);

        if (!ok) {
          console.warn('[TripManager] Could not transition to RECEIVING_OFFER');
        }

      } else {
        console.log('[TripManager] No pending offers');
        this.pendingOffer = null;
        stateManager.set('trip.pending', null);
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

    supabaseClient.subscribeToOffers(driverId, {
      onOffer: (payload) => this._handleOfferUpdate(payload),
      onError: (err) => console.error('[TripManager] Offer subscription error:', err)
    });

    supabaseClient.subscribeToTrips(driverId, {
      onTrip: (payload) => this._handleTripUpdate(payload)
    });
  }

  async _handleOfferUpdate(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (this.currentTrip) {
      console.log('[TripManager] Ignoring offer (active trip exists)');
      return;
    }

    if (eventType === 'INSERT') {
      if (newRecord?.estado === 'PENDIENTE') {
        await this._fetchAndShowOffer(newRecord);
      }
    }

    if (eventType === 'UPDATE') {
      if (
        newRecord?.estado !== 'PENDIENTE' &&
        this.pendingOffer?.offerId === newRecord?.id
      ) {
        console.log('[TripManager] Offer no longer pending');

        this.pendingOffer = null;
        stateManager.set('trip.pending', null);

        if (stateManager.get('driver.status') === CONFIG.DRIVER_STATES.RECEIVING_OFFER) {
          stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);
        }
      }
    }

    if (eventType === 'DELETE') {
      if (this.pendingOffer?.offerId === oldRecord?.id) {
        console.log('[TripManager] Offer deleted');

        this.pendingOffer = null;
        stateManager.set('trip.pending', null);

        if (stateManager.get('driver.status') === CONFIG.DRIVER_STATES.RECEIVING_OFFER) {
          stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);
        }
      }
    }
  }

  async _fetchAndShowOffer(offerRecord) {
    try {
      const { data: trip, error } = await supabaseClient.client
        .from('viajes')
        .select('*')
        .eq('id', offerRecord.viaje_id)
        .single();

      if (error) {
        console.error('[TripManager] Fetch offer error:', error);
        return;
      }

      if (!trip) return;

      this.pendingOffer = {
        ...trip,
        offerId: offerRecord.id,
        expiresAt: offerRecord.expires_at
      };

      console.log('[TripManager] Showing new offer trip:', trip.id);

      stateManager.set('trip.pending', this.pendingOffer);

      const ok = stateManager.transitionDriver(CONFIG.DRIVER_STATES.RECEIVING_OFFER);
      if (!ok) {
        console.warn('[TripManager] Transition RECEIVING_OFFER blocked');
      }

    } catch (error) {
      console.error('[TripManager] Fetch error:', error);
    }
  }

  _handleTripUpdate(payload) {
    const { eventType, new: newRecord } = payload;
    if (!newRecord) return;

    const estado = newRecord.estado;
    console.log(`[TripManager] Trip ${newRecord.id} -> ${estado}`);

    if (['ACEPTADO', 'EN_CURSO'].includes(estado)) {
      this.currentTrip = newRecord;
      stateManager.set('trip.current', newRecord);

      this.pendingOffer = null;
      stateManager.set('trip.pending', null);

      if (estado === 'ACEPTADO') {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.GOING_TO_PICKUP);
      } else {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.IN_PROGRESS);
      }
    }

    if (['COMPLETADO', 'CANCELADO'].includes(estado)) {
      const wasCurrent = this.currentTrip?.id === newRecord.id;

      this.currentTrip = null;
      stateManager.set('trip.current', null);

      if (wasCurrent) {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);

        if (estado === 'COMPLETADO') {
          soundService.feedback('arrival');
        }
      }
    }
  }

  // =========================================================
  // REFRESH
  // =========================================================

  _startRefreshInterval() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(() => {
      if (!this.currentTrip) {
        this._loadInitialState();
      }
    }, CONFIG.TRIP_REFRESH_INTERVAL || 5000);
  }

  // =========================================================
  // PUBLIC ACTIONS
  // =========================================================

  async acceptOffer(tripId) {
    const driverId = supabaseClient.getDriverId();

    try {
      const { data, error } = await supabaseClient.acceptOffer(tripId, driverId);

      if (error) throw error;

      if (data?.ok) {
        soundService.feedback('accept');
        return { success: true };
      }

      return { success: false, error: data?.reason || 'Unknown error' };

    } catch (error) {
      console.error('[TripManager] Accept error:', error);
      soundService.feedback('error');
      return { success: false, error: error.message };
    }
  }

  async rejectOffer(tripId, reason = 'RECHAZADO_POR_CHOFER') {
    const driverId = supabaseClient.getDriverId();

    try {
      await supabaseClient.rejectOffer(tripId, driverId, reason);

      this.pendingOffer = null;
      stateManager.set('trip.pending', null);

      stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);

      return { success: true };

    } catch (error) {
      console.error('[TripManager] Reject error:', error);
      return { success: false, error: error.message };
    }
  }

  async startTrip(tripId) {
    const driverId = supabaseClient.getDriverId();

    try {
      const { data, error } = await supabaseClient.startTrip(tripId, driverId);

      if (error) throw error;

      if (data?.ok) {
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.IN_PROGRESS);
        return { success: true };
      }

      return { success: false, error: 'Could not start trip' };

    } catch (error) {
      console.error('[TripManager] Start error:', error);
      return { success: false, error: error.message };
    }
  }

  async completeTrip(tripId) {
    const driverId = supabaseClient.getDriverId();

    try {
      const { data, error } = await supabaseClient.completeTrip(tripId, driverId);

      if (error) throw error;

      if (data?.ok) {
        soundService.feedback('arrival');
        return { success: true };
      }

      return { success: false, error: 'Could not complete trip' };

    } catch (error) {
      console.error('[TripManager] Complete error:', error);
      return { success: false, error: error.message };
    }
  }

  // =========================================================
  // GETTERS
  // =========================================================

  getCurrentTrip() {
    return this.currentTrip;
  }

  getPendingOffer() {
    return this.pendingOffer;
  }

  // =========================================================
  // DESTROY
  // =========================================================

  destroy() {
    supabaseClient.unsubscribeAll();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

const tripManager = new TripManager();
