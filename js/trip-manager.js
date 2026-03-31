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

    this.offerChannel = null;
    this.tripChannel = null;

    this.refreshInterval = null;
    this.isLoadingInitial = false;

    this.listeners = new Map();

    this.driverId = null;

    this.lastOfferIdShown = null; // ✅ FIX anti-parpadeo modal
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

    // =====================================================
    // 1) Obtener usuario autenticado
    // =====================================================
    const { data: { user }, error: userError } = await supabaseService.client.auth.getUser();

    if (userError || !user?.id) {
      console.error('[TripManager] ❌ No authenticated user found:', userError);
      return false;
    }

    // UUID real de auth.users
    this.driverUserId = user.id;

    // =====================================================
    // 2) Buscar perfil chofer en tabla choferes
    // =====================================================
    const { data: chofer, error: choferError } = await supabaseService.client
      .from('choferes')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (choferError) {
      console.error('[TripManager] ❌ Error buscando perfil de chofer:', choferError);
      return false;
    }

    if (!chofer?.id) {
      console.error('[TripManager] ❌ No existe perfil de chofer para este usuario');
      return false;
    }

    // ID real de tabla choferes
    this.driverProfileId = chofer.id;

    // Compatibilidad con tu código actual
    this.driverId = this.driverProfileId;

    localStorage.setItem('driverId', this.driverProfileId);
    sessionStorage.setItem('driverId', this.driverProfileId);

    console.log('[TripManager] ✅ Initialized');
    console.log('[TripManager] auth.user.id:', this.driverUserId);
    console.log('[TripManager] choferes.id:', this.driverProfileId);

    await this._loadInitialState();
    this._subscribeToRealtime();
    this._startRefreshInterval();

    return true;

  } catch (error) {
    console.error('[TripManager] ❌ Init error:', error);
    return false;
  }
}
  // =========================================================
  // LOAD INITIAL STATE
  // =========================================================
// =========================================================
// LOAD INITIAL STATE
// =========================================================
async _loadInitialState() {
  if (this.isLoadingInitial) return;
  this.isLoadingInitial = true;

  const driverUserId = this.driverUserId;       // auth.users.id
  const driverProfileId = this.driverProfileId; // choferes.id

  try {
    if (!driverUserId || !driverProfileId) {
      console.warn('[TripManager] No driver IDs available');
      this.isLoadingInitial = false;
      return;
    }

    // =====================================================
    // 1) ACTIVE TRIP
    // =====================================================
    const { data: activeTrip, error: tripError } = await supabaseService.client
      .from('viajes')
      .select('*')
      .eq('chofer_id_uuid', driverUserId)
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
      this.pendingOffer = null;
      this.lastOfferIdShown = null;

      if (activeTrip.estado === 'ASIGNADO') {
        this.emit('newPendingTrip', activeTrip);
      } else {
        this.emit('tripAccepted', activeTrip);
      }

      this.isLoadingInitial = false;
      return;
    }

    // =====================================================
    // 2) PENDING OFFERS
    // =====================================================
    console.log('[TripManager] Checking offers for driver profile:', driverProfileId);

    const { data: offers, error: offerError } = await supabaseService.client
      .from('viaje_ofertas')
      .select('id, viaje_id, cotizacion_id, chofer_id, estado, enviada_en, respondida_en')
      .eq('chofer_id', driverProfileId)
      .eq('estado', 'pendiente')
      .order('enviada_en', { ascending: false })
      .limit(5);

    console.log('[TripManager] Offers fetched:', offers, offerError);

    if (offerError) {
      console.error('[TripManager] Error loading offers:', offerError);
    }

    if (!offers || offers.length === 0) {
      this.pendingOffer = null;
      this.lastOfferIdShown = null;
      this.emit('noPendingTrips');

      this.isLoadingInitial = false;
      return;
    }

    // =====================================================
    // 3) SELECT FIRST VALID OFFER
    // =====================================================
    const validOffer = offers[0];

    if (!validOffer?.viaje_id && !validOffer?.cotizacion_id) {
      console.warn('[TripManager] Offer has no viaje_id and no cotizacion_id:', validOffer);

      this.pendingOffer = null;
      this.lastOfferIdShown = null;
      this.emit('noPendingTrips');

      this.isLoadingInitial = false;
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
        this.isLoadingInitial = false;
        return;
      }

      trip = data;
    } else {
      const { data, error } = await supabaseService.client
        .from('cotizaciones')
        .select('*')
        .eq('id', validOffer.cotizacion_id)
        .single();

      if (error) {
        console.error('[TripManager] Error fetching cotizacion for offer:', error);
        this.isLoadingInitial = false;
        return;
      }

      trip = data;
    }

    if (!trip) {
      console.warn('[TripManager] Trip/Cotizacion not found for offer:', validOffer.id);
      this.isLoadingInitial = false;
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
  }

  this.isLoadingInitial = false;
}

