/**
 * Cliente Supabase inicializado con manejo de errores
 * FASE 1 UBER-LIKE: soporte para ofertas individuales + RPC atómicas
 */

import CONFIG from '/mimi-transporte/js/config.js';

class SupabaseService {
  constructor() {
    this.client = null;
    this.rest = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return true;

    if (typeof window.supabase === 'undefined') {
      console.error('Supabase library not loaded');
      return false;
    }

    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
      console.error('Supabase config incompleta');
      return false;
    }

    const invalidKeys = [
      'TU_ANON_KEY_REAL_AQUI',
      'YOUR_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'YOUR_KEY_HERE'
    ];

    if (invalidKeys.includes(CONFIG.SUPABASE_KEY.trim())) {
      console.error('Supabase key inválida: sigue siendo placeholder');
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
            timeout: 20000
          }
        }
      );

      this.rest = {
        select: this._withRetry(this._select.bind(this)),
        update: this._withRetry(this._update.bind(this)),
        insert: this._withRetry(this._insert.bind(this)),
        upsert: this._withRetry(this._upsert.bind(this)),
        rpc: this._withRetry(this._rpc.bind(this))
      };

      this.initialized = true;
      console.log('Supabase inicializado correctamente');
      return true;
    } catch (error) {
      console.error('Supabase initialization failed:', error);
      return false;
    }
  }

  _withRetry(fn, retries = 3) {
    return async (...args) => {
      let lastError;

      for (let i = 0; i < retries; i++) {
        try {
          return await fn(...args);
        } catch (error) {
          lastError = error;
          console.warn(`Supabase retry ${i + 1}/${retries}:`, error);

          if (i < retries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          }
        }
      }

      throw lastError;
    };
  }

  async _select(table, opts = {}) {
    let query = this.client.from(table).select(opts.columns || '*');

    if (opts.eq) {
      Object.entries(opts.eq).forEach(([k, v]) => {
        query = query.eq(k, v);
      });
    }

    if (opts.neq) {
      Object.entries(opts.neq).forEach(([k, v]) => {
        query = query.neq(k, v);
      });
    }

    if (opts.in) {
      Object.entries(opts.in).forEach(([k, v]) => {
        query = query.in(k, Array.isArray(v) ? v : [v]);
      });
    }

    if (opts.order) {
      const [col, dir] = opts.order.split('.');
      query = query.order(col, { ascending: dir === 'asc' });
    }

    if (opts.limit) query = query.limit(opts.limit);
    if (opts.single) query = query.single();

    const { data, error } = await query;

    if (error) {
      console.error(`Supabase SELECT error [${table}]`, error);
      throw error;
    }

    return data || [];
  }

  async _update(table, id, data) {
    if (!id) {
      throw new Error(`UPDATE abortado: id inválido para tabla "${table}"`);
    }

    const updateData = {
      ...data,
      updated_at: new Date().toISOString()
    };

    const { data: result, error } = await this.client
      .from(table)
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error(`Supabase UPDATE error [${table}]`, error);
      throw error;
    }

    return result || [];
  }

  async _insert(table, data) {
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select();

    if (error) {
      console.error(`Supabase INSERT error [${table}]`, error);
      throw error;
    }

    return result || [];
  }

  async _upsert(table, data, onConflict = 'id') {
    const { data: result, error } = await this.client
      .from(table)
      .upsert(data, { onConflict })
      .select();

    if (error) {
      console.error(`Supabase UPSERT error [${table}]`, error);
      throw error;
    }

    return result || [];
  }

  async _rpc(fnName, params = {}) {
    const { data, error } = await this.client.rpc(fnName, params);

    if (error) {
      console.error(`Supabase RPC error [${fnName}]`, error);
      throw error;
    }

    return data;
  }

  async ensureDriverExists(driverData = {}) {
    const driverId = this.getCurrentDriverId();
    if (!driverId) throw new Error('Driver ID inválido');

    const payload = {
      id: driverId,
      nombre: driverData.nombre || driverData.name || null,
      email: driverData.email || null,
      telefono: driverData.telefono || null,
      online: true,
      disponible: true,
      last_seen_at: new Date().toISOString(),
      last_location_at: null,
      updated_at: new Date().toISOString()
    };

    return this.rest.upsert(CONFIG.TABLES.CHOFERES, payload, 'id');
  }

  async updateDriverLocation(driverId, position) {
    if (!driverId) {
      throw new Error('No se pudo actualizar ubicación: driverId inválido');
    }

    return this.rest.update(CONFIG.TABLES.CHOFERES, driverId, {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading || null,
      speed: position.speed || null,
      accuracy: position.accuracy || null,
      last_seen_at: new Date().toISOString(),
      last_location_at: new Date().toISOString(),
      online: true
    });
  }

  async setDriverAvailability(driverId, disponible) {
    if (!driverId) {
      throw new Error('No se pudo actualizar disponibilidad: driverId inválido');
    }

    return this.rest.update(CONFIG.TABLES.CHOFERES, driverId, {
      disponible,
      online: true,
      last_seen_at: new Date().toISOString()
    });
  }

  async pingDriverOnline(driverId) {
    if (!driverId) return;

    return this.rest.update(CONFIG.TABLES.CHOFERES, driverId, {
      online: true,
      last_seen_at: new Date().toISOString()
    });
  }

  async aceptarOfertaViaje(viajeId, choferId) {
    return this.rest.rpc('aceptar_oferta_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
  }

  async rechazarOfertaViaje(viajeId, choferId, motivo = null) {
    return this.rest.rpc('rechazar_oferta_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId,
      p_motivo: motivo
    });
  }

  async iniciarViaje(viajeId, choferId) {
    return this.rest.rpc('iniciar_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
  }

  async completarViaje(viajeId, choferId) {
    return this.rest.rpc('completar_viaje', {
      p_viaje_id: viajeId,
      p_chofer_id: choferId
    });
  }

  subscribeToDriverOffers(driverId, callback) {
    if (!this.client) {
      throw new Error('Supabase client no inicializado');
    }

    const channel = this.client
      .channel(`driver-offers-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viaje_ofertas',
          filter: `chofer_id=eq.${driverId}`
        },
        callback
      )
      .subscribe((status) => {
        console.log('[Realtime ofertas chofer]', status);

        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime ofertas: CHANNEL_ERROR');
        }

        if (status === 'TIMED_OUT') {
          console.error('Realtime ofertas: TIMED_OUT');
        }
      });

    return channel;
  }

  subscribeToDriverTrips(driverId, callback) {
    if (!this.client) {
      throw new Error('Supabase client no inicializado');
    }

    const channel = this.client
      .channel(`driver-trips-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: CONFIG.TABLES.VIAJES,
          filter: `chofer_id=eq.${driverId}`
        },
        callback
      )
      .subscribe((status) => {
        console.log('[Realtime viajes chofer]', status);

        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime viajes chofer: CHANNEL_ERROR');
        }

        if (status === 'TIMED_OUT') {
          console.error('Realtime viajes chofer: TIMED_OUT');
        }
      });

    return channel;
  }

  getCurrentDriverData() {
    try {
      const raw = localStorage.getItem('choferData');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('No se pudo parsear choferData:', error);
      return null;
    }
  }

  getCurrentDriverId() {
    const choferData = this.getCurrentDriverData();

    if (choferData?.id) return choferData.id;
    if (choferData?.email) return choferData.email;

    const legacyId = localStorage.getItem('choferUsuario');
    return legacyId || null;
  }

  isAuthenticated() {
    return (
      localStorage.getItem('choferLogueado') === 'true' &&
      this.getCurrentDriverId() !== null
    );
  }

  logout() {
    try {
      this.client?.removeAllChannels?.();
    } catch (e) {
      console.warn('Error limpiando canales realtime:', e);
    }

    localStorage.removeItem('choferLogueado');
    localStorage.removeItem('choferUsuario');
    localStorage.removeItem('choferData');

    window.location.href = CONFIG.REDIRECTS.LOGIN;
  }
}

const supabaseService = new SupabaseService();
export default supabaseService;
