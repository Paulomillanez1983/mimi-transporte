/**
 * Servicio de geolocalización
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
      accuracy: coords.ac
