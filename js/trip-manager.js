/**
 * MIMI Driver - Trip Manager
 * Business logic for trip lifecycle
 */

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingOffer = null;
    this.subscriptions = [];
    this.refreshInterval = null;
  }

  async initialize() {
    const driverId = supabaseClient.getDriverId();
    if (!driverId) throw new Error('Not authenticated');

    console.log('[TripManager] Initializing for driver:', driverId);

    // Load initial state
    await this._loadInitialState();

    // Subscribe to realtime
    this._subscribeToRealtime(driverId);

    // Start background refresh
    this._startRefreshInterval();

    return this;
  }

  async _loadInitialState() {
    const driverId = supabaseClient.getDriverId();

    try {
      // Check for active trip first
      const { data: activeTrip, error: tripError } = await supabaseClient.getActiveTrip(driverId);
      
      if (tripError) {
        console.error('[TripManager] Error loading active trip:', tripError);
      }
      
      if (activeTrip) {
        console.log('[TripManager] Active trip found:', activeTrip.id);
        this.currentTrip = activeTrip;
        stateManager.set('trip.current', activeTrip);
        
        // Determine correct state
        const driverState = activeTrip.estado === 'ACEPTADO' 
          ? CONFIG.DRIVER_STATES.GOING_TO_PICKUP
          : CONFIG.DRIVER_STATES.IN_PROGRESS;
        
        stateManager.transitionDriver(driverState);
        return;
      }

      // Check for pending offers
      const { data: offers, error: offerError } = await supabaseClient.getPendingOffers(driverId);
      
      if (offerError) {
        console.error('[TripManager] Error loading offers:', offerError);
      }
      
      if (offers && offers.length > 0) {
        const offer = offers[0];
        console.log('[TripManager] Pending offer found:', offer.id);
        
        this.pendingOffer = {
          ...offer.viajes,
          offerId: offer.id,
          expiresAt: offer.expires_at
        };
        
        stateManager.set('trip.pending', this.pendingOffer);
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.RECEIVING_OFFER);
      } else {
        console.log('[TripManager] No pending offers');
        stateManager.set('trip.pending', null);
      }

    } catch (error) {
      console.error('[TripManager] Load error:', error);
    }
  }

  _subscribeToRealtime(driverId) {
    // Subscribe to offers
    const offersSub = supabaseClient.subscribeToOffers(driverId, {
      onOffer: (payload) => this._handleOfferUpdate(payload),
      onError: (err) => console.error('[TripManager] Offer subscription error:', err)
    });

    // Subscribe to trips
    const tripsSub = supabaseClient.subscribeToTrips(driverId, {
      onTrip: (payload) => this._handleTripUpdate(payload)
    });

    this.subscriptions.push(offersSub, tripsSub);
  }

  _handleOfferUpdate(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (newRecord?.estado === 'PENDIENTE') {
          this._fetchAndShowOffer(newRecord);
        }
        break;

      case 'UPDATE':
        if (newRecord?.estado !== 'PENDIENTE' && this.pendingOffer?.offerId === newRecord.id) {
          // Offer no longer pending
          this.pendingOffer = null;
          stateManager.set('trip.pending', null);
          
          if (stateManager.get('driver.status') === CONFIG.DRIVER_STATES.RECEIVING_OFFER) {
            stateManager.transitionDriver(CONFIG.DRIVER_STATES.ONLINE);
          }
        }
        break;

      case 'DELETE':
        if (this.pendingOffer?.offerId === oldRecord?.id) {
          this.pendingOffer = null;
          stateManager.set('trip.pending', null);
        }
        break;
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

      if (trip) {
        this.pendingOffer = {
          ...trip,
          offerId: offerRecord.id,
          expiresAt: offerRecord.expires_at
        };

        stateManager.set('trip.pending', this.pendingOffer);
        stateManager.transitionDriver(CONFIG.DRIVER_STATES.RECEIVING_OFFER);
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
    else if (['COMPLETADO', 'CANCELADO'].includes(estado)) {
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

  _startRefreshInterval() {
    this.refreshInterval = setInterval(() => {
      // Only refresh if no recent activity
      this._loadInitialState();
    }, CONFIG.TRIP_REFRESH_INTERVAL);
  }

  // Public actions
  async acceptOffer(tripId) {
    const driverId = supabaseClient.getDriverId();
    
    try {
      const { data, error } = await supabaseClient.acceptOffer(tripId, driverId);
      
      if (error) throw error;
      
      if (data?.ok) {
        soundService.feedback('accept');
        return { success: true };
      } else {
        return { success: false, error: data?.reason || 'Unknown error' };
      }
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

  getCurrentTrip() {
    return this.currentTrip;
  }

  getPendingOffer() {
    return this.pendingOffer;
  }

  destroy() {
    // Unsubscribe
    supabaseClient.unsubscribeAll();
    
    // Clear interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

const tripManager = new TripManager();
