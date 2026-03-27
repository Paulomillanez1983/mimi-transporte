/**
 * Servicio de geolocalización con optimización de batería
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
    this.backgroundMode = false;
  }

  async start(callback) {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return false;
    }

    if (this.isTracking) {
      this.stop();
    }

    // Callback interno para procesar posición
    this.callbacks.push(callback);

    return new Promise((resolve) => {
      // Intentar obtener posición inicial
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this._handlePosition(position, true);
          resolve(true);
        },
        (error) => {
          console.warn('Initial position error:', error);
          resolve(false);
        },
        CONFIG.GEO_OPTIONS
      );

      // Iniciar watch continuo
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._handleError(error),
        CONFIG.GEO_OPTIONS
      );

      this.isTracking = true;

      // Backup con intervalo (algunos dispositivos matan el watch)
      this.updateInterval = setInterval(() => {
        this._refreshPosition();
      }, CONFIG.LOCATION_UPDATE_INTERVAL);

      // Manejar visibilidad de página
      document.addEventListener('visibilitychange', () => {
        this._handleVisibilityChange();
      });
    });
  }

  _handlePosition(position, isInitial = false) {
    const coords = position.coords;
    
    // Filtrar posiciones inválidas o muy imprecisas
    if (coords.accuracy > 100 && !isInitial) {
      return; // Ignorar si precisión > 100m
    }

    const newPosition = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: coords.heading || this._calculateHeading(coords),
      speed: coords.speed ? Math.round(coords.speed * 3.6) : 0, // km/h
      timestamp: position.timestamp
    };

    // Filtrar duplicados (misma posición)
    if (this.lastPosition && 
        this.lastPosition.lat === newPosition.lat && 
        this.lastPosition.lng === newPosition.lng) {
      return;
    }

    this.lastPosition = newPosition;

    // Notificar a todos los suscriptores
    this.callbacks.forEach(cb => {
      try {
        cb(newPosition);
      } catch (e) {
        console.error('Callback error:', e);
      }
    });

    // Actualizar en Supabase (throttled)
    this._throttledUpdate(newPosition);
  }

  _calculateHeading(coords) {
    if (!this.lastPosition) return 0;
    
    const lat1 = this.lastPosition.lat * Math.PI / 180;
    const lat2 = coords.latitude * Math.PI / 180;
    const dLon = (coords.longitude - this.lastPosition.lng) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const heading = Math.atan2(y, x) * 180 / Math.PI;
    return (heading + 360) % 360;
  }

  // Throttle para no saturar Supabase
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
    }, 2000); // Máximo 1 update cada 2 segundos
  }

  _refreshPosition() {
    if (!this.isTracking) return;
    
    navigator.geolocation.getCurrentPosition(
      (pos) => this._handlePosition(pos),
      (err) => console.warn('Refresh position error:', err),
      { ...CONFIG.GEO_OPTIONS, maximumAge: 10000 }
    );
  }

  _handleError(error) {
    let message = 'Error de ubicación';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Permiso de ubicación denegado';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Ubicación no disponible';
        break;
      case error.TIMEOUT:
        message = 'Timeout obteniendo ubicación';
        break;
    }
    console.error('Geolocation error:', message, error);
  }

  _handleVisibilityChange() {
    const isHidden = document.hidden;
    
    if (isHidden) {
      // Modo background: reducir frecuencia
      this.backgroundMode = true;
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => {
          this._refreshPosition();
        }, 30000); // 30 segundos en background
      }
    } else {
      // Volver a foreground
      this.backgroundMode = false;
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

  isActive() {
    return this.isTracking;
  }
}

const locationTracker = new LocationTracker();
export default locationTracker;
