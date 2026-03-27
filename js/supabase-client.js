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
    this.reconnectTimer = null;

    // Cache UID in memory
    this.driverId = null;
    this.driverEmail = null;

    // Prevent repeated profile creation spam
    this.profileEnsured = false;
    this.profileEnsuring = false;

    // Auth listener ref
    this.authUnsubscribe = null;
  }

  // =========================================================
  // INIT
  // =========================================================

  async initialize() {
    if (this.client) return true;

    console.log('[Supabase] Initializing...');

    // Esperar supabase lib (por defer/carga lenta)
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
            detectSessionInUrl: false
          },
          realtime: {
            params: { eventsPerSecond: 10 }
          },
          db: { schema: 'public' }
        }
      );

      // Test connection (read-only)
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

      // Auth state change
      const { data: authListener } = this.client.auth.onAuthStateChange(
        async (event, session) => {
          this.driverId = session?.user?.id || null;
          this.driverEmail = session?.user?.email || null;

          console.log('[Supabase] Auth event:', event, 'UID:', this.driverId);

          // Reset flags
          this.profileEnsured = false;
          this.profileEnsuring = false;

          // If logout -> cleanup
          if (!this.driverId) {
            console.log('[Supabase] Logout detected, cleaning channels...');
            this.unsubscribeAll();
            return;
          }

          // Ensure profile when login
          await this.ensureDriverProfile();
        }
      );

      this.authUnsubscribe = authListener?.subscription;

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

  async _waitForSupabaseLib(timeoutMs = 6000) {
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

    if (this.profileEnsured) return { ok: true, cached: true };
    if (this.profileEnsuring) return { ok: true, pending: true };

    this.profileEnsuring = true;

    try {
      // Check if exists
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

      // Create new profile
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

    if (error) return { data: null, error };

    return { data: data?.[0] || null, error: null };
  }

  // =========================================================
  // RPC CALLS
  // =========================================================

  async acceptOffer(tripId, driverId) {
    if (!this.client) return { data: null, error: 'No client' };

    const { data, error } = await this.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    if (error) console.error('[Supabase] acceptOffer error:', error);
    return { data, error };
  }

  async rejectOffer(tripId, driverId, reason = null) {
    if (!this.client) return { data: null, error: 'No client' };

    const { data, error } = await this.client.rpc('rechazar_oferta_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId,
      p_motivo: reason
    });

    if (error) console.error('[Supabase] rejectOffer error:', error);
    return { data, error };
  }

  async startTrip(tripId, driverId) {
    if (!this.client) return { data: null, error: 'No client' };

    const { data, error } = await this.client.rpc('iniciar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    if (error) console.error('[Supabase] startTrip error:', error);
    return { data, error };
  }

  async completeTrip(tripId, driverId) {
    if (!this.client) return { data: null, error: 'No client' };

    const { data, error } = await this.client.rpc('completar_viaje', {
      p_viaje_id: tripId,
      p_chofer_id: driverId
    });

    if (error) console.error('[Supabase] completeTrip error:', error);
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

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      console.log(`[Supabase] Reconnecting attempt ${this.reconnectAttempts}...`);
      this.subscribeToOffers(driverId, callbacks);
    }, delay);
  }
}

const supabaseClient = new SupabaseClient();
