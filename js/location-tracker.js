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
    this.permissionStatus = null;

    this._visibilityHandler = this._handleVisibilityChange.bind(this);
    this._lastDbUpdate = 0;
  }

  async start(callback) {
    console.log('[LocationTracker] Starting...');

    if (!navigator.geolocation) {
      console.error('[LocationTracker] Geolocation not supported');
      return false;
    }

    if (this.isTracking) {
      this.stop();
    }

    const hasPermission = await this._checkPermission();
    if (!hasPermission) {
      console.warn('[LocationTracker] Permission not granted yet, requesting...');
      const requested = await this._requestPermission();
      if (!requested) {
        console.error('[LocationTracker] Could not get permission');
        return false;
      }
    }

    if (callback) {
      this.callbacks.push(callback);
    }

    this.isTracking = true;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[LocationTracker] Initial position:', position.coords);
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Initial position error:', error.message);
          resolve(false);
        },
        {
          enableHighAccuracy: navigator.connection?.effectiveType !== '2g',
          timeout: 30000,
          maximumAge: 10000
        }
      );

      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        {
          enableHighAccuracy: navigator.connection?.effectiveType !== '2g',
          timeout: 30000,
          maximumAge: 5000
        }
      );

      console.log('[LocationTracker] Watch started, ID:', this.watchId);

      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL || 5000);

      document.removeEventListener('visibilitychange', this._visibilityHandler);
      document.addEventListener('visibilitychange', this._visibilityHandler);
    });
  }

  async _checkPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return false;
    }

    try {
      this.permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      console.log('[LocationTracker] Permission status:', this.permissionStatus.state);

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

  async _requestPermission() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          console.log('[LocationTracker] Permission granted via getCurrentPosition');
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Permission denied or error:', error.message);
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
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

    if (coords.accuracy > 500 && !isInitial) {
      console.warn('[LocationTracker] Low accuracy, skipping:', coords.accuracy);
      return;
    }

    if (coords.speed && coords.speed * 3.6 > 150) {
      console.warn('[LocationTracker] Ignoring unrealistic speed:', coords.speed);
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

    if (this.lastPosition) {
      const dist = this._distanceMeters(
        this.lastPosition.lat,
        this.lastPosition.lng,
        newPosition.lat,
        newPosition.lng
      );

      if (dist < 5 && !isInitial) {
        return;
      }
    }

    if (
      this.lastPosition &&
      this.lastPosition.lat === newPosition.lat &&
      this.lastPosition.lng === newPosition.lng
    ) {
      return;
    }

    this.lastPosition = newPosition;

    this.callbacks.forEach((cb) => {
      try {
        cb(newPosition);
      } catch (e) {
        console.error('[LocationTracker] Callback error:', e);
      }
    });

    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    const now = Date.now();

    if (!this._lastDbUpdate || now - this._lastDbUpdate > 4000) {
      this._lastDbUpdate = now;
      this._sendToSupabase(position);
    }
  }

  async _sendToSupabase(position) {
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
        console.error('[LocationTracker] Supabase error:', error);
      }
    } catch (err) {
      console.error('[LocationTracker] Update error:', err);
    }
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[LocationTracker] Refresh error:', err.message),
      {
        enableHighAccuracy: navigator.connection?.effectiveType !== '2g',
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

    window.dispatchEvent(
      new CustomEvent('locationError', {
        detail: {
          code: error.code,
          message: errorMessages[error.code] || error.message
        }
      })
    );
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;
    console.log('[LocationTracker] Visibility changed:', isHidden ? 'hidden' : 'visible');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    const interval = isHidden ? 60000 : (CONFIG.LOCATION_UPDATE_INTERVAL || 5000);

    this.updateInterval = setInterval(() => {
      this._refreshPosition();
    }, interval);

    if (!isHidden) {
      this._refreshPosition();
    }
  }

  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _distanceMeters(lat1, lon1, lat2, lon2) {
    return this._haversine(lat1, lon1, lat2, lon2);
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

    document.removeEventListener('visibilitychange', this._visibilityHandler);

    this.isTracking = false;
    this.callbacks = [];
    this.lastPosition = null;
    this._lastDbUpdate = 0;
  }

  getLastPosition() {
    return this.lastPosition;
  }

  getCurrentPosition() {
    return this.lastPosition;
  }

  isActive() {
    return this.isTracking;
  }
}

export default new LocationTracker();
