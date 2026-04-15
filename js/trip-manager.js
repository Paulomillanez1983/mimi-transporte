/**
 * MIMI Driver - Trip Manager (PRODUCTION FINAL FIXED)
 * Business logic for trip lifecycle
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class TripManager {
  constructor() {
    this.currentTrip = null;
    this.pendingOffer = null;
    this._loadingPromise = null;

    this.offerChannel = null;
    this.tripChannel = null;
    this._debounceTimer = null;
    this.refreshInterval = null;
    this.isLoadingInitial = false;
    this.isRefreshingOffers = false;

    this.listeners = new Map();

    this.driverId = null;

    this.lastOfferIdShown = null; // anti-parpadeo modal
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
      try {
        cb(payload);
      } catch (e) {
        console.error('[TripManager] Listener error:', e);
      }
    });
  }

  // =========================================================
  // INIT
  // =========================================================
async init(driverIdParam = null) {
  try {
    await supabaseService.ensureDriverProfile();

    let driverId =
      driverIdParam ||
      supabaseService.getDriverId?.() ||
      null;

    if (!driverId && supabaseService.client?.auth) {
      const {
        data: { user },
        error: userError
      } = await supabaseService.client.auth.getUser();

      if (userError) {
        console.error('[TripManager] Error obteniendo auth user:', userError);
      }

      if (user?.id) {
        driverId = user.id;
      }
    }

    if (!driverId) {
      console.error('[TripManager] ❌ No driverId available after fallback');
      return false;
    }

    this.driverId = driverId;

    console.log('[TripManager] ✅ Initializing for driver user_id:', driverId);
    await this._loadInitialState(driverId);
    this._subscribeToRealtime(driverId);
    this._startRefreshInterval(driverId);

    return true;
  } catch (error) {
    console.error('[TripManager] ❌ Init error:', error);
    return false;
  }
}
  // =========================================================
  // LOAD INITIAL STATE
  // =========================================================
  async _loadInitialState(driverId) {
    if (this._loadingPromise) return this._loadingPromise;

    this._loadingPromise = (async () => {
      this.isLoadingInitial = true;
      this.isRefreshingOffers = true;

      try {
        // =====================================================
        // 1) ACTIVE TRIP
        // =====================================================
        const { data: activeTrip, error: tripError } = await supabaseService.client
          .from('viajes')
          .select('*')
          .eq('chofer_user_id', driverId)
          .in('estado', ['ASIGNADO', 'ACEPTADO', 'EN_CURSO'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tripError) {
          console.error('[TripManager] Error loading active trip:', tripError);
        }

        if (activeTrip) {
          console.log('[TripManager] Active trip found:', activeTrip.id, activeTrip.estado);

          this.currentTrip = activeTrip;
          this.emit('noPendingTrips');
          this.pendingOffer = null;
          this.lastOfferIdShown = null;

          if (activeTrip.estado === 'EN_CURSO') {
            this.emit('tripStarted', activeTrip);
          } else {
            this.emit('tripAccepted', activeTrip);
          }

          return;
        }

        this.currentTrip = null;

        // =====================================================
        // 2) PENDING OFFERS
        // =====================================================
        console.log('[TripManager] Checking offers for driver:', driverId);

        const nowIso = new Date().toISOString();

        const { data: offers, error: offerError } = await supabaseService.client
          .from('viaje_ofertas')
          .select('id, viaje_id, cotizacion_id, chofer_id, estado, enviada_en, respondida_en, expires_at')
          .eq('chofer_id', driverId)
          .eq('estado', 'pendiente')
          .gt('expires_at', nowIso)
          .order('enviada_en', { ascending: false })
          .limit(5);

        console.log('[TripManager] Offers fetched:', offers, offerError);

        if (offerError) {
          console.error('[TripManager] Error loading offers:', offerError);
        }

        if (!offers || offers.length === 0) {
          if (this.pendingOffer) {
            this.emit('pendingTripCleared', { reason: 'no_offers' });
          }

          this.pendingOffer = null;
          this.lastOfferIdShown = null;
          this.emit('noPendingTrips');
          return;
        }

        // =====================================================
        // 3) VALID OFFER
        // =====================================================
        const validOffer = offers.find((offer) => {
          if (!offer) return false;
          if (offer.estado !== 'pendiente') return false;
          if (!offer.expires_at) return false;

          const expiresAt = new Date(offer.expires_at).getTime();
          if (Number.isNaN(expiresAt)) return false;

          return expiresAt > Date.now();
        });

        if (!validOffer) {
          console.warn('[TripManager] No valid non-expired offer found');

          if (this.pendingOffer) {
            this.emit('pendingTripCleared', { reason: 'all_offers_expired' });
          }

          this.pendingOffer = null;
          this.lastOfferIdShown = null;
          this.emit('noPendingTrips');
          return;
        }

        if (!validOffer?.viaje_id && !validOffer?.cotizacion_id) {
          console.warn('[TripManager] Offer has no viaje_id and no cotizacion_id:', validOffer);

          if (this.pendingOffer) {
            this.emit('pendingTripCleared', { reason: 'invalid_offer' });
          }

          this.pendingOffer = null;
          this.lastOfferIdShown = null;
          this.emit('noPendingTrips');
          return;
        }

        // =====================================================
        // 4) FETCH TRIP OR COTIZACION
        // =====================================================
        let trip = null;

        if (validOffer.viaje_id) {
          const { data, error } = await supabaseService.client
            .from('viajes')
            .select('*')
            .eq('id', validOffer.viaje_id)
            .single();

          if (error) {
            console.error('[TripManager] Error fetching trip for offer:', error);

            this.pendingOffer = null;
            this.lastOfferIdShown = null;
            this.emit('noPendingTrips');
            return;
          }

          trip = data;

          const ESTADOS_VALIDOS_OFERTA = ['OFERTADO', 'ASIGNADO'];

          if (trip && !ESTADOS_VALIDOS_OFERTA.includes(trip.estado)) {
            console.warn('[TripManager] Offer ignored because trip is no longer offerable:', trip.id, trip.estado);

            this.pendingOffer = null;
            this.lastOfferIdShown = null;
            this.emit('noPendingTrips');
            return;
          }
        } else {
          const { data, error } = await supabaseService.client
            .from('cotizaciones')
            .select('*')
            .eq('id', validOffer.cotizacion_id)
            .single();

          if (error) {
            console.error('[TripManager] Error fetching cotizacion for offer:', error);

            this.pendingOffer = null;
            this.lastOfferIdShown = null;
            this.emit('noPendingTrips');
            return;
          }

          trip = data;
        }

        if (!trip) {
          console.warn('[TripManager] Trip/Cotizacion not found for offer:', validOffer.id);

          this.pendingOffer = null;
          this.lastOfferIdShown = null;
          this.emit('noPendingTrips');
          return;
        }

        // =====================================================
        // 5) SET PENDING OFFER
        // =====================================================
        this.pendingOffer = {
          ...trip,
          offerId: validOffer.id,
          viajeId: validOffer.viaje_id || null,
          cotizacionId: validOffer.cotizacion_id || null,
          enviadaEn: validOffer.enviada_en,
          expiresAt: validOffer.expires_at,
          tipo: validOffer.viaje_id ? 'VIAJE' : 'COTIZACION'
        };

        console.log('[TripManager] Pending offer found:', validOffer.id);

        if (this.lastOfferIdShown === validOffer.id) {
          console.log('[TripManager] Offer already shown, skipping emit');
        } else {
          this.lastOfferIdShown = validOffer.id;
          this.emit('newPendingTrip', this.pendingOffer);
        }
      } catch (error) {
        console.error('[TripManager] Load error:', error);
      } finally {
        this.isLoadingInitial = false;
        this.isRefreshingOffers = false;
      }
    })();

    try {
      return await this._loadingPromise;
    } finally {
      this._loadingPromise = null;
    }
  }
  
async rejectOffer(offerId) {
  const driverId = this.driverId;
  if (!driverId) return { success: false, error: 'No driverId' };

  console.log('[TripManager] Rejecting offer:', offerId);

  // Buscar viaje_id antes de rechazar
  const { data: ofertaActual, error: ofertaError } = await supabaseService.client
    .from('viaje_ofertas')
    .select('id, viaje_id, chofer_id, estado')
    .eq('id', offerId)
    .eq('chofer_id', driverId)
    .maybeSingle();

  if (ofertaError) {
    console.error('[TripManager] Error reading offer before reject:', ofertaError);
    return { success: false, error: ofertaError.message };
  }

  if (!ofertaActual) {
    return { success: false, error: 'Oferta no encontrada' };
  }

  const viajeId = ofertaActual.viaje_id || null;

  const { error } = await supabaseService.client
  .from('viaje_ofertas')
  .update({
    estado: 'rechazada',
    respondida_en: new Date().toISOString()
  })
  .eq('id', offerId)
  .eq('chofer_id', driverId)
  .in('estado', ['pendiente', 'enviada']);

  if (error) {
    console.error('[TripManager] RejectOffer error:', error);
    return { success: false, error: error.message };
  }

  this.pendingOffer = null;
  this.lastOfferIdShown = null;
  this.emit('pendingTripCleared', { reason: 'offer_rejected' });

  // Redispatch al siguiente chofer
  if (viajeId) {
    const redispatch = await this._redispatchViaje(viajeId);
    if (!redispatch.success) {
      console.warn('[TripManager] Reject ok, pero redispatch falló:', redispatch.error);
    }
  }

  await this._loadInitialState(driverId);

  return { success: true };
}
  // =========================================================
  // REALTIME
  // =========================================================
  _subscribeToRealtime(driverId) {
    console.log('[TripManager] Subscribing to realtime channels...', driverId);

    if (this.offerChannel) {
      supabaseService.client.removeChannel(this.offerChannel);
      this.offerChannel = null;
    }

    if (this.tripChannel) {
      supabaseService.client.removeChannel(this.tripChannel);
      this.tripChannel = null;
    }

    // =====================================================
    // OFERTAS
    // =====================================================
    this.offerChannel = supabaseService.client
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
          console.log('[TripManager] Offer realtime payload:', payload);
          this._debouncedRefresh(driverId);        
        }
      )
      .subscribe((status) => {
        console.log('[TripManager] Offer channel status:', status);
      });

    // =====================================================
    // VIAJES
    // =====================================================
    this.tripChannel = supabaseService.client
      .channel(`trips-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viajes',
          filter: `chofer_user_id=eq.${driverId}`
        },
        (payload) => {
          console.log('[TripManager] Trip realtime payload:', payload);

          const trip = payload.new;
          if (!trip) return;

          console.log('[TripManager] Trip update:', trip.id, trip.estado);

          if (trip.estado === 'ASIGNADO' || trip.estado === 'ACEPTADO') {
            this.emit('tripAccepted', trip);
          }

          if (trip.estado === 'EN_CURSO') {
            this.emit('tripStarted', trip);
          }

          if (trip.estado === 'COMPLETADO') {
            this.emit('tripCompleted', trip);
          }

          if (trip.estado === 'CANCELADO') {
            this.emit('tripCancelled', trip);
          }

               if (['ASIGNADO', 'ACEPTADO', 'EN_CURSO'].includes(trip.estado)) {
               this.currentTrip = trip;
               } else if (['COMPLETADO', 'CANCELADO'].includes(trip.estado)) {
               this.currentTrip = null;
               this.pendingOffer = null;
               this.lastOfferIdShown = null;

              this.emit('pendingTripCleared', { reason: 'trip_finished_realtime' });
              this.emit('noPendingTrips');
           }  
        }
      )
      .subscribe((status) => {
        console.log('[TripManager] Trip channel status:', status);
      });
  }
  _debouncedRefresh(driverId) {
    clearTimeout(this._debounceTimer);

    this._debounceTimer = setTimeout(() => {
      this._loadInitialState(driverId);
    }, 400);
  }    
    // =========================================================
  // REFRESH
  // =========================================================
  _startRefreshInterval(driverId) {
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(() => {
      if (this.isLoadingInitial || this.isRefreshingOffers) return;
      this._loadInitialState(driverId);
    }, CONFIG.TRIP_REFRESH_INTERVAL || 8000);
  }

async setDriverAvailability({ online, disponible }) {
  let authUserId = null;

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseService.client.auth.getUser();

    if (userError) {
      console.error('[TripManager] auth.getUser error:', userError);
      return { success: false, error: userError.message };
    }

    authUserId = user?.id || null;
  } catch (err) {
    console.error('[TripManager] auth.getUser failed:', err);
    return { success: false, error: err.message };
  }

  if (!authUserId) {
    return { success: false, error: 'No auth user id' };
  }

  const now = new Date().toISOString();

  const payload = {
    last_seen_at: now
  };

  if (typeof online === 'boolean') payload.online = online;
  if (typeof disponible === 'boolean') payload.disponible = disponible;

  const updatePromise = supabaseService.client
    .from('choferes')
    .update(payload)
    .eq('user_id', authUserId);

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ error: new Error('TIMEOUT_ACTUALIZANDO_CHOFER') }), 8000)
  );

  const result = await Promise.race([updatePromise, timeoutPromise]);
  const error = result?.error || null;

  if (error) {
    console.error('[TripManager] setDriverAvailability error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
  
  // =========================================================
  // ACTIONS (VIAJES)
  // =========================================================
  async _invokeEdgeFunction(functionName, body = {}) {
    try {
      const sessionData = await supabaseService.client.auth.getSession();
      const accessToken = sessionData?.data?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'No access token' };
      }

      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CONFIG.SUPABASE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });

      const raw = await res.text();
      let json = null;

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (_) {
        json = { raw };
      }

      if (!res.ok) {
        return {
          success: false,
          error: json?.error || json?.message || `HTTP ${res.status}`,
          body: json,
          status: res.status
        };
      }

      return {
        success: !!(json?.exito || json?.ok),
        data: json,
        body: json,
        error: json?.error || null
      };
    } catch (err) {
      console.error(`[TripManager] Edge ${functionName} error:`, err);
      return {
        success: false,
        error: err.message || `Error invocando ${functionName}`
      };
    }
  }

  async acceptOffer(offerId) {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };
    if (!offerId) return { success: false, error: 'No offerId disponible' };

    const { data: offerRow, error: offerError } = await supabaseService.client
      .from('viaje_ofertas')
      .select('id, viaje_id, chofer_id, estado')
      .eq('id', offerId)
      .eq('chofer_id', driverId)
      .in('estado', ['pendiente', 'enviada'])
      .maybeSingle();

    if (offerError) {
      console.error('[TripManager] Error reading offer before accept:', offerError);
      return { success: false, error: offerError.message };
    }

    if (!offerRow?.viaje_id) {
      return { success: false, error: 'Oferta no encontrada o sin viaje asociado' };
    }

    const result = await this._invokeEdgeFunction('aceptar-viaje-ts', {
      viaje_id: offerRow.viaje_id,
      chofer_id: driverId
    });

    if (!result.success) {
      const paso = result?.body?.paso || '';
      if (
        [
          'viaje_ya_asignado',
          'estado_final',
          'estado_invalido',
          'chofer_no_autorizado',
          'oferta_vencida'
        ].includes(paso)
      ) {
        this.pendingOffer = null;
        this.lastOfferIdShown = null;
        this.emit('pendingTripCleared', { reason: result.error || 'offer_unavailable' });
        await this._loadInitialState(driverId);
      }

      return { success: false, error: result.error || 'No se pudo aceptar el viaje' };
    }

    this.pendingOffer = null;
    this.lastOfferIdShown = null;
    this.emit('pendingTripCleared', { reason: 'offer_accepted' });

    await this._loadInitialState(driverId);
    return { success: true, data: result.data };
  }

  async acceptTrip(tripId) {
    return this.acceptOffer(tripId);
  }

  async rejectTrip(reason = 'RECHAZADO_POR_CHOFER') {
    return this.rejectOffer(this.pendingOffer?.offerId, reason);
  }

async startTrip(tripId) {
  const driverId = this.driverId;
  if (!driverId) return { success: false, error: 'No driverId' };

  const result = await this._invokeEdgeFunction('iniciar-viaje-ts', {
    viaje_id: tripId,
    chofer_id: driverId
  });

  if (!result.success) {
    console.error('[TripManager] Start trip error:', result.error);
    return { success: false, error: result.error };
  }

  // 🚕 Chofer ocupado
  await supabaseService.client
    .from('choferes')
    .update({
      disponible: false,
      last_seen_at: new Date().toISOString()
    })
    .eq('user_id', driverId);

  return { success: true, data: result.data };
}
async finishTrip(tripId) {
  const driverId = this.driverId;
  if (!driverId) return { success: false, error: 'No driverId' };

  const result = await this._invokeEdgeFunction('completar-viaje-ts', {
    viaje_id: tripId,
    chofer_id: driverId
  });

  if (!result.success) {
    console.error('[TripManager] Finish trip error:', result.error);
    return { success: false, error: result.error };
  }

  // 🚕 Chofer vuelve a disponible
  await supabaseService.client
    .from('choferes')
    .update({
      disponible: true,
      last_seen_at: new Date().toISOString()
    })
    .eq('user_id', driverId);

  return { success: true, data: result.data };
}

  async cancelTrip(tripId, motivo = 'CANCELADO_POR_CHOFER') {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    console.log('[TripManager] Cancelando viaje:', tripId);

    const result = await this._invokeEdgeFunction('cancelar-viaje-ts', {
      viaje_id: tripId,
      chofer_id: driverId,
      cancelado_por: 'chofer',
      motivo
    });

    if (!result.success) {
      console.error('[TripManager] Cancel trip error:', result.error);
      return { success: false, error: result.error };
    }

    await supabaseService.client
      .from('choferes')
      .update({
        disponible: true,
        last_seen_at: new Date().toISOString()
      })
      .eq('user_id', driverId);

    this.currentTrip = null;
    this.pendingOffer = null;
    this.lastOfferIdShown = null;

    this.emit('tripCancelled', { id: tripId });
    this.emit('pendingTripCleared', { reason: 'trip_cancelled' });

    await this._loadInitialState(driverId);

    return { success: true, data: result.data };
  }
    async _redispatchViaje(viajeId, attempt = 0) {
    if (!viajeId) return { success: false, error: 'No viajeId' };

    try {
      const sessionData = await supabaseService.client.auth.getSession();
      const accessToken = sessionData?.data?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'No access token' };
      }

      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/dispatch-viaje`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CONFIG.SUPABASE_KEY,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          viaje_id: viajeId,
          timeout_seconds: CONFIG.INCOMING_OFFER_TIMEOUT || 15
        })
      });

      const raw = await res.text();
      let json = null;

      try {
        json = raw ? JSON.parse(raw) : null;
      } catch (_) {
        json = { raw };
      }

      if (!res.ok) {
        console.warn('[TripManager] redispatch HTTP error:', res.status, json);

        if (res.status >= 500 && attempt < 1) {
          console.log('[TripManager] retry redispatch...');
          await new Promise(r => setTimeout(r, 800));
          return this._redispatchViaje(viajeId, attempt + 1);
        }

        return {
          success: false,
          error: json?.error || `HTTP ${res.status}`,
          body: json
        };
      }

      console.log('[TripManager] redispatch OK:', json);
      return { success: true, data: json };
    } catch (err) {
      console.error('[TripManager] redispatch error:', err);
      return { success: false, error: err.message };
    }
  }
  
  // =========================================================
  // MANUAL REFRESH
  // =========================================================
  async refresh() {
    if (!this.driverId) return;
    await this._loadInitialState(this.driverId);
  }

  // =========================================================
  // CLEANUP
  // =========================================================
  destroy() {
    if (this.offerChannel) {
      supabaseService.client.removeChannel(this.offerChannel);
      this.offerChannel = null;
    }

    if (this.tripChannel) {
      supabaseService.client.removeChannel(this.tripChannel);
      this.tripChannel = null;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.currentTrip = null;
    this.pendingOffer = null;
    this.lastOfferIdShown = null;
    this.driverId = null;
    this.isLoadingInitial = false;
    this.isRefreshingOffers = false;

    console.log('[TripManager] Destroyed');
  }
// =========================================================
// STATE RESET (ANTI BUGS)
// =========================================================
resetState() {
  this.currentTrip = null;
  this.pendingOffer = null;
  this.lastOfferIdShown = null;

  this.emit('pendingTripCleared', { reason: 'manual_reset' });
  this.emit('noPendingTrips');
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

  getDriverId() {
    return this.driverId;
  }
}

export default new TripManager();