// =========================================================
// OFFERS ACTIONS
// =========================================================
async acceptOffer(offerId) {
  const driverProfileId = this.driverProfileId;
  if (!driverProfileId) return { success: false, error: 'No driverProfileId' };

  console.log('[TripManager] Accepting offer:', offerId);

  const { data: offer, error: offerError } = await supabaseService.client
    .from('viaje_ofertas')
    .select('*')
    .eq('id', offerId)
    .eq('chofer_id', driverProfileId)
    .single();

  if (offerError || !offer) {
    console.error('[TripManager] Offer not found:', offerError);
    return { success: false, error: 'Oferta no encontrada' };
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
  const driverProfileId = this.driverProfileId;
  if (!driverProfileId) return { success: false, error: 'No driverProfileId' };

  console.log('[TripManager] Rejecting offer:', offerId);

  const { error } = await supabaseService.client
    .from('viaje_ofertas')
    .update({
      estado: 'rechazada',
      respondida_en: new Date().toISOString()
    })
    .eq('id', offerId)
    .eq('chofer_id', driverProfileId)
    .eq('estado', 'pendiente');

  if (error) {
    console.error('[TripManager] RejectOffer error:', error);
    return { success: false, error: error.message };
  }

  this.pendingOffer = null;
  this.lastOfferIdShown = null;

  await this._loadInitialState();

  return { success: true };
}

// =========================================================
// REALTIME
// =========================================================
_subscribeToRealtime() {
  const driverUserId = this.driverUserId;
  const driverProfileId = this.driverProfileId;

  console.log('[TripManager] Subscribing to realtime channels...');
  console.log('[TripManager] driverUserId:', driverUserId);
  console.log('[TripManager] driverProfileId:', driverProfileId);

  if (!driverUserId || !driverProfileId) {
    console.warn('[TripManager] Cannot subscribe: missing IDs');
    return;
  }

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
    .channel(`offers-${driverProfileId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'viaje_ofertas',
        filter: `chofer_id=eq.${driverProfileId}`
      },
      async (payload) => {
        console.log('[TripManager] Offer realtime payload:', payload);
        await this._loadInitialState();
      }
    )
    .subscribe((status) => {
      console.log('[TripManager] Offer channel status:', status);
    });

  // =====================================================
  // VIAJES
  // =====================================================
  this.tripChannel = supabaseService.client
    .channel(`trips-${driverUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'viajes',
        filter: `chofer_id_uuid=eq.${driverUserId}`
      },
      (payload) => {
        console.log('[TripManager] Trip realtime payload:', payload);

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
    .subscribe((status) => {
      console.log('[TripManager] Trip channel status:', status);
    });
}

// =========================================================
// REFRESH
// =========================================================
_startRefreshInterval() {
  if (this.refreshInterval) clearInterval(this.refreshInterval);

  this.refreshInterval = setInterval(() => {
    if (this.currentTrip) return;
    this._loadInitialState();
  }, 3000);
}

// =========================================================
// ACTIONS (VIAJES)
// =========================================================
async acceptTrip(tripId) {
  const driverProfileId = this.driverProfileId;
  if (!driverProfileId) return { success: false, error: 'No driverProfileId' };

  console.log('[TripManager] Calling RPC aceptar_oferta_viaje...', tripId, driverProfileId);

  const rpcPromise = supabaseService.client.rpc('aceptar_oferta_viaje', {
    p_viaje_id: tripId,
    p_chofer_id: driverProfileId
  });

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ data: null, error: new Error("RPC_TIMEOUT") }), 8000)
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

      if (result.reason === 'OFERTA_NO_DISPONIBLE') {
        console.log('[TripManager] Refreshing offers (offer not available)...');
        await this._loadInitialState();
      }

      return { success: false, error: result.reason || 'No se pudo aceptar el viaje' };
    }

    this.pendingOffer = null;
    this.lastOfferIdShown = null;
    await this._loadInitialState();

    return { success: true };

  } catch (err) {
    console.error('[TripManager] RPC FAILED:', err);
    return { success: false, error: err.message };
  }
}

async rejectTrip(reason = 'RECHAZADO_POR_CHOFER') {
  const driverProfileId = this.driverProfileId;
  if (!driverProfileId) return { success: false, error: 'No driverProfileId' };

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
    .eq('chofer_id', driverProfileId)
    .eq('estado', 'pendiente');

  if (error) {
    console.error('[TripManager] Reject error:', error);
    return { success: false, error: error.message };
  }

  this.pendingOffer = null;
  this.lastOfferIdShown = null;

  await this._loadInitialState();

  return { success: true };
}

async startTrip(tripId) {
  const driverUserId = this.driverUserId;
  if (!driverUserId) return { success: false, error: 'No driverUserId' };

  const { error } = await supabaseService.client
    .from('viajes')
    .update({
      estado: 'EN_CURSO',
      iniciado_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', tripId)
    .eq('chofer_id_uuid', driverUserId);

  if (error) {
    console.error('[TripManager] Start trip error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

async finishTrip(tripId) {
  const driverUserId = this.driverUserId;
  if (!driverUserId) return { success: false, error: 'No driverUserId' };

  const { error } = await supabaseService.client
    .from('viajes')
    .update({
      estado: 'COMPLETADO',
      completado_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', tripId)
    .eq('chofer_id_uuid', driverUserId);

  if (error) {
    console.error('[TripManager] Finish trip error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

async cancelTrip(tripId, motivo = 'CANCELADO_POR_CHOFER') {
  const driverUserId = this.driverUserId;
  if (!driverUserId) return { success: false, error: 'No driverUserId' };

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
    .eq('chofer_id_uuid', driverUserId);

  if (error) {
    console.error('[TripManager] Cancel trip error:', error);
    return { success: false, error: error.message };
  }

  this.currentTrip = null;
  this.pendingOffer = null;
  this.lastOfferIdShown = null;

  this.emit('tripCancelled', { id: tripId });

  return { success: true };
}

// =========================================================
// MANUAL REFRESH
// =========================================================
async refresh() {
  if (!this.driverUserId || !this.driverProfileId) return;
  await this._loadInitialState();
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
