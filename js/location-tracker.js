/**
 * Location Tracker Producción (FIX TIMEOUT + RLS + auth.uid)
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

    this._lastDbUpdate = 0;
    this._dbInterval = 8000; // guardar en DB cada 8 seg
  }

  async start(callback) {
    if (!navigator.geolocation) {
      console.error('[LocationTracker] Geolocation no soportado');
      return false;
    }

    if (this.isTracking) this.stop();

    if (callback) this.callbacks.push(callback);

    this.isTracking = true;

    const options = {
      enableHighAccuracy: true,
      timeout: 20000,      // ✅ más tiempo
      maximumAge: 5000
    };

    return new Promise((resolve) => {
      // Posición inicial
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Error posición inicial:', error);
          // aunque falle inicial, seguimos con watchPosition
          resolve(true);
        },
        options
      );

      // Watch continuo (principal)
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        options
      );

      // Refresco extra (solo por seguridad, no tan seguido)
      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL || 15000);

      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;

    // Si la precisión es muy mala, ignoramos (pero dejamos pasar la inicial)
    if (!isInitial && coords.accuracy && coords.accuracy > 300) return;

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy || null,
      heading: coords.heading || 0,
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0,
      timestamp: position.timestamp
    };

    // Evitar repetidos exactos
    if (
      this.lastPosition &&
      this.lastPosition.lat === newPosition.lat &&
      this.lastPosition.lng === newPosition.lng
    ) return;

    this.lastPosition = newPosition;

    // callbacks para el mapa / UI
    this.callbacks.forEach((cb) => {
      try { cb(newPosition); } catch (e) {}
    });

    // guardar en supabase con throttle real
    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this._updateTimeout = setTimeout(async () => {
      const now = Date.now();
      if (now - this._lastDbUpdate < this._dbInterval) return;
      this._lastDbUpdate = now;

      try {
        const { data: { user } } = await supabaseService.client.auth.getUser();
        if (!user) return;

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
          .eq('id_uuid', supabaseService.getDriverId());

        if (error) {
          console.error('[LocationTracker] ❌ Error update ubicación:', error);
        } else {
          console.log('[LocationTracker] ✅ Ubicación guardada en Supabase');
        }

      } catch (err) {
        console.error('[LocationTracker] ❌ Error update ubicación:', err);
      }
    }, 1500);
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[LocationTracker] Refresh error:', err),
      {
        enableHighAccuracy: true,
        timeout: 20000,      // ✅ FIX
        maximumAge: 15000
      }
    );
  }

  _handleError(error) {
    // Timeout es normal en PC, no lo tratamos como fatal
    if (error.code === 3) {
      console.warn('[LocationTracker] ⚠️ Timeout GPS (normal en PC/WiFi)');
      return;
    }

    console.error('[LocationTracker] Error GPS:', error.message);
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;

    if (this.updateInterval) clearInterval(this.updateInterval);

    // cuando está en background refresca más lento
    this.updateInterval = setInterval(() => {
      this._refreshPosition();
    }, isHidden ? 60000 : (CONFIG.LOCATION_UPDATE_INTERVAL || 15000));

    if (!isHidden) this._refreshPosition();
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this.isTracking = false;
    this.callbacks = [];
    this.lastPosition = null;
  }

  getLastPosition() {
    return this.lastPosition;
  }
}

export default new LocationTracker();
