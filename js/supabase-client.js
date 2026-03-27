/**
 * Cliente Supabase con realtime robusto
 */

import CONFIG from './config.js';

class SupabaseService {
  constructor() {
    console.log('[SupabaseService] Constructor');
    this.client = null;
    this.initialized = false;
    this.channels = [];
  }

  async init() {
    if (this.initialized) return true;

    console.log('[SupabaseService] Inicializando...');

    if (!window.supabase) {
      console.error('[SupabaseService] Librería Supabase no cargada');
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
          }
        }
      );

      const { error } = await this.client.from('choferes').select('count').limit(1);
      
      if (error) {
        console.error('[SupabaseService] Error de conexión:', error);
        return false;
      }

      console.log('[SupabaseService] Conexión exitosa');
      this.initialized = true;
      return true;

    } catch (error) {
      console.error('[SupabaseService] Error inicializando:', error);
      return false;
    }
  }

  subscribeToDriverOffers(driverId, callback) {
    console.log('[SupabaseService] Suscribiendo a ofertas para:', driverId);
    if (!this.client) return null;

    const channelName = `driver-offers-${driverId}-${Date.now()}`;
    
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
          console.log('[SupabaseService] [Realtime] Evento recibido:', payload);
          callback(payload);
        }
      )
      .subscribe((status, err) => {
        console.log(`[SupabaseService] [Realtime] Canal ${channelName} status:`, status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[SupabaseService] [Realtime] ✅ Suscrito correctamente');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[SupabaseService] [Realtime] ❌ Error de canal:', err);
        } else if (status === 'TIMED_OUT') {
          console.error('[SupabaseService] [Realtime] ⏱️ Timeout');
        }
      });

    this.channels.push(channel);
    return channel;
  }

  subscribeToDriverTrips(driverId, callback) {
    console.log('[SupabaseService] Suscribiendo a viajes para:', driverId);

    const channelName = `driver-trips-${driverId}-${Date.now()}`;
    
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
          console.log('[SupabaseService] [Realtime] Viaje evento:', payload);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log(`[SupabaseService] [Realtime] Viajes ${channelName} status:`, status);
      });

    this.channels.push(channel);
    return channel;
  }

  async getPendingOffers(driverId) {
    console.log('[SupabaseService] Buscando ofertas pendientes para:', driverId);
    
    const { data, error } = await this.client
      .from('viaje_ofertas')
      .select(`*, viajes:viaje_id (*)`)
      .eq('chofer_id', driverId)
      .eq('estado', 'PENDIENTE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SupabaseService] Error obteniendo ofertas:', error);
      return [];
    }

    console.log('[SupabaseService] Ofertas encontradas:', data?.length || 0);
    return data || [];
  }

  async getActiveTrip(driverId) {
    console.log('[SupabaseService] Buscando viaje activo para:', driverId);
    
    // CORRECCIÓN: Usar .or() en lugar de .in() para evitar error 406
    const { data, error } = await this.client
      .from('viajes')
      .select('*')
      .eq('chofer_id', driverId)
      .or('estado.eq.ACEPTADO,estado.eq.EN_CURSO')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[SupabaseService] Error obteniendo viaje activo:', error);
      return null;
    }

    if (data) {
      console.log('[SupabaseService] Viaje activo encontrado:', data.id);
    } else {
      console.log('[SupabaseService] No hay viaje activo');
    }

    return data;
  }

  async updateDriverLocation(driverId, position) {
    if (!driverId) return;
    
    const { error } = await this.client
      .from('choferes')
      .update({
        lat: position.lat,
        lng: position.lng,
        heading: position.heading,
        speed: position.speed,
        accuracy: position.accuracy,
        last_location_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      })
      .eq('id', driverId);

    if (error) {
      console.error('[SupabaseService] Error actualizando ubicación:', error);
    }
  }

  async setDriverAvailability(driverId, disponible) {
    const { error } = await this.client
      .from('choferes')
      .update({
        disponible,
        online: disponible,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', driverId);

    if (error) throw error;
  }

  // RPC Functions
  async aceptarOfertaViaje(viajeId, choferId) {
    console.log('[SupabaseService] RPC: aceptar_oferta_viaje', viajeId, choferId);
    const { data, error } = await this.client.rpc('aceptar_oferta_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
    
    if (error) {
      console.error('[SupabaseService] RPC Error:', error);
      throw error;
    }
    
    return data;
  }

  async rechazarOfertaViaje(viajeId, choferId, motivo = null) {
    const { data, error } = await this.client.rpc('rechazar_oferta_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId,
      p_motivo: motivo
    });
    
    if (error) throw error;
    return data;
  }

  async iniciarViaje(viajeId, choferId) {
    const { data, error } = await this.client.rpc('iniciar_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
    
    if (error) throw error;
    return data;
  }

  async completarViaje(viajeId, choferId) {
    const { data, error } = await this.client.rpc('completar_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
    
    if (error) throw error;
    return data;
  }

  getCurrentDriverId() {
    const choferData = this.getCurrentDriverData();
    return choferData?.id || localStorage.getItem('choferUsuario') || null;
  }

  getCurrentDriverData() {
    try {
      return JSON.parse(localStorage.getItem('choferData') || '{}');
    } catch {
      return null;
    }
  }

  isAuthenticated() {
    return localStorage.getItem('choferLogueado') === 'true' 
      && this.getCurrentDriverId() !== null;
  }

  logout() {
    console.log('[SupabaseService] Logout');
    this.channels.forEach(ch => {
      try { ch.unsubscribe(); } catch (e) {}
    });
    this.channels = [];
    
    localStorage.removeItem('choferLogueado');
    localStorage.removeItem('choferUsuario');
    localStorage.removeItem('choferData');
    
    window.location.href = CONFIG.REDIRECTS.LOGIN;
  }
}

const supabaseService = new SupabaseService();
export default supabaseService;
