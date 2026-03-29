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

  this.driverId = null; // ✅ guardar chofer_id_uuid
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

    // aseguramos perfil
    await supabaseService.ensureDriverProfile();

const driverId = supabaseService.getDriverId();
if (!driverId) throw new Error('No driverId available');

this.driverId = driverId; // ✅ guardar

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

    console.log('[TripManager] Checking offers for driver:', driverId);

    // =====================================================
    // 2) PENDING OFFERS
    // =====================================================
    const { data: offers, error: offerError } = await supabaseService.client
      .from('viaje_ofertas')
      .select('id, viaje_id, chofer_id_uuid, estado, expires_at, offered_at')
      .eq('chofer_id_uuid', driverId)
      .eq('estado', 'PENDIENTE')
      .order('offered_at', { ascending: false })
      .limit(5);

    console.log('[TripManager] Offers fetched:', offers, offerError);

    if (offerError) {
      console.error('[TripManager] Error loading offers:', offerError);
    }

    if (offers && offers.length > 0) {
      const now = Date.now();

      // 🔥 filtramos manualmente las que todavía no vencieron
      const validOffer = offers.find(o => {
        if (!o.expires_at) return false;
        const exp = new Date(o.expires_at).getTime();
        return exp > now;
      });

      if (!validOffer) {
        console.warn('[TripManager] No valid pending offer (all expired)');
        this.pendingOffer = null;
        this.emit('noPendingTrips');
        this.isLoadingInitial = false;
        return;
      }

      const { data: trip, error: tripErr } = await supabaseService.client
        .from('viajes')
        .select('*')
        .eq('id', validOffer.viaje_id)
        .single();

      if (tripErr) {
        console.error('[TripManager] Error fetching trip for offer:', tripErr);
      } else if (trip) {
        this.pendingOffer = {
          ...trip,
          offerId: validOffer.id,
          expiresAt: validOffer.expires_at
        };

        console.log('[TripManager] Pending offer found:', validOffer.id);
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
  console.log('[TripManager] Subscribing to realtime channels...', driverId);

  // 🔥 limpiar canales anteriores
  if (this.offerChannel) {
    supabaseService.client.removeChannel(this.offerChannel);
    this.offerChannel = null;
  }
  if (this.tripChannel) {
    supabaseService.client.removeChannel(this.tripChannel);
    this.tripChannel = null;
  }

  // OFERTAS
  this.offerChannel = supabaseService.client
    .channel(`offers-${driverId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'viaje_ofertas',
        filter: `chofer_id_uuid=eq.${driverId}`
      },
      async (payload) => {
        console.log('[TripManager] Offer realtime payload:', payload);
        await this._loadInitialState(driverId);
      }
    )
    .subscribe((status) => {
      console.log('[TripManager] Offer channel status:', status);
    });

  // VIAJES
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
_startRefreshInterval(driverId) {
  if (this.refreshInterval) clearInterval(this.refreshInterval);

  this.refreshInterval = setInterval(() => {
    // si ya hay viaje activo, no spamear
    if (this.currentTrip) return;

    this._loadInitialState(driverId);
  }, 2000); // 🔥 cada 2 segundos
}

  // =========================================================
  // ACTIONS
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

    // Caso 1: devuelve directo {ok:true}
    if (data?.ok !== undefined) {
      result = data;
    }

    // Caso 2: devuelve array [{aceptar_oferta_viaje:{ok,reason}}]
    if (!result && Array.isArray(data)) {
      result = data?.[0]?.aceptar_oferta_viaje;
    }

    if (!result) {
      console.error('[TripManager] Invalid RPC response format:', data);
      return { success: false, error: 'Respuesta RPC inválida' };
    }

    if (!result.ok) {
      console.warn('[TripManager] Offer rejected:', result.reason);

      // 🔥 si ya no está disponible, refrescamos ofertas automáticamente
      if (result.reason === 'OFERTA_NO_DISPONIBLE') {
        console.log('[TripManager] Refreshing offers (offer not available)...');
        await this._loadInitialState(driverId);
      }

      return { success: false, error: result.reason || 'No se pudo aceptar el viaje' };
    }

    // si aceptó OK, limpiamos pending offer
    this.pendingOffer = null;

    return { success: true };

  } catch (err) {
    console.error('[TripManager] RPC FAILED:', err);
    return { success: false, error: err.message };
  }
}

  async rejectTrip(tripId, reason = 'RECHAZADO_POR_CHOFER') {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viaje_ofertas')
      .update({
        estado: 'RECHAZADA',
        rechazo_motivo: reason,
        responded_at: new Date().toISOString()
      })
      .eq('viaje_id', tripId)
      .eq('chofer_id_uuid', driverId)
      .eq('estado', 'PENDIENTE');

    if (error) {
      console.error('[TripManager] Reject error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async startTrip(tripId) {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viajes')
      .update({
        estado: 'EN_CURSO',
        iniciado_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('chofer_id_uuid', driverId);

    if (error) {
      console.error('[TripManager] Start trip error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  async finishTrip(tripId) {
    const driverId = this.driverId;
    if (!driverId) return { success: false, error: 'No driverId' };

    const { error } = await supabaseService.client
      .from('viajes')
      .update({
        estado: 'COMPLETADO',
        completado_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('chofer_id_uuid', driverId);

    if (error) {
      console.error('[TripManager] Finish trip error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }
    // =========================================================
  // MANUAL REFRESH (para forzar recarga después de aceptar)
  // =========================================================
  async refresh() {
    if (!this.driverId) return;
    await this._loadInitialState(this.driverId);
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
