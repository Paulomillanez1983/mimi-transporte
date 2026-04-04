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

    this.offerChannel = null;
    this.tripChannel = null;

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
        localStorage.getItem('driverId') ||
        sessionStorage.getItem('driverId') ||
        null;

      // Fallback real: buscar chofer desde auth si el cache falló
      if (!driverId && supabaseService.client?.auth) {
  const { data: { user } } = await supabaseService.client.auth.getUser();

  if (user?.id) {
    const { data: chofer, error } = await supabaseService.client
      .from('choferes')
      .select('id_uuid')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[TripManager] Error buscando chofer por user_id:', error);
    }

    if (chofer?.id_uuid) {
      driverId = chofer.id_uuid;
      localStorage.setItem('driverId', driverId);
      sessionStorage.setItem('driverId', driverId);
    }
  }
}

      if (!driverId) {
        console.error('[TripManager] ❌ No driverId available after fallback');
        return false;
      }

      this.driverId = driverId;
      await supabaseService.client
  .from('choferes')
  .update({
    online: true,
    disponible: true,
    last_seen_at: new Date().toISOString()
  })
  .eq('id_uuid', driverId);

      console.log('[TripManager] ✅ Initializing for driver UUID:', driverId);

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
    if (this.isLoadingInitial || this.isRefreshingOffers) return;

    this.isLoadingInitial = true;
    this.isRefreshingOffers = true;

    try {
      // =====================================================
      // 1) ACTIVE TRIP
      // =====================================================
      const { data: activeTrip, error: tripError } = await supabaseService.client
        .from('viajes')
        .select('*')
        .eq('chofer_id_uuid', driverId)
        .in('estado', ['ASIGNADO', 'ACEPTADO', 'EN_CURSO'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tripError) {
        console.error('[TripManager] Error loading active trip:', tripError);
      }

      if (activeTrip) {
        console.log('[TripManager] Active trip found:', activeTrip.id, activeTrip.estado);

      if (activeTrip) {
        console.log('[TripManager] Active trip found:', activeTrip.id, activeTrip.estado);

        this.currentTrip = activeTrip;
        this.pendingOffer = null;
        this.lastOfferIdShown = null;

        // ASIGNADO / ACEPTADO / EN_CURSO son viaje activo, no oferta pendiente
        if (activeTrip.estado === 'EN_CURSO') {
          this.emit('tripStarted', activeTrip);
        } else {
          this.emit('tripAccepted', activeTrip);
        }

        return;
      }
      // Si NO hay viaje activo, limpiar estado viejo
      this.currentTrip = null;

      // =====================================================
      // 2) PENDING OFFERS (SOLO VIGENTES)
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
      // 3) SELECT FIRST REALLY VALID OFFER
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
      // 4) FETCH TRIP OR COTIZACION DATA
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

        // Validación extra: si el viaje ya no está ofertable, no mostrarlo
        if (trip && !['OFERTADO', 'ASIGNADO', 'DISPONIBLE', 'ACEPTADO', 'EN_CURSO'].includes(trip.estado)) {
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

      // =====================================================
      // 6) ANTI-PARPADEO
      // =====================================================
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
  }

  // =========================================================
  // OFFERS ACTIONS
  // =========================================================
  async acceptOffer(offerId) {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    console.log('[TripManager] Accepting offer:', offerId);

    const { data: offer, error: offerError } = await supabaseService.client
      .from('viaje_ofertas')
      .select('*')
      .eq('id', offerId)
      .eq('chofer_id', driverId)
      .single();

    if (offerError || !offer) {
      console.error('[TripManager] Offer not found:', offerError);
      return { success: false, error: 'Oferta no encontrada' };
    }

    // Blindaje local contra ofertas vencidas
    if (offer?.expires_at) {
      const expiresAt = new Date(offer.expires_at).getTime();
      if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
        console.warn('[TripManager] Offer expired before accept:', offer.id);

        this.pendingOffer = null;
        this.lastOfferIdShown = null;
        this.emit('pendingTripCleared', { reason: 'offer_expired_before_accept' });

        await this._loadInitialState(driverId);

        return { success: false, error: 'OFERTA_EXPIRADA' };
      }
    }

    if (offer.viaje_id) {
      return await this.acceptTrip(offer.viaje_id);
    }

    if (offer.cotizacion_id) {
      return { success: false, error: 'COTIZACION_NO_IMPLEMENTADA' };
    }

    return { success: false, error: 'Oferta inválida (sin viaje_id/cotizacion_id)' };
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
          await this._loadInitialState(driverId);
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
          filter: `chofer_id_uuid=eq.${driverId}`
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
          }
        }
      )
      .subscribe((status) => {
        console.log('[TripManager] Trip channel status:', status);
      });
    }
  }

    
    
    // =========================================================
  // REFRESH
  // =========================================================
  _startRefreshInterval(driverId) {
    if (this.refreshInterval) clearInterval(this.refreshInterval);

    this.refreshInterval = setInterval(() => {
    if (this.currentTrip) return;
    if (this.pendingOffer) return;
    if (this.isLoadingInitial || this.isRefreshingOffers) return;
      this._loadInitialState(driverId);
    }, 6000);
  }

  // =========================================================
  // ACTIONS (VIAJES)
  // =========================================================
  async acceptTrip(tripId) {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    console.log('[TripManager] Calling RPC aceptar_oferta_viaje...', tripId, driverId);

    const rpcPromise = supabaseService.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('RPC_TIMEOUT') }), 8000)
    );

    try {
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

      if (error) {
        console.error('[TripManager] RPC accept error:', error);
        return { success: false, error: error.message };
      }

      console.log('[TripManager] RPC raw response:', data);

      let result = null;

      if (data?.ok !== undefined) {
        result = data;
      }

      if (!result && Array.isArray(data)) {
        result = data?.[0]?.aceptar_oferta_viaje;
      }

      if (!result) {
        console.error('[TripManager] Invalid RPC response format:', data);
        return { success: false, error: 'Respuesta RPC inválida' };
      }

      if (!result.ok) {
        console.warn('[TripManager] Offer rejected:', result.reason);

        if (['OFERTA_NO_DISPONIBLE', 'VIAJE_YA_TOMADO', 'VIAJE_BLOQUEADO'].includes(result.reason)) {
          this.pendingOffer = null;
          this.lastOfferIdShown = null;

          this.emit('pendingTripCleared', {
            reason: result.reason,
            tripId
          });

          console.log('[TripManager] Refreshing offers after rejection...');
          this.currentTrip = { id: tripId };
          await this._loadInitialState(driverId);
        }

        return { success: false, error: result.reason || 'No se pudo aceptar el viaje' };
      }

      this.pendingOffer = null;
      this.lastOfferIdShown = null;

      this.currentTrip = { id: tripId };

      this.emit('pendingTripCleared', { reason: 'offer_accepted' });

      await this._loadInitialState(driverId);
      return { success: true };

    } catch (err) {
      console.error('[TripManager] RPC FAILED:', err);
      return { success: false, error: err.message };
    }
  }

  async rejectTrip(reason = 'RECHAZADO_POR_CHOFER') {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    if (!this.pendingOffer?.offerId) {
      return { success: false, error: 'No offerId disponible' };
    }

    const { error } = await supabaseService.client
      .from('viaje_ofertas')
      .update({
        estado: 'rechazada',
        respondida_en: new Date().toISOString()
      })
      .eq('id', this.pendingOffer.offerId)
      .eq('chofer_id', driverId)
      .eq('estado', 'pendiente');

    if (error) {
      console.error('[TripManager] Reject error:', error);
      return { success: false, error: error.message };
    }

    this.pendingOffer = null;
    this.lastOfferIdShown = null;

    this.emit('pendingTripCleared', { reason: 'trip_rejected' });

    await this._loadInitialState(driverId);

    return { success: true };
  }

