/**
 * Servicio de mapas con MapLibre - Optimizado para producción
 */

import CONFIG from './config.js';

class MapService {
  constructor() {
    this.map = null;
    this.markers = {
      driver: null,
      pickup: null,
      destination: null
    };
    this.routeLayer = null;
    this.isReady = false;
    this.pendingOperations = [];
  }

  async init(containerId) {
    return new Promise((resolve, reject) => {
      try {
        this.map = new maplibregl.Map({
          container: containerId,
          style: CONFIG.MAP_STYLE,
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
          touchZoomRotate: true
        });

        this.map.on('load', () => {
          this.isReady = true;
          this._executePending();
          resolve(this.map);
        });

        this.map.on('error', (e) => {
          console.error('Map error:', e);
          reject(e);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  _executePending() {
    while (this.pendingOperations.length > 0) {
      const op = this.pendingOperations.shift();
      op();
    }
  }

  _whenReady(operation) {
    if (this.isReady) {
      operation();
    } else {
      this.pendingOperations.push(operation);
    }
  }

  // Crear elemento de marcador personalizado
  _createMarkerElement(type, content) {
    const el = document.createElement('div');
    el.className = `marker-${type}`;
    el.innerHTML = content;
    el.style.cssText = `
      width: ${type === 'driver' ? '48px' : '40px'};
      height: ${type === 'driver' ? '48px' : '40px'};
      background: ${type === 'driver' ? '#276EF1' : type === 'pickup' ? '#05944F' : '#E11900'};
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${type === 'driver' ? '24px' : '18px'};
      z-index: ${type === 'driver' ? '100' : '10'};
    `;
    return el;
  }

  updateDriverPosition(lng, lat, heading = 0) {
    this._whenReady(() => {
      if (!this.markers.driver) {
        const el = this._createMarkerElement('driver', '🚐');
        this.markers.driver = new maplibregl.Marker({ 
          element: el,
          rotation: heading 
        })
          .setLngLat([lng, lat])
          .addTo(this.map);
      } else {
        this.markers.driver.setLngLat([lng, lat]);
        this.markers.driver.setRotation(heading);
      }

      // Smooth flyTo solo si el usuario no está interactuando
      if (!this.map.isMoving() && !this.map.isZooming()) {
        this.map.easeTo({
          center: [lng, lat],
          duration: 1000,
          easing: (t) => t * (2 - t) // easeOutQuad
        });
      }
    });
  }

  showTripRoute(pickup, destination, fitBounds = true) {
    this._whenReady(() => {
      // Limpiar marcadores anteriores
      this.clearTripMarkers();

      // Marcador de pickup (origen)
      const pickupEl = this._createMarkerElement('pickup', '👤');
      this.markers.pickup = new maplibregl.Marker({ element: pickupEl })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(this.map);

      // Marcador de destino
      const destEl = this._createMarkerElement('destination', '🏁');
      this.markers.destination = new maplibregl.Marker({ element: destEl })
        .setLngLat([destination.lng, destination.lat])
        .addTo(this.map);

      // Dibujar línea de ruta
      this._drawRouteLine(pickup, destination);

      // Ajustar vista
      if (fitBounds) {
        const bounds = new maplibregl.LngLatBounds()
          .extend([pickup.lng, pickup.lat])
          .extend([destination.lng, destination.lat]);
        
        this.map.fitBounds(bounds, { 
          padding: { top: 100, bottom: 300, left: 50, right: 50 },
          duration: 1000
        });
      }
    });
  }

  _drawRouteLine(from, to) {
    const coordinates = [
      [from.lng, from.lat],
      [to.lng, to.lat]
    ];

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates
      },
      properties: {}
    };

    if (this.map.getSource('route')) {
      this.map.getSource('route').setData(geojson);
    } else {
      this.map.addSource('route', {
        type: 'geojson',
        data: geojson,
        lineMetrics: true
      });

      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#276EF1',
          'line-width': 5,
          'line-opacity': 0.9,
          'line-gradient': [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0, '#05944F',
            0.5, '#276EF1',
            1, '#E11900'
          ]
        }
      });

      // Efecto de animación de la línea
      this._animateRoute();
    }
  }

  _animateRoute() {
    let progress = 0;
    const animate = () => {
      progress += 0.01;
      if (progress > 1) progress = 0;
      
      if (this.map.getLayer('route-line')) {
        this.map.setPaintProperty('route-line', 'line-dasharray', [0, 2, 1]);
      }
      
      requestAnimationFrame(animate);
    };
    // Simplificado: en producción usar line-gradient animado
  }

  clearTripMarkers() {
    if (this.markers.pickup) {
      this.markers.pickup.remove();
      this.markers.pickup = null;
    }
    if (this.markers.destination) {
      this.markers.destination.remove();
      this.markers.destination = null;
    }
  }

  clearAll() {
    this.clearTripMarkers();
    if (this.map.getLayer('route-line')) {
      this.map.removeLayer('route-line');
    }
    if (this.map.getSource('route')) {
      this.map.removeSource('route');
    }
  }

  resize() {
    if (this.map) {
      this.map.resize();
    }
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.isReady = false;
    }
  }

  // Calcular distancia entre dos puntos (Haversine)
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  // Calcular tiempo estimado (asumiendo velocidad promedio)
  static calculateETA(distanceMeters, speedKmh = 30) {
    const seconds = (distanceMeters / 1000) / speedKmh * 3600;
    const minutes = Math.ceil(seconds / 60);
    return minutes <= 1 ? '1 min' : `${minutes} mins`;
  }
}

const mapService = new MapService();
export default mapService;
