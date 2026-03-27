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
    this.isReady = false;
    this.pendingOperations = [];
    this.hasFatalError = false;
    this._boundResize = null;
    this._styleLoaded = false;
  }

  async init(containerId) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof window.maplibregl === 'undefined') {
          throw new Error('MapLibre no está cargado');
        }

        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error(`No existe el contenedor del mapa: ${containerId}`);
        }

        if (this.map) {
          try {
            this.destroy();
          } catch (e) {
            console.warn('No se pudo destruir mapa previo:', e);
          }
        }

        this.map = new window.maplibregl.Map({
          container: containerId,
          style: {
            version: 8,
            sources: {
              'osm': {
                type: 'raster',
                tiles: [
                  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors'
              }
            },
            layers: [{
              id: 'osm',
              type: 'raster',
              source: 'osm',
              minzoom: 0,
              maxzoom: 19
            }]
          },
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
          touchZoomRotate: true,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: false
        });

        this._boundResize = () => {
          try {
            this.map?.resize?.();
          } catch (e) {
            console.warn('No se pudo forzar resize del mapa:', e);
          }
        };

        // Resize inicial
        setTimeout(this._boundResize, 100);
        setTimeout(this._boundResize, 500);
        setTimeout(this._boundResize, 1000);

        window.addEventListener('resize', this._boundResize);
        window.addEventListener('orientationchange', this._boundResize);

        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', this._boundResize);
        }

        // Manejar errores de carga de tiles silenciosamente
        this.map.on('error', (e) => {
          // Silenciar errores de tiles que no afectan funcionalidad
          if (e?.error?.status === 404 || e?.error?.message?.includes('tile')) {
            return;
          }
          console.warn('Map warning:', e.error?.message || e);
        });

        this.map.on('load', () => {
          try {
            this.isReady = true;
            this.hasFatalError = false;
            this.map.resize();
            this._executePending();
            resolve(this.map);
          } catch (e) {
            reject(e);
          }
        });

        // Timeout de seguridad
        setTimeout(() => {
          if (!this.isReady) {
            console.warn('Mapa cargando lentamente...');
            // No rechazamos, permitimos modo degradado
            this.hasFatalError = false;
            resolve(null);
          }
        }, 10000);

      } catch (error) {
        this.hasFatalError = true;
        reject(error);
      }
    });
  }

  _executePending() {
    while (this.pendingOperations.length > 0) {
      const op = this.pendingOperations.shift();
      try {
        op();
      } catch (e) {
        console.warn('Error ejecutando operación pendiente:', e);
      }
    }
  }

  _whenReady(operation) {
    if (this.isReady && this.map && !this.hasFatalError) {
      try {
        operation();
      } catch (e) {
        console.warn('Operación de mapa falló:', e);
      }
    } else {
      this.pendingOperations.push(operation);
    }
  }

  _createMarkerElement(type, content) {
    const el = document.createElement('div');
    el.className = `marker-${type}`;
    el.innerHTML = content;
    
    const colors = {
      driver: '#276EF1',
      pickup: '#05944F',
      destination: '#E11900'
    };
    
    const sizes = {
      driver: '48px',
      pickup: '40px',
      destination: '40px'
    };
    
    el.style.cssText = `
      width: ${sizes[type]};
      height: ${sizes[type]};
      background: ${colors[type]};
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${type === 'driver' ? '24px' : '18px'};
      z-index: ${type === 'driver' ? '100' : '10'};
      transition: transform 0.2s ease;
    `;
    
    return el;
  }

  updateDriverPosition(lng, lat, heading = 0) {
    this._whenReady(() => {
      if (!this.map || typeof lng !== 'number' || typeof lat !== 'number') return;

      if (!this.markers.driver) {
        const el = this._createMarkerElement('driver', '🚐');
        this.markers.driver = new window.maplibregl.Marker({
          element: el,
          rotation: heading || 0
        })
          .setLngLat([lng, lat])
          .addTo(this.map);
      } else {
        this.markers.driver.setLngLat([lng, lat]);
        if (heading && typeof this.markers.driver.setRotation === 'function') {
          this.markers.driver.setRotation(heading);
        }
      }

      // Seguimiento suave solo si no está interactuando
      if (!this.map.isMoving() && !this.map.isZooming()) {
        this.map.easeTo({
          center: [lng, lat],
          duration: 1000,
          easing: (t) => t * (2 - t)
        });
      }
    });
  }

  showTripRoute(pickup, destination, fitBounds = true) {
    this._whenReady(() => {
      if (!this.map || !pickup || !destination) return;

      this.clearTripMarkers();

      // Validar coordenadas
      if (typeof pickup.lng !== 'number' || typeof pickup.lat !== 'number' ||
          typeof destination.lng !== 'number' || typeof destination.lat !== 'number') {
        console.warn('Coordenadas inválidas para ruta');
        return;
      }

      const pickupEl = this._createMarkerElement('pickup', '👤');
      this.markers.pickup = new window.maplibregl.Marker({ element: pickupEl })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(this.map);

      const destEl = this._createMarkerElement('destination', '🏁');
      this.markers.destination = new window.maplibregl.Marker({ element: destEl })
        .setLngLat([destination.lng, destination.lat])
        .addTo(this.map);

      this._drawRouteLine(pickup, destination);

      if (fitBounds) {
        try {
          const bounds = new window.maplibregl.LngLatBounds()
            .extend([pickup.lng, pickup.lat])
            .extend([destination.lng, destination.lat]);

          this.map.fitBounds(bounds, {
            padding: { top: 100, bottom: 300, left: 50, right: 50 },
            duration: 1000,
            maxZoom: 16
          });
        } catch (e) {
          console.warn('Error ajustando bounds:', e);
        }
      }
    });
  }

  _drawRouteLine(from, to) {
    if (!this.map || !this.isReady) return;

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

    try {
      const existingSource = this.map.getSource?.('route');
      if (existingSource) {
        existingSource.setData(geojson);
        return;
      }

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
          'line-opacity': 0.9
        }
      });
    } catch (e) {
      console.warn('No se pudo dibujar la ruta:', e);
    }
  }

  clearTripMarkers() {
    try {
      if (this.markers.pickup) {
        this.markers.pickup.remove();
        this.markers.pickup = null;
      }
      if (this.markers.destination) {
        this.markers.destination.remove();
        this.markers.destination = null;
      }
    } catch (e) {
      console.warn('Error limpiando marcadores:', e);
    }
  }

  clearAll() {
    try {
      this.clearTripMarkers();

      if (!this.map) return;

      if (this.map.getLayer?.('route-line')) {
        this.map.removeLayer('route-line');
      }
      if (this.map.getSource?.('route')) {
        this.map.removeSource('route');
      }
    } catch (e) {
      console.warn('Error limpiando mapa:', e);
    }
  }

  resize() {
    try {
      if (this.map) {
        this.map.resize();
      }
    } catch (e) {
      console.warn('Error redimensionando mapa:', e);
    }
  }

  destroy() {
    try {
      this.clearAll();

      if (this.markers.driver) {
        this.markers.driver.remove();
        this.markers.driver = null;
      }

      if (this._boundResize) {
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('orientationchange', this._boundResize);

        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', this._boundResize);
        }
      }

      if (this.map) {
        this.map.remove();
        this.map = null;
      }
    } catch (e) {
      console.warn('Error destruyendo mapa:', e);
    } finally {
      this.isReady = false;
      this.hasFatalError = false;
      this.pendingOperations = [];
      this._boundResize = null;
    }
  }

  static calculateDistance(lat1, lng1, lat2, lng2) {
    if (typeof lat1 !== 'number' || typeof lng1 !== 'number' || 
        typeof lat2 !== 'number' || typeof lng2 !== 'number') {
      return 0;
    }

    const R = 6371e3;
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

  static calculateETA(distanceMeters, speedKmh = 30) {
    if (typeof distanceMeters !== 'number' || distanceMeters < 0) return '--';
    
    const seconds = (distanceMeters / 1000) / speedKmh * 3600;
    const minutes = Math.ceil(seconds / 60);
    return minutes <= 1 ? '1 min' : `${minutes} mins`;
  }
}

const mapService = new MapService();
export default mapService;
