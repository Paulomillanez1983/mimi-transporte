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

    // Subimos tolerancia para desktop / wifi positioning
    this.accuracyThreshold = 200; // meters
  }

  async start(callback) {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    this.stop();

    if (callback) {
      this.callbacks.push(callback);
    }

    this.isTracking = true;

    return new Promise((resolve) => {
      let resolved = false;

      // 1) Intento inicial (no bloqueante)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this._handlePosition(pos, true);

          if (!resolved) {
            resolved = true;
            resolve(this.position);
          }
        },
        (err) => {
          console.warn('[Location] Initial position error:', err);

          // No rechazamos, porque igual watchPosition puede funcionar
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,     // antes 10000
          maximumAge: 10000
        }
      );

      // 2) Tracking continuo
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => this._handlePosition(pos),
        (err) => this._handleError(err),
        {
          enableHighAccuracy: true,
          timeout: 20000,     // antes 10000
          maximumAge: 5000
        }
      );

      // 3) Backup refresh timer
      this.updateTimer = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL);

      // 4) Visibility
      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    if (!position?.coords) return;

    const coords = position.coords;

    // Si accuracy es demasiado mala, ignorar excepto si todavía no tenemos nada
    if (coords.accuracy > this.accuracyThreshold && this.position && !isInitial) {
      return;
    }

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading ?? this.position?.heading ?? 0,
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0,
      timestamp: Date.now()
    };

    // Validación dura para evitar null/NaN
    if (
      typeof newPosition.lat !== 'number' ||
      typeof newPosition.lng !== 'number' ||
      Number.isNaN(newPosition.lat) ||
      Number.isNaN(newPosition.lng)
    ) {
      console.warn('[Location] Invalid coordinates received:', newPosition);
      return;
    }

    // Evitar spam si no se movió
    if (this.position && this._distance(newPosition, this.position) < 5) {
      return;
    }

    this.position = newPosition;

    // Update Supabase (throttled)
    this._throttleUpdate(newPosition);

    // Notify UI
    this.callbacks.forEach(cb => {
      try { cb(newPosition); } catch (e) {}
    });
  }

  _throttleUpdate(position) {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
    }

    this.throttleTimer = setTimeout(async () => {
      try {
        const driverId = supabaseClient.getDriverId();

        // Si driverId no existe no mandamos nada
        if (!driverId) return;

        // No enviar si todavía no hay posición real
        if (!position?.lat || !position?.lng) return;

        await supabaseClient.updateDriverLocation(driverId, position);

      } catch (err) {
        console.warn('[Location] Supabase update error:', err);
      }
    }, 2500);
  }

  _refreshPosition() {
    if (!this.isTracking) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('[Location] Refresh error:', err),
      {
        enableHighAccuracy: true,
        timeout: 20000,     // antes 8000
        maximumAge: 10000
      }
    );
  }

  _handleError(error) {
    console.error('[Location] Error:', error);

    window.dispatchEvent(new CustomEvent('locationError', {
      detail: error
    }));
  }

  _handleVisibilityChange() {
    if (!this.updateTimer) return;

    clearInterval(this.updateTimer);

    if (document.hidden) {
      this.updateTimer = setInterval(() => {
        this._refreshPosition();
      }, 30000);
    } else {
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

    const a =
      Math.sin(Δφ/2) * Math.sin(Δφ/2) +
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
    this.position = null;
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
