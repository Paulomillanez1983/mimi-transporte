/**
 * Location Tracker Producción (RLS + auth.uid)
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
  }

  async start(callback) {
    if (!navigator.geolocation) {
      console.error('[LocationTracker] Geolocation no soportado');
      return false;
    }

    if (this.isTracking) this.stop();

    if (callback) this.callbacks.push(callback);

    this.isTracking = true;

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('[LocationTracker] Error posición inicial:', error);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
      );

      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
      );

      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL || 5000);

      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;

    if (coords.accuracy > 100 && !isInitial) return;

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
    ) return;

    this.lastPosition = newPosition;

    this.callbacks.forEach((cb) => {
      try { cb(newPosition); } catch (e) {}
    });

    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    if (this._updateTimeout) clearTimeout(this._updateTimeout);

    this._updateTimeout = setTimeout(async () => {
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
          .eq('user_id', user.id);

        if (error) console.error('[LocationTracker] Error update:', error);

      } catch (err) {
        console.error('[LocationTracker] Error update ubicación:', err);
      }
    }, 2000);
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[LocationTracker] Refresh error:', err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }

  _handleError(error) {
    console.error('[LocationTracker] Error GPS:', error.message);
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;

    if (this.updateInterval) clearInterval(this.updateInterval);

    this.updateInterval = setInterval(() => {
      this._refreshPosition();
    }, isHidden ? 30000 : (CONFIG.LOCATION_UPDATE_INTERVAL || 5000));

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
