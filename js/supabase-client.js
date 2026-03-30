/**
 * MIMI Driver - Supabase Client (PRODUCTION FINAL)
 * Compatible con RLS + auth.uid() (UUID)
 *
 * DB REAL:
 *  - choferes.id_uuid (uuid)  <-- ID operativo del chofer
 *  - choferes.user_id (uuid)  <-- auth.users.id
 *  - viajes.chofer_id (uuid)  <-- referencia a choferes.id_uuid
 *  - viaje_ofertas.chofer_id (uuid) <-- referencia a choferes.id_uuid
 */

import CONFIG from './config.js';

class SupabaseClient {
  constructor() {
    this.client = null;
    this.channels = new Map();

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8;
    this.reconnectTimer = null;

    // auth.users.id
    this.userId = null;
    this.userEmail = null;

    // choferes.id_uuid
    this.driverId = null;

if (event === 'SIGNED_OUT') {
  this.profileEnsured = false;
  this.profileEnsuring = false;
  this.driverId = null;
}
  }

// =========================================================
// INIT
// =========================================================
async init() {
  console.log('[Supabase] Initializing...');

  const ok = await this._waitForSupabaseLib();
  if (!ok) {
    console.error('[Supabase] Library not loaded (timeout)');
    return false;
  }

  try {
    this.client = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "mimi-driver-auth",
          flowType: "pkce"
        },
        realtime: {
          params: { eventsPerSecond: 10 }
        },
        db: { schema: "public" }
      }
    );

    // Load session (cache)
    const { data: sessionData, error: sessionError } =
      await this.client.auth.getSession();

    if (sessionError) {
      console.warn('[Supabase] getSession error:', sessionError);
    }

    this.session = sessionData?.session || null;

    this.userId = this.session?.user?.id || null;
    this.userEmail = this.session?.user?.email || null;

    console.log('[Supabase] Auth UID:', this.userId);
    console.log('[Supabase] Auth Email:', this.userEmail);

    // Auth listener (solo una vez)
    if (!this.authSubscription) {
      const { data: authListener } = this.client.auth.onAuthStateChange(
        async (event, session) => {
          this.session = session || null;

          this.userId = session?.user?.id || null;
          this.userEmail = session?.user?.email || null;

          console.log('[Supabase] Auth event:', event, 'UID:', this.userId);

          this.profileEnsured = false;
          this.profileEnsuring = false;
          this.driverId = null;

          if (!this.userId) {
            console.log('[Supabase] Logout detected, cleaning channels...');
            this.unsubscribeAll();
            return;
          }

          await this.ensureDriverProfile();
        }
      );

      this.authSubscription = authListener?.subscription || null;
    }

    if (this.userId) {
      await this.ensureDriverProfile();

      if (!this.driverId) {
        console.warn('[Supabase] driverId still null after ensureDriverProfile');
      }
    }

    console.log('[Supabase] Connected');
    this.reconnectAttempts = 0;

    return true;
  } catch (error) {
    console.error('[Supabase] Connection failed:', error);
    return false;
  }
}

  async _waitForSupabaseLib(timeoutMs = 8000) {
    if (window.supabase) return true;

    const start = Date.now();

    while (!window.supabase) {
      await new Promise((r) => setTimeout(r, 100));
      if (Date.now() - start > timeoutMs) return false;
    }

    return true;
  }

  // =========================================================
  // AUTH
  // =========================================================
  isAuthenticated() {
    return !!this.userId;
  }

  getUserId() {
    return this.userId;
  }

  getDriverId() {
    return this.driverId;
  }

  async getCurrentUser() {
    if (!this.client) return null;

    const { data, error } = await this.client.auth.getUser();
    if (error) return null;

    return data?.user || null;
  }

  // =========================================================
  // DRIVER PROFILE (SAFE ENSURE)
  // =========================================================