async startTrip(tripId) {
  const driverId = this.driverId;
  if (!driverId) return { success: false, error: 'No driverId' };

  const now = new Date().toISOString();

  const { error } = await supabaseService.client
    .from('viajes')
    .update({
      estado: 'EN_CURSO',
      iniciado_at: now,
      updated_at: now
    })
    .eq('id', tripId)
    .eq('chofer_id_uuid', driverId);

  if (error) {
    console.error('[TripManager] Start trip error:', error);
    return { success: false, error: error.message };
  }

  // 🚕 Chofer ocupado
  await supabaseService.client
    .from('choferes')
    .update({
      disponible: false,
      last_seen_at: now
    })
    .eq('id_uuid', driverId);

  return { success: true };
}
async finishTrip(tripId) {
  const driverId = this.driverId;
  if (!driverId) return { success: false, error: 'No driverId' };

  const now = new Date().toISOString();

  const { error } = await supabaseService.client
    .from('viajes')
    .update({
      estado: 'COMPLETADO',
      completado_at: now,
      updated_at: now
    })
    .eq('id', tripId)
    .eq('chofer_id_uuid', driverId);

  if (error) {
    console.error('[TripManager] Finish trip error:', error);
    return { success: false, error: error.message };
  }

  // 🚕 Chofer vuelve a disponible
  await supabaseService.client
    .from('choferes')
    .update({
      disponible: true,
      last_seen_at: now
    })
    .eq('id_uuid', driverId);

  return { success: true };
}
  async cancelTrip(tripId, motivo = 'CANCELADO_POR_CHOFER') {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    console.log('[TripManager] Cancelando viaje:', tripId);

    const { error } = await supabaseService.client
      .from('viajes')
      .update({
        estado: 'CANCELADO',
        cancelado_at: new Date().toISOString(),
        cancelado_por: 'CHOFER',
        cancel_reason: motivo,
        updated_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('chofer_id_uuid', driverId);

    if (error) {
      console.error('[TripManager] Cancel trip error:', error);
      return { success: false, error: error.message };
    }

    this.currentTrip = null;
    this.pendingOffer = null;
    this.lastOfferIdShown = null;

    this.emit('tripCancelled', { id: tripId });
    this.emit('pendingTripCleared', { reason: 'trip_cancelled' });

    return { success: true };
  }
async _redispatchViaje(viajeId) {
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
