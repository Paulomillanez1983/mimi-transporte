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

    try {
      this.client = window.supabase.createClient(
        CONFIG.SUPABASE_URL, 
        CONFIG.SUPABASE_KEY,
        {
          auth: { 
            persistSession: true, 
            autoRefreshToken: true,
            detectSessionInUrl: true
          },
          realtime: {
            timeout: 20000
          }
        }
      );

      // Wrapper REST con retry logic
      this.rest = {
        select: this._withRetry(this._select.bind(this)),
        update: this._withRetry(this._update.bind(this)),
        insert: this._withRetry(this._insert.bind(this))
      };

      this.initialized = true;
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
    if (error) throw error;
    return data || [];
  }

  async _update(table, id, data) {
    const updateData = {
      ...data,
      updated_at: new Date().toISOString()
    };

    const { data: result, error } = await this.client
      .from(table)
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;
    return result;
  }

  async _insert(table, data) {
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select();

    if (error) throw error;
    return result;
  }

  // Actualizar ubicación del chofer en tiempo real
  async updateDriverLocation(driverId, position) {
    return this.rest.update('choferes', driverId, {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading || null,
      speed: position.speed || null,
      last_update: new Date().toISOString(),
      online: true
    });
  }

  // Suscribirse a cambios de viajes
  subscribeToTrips(callback) {
    return this.client
      .channel('trips-channel')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'viajes',
          filter: `chofer_id=eq.${this.getCurrentDriverId()}`
        },
        callback
      )
      .subscribe();
  }

  getCurrentDriverId() {
    return localStorage.getItem('choferUsuario') || null;
  }

  isAuthenticated() {
    return localStorage.getItem('choferLogueado') === 'true' && 
           this.getCurrentDriverId() !== null;
  }

  logout() {
    localStorage.removeItem('choferLogueado');
    localStorage.removeItem('choferUsuario');
    localStorage.removeItem('choferData');
    window.location.href = CONFIG.REDIRECTS.LOGIN;
  }
}

// Singleton
const supabaseService = new SupabaseService();
export default supabaseService;
