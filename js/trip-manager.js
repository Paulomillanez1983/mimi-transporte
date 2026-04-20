/**
 * MIMI Driver - Trip Manager (PRODUCTION FINAL FIXED v2)
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
    this.tripAssignedChannel = null;
    this._debounceTimer = null;
    this.refreshInterval = null;
    this.isLoadingInitial = false;
    this.isRefreshingOffers = false;

    this.listeners = new Map();
    this.driverId = null;

    this.lastOfferIdShown = null;
    this._resetting = false;

    // Reintentos de reconexión para canales realtime
    this._reconnectAttempts = {
      offer: 0,
      trip: 0,
      tripAssigned: 0
    };
  }

  // =========================================================
  // DEBOUNCE & RECONEXIÓN
  // =========================================================
  _debouncedRefresh(driverId) {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._loadInitialState(driverId);
    }, 500);
  }

  // =========================================================
  // EVENT EMITTER SIMPLE
  // =========================================================
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(callback);

    return () => {
      const arr = this.listeners.get(event) || [];
      this.listeners.set(
        event,
        arr.filter((cb) => cb !== callback)
      );
    };
  }

  emit(event, payload) {
    const arr = this.listeners.get(event) || [];
    arr.forEach((cb) => {
      try {
        cb(payload);
      } catch (error) {
        console.error('[TripManager] Listener error:', error);
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
        supabaseService.driverId ||
        null;

      if (!driverId) {
        try {
          const {
            data: { user },
            error: userError
          } = await supabaseService.client.auth.getUser();

          if (userError) {
            console.error('[TripManager] Error obteniendo auth user:', userError);
          }

          if (user?.id) {
            const { data: chofer, error: choferError } = await supabaseService.client
              .from('choferes')
              .select('id_uuid')
              .eq('user_id', user.id)
              .maybeSingle();

            if (choferError) {
              console.error('[TripManager] Error resolviendo chofer.id_uuid:', choferError);
            }

            driverId = chofer?.id_uuid || null;
          }
        } catch (error) {
          console.error('[TripManager] Error resolviendo driverId real:', error);
        }
      }

      if (!driverId) {
        console.error('[TripManager] No driverId available after fallback');
        return false;
      }

      this.driverId = driverId;

      console.log('[TripManager] Initializing for chofer_id_uuid:', driverId);

      await this._loadInitialState(driverId);
      this._subscribeToRealtime(driverId);
      this._startRefreshInterval(driverId);

      return true;
    } catch (error) {
      console.error('[TripManager] Init error:', error);
      return false;
    }
  }

  _normalizeDriverTripState(trip) {
    if (!trip) return '';
    return String(trip.estado || '').trim().toUpperCase();
  }

  _handleTripRealtimePayload(payload) {
    const tripRaw = payload.new;
    if (!tripRaw) return;

    const trip = {
      ...tripRaw,
      estado: this._normalizeDriverTripState(tripRaw)
    };

    console.log('[TripManager] Trip update:', trip.id, trip.estado);

    const currentTripId = this.currentTrip?.id ? String(this.currentTrip.id) : null;
    const incomingTripId = trip?.id ? String(trip.id) : null;
    const isSameCurrentTrip =
      !!currentTripId &&
      !!incomingTripId &&
      currentTripId === incomingTripId;

    if ((trip.estado === 'ASIGNADO' || trip.estado === 'ACEPTADO') && !isSameCurrentTrip) {
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
      this.pendingOffer = null;
      this.lastOfferIdShown = null;
    } else if (trip.estado === 'OFERTADO') {
      this.currentTrip = null;
    } else if (['COMPLETADO', 'CANCELADO'].includes(trip.estado)) {
      this.currentTrip = null;
      this.pendingOffer = null;
      this.lastOfferIdShown = null;

      this.emit('pendingTripCleared', { reason: 'trip_finished_realtime' });
      this.emit('noPendingTrips');
    }
  }

  // =========================================================
  // LOAD INITIAL STATE (OPTIMIZADO)
  // =========================================================
  async _loadInitialState(driverId) {
    if (this._loadingPromise) {
      return this._loadingPromise;
    }

    this._loadingPromise = (async () => {
      this.isLoadingInitial = true;
      this.isRefreshingOffers = true;

      try {
        // =====================================================
        // 1) ACTIVE TRIP (UNA SOLA CONSULTA CON OR)
        // =====================================================
        const estadosActivos = ['ASIGNADO', 'ACEPTADO', 'EN_CURSO'];

        const { data: activeTrips, error: tripError } = await supabaseService.client
          .from('viajes')
          .select('*')
          .or(`chofer_id_uuid.eq.${driverId},assigned_driver_id.eq.${driverId}`)
          .in('estado', estadosActivos)
          .order('updated_at', { ascending: false })
          .limit(1);

        const activeTrip = activeTrips?.[0] || null;

        if (tripError) {
          console.error('[TripManager] Error loading active trip:', tripError);
        }

        if (activeTrip) {
          const normalizedState = this._normalizeDriverTripState(activeTrip);
          const normalizedTrip = {
            ...activeTrip,
            estado: normalizedState
          };

          console.log(
            '[TripManager] Active trip found:',
            normalizedTrip.id,
            normalizedTrip.estado
          );

          this.currentTrip = normalizedTrip;
          this.pendingOffer = null;
          this.lastOfferIdShown = null;

          if (normalizedState === 'EN_CURSO') {
            this.emit('tripStarted', normalizedTrip);
          } else {
            this.emit('tripAccepted', normalizedTrip);
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
  .eq('estado', 'PENDIENTE')
  .not('expires_at', 'is', null)

  
  .order('enviada_en', { ascending: false })
  .limit(1);
        console.log('[TripManager] Offers fetched:', offers, offerError, 'nowIso=', nowIso);

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
        const validOffer = offers[0] || null;

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

        if (!validOffer.viaje_id && !validOffer.cotizacion_id) {
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

          if (trip && !ESTADOS_VALIDOS_OFERTA.includes(String(trip.estado || '').toUpperCase())) {
            console.warn(
              '[TripManager] Offer ignored because trip is no longer offerable:',
              trip.id,
              trip.estado
            );

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
        const expiresAtMs = validOffer?.expires_at ? new Date(validOffer.expires_at).getTime() : 0;
const enviadaEnMs = validOffer?.enviada_en ? new Date(validOffer.enviada_en).getTime() : 0;
const nowMs = Date.now();

const remainingSeconds = Math.max(
  0,
  Math.round((expiresAtMs - nowMs) / 1000)
);
        const offerWindowSeconds = Math.max(
  1,
  Math.round((expiresAtMs - enviadaEnMs) / 1000)
);

this.pendingOffer = {
  ...trip,
  offerId: validOffer.id,
  viajeId: validOffer.viaje_id || null,
  cotizacionId: validOffer.cotizacion_id || null,
  enviadaEn: validOffer.enviada_en,
  expiresAt: validOffer.expires_at,
  remainingOfferSeconds: remainingSeconds,
  offerTimeoutSeconds: offerWindowSeconds,
  tipo: validOffer.viaje_id ? 'VIAJE' : 'COTIZACION'
};

        console.log('[TripManager] Pending offer found:', validOffer.id);

if (
  this.lastOfferIdShown === validOffer.id &&
  this.pendingOffer?.expiresAt === validOffer.expires_at
) {
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

  // =========================================================
  // REJECT OFFER (CORREGIDO CON REASON)
  // =========================================================
async rejectOffer(offerId, reason = 'RECHAZADA') {
  const driverId = this.driverId;

  if (!driverId) {
    return { success: false, error: 'No driverId' };
  }

  if (!offerId) {
    return { success: false, error: 'No offerId' };
  }

  console.log('[TripManager] Rejecting offer:', offerId, 'reason:', reason);

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

  const updatePayload = {
    estado: 'RECHAZADA',
    respondida_en: new Date().toISOString()
  };

  const { error } = await supabaseService.client
    .from('viaje_ofertas')
    .update(updatePayload)
    .eq('id', offerId)
    .eq('chofer_id', driverId)
    .in('estado', ['PENDIENTE']);

  if (error) {
    console.error('[TripManager] RejectOffer error:', error);
    return { success: false, error: error.message };
  }

  this.pendingOffer = null;
  this.lastOfferIdShown = null;
  this.emit('pendingTripCleared', { reason: 'offer_rejected' });

  await new Promise(resolve => setTimeout(resolve, 200));

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
  // REALTIME (CON RECONEXIÓN AUTOMÁTICA)
  // =========================================================
  _cleanupChannel(key) {
    const channel = this[`${key}Channel`];
    if (channel) {
      try {
        supabaseService.client.removeChannel(channel);
      } catch (e) {
        console.warn(`[TripManager] Error removing ${key} channel:`, e);
      }
      this[`${key}Channel`] = null;
    }
  }

  _cleanupChannels() {
    ['offer', 'trip', 'tripAssigned'].forEach(key => this._cleanupChannel(key));
  }

  _subscribeToRealtime(driverId) {
    console.log('[TripManager] Subscribing to realtime channels...', driverId);

    // Cleanup previo
    this._cleanupChannels();

    const createChannel = (name, table, filter, handler, key) => {
      const channel = supabaseService.client
        .channel(`${name}-${driverId}-${Date.now()}`) // nombre único para evitar colisiones
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter
        }, handler)
        .subscribe((status) => {
          console.log(`[TripManager] ${name} channel status:`, status);

          if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            this._reconnectAttempts[key]++;
            const delay = Math.min(1000 * 2 ** this._reconnectAttempts[key], 30000);
            console.warn(`[TripManager] Reconnecting ${name} in ${delay}ms (attempt ${this._reconnectAttempts[key]})...`);

            setTimeout(() => {
              this._cleanupChannel(key);
              createChannel(name, table, filter, handler, key);
            }, delay);
          } else if (status === 'SUBSCRIBED') {
            if (this._reconnectAttempts[key] > 0) {
              console.log(`[TripManager] ${name} channel reconnected successfully`);
            }
            this._reconnectAttempts[key] = 0;
          }
        });

      this[`${key}Channel`] = channel;
    };

createChannel('offers', 'viaje_ofertas', 
  `chofer_id=eq.${driverId}`,
  (payload) => {
    console.log('[TripManager] Offer realtime payload:', payload);
    this._debouncedRefresh(driverId);
  },
  'offer'
);    createChannel('trips', 'viajes',
      `chofer_id_uuid=eq.${driverId}`,
      (payload) => {
        console.log('[TripManager] Trip realtime payload:', payload);
        this._handleTripRealtimePayload(payload);
      },
      'trip'
    );

    createChannel('trips-assigned', 'viajes',
      `assigned_driver_id=eq.${driverId}`,
      (payload) => {
        console.log('[TripManager] Trip assigned realtime payload:', payload);
        this._handleTripRealtimePayload(payload);
      },
      'tripAssigned'
    );
  }

  // =========================================================
  // REFRESH
  // =========================================================
  _startRefreshInterval(driverId) {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

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
    } catch (error) {
      console.error('[TripManager] auth.getUser failed:', error);
      return { success: false, error: error.message };
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
      setTimeout(
        () => resolve({ error: new Error('TIMEOUT_ACTUALIZANDO_CHOFER') }),
        8000
      )
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
    } catch (error) {
      console.error(`[TripManager] Edge ${functionName} error:`, error);
      return {
        success: false,
        error: error.message || `Error invocando ${functionName}`
      };
    }
  }

  async acceptOffer(offerId) {
    const driverId = this.driverId;

    if (!driverId) {
      return { success: false, error: 'No driverId' };
    }

    if (!offerId) {
      return { success: false, error: 'No offerId disponible' };
    }

const { data: offerRow, error: offerError } = await supabaseService.client
  .from('viaje_ofertas')
  .select('id, viaje_id, chofer_id, estado')
  .eq('id', offerId)
  .eq('chofer_id', driverId)
  .in('estado', ['PENDIENTE'])
  .maybeSingle();    
    if (offerError) {
      console.error('[TripManager] Error reading offer before accept:', offerError);
      return { success: false, error: offerError.message };
    }

    if (!offerRow?.viaje_id) {
      return { success: false, error: 'Oferta no encontrada o sin viaje asociado' };
    }

const result = await this._invokeEdgeFunction('aceptar-viaje-multi', {
  viaje_id: offerRow.viaje_id,
  chofer_id: driverId
});
    console.log('[TripManager] acceptOffer result:', result);
    console.log('[TripManager] acceptOffer body:', result?.body);

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
        this.emit('pendingTripCleared', {
          reason: result.error || 'offer_unavailable'
        });

        await this._loadInitialState(driverId);
      }

      return {
        success: false,
        error: result.error || 'No se pudo aceptar el viaje'
      };
    }

    // =====================================================
    // HIDRATAR EL VIAJE ACEPTADO CON RETRY
    // =====================================================
    let acceptedTripRaw = null;
    let acceptedTripError = null;

    // Esperar un momento para que la transacción se complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Intentar hidratar hasta 3 veces
let acceptedTripQueryResult = null;

for (let attempt = 0; attempt < 3; attempt++) {
  acceptedTripQueryResult = await supabaseService.client
    .from('viajes')
    .select('*')
    .eq('id', offerRow.viaje_id)
    .maybeSingle();

  acceptedTripRaw = acceptedTripQueryResult.data;
  acceptedTripError = acceptedTripQueryResult.error;

  if (acceptedTripRaw) break;

  if (attempt < 2) {
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
}
    if (acceptedTripError) {
      console.error('[TripManager] Error loading accepted trip:', acceptedTripError);
    }

    if (acceptedTripRaw) {
      const normalizedState = this._normalizeDriverTripState(acceptedTripRaw);
      const acceptedTrip = {
        ...acceptedTripRaw,
        estado: normalizedState
      };

      console.log(
        '[TripManager] Accepted trip hydrated immediately:',
        acceptedTrip.id,
        acceptedTrip.estado
      );

      this.currentTrip = acceptedTrip;
      this.pendingOffer = null;
      this.lastOfferIdShown = null;

      if (normalizedState === 'EN_CURSO') {
        this.emit('tripStarted', acceptedTrip);
      } else {
        this.emit('tripAccepted', acceptedTrip);
      }

return {
  success: true,
  data: acceptedTripQueryResult?.data || null,
  trip: acceptedTrip
};
          }

    // =====================================================
    // FALLBACK: SI AÚN NO SE REFLEJÓ EN DB, REFRESH
    // =====================================================
    await this._loadInitialState(driverId);

if (this.currentTrip) {
  return {
    success: true,
    data: acceptedTripQueryResult?.data || result.data || null,
    trip: this.currentTrip
  };
}
    
    console.warn(
      '[TripManager] acceptOffer OK, pero el viaje aún no pudo hidratarse en frontend'
    );

return {
  success: true,
  data: acceptedTripQueryResult?.data || null,
  warning: 'trip_not_hydrated_yet'
};
    }

  async acceptTrip() {
    const offerId = this.pendingOffer?.offerId || null;

    if (!offerId) {
      console.error('[TripManager] acceptTrip: no pending offerId available');
      return { success: false, error: 'No hay oferta pendiente para aceptar' };
    }

    return this.acceptOffer(offerId);
  }

  async rejectTrip(reason = 'RECHAZADO_POR_CHOFER') {
    const offerId = this.pendingOffer?.offerId || null;

    if (!offerId) {
      return { success: false, error: 'No hay oferta pendiente para rechazar' };
    }

    return this.rejectOffer(offerId, reason);
  }

  async startTrip(tripId) {
    const driverId = this.driverId;

    if (!driverId) {
      return { success: false, error: 'No driverId' };
    }

    const result = await this._invokeEdgeFunction('iniciar-viaje-ts', {
      viaje_id: tripId,
      chofer_id: driverId
    });

    if (!result.success) {
      console.error('[TripManager] Start trip error:', result.error);
      return { success: false, error: result.error };
    }

    await this.setDriverAvailability({ disponible: false });

    return { success: true, data: result.data };
  }

  async finishTrip(tripId) {
    const driverId = this.driverId;

    if (!driverId) {
      return { success: false, error: 'No driverId' };
    }

    const result = await this._invokeEdgeFunction('completar-viaje-ts', {
      viaje_id: tripId,
      chofer_id: driverId
    });

    if (!result.success) {
      console.error('[TripManager] Finish trip error:', result.error);
      return { success: false, error: result.error };
    }

    await this.setDriverAvailability({ disponible: true });

    return { success: true, data: result.data };
  }

  async cancelTrip(tripId, motivo = 'CANCELADO_POR_CHOFER') {
    const driverId = this.driverId;

    if (!driverId) {
      return { success: false, error: 'No driverId' };
    }

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

    await this.setDriverAvailability({ disponible: true });

    this.currentTrip = null;
    this.pendingOffer = null;
    this.lastOfferIdShown = null;

    this.emit('tripCancelled', { id: tripId });
    this.emit('pendingTripCleared', { reason: 'trip_cancelled' });

    await this._loadInitialState(driverId);

    return { success: true, data: result.data };
  }

  async _redispatchViaje(viajeId, attempt = 0) {
    if (!viajeId) {
      return { success: false, error: 'No viajeId' };
    }

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
           viaje_id: viajeId
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
          await new Promise((resolve) => setTimeout(resolve, 800));
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
    } catch (error) {
      console.error('[TripManager] redispatch error:', error);
      return { success: false, error: error.message };
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
    this._cleanupChannels();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    this.currentTrip = null;
    this.pendingOffer = null;
    this.lastOfferIdShown = null;
    this.driverId = null;
    this.isLoadingInitial = false;
    this.isRefreshingOffers = false;

    // Resetear contadores de reconexión
    this._reconnectAttempts = {
      offer: 0,
      trip: 0,
      tripAssigned: 0
    };

    console.log('[TripManager] Destroyed');
  }

  // =========================================================
  // STATE RESET (ANTI BUGS)
  // =========================================================
  resetState(options = {}) {
    if (this._resetting) {
      console.warn('[TripManager] resetState ignorado: ya se está ejecutando');
      return;
    }

    const {
      silent = false,
      reason = 'manual_reset'
    } = options || {};

    this._resetting = true;

    try {
      this.currentTrip = null;
      this.pendingOffer = null;
      this.lastOfferIdShown = null;

      if (!silent) {
        this.emit('pendingTripCleared', { reason });
        this.emit('noPendingTrips');
      }
    } finally {
      this._resetting = false;
    }
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
