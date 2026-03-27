/**
 * Cliente Supabase inicializado con manejo de errores
 */

import CONFIG from './config.js';

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

    if (
      !CONFIG.SUPABASE_URL ||
      !CONFIG.SUPABASE_KEY ||
      CONFIG.SUPABASE_KEY.includes('TU_ANON_KEY')
    ) {
      console.error('Supabase key inválida o placeholder detectado');
      return false;
    }

    try {
      console.log('SUPABASE_URL =>', CONFIG.SUPABASE_URL);
      console.log('SUPABASE_KEY (inicio) =>', CONFIG.SUPABASE_KEY?.slice(0, 20));

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
        upsert: this._withRetry(this._upsert.bind(this))
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
    const payload = Array.isArray(data) ? data : [data];

    const { data: result, error } = await this.client
      .from(table)
      .upsert(payload, { onConflict })
      .select();

    if (error) {
      console.error(`Supabase UPSERT error [${table}]`, error);
      throw error;
    }

    return result || [];
  }

  // =====================================================
  // TRACKING DEL CHOFER EN TIEMPO REAL
  // Respeta tu tabla `choferes`
  // =====================================================
  async updateDriverLocation(driverId, position) {
    if (!driverId) {
      throw new Error('No se pudo actualizar ubicación: driverId inválido');
    }

    return this.rest.upsert(
      'choferes',
      {
        id: driverId,
        lat: position.lat,
        lng: position.lng,
        heading: position.heading ?? null,
        speed: position.speed ?? null,
        online: true,
        disponible: true,
        last_update: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      'id'
    );
  }

  // =====================================================
  // DISPONIBILIDAD DEL CHOFER
  // =====================================================
  async setDriverAvailability(driverId, disponible, online = true) {
    if (!driverId) {
      throw new Error('driverId inválido');
    }

    return this.rest.upsert(
      'choferes',
      {
        id: driverId,
        disponible,
        online,
        last_update: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      'id'
    );
  }

  // =====================================================
  // SUBSCRIPCIÓN REALTIME A VIAJES
  // =====================================================
  subscribeToTrips(callback) {
    if (!this.client) {
      throw new Error('Supabase client no inicializado');
    }

    const channel = this.client
      .channel('trips-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'viajes'
        },
        callback
      )
      .subscribe((status) => {
        console.log('[Realtime viajes]', status);

        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime viajes: CHANNEL_ERROR');
        }

        if (status === 'TIMED_OUT') {
          console.error('Realtime viajes: TIMED_OUT');
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

    // Prioridad: id real estructurado
    if (choferData?.id) return choferData.id;

    // Fallback legacy
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

    const driverId = this.getCurrentDriverId();

    // intento marcar offline sin bloquear logout
    if (driverId && this.client) {
      this.client
        .from('choferes')
        .upsert({
          id: driverId,
          online: false,
          disponible: false,
          last_update: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .then(() => {
          console.log('Chofer marcado offline');
        })
        .catch((e) => {
          console.warn('No se pudo marcar chofer offline:', e);
        });
    }

    localStorage.removeItem('choferLogueado');
    localStorage.removeItem('choferUsuario');
    localStorage.removeItem('choferData');

    window.location.href = CONFIG.REDIRECTS.LOGIN;
  }
}

// Singleton
const supabaseService = new SupabaseService();
export default supabaseService;
