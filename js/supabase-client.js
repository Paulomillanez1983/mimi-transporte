/**
 * MIMI Driver - Supabase Client
 * Real-time subscriptions and database operations
 */

class SupabaseClient {
  constructor() {
    this.client = null;
    this.channels = new Map();
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async initialize() {
    if (this.client) return true;

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
            params: {
              eventsPerSecond: 10
            }
          },
          db: {
            schema: 'public'
          }
        }
      );

      // Test connection
      const { error } = await this.client.from('choferes').select('count').limit(1);
      if (error) throw error;

      this.reconnectAttempts = 0;
      console.log('[Supabase] Connected');
      return true;

    } catch (error) {
      console.error('[Supabase] Connection failed:', error);
      return false;
    }
  }

  // Auth
  getCurrentUser() {
    return this.client?.auth?.getUser();
  }

  getDriverId() {
    // Try to get from localStorage or auth
    const stored = localStorage.getItem('mimi_driver_id');
    if (stored) return stored;
    
    // Fallback to auth
    const user = this.client?.auth?.user?.();
    return user?.id;
  }

  isAuthenticated() {
    return !!this.getDriverId();
  }

  // Real-time subscriptions
  subscribeToOffers(driverId, callbacks) {
    if (!this.client) return null;

    const channelName = `offers:${driverId}`;
    
    // Unsubscribe existing
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
          console.log('[Realtime] Offer update:', payload);
          callbacks.onOffer?.(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(`[Realtime] Channel ${channelName}: ${status}`);
        if (status === 'CHANNEL_ERROR') {
          callbacks.onError?.(err);
          this._handleReconnect(driverId, callbacks);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  subscribeToTrips(driverId, callbacks) {
    if (!this.client) return null;

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
          console.log('[Realtime] Trip update:', payload);
          callbacks.onTrip?.(payload);
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
    this.channels.forEach((channel, name) => {
      channel.unsubscribe();
    });
    this.channels.clear();
  }

  // Database operations
  async updateDriverLocation(driverId, position) {
    if (!driverId || !position) return { error: 'Missing params' };

    const { error } = await this.client
      .from('choferes')
      .update({
        lat: position.lat,
        lng: position.lng,
        heading: position.heading || 0,
        speed: position.speed || 0,
        accuracy: position.accuracy || 0,
        last_location_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      })
      .eq('id', driverId);

    return { error };
  }

  async setDriverOnline(driverId, isOnline) {
    const { error } = await this.client
      .from('choferes')
      .update({
        online: isOnline,
        disponible: isOnline,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', driverId);

    return { error };
  }

  async getPendingOffers(driverId) {
    const { data, error } = await this.client
      .from('viaje_ofertas')
      .select(`
        *,
        viajes:viaje_id (*)
      `)
      .eq('chofer_id', driverId)
      .eq('estado', 'PENDIENTE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    return { data, error };
  }

  async getActiveTrip(driverId) {
    const { data, error } = await this.client
      .from('viajes')
      .select('*')
      .eq('chofer_id', driverId)
      .or('estado.eq.ACEPTADO,estado.eq.EN_CURSO')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // PGRST116 = no rows returned (not an error for us)
    if (error && error.code === 'PGRST116') {
      return { data: null, error: null };
    }

    return { data, error };
  }

  // RPC Calls
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

  // Private: Reconnection logic
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
