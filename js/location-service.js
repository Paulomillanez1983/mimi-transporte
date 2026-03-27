/**
 * MIMI Driver - Location Service
 * High-accuracy tracking with battery optimization
 */

class LocationService {
  constructor() {
    this.watchId = null;
    this.position = null;
    this.callbacks = [];
    this.isTracking = false;
    this.updateTimer = null;
    this.throttleTimer = null;
    this.accuracyThreshold = 50; // meters
  }

  async start(callback) {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    // Stop existing
    this.stop();
    
    if (callback) {
      this.callbacks.push(callback);
    }

    return new Promise((resolve, reject) => {
      // Get initial position
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this._handlePosition(pos, true);
          resolve(this.position);
        },
        (err) => {
          console.warn('[Location] Initial position error:', err);
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000
        }
      );

      // Start watching
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this._handlePosition(pos),
        (err) => this._handleError(err),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
          distanceFilter: 10
        }
      );

      this.isTracking = true;

      // Backup refresh timer
      this.updateTimer = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL);

      // Handle visibility changes
      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;
    
    // Filter low accuracy (except initial)
    if (coords.accuracy > this.accuracyThreshold && !isInitial) {
      return;
    }

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading || this.position?.heading || 0,
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0, // km/h
      timestamp: Date.now()
    };

    // Skip if no significant change
    if (this.position && this._distance(newPosition, this.position) < 5) {
      return;
    }

    this.position = newPosition;

    // Throttle updates to Supabase
    this._throttleUpdate(newPosition);

    // Notify local callbacks
    this.callbacks.forEach(cb => {
      try { cb(newPosition); } catch (e) {}
    });
  }

  _throttleUpdate(position) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
    }

    this.throttleTimer = setTimeout(async () => {
      const driverId = supabaseClient.getDriverId();
      if (driverId) {
        await supabaseClient.updateDriverLocation(driverId, position);
      }
    }, 2000);
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[Location] Refresh error:', err),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000
      }
    );
  }

  _handleError(error) {
    console.error('[Location] Error:', error.message);
    
    // Notify UI
    window.dispatchEvent(new CustomEvent('locationError', {
      detail: error
    }));
  }

  _handleVisibilityChange() {
    if (!this.updateTimer) return;

    clearInterval(this.updateTimer);

    if (document.hidden) {
      // Slow down when hidden
      this.updateTimer = setInterval(() => {
        this._refreshPosition();
      }, 30000);
    } else {
      // Normal speed when visible
      this.updateTimer = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL);
      this._refreshPosition();
    }
  }

  _distance(pos1, pos2) {
    const R = 6371e3;
    const φ1 = pos1.lat * Math.PI / 180;
    const φ2 = pos2.lat * Math.PI / 180;
    const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
    const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    this.isTracking = false;
    this.callbacks = [];
  }

  getPosition() {
    return this.position;
  }

  onUpdate(callback) {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx > -1) this.callbacks.splice(idx, 1);
    };
  }
}

const locationService = new LocationService();
