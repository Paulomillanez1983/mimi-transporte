/**
 * MIMI Driver - Supabase Client (PRODUCTION FINAL)
 * Real-time subscriptions and database operations
 */

class SupabaseClient {
  constructor() {
    this.client = null;
    this.channels = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Cache UID in memory
    this.driverId = null;
    this.driverEmail = null;

    // Prevent repeated profile creation spam
    this.profileEnsured = false;
    this.profileEnsuring = false;
  }

  async initialize() {
    if (this.client) return true;

    console.log('[Supabase] Initializing...');

    if (!window.supabase) {
      console.error('[Supabase] Library not loaded');
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
            detectSessionInUrl: false
          },
          realtime: {
            params: { eventsPerSecond: 10 }
          },
          db: {
            schema: 'public'
          }
        }
      );

      // Test basic connection (no write)
      const { error } = await this.client
        .from('choferes')
        .select('id')
        .limit(1);

      if (error) {
        console.error('[Supabase] Connection test failed:', error);
        return false;
      }

      console.log('[Supabase] Connected');

      // Load current session
      const { data: sessionData, error: sessionError } =
        await this.client.auth.getSession();

      if (sessionError) {
        console.warn('[Supabase] getSession error:', sessionError);
      }

      this.driverId = sessionData?.session?.user?.id || null;
      this.driverEmail = sessionData?.session?.user?.email || null;

      console.log('[Supabase] Driver UID:', this.driverId);
      console.log('[Supabase] Driver Email:', this.driverEmail);

      // Listen auth changes
      this.client.auth.onAuthStateChange(async (_event, session) => {
        this.driverId = session?.user?.id || null;
        this.driverEmail = session?.user?.email || null;

        console.log('[Supabase] Auth updated UID:', this.driverId);

        // Reset ensure flags if user changes
        this.profileEnsured = false;

        if (this.driverId) {
          await this.ensureDriverProfile();
        }
      });

      // Ensure profile if already logged
      if (this.driverId) {
        await this.ensureDriverProfile();
      }

      this.reconnectAttempts = 0;
      return true;

    } catch (error) {
      console.error('[Supabase] Connection failed:', error);
      return false;
    }
  }

  // =========================================================
  // AUTH
  // =========================================================

  getDriverId() {
    return this.driverId;
  }

  getDriverEmail() {
    return this.driverEmail;
  }

  isAuthenticated() {
    return !!this.driverId;
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
    if (!this.driverId) return { ok: false, error: 'No driverId' };

    // prevent multiple calls at same time
    if (this.profileEnsured) return { ok: true, cached: true };
    if (this.profileEnsuring) return { ok: true, pending: true };

    this.profileEnsuring = true;

    try {
      // 1) Check if driver already exists
      const { data: existing, error: selectError } = await this.client
        .from('choferes')
        .select('id')
        .eq('id', this.driverId)
        .maybeSingle();

      if (selectError) {
        console.warn('[Supabase] ensureDriverProfile select error:', selectError);
      }

      if (existing?.id) {
        console.log('[Supabase] Driver profile already exists');
        this.profileEnsured = true;
        this.profileEnsuring = false;
        return { ok: true, existed: true };
      }

      // 2) If not exists, attempt INSERT (NOT UPSERT, cleaner with RLS)
      const user = await this.getCurrentUser();

      const payload = {
        id: this.driverId,
        email: user?.email || this.driverEmail || null,
        nombre: user?.user_metadata?.full_name || user?.email || 'Chofer',
        telefono: user?.user_metadata?.phone || null,

        online: false,
        disponible: true,
        bloqueado: false,

        last_seen_at: new Date().toISOString()
      };

      const { error: insertError } = await this.client
        .from('choferes')
        .insert(payload);

      if (insertError) {
        console.error('[Supabase] ensureDriverProfile INSERT blocked:', insertError);

        // IMPORTANT: if RLS blocks insert, app can still run read-only
        this.profileEnsuring = false;
        return { ok: false, error: insertError };
      }

      console.log('[Supabase] Driver profile created');
      this.profileEnsured = true;
      this.profileEnsuring = false;
      return { ok: true, created: true };

    } catch (err) {
      console.error('[Supabase] ensureDriverProfile fatal error:', err);
      this.profileEnsuring = false;
      return { ok: false, error: err.message };
    }
  }

  // =========================================================
  // REALTIME SUBSCRIPTIONS
  // =========================================================

  subscribeToOffers(driverId, callbacks) {
    if (!this.client || !driverId) return null;

    const channelName = `offers:${driverId}`;
    this.unsubscribe(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viaje_ofertas',
          filter: `chofer_id=eq.${driverId}`
        },
        (payload) => {
          callbacks?.onOffer?.(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] Channel ${channelName}: ${status}`);

        if (status === 'CHANNEL_ERROR') {
          callbacks?.onError?.(err);
          this._handleReconnect(driverId, callbacks);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  subscribeToTrips(driverId, callbacks) {
    if (!this.client || !driverId) return null;

    const channelName = `trips:${driverId}`;
    this.unsubscribe(channelName);

    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viajes',
          filter: `chofer_id=eq.${driverId}`
        },
        (payload) => {
          callbacks?.onTrip?.(payload);
        }
      )
      .subscribe();

    this.channels.set(channelName, channel);
    return channel;
  }

  unsubscribe(channelName) {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  unsubscribeAll() {
    this.channels.forEach((channel) => channel.unsubscribe());
    this.channels.clear();
  }

  // =========================================================
  // DATABASE OPERATIONS
  // =========================================================

  async updateDriverLocation(driverId, position) {
    if (!this.client) return { error: 'No client' };
    if (!driverId || !position) return { error: 'Missing params' };

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
      .eq('id', driverId);

    if (error) {
      console.warn('[Supabase] updateDriverLocation blocked:', error);
    }

    return { error };
  }

  async setDriverOnline(driverId, isOnline) {
    if (!this.client) return { error: 'No client' };
    if (!driverId) return { error: 'Missing driverId' };

    const { error } = await this.client
      .from('choferes')
      .update({
        online: isOnline,
        disponible: isOnline,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', driverId);

    if (error) {
      console.warn('[Supabase] setDriverOnline blocked:', error);
    }

    return { error };
  }

  async getPendingOffers(driverId) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!driverId) return { data: null, error: 'Missing driverId' };

    const { data, error } = await this.client
      .from('viaje_ofertas')
      .select(`*, viajes:viaje_id (*)`)
      .eq('chofer_id', driverId)
      .eq('estado', 'PENDIENTE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    return { data, error };
  }

  async getActiveTrip(driverId) {
    if (!this.client) return { data: null, error: 'No client' };
    if (!driverId) return { data: null, error: 'Missing driverId' };

    const { data, error } = await this.client
      .from('viajes')
      .select('*')
      .eq('chofer_id', driverId)
      .in('estado', ['ACEPTADO', 'EN_CURSO'])
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      return { data: null, error };
    }

    return { data: data && data.length > 0 ? data[0] : null, error: null };
  }

  // =========================================================
  // RPC CALLS
  // =========================================================

  async acceptOffer(tripId, driverId) {
    const { data, error } = await this.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    return { data, error };
  }

  async rejectOffer(tripId, driverId, reason = null) {
    const { data, error } = await this.client.rpc('rechazar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId,
      p_motivo: reason
    });

    return { data, error };
  }

  async startTrip(tripId, driverId) {
    const { data, error } = await this.client.rpc('iniciar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    return { data, error };
  }

  async completeTrip(tripId, driverId) {
    const { data, error } = await this.client.rpc('completar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    return { data, error };
  }

  // =========================================================
  // PRIVATE: RECONNECTION LOGIC
  // =========================================================

  _handleReconnect(driverId, callbacks) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Supabase] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    setTimeout(() => {
      console.log(`[Supabase] Reconnecting attempt ${this.reconnectAttempts}...`);
      this.subscribeToOffers(driverId, callbacks);
    }, delay);
  }
}

const supabaseClient = new SupabaseClient();
