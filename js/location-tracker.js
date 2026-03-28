/**
 * Servicio de geolocalización
 */

import { CONFIG } from './config.js';
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
      console.error('Geolocation not supported');
      return false;
    }

    if (this.isTracking) {
      this.stop();
    }

    this.callbacks.push(callback);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('Initial position error:', error);
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
      );

      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
      );

      this.isTracking = true;

      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL);

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

    if (this.lastPosition && 
        this.lastPosition.lat === newPosition.lat && 
        this.lastPosition.lng === newPosition.lng) {
      return;
    }

    this.lastPosition = newPosition;
    this.callbacks.forEach(cb => {
      try { cb(newPosition); } catch (e) {}
    });

    this._throttledUpdate(newPosition);
  }

  _throttledUpdate(position) {
    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
    }

    this._updateTimeout = setTimeout(() => {
      const driverId = supabaseService.getCurrentDriverId();
      if (driverId) {
        supabaseService.updateDriverLocation(driverId, position)
          .catch(err => console.error('Location update failed:', err));
      }
    }, 2000);
  }

  _refreshPosition() {
    if (!this.isTracking) return;
    
    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('Refresh position error:', err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }

  _handleError(error) {
    console.error('Geolocation error:', error.message);
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;
    
    if (isHidden) {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => {
          this._refreshPosition();
        }, 30000);
      }
    } else {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => {
          this._refreshPosition();
        }, CONFIG.LOCATION_UPDATE_INTERVAL);
      }
      this._refreshPosition();
    }
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

    if (this._updateTimeout) {
      clearTimeout(this._updateTimeout);
    }

    this.isTracking = false;
    this.callbacks = [];
    this.lastPosition = null;
  }

  getLastPosition() {
    return this.lastPosition;
  }
}

const locationTracker = new LocationTracker();
export default locationTracker;
