/**
 * Location Tracker Producción (RLS + auth.uid)
 * CON MANEJO EXPLÍCITO DE PERMISOS
 */

import CONFIG from './config.js';
import supabaseService from './supabase-client.js';

class LocationTracker {
  constructor() {
    this.watchId = null;
    this.lastPosition = null;
    this.callbacks = [];
    this.isTracking = false;
    this.updateInterval = null;
    this._updateTimeout = null;
    this.permissionStatus = null;
  }

  async start(callback) {
    console.log('[LocationTracker] Starting...');

    // 1. VERIFICAR PERMISOS PRIMERO
    const hasPermission = await this._checkPermission();
    if (!hasPermission) {
      console.error('[LocationTracker] Permission denied or not available');
      // Intentar solicitar de todas formas
      const requested = await this._requestPermission();
      if (!requested) {
        console.error('[LocationTracker] Could not get permission');
        return false;
      }
    }

    if (!navigator.geolocation) {
      console.error('[LocationTracker] Geolocation not supported');
      return false;
    }

    if (this.isTracking) this.stop();

    if (callback) this.callbacks.push(callback);

    this.isTracking = true;

    return new Promise((resolve) => {
      // 2. OBTENER POSICIÓN INICIAL CON TIMEOUT LARGO
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[LocationTracker] Initial position:', position.coords);
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Initial position error:', error.message);
          // No rechazamos, intentamos watchPosition de todas formas
          resolve(false);
        },
        { 
          enableHighAccuracy: true, 
          timeout: 30000, // 30 segundos
          maximumAge: 10000 // 10 segundos
        }
      );

      // 3. INICIAR WATCH POSITION
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        { 
          enableHighAccuracy: true, 
          timeout: 30000, // 30 segundos
          maximumAge: 5000 // 5 segundos
        }
      );

      console.log('[LocationTracker] Watch started, ID:', this.watchId);

      // 4. BACKUP REFRESH INTERVAL
      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL || 5000);

      // 5. MANEJAR CAMBIO DE VISIBILIDAD
      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  // NUEVO: Verificar permisos de forma explícita
  async _checkPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      // Navegador no soporta Permissions API, asumir que necesitamos pedir
      return false;
    }

    try {
      this.permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      console.log('[LocationTracker] Permission status:', this.permissionStatus.state);
      
      // Escuchar cambios en el permiso
      this.permissionStatus.onchange = () => {
        console.log('[LocationTracker] Permission changed to:', this.permissionStatus.state);
        if (this.permissionStatus.state === 'denied') {
          this.stop();
        }
      };

      return this.permissionStatus.state === 'granted';
    } catch (e) {
      console.warn('[LocationTracker] Could not query permission:', e);
      return false;
    }
  }

  // NUEVO: Solicitar permiso explícitamente
  async _requestPermission() {
    return new Promise((resolve) => {
      // Intentar obtener posición una vez para disparar el prompt de permiso
      navigator.geolocation.getCurrentPosition(
        () => {
          console.log('[LocationTracker] Permission granted via getCurrentPosition');
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Permission denied or error:', error.message);
          resolve(false);
        },
        { timeout: 10000 }
      );
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;
    console.log('[LocationTracker] Position update:', {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading,
      speed: coords.speed
    });

    // Aumentar tolerancia de precisión para aceptar más lecturas
    if (coords.accuracy > 500 && !isInitial) {
      console.warn('[LocationTracker] Low accuracy, skipping:', coords.accuracy);
      return;
    }

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading || 0,
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0,
      timestamp: position.timestamp
    };

    if (
      this.lastPosition &&
      this.lastPosition.lat === newPosition.lat &&
      this.lastPosition.lng === newPosition.lng
    ) {
      return; // Misma posición, no actualizar
    }

    this.lastPosition = newPosition;

    // Notificar callbacks
    this.callbacks.forEach((cb) => {
      try { 
        cb(newPosition); 
      } catch (e) {
        console.error('[LocationTracker] Callback error:', e);
      }
    });

    // Actualizar Supabase (throttled)
    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this._updateTimeout = setTimeout(async () => {
      try {
        const { data: { user } } = await supabaseService.client.auth.getUser();
        if (!user) {
          console.warn('[LocationTracker] No user, skipping update');
          return;
        }

        const { error } = await supabaseService.client
          .from('choferes')
          .update({
            lat: position.lat,
            lng: position.lng,
            accuracy: position.accuracy,
            heading: position.heading,
            speed: position.speed,
            last_location_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString()
          })
          .eq('user_id', user.id);

        if (error) {
          console.error('[LocationTracker] Supabase update error:', error);
        } else {
          console.log('[LocationTracker] Location updated in Supabase');
        }

      } catch (err) {
        console.error('[LocationTracker] Error updating location:', err);
      }
    }, 2000);
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[LocationTracker] Refresh error:', err.message),
      { 
        enableHighAccuracy: true, 
        timeout: 30000, 
        maximumAge: 10000 
      }
    );
  }

  _handleError(error) {
    console.error('[LocationTracker] GPS Error:', error.code, error.message);
    
    const errorMessages = {
      1: 'Permiso de ubicación denegado',
      2: 'Posición no disponible',
      3: 'Timeout al obtener ubicación'
    };

    // Disparar evento para UI
    window.dispatchEvent(new CustomEvent('locationError', {
      detail: { 
        code: error.code, 
        message: errorMessages[error.code] || error.message 
      }
    }));
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;
    console.log('[LocationTracker] Visibility changed:', isHidden ? 'hidden' : 'visible');

    if (this.updateInterval) clearInterval(this.updateInterval);

    // Intervalo más largo cuando está en background
    const interval = isHidden ? 60000 : (CONFIG.LOCATION_UPDATE_INTERVAL || 5000);
    
    this.updateInterval = setInterval(() => {
      this._refreshPosition();
    }, interval);

    if (!isHidden) {
      // Forzar actualización al volver a visible
      this._refreshPosition();
    }
  }

  stop() {
    console.log('[LocationTracker] Stopping...');

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
      this._updateTimeout = null;
    }

    this.isTracking = false;
    this.callbacks = [];
    this.lastPosition = null;
  }

  getLastPosition() {
    return this.lastPosition;
  }

  isActive() {
    return this.isTracking;
  }
}

export default new LocationTracker();