async ensureDriverProfile() {
  if (!this.client) return { ok: false, error: 'No client' };
  if (!this.userId) return { ok: false, error: 'No auth user id' };

  if (this.profileEnsured && this.driverId) {
    return { ok: true, cached: true, driverId: this.driverId };
  }

  if (this.profileEnsuring) {
    return { ok: true, pending: true };
  }

  this.profileEnsuring = true;

  try {
    const { data: existing, error: selectError } = await this.client
      .from('choferes')
      .select('id_uuid, user_id, email, nombre, telefono, online, disponible, bloqueado')
      .eq('user_id', this.userId)
      .maybeSingle();

    if (selectError) {
      console.warn('[Supabase] ensureDriverProfile select error:', selectError);
    }

    if (existing?.id_uuid) {
      console.log('[Supabase] Driver profile already exists:', existing.id_uuid);

      this.driverId = existing.id_uuid;
      this.profileEnsured = true;
      this.profileEnsuring = false;

      return { ok: true, existed: true, driverId: this.driverId };
    }

    const user = await this.getCurrentUser();

    const payload = {
      user_id: this.userId,
      email: user?.email || this.userEmail || null,
      nombre: user?.user_metadata?.full_name || user?.email || 'Chofer',
      telefono: user?.user_metadata?.phone || null,
      online: false,
      disponible: true,
      bloqueado: false,
      last_seen_at: new Date().toISOString()
    };

    // 🔥 SOLUCIÓN DEFINITIVA: UPSERT
    const { data: created, error: upsertError } = await this.client
      .from('choferes')
      .upsert(payload, { onConflict: 'user_id' })
      .select('id_uuid, user_id')
      .single();

    if (upsertError) {
      console.error('[Supabase] ensureDriverProfile UPSERT failed:', upsertError);
      this.profileEnsuring = false;
      return { ok: false, error: upsertError };
    }

    console.log('[Supabase] Driver profile ensured:', created.id_uuid);

    this.driverId = created.id_uuid;
    this.profileEnsured = true;
    this.profileEnsuring = false;

    return { ok: true, ensured: true, driverId: this.driverId };

  } catch (err) {
    console.error('[Supabase] ensureDriverProfile fatal error:', err);
    this.profileEnsuring = false;
    return { ok: false, error: err.message };
  }
}

  // =========================================================
  // REALTIME SUBSCRIPTIONS
  // =========================================================
  subscribeToOffers(callbacks) {
    if (!this.client || !this.driverId) return null;

    const channelName = `offers:${this.driverId}`;
    this.unsubscribe(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viaje_ofertas',
          filter: `chofer_id_uuid=eq.${this.driverId}`
        },
        (payload) => {
          try {
            callbacks?.onOffer?.(payload);
          } catch (e) {
            console.error('[Realtime] Offer callback error:', e);
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] Channel ${channelName}: ${status}`);

        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] CHANNEL_ERROR:', err);
          callbacks?.onError?.(err);
          this._handleReconnect(callbacks);
        }

        if (status === 'TIMED_OUT') {
          console.warn('[Realtime] TIMED_OUT -> reconnect');
          this._handleReconnect(callbacks);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  subscribeToTrips(callbacks) {
    if (!this.client || !this.driverId) return null;

    const channelName = `trips:${this.driverId}`;
    this.unsubscribe(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viajes',
          filter: `chofer_id_uuid=eq.${this.driverId}`
        },
        (payload) => {
          try {
            callbacks?.onTrip?.(payload);
          } catch (e) {
            console.error('[Realtime] Trip callback error:', e);
          }
        }
      )
      .subscribe();

    this.channels.set(channelName, channel);
    return channel;
  }

  unsubscribe(channelName) {
    const channel = this.channels.get(channelName);
    if (channel) {
      try {
        channel.unsubscribe();
      } catch (e) {}
      this.channels.delete(channelName);
    }
  }

  unsubscribeAll() {
    try {
      this.channels.forEach((channel) => {
        try {
          channel.unsubscribe();
        } catch (e) {}
      });
    } catch (e) {}

    this.channels.clear();
  }

  // =========================================================
  // DATABASE OPERATIONS
  // =========================================================
  async updateDriverLocation(position) {
    if (!this.client) return { error: 'No client' };
    if (!this.driverId) return { error: 'No driverId (profile missing)' };
    if (!position) return { error: 'Missing position' };

    const updatePayload = {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading || 0,
      speed: position.speed || 0,
      accuracy: position.accuracy || 0,
      last_location_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };

    const { error } = await this.client
      .from('choferes')
      .update(updatePayload)
      .eq('id_uuid', this.driverId);

    if (error) {
      console.warn('[Supabase] updateDriverLocation blocked:', error);
    }

    return { error };
  }

  async setDriverOnline(isOnline) {
    if (!this.client) return { error: 'No client' };
    if (!this.driverId) return { error: 'No driverId (profile missing)' };

    const { error } = await this.client
      .from('choferes')
      .update({
        online: isOnline,
        disponible: isOnline,
        last_seen_at: new Date().toISOString()
      })
      .eq('id_uuid', this.driverId);

    if (error) {
      console.warn('[Supabase] setDriverOnline blocked:', error);
    }

    return { error };
  }

async getPendingOffers() {
  if (!this.client) return { data: null, error: 'No client' };
  if (!this.driverId) return { data: null, error: 'No driverId' };

  const { data, error } = await this.client
    .from('viaje_ofertas')
    .select(`
      id,
      viaje_id,
      chofer_id,
      estado,
      enviada_en,
      respondida_en,
      viajes (
        id,
        estado,
        origen,
        destino,
        origen_lat,
        origen_lng,
        destino_lat,
        destino_lng,
        precio,
        km,
        cliente,
        telefono,
        created_at,
        current_offer_expires_at
      )
    `)
    .eq('chofer_id', this.driverId)
    .eq('estado', 'PENDIENTE')
    .order('enviada_en', { ascending: false });

  if (error) {
    console.error('[Supabase] getPendingOffers error:', error);
    return { data: null, error };
  }

  // ============================
  // FILTRAR OFERTAS EXPIRADAS
  // ============================
  const now = new Date();

  const filtered = (data || []).filter((offer) => {
    const exp = offer?.viajes?.current_offer_expires_at;
    if (!exp) return true; // si no tiene expiración, no la descartamos
    return new Date(exp) > now;
  });

  return { data: filtered, error: null };
}

  async getActiveTrip() {
    if (!this.client) return { data: null, error: 'No client' };
    if (!this.driverId) return { data: null, error: 'No driverId' };

    const { data, error } = await this.client
      .from('viajes')
      .select('*')
      .eq('chofer_id_uuid', this.driverId)
      .in('estado', ['ACEPTADO', 'EN_CURSO'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] getActiveTrip error:', error);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  }

  // =========================================================
  // RPC CALLS
  // =========================================================
  async acceptOffer(tripId) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!this.driverId) return { data: null, error: 'No driverId' };

    const { data, error } = await this.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId
    });

    if (error) console.error('[Supabase] acceptOffer error:', error);

    return { data, error };
  }

  async rejectOffer(tripId, reason = null) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!this.driverId) return { data: null, error: 'No driverId' };

    const { data, error } = await this.client.rpc('rechazar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId,
      p_motivo: reason
    });

    if (error) console.error('[Supabase] rejectOffer error:', error);

    return { data, error };
  }

  async startTrip(tripId) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!this.driverId) return { data: null, error: 'No driverId' };

    const { data, error } = await this.client.rpc('iniciar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId
    });

    if (error) console.error('[Supabase] startTrip error:', error);

    return { data, error };
  }

  async completeTrip(tripId) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!this.driverId) return { data: null, error: 'No driverId' };

    const { data, error } = await this.client.rpc('completar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId
    });

    if (error) console.error('[Supabase] completeTrip error:', error);

    return { data, error };
  }

  // =========================================================
  // PRIVATE: RECONNECTION LOGIC
  // =========================================================
  _handleReconnect(callbacks) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Supabase] Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      console.log(`[Supabase] Reconnecting attempt ${this.reconnectAttempts}...`);

      try {
this.subscribeToOffers(callbacks);
this.subscribeToTrips(callbacks);
        
      } catch (e) {
        console.error('[Supabase] reconnect failed:', e);
      }
    }, delay);
  }
}

const supabaseService = new SupabaseClient();
export default supabaseService;
