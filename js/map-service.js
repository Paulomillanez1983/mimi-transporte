/**
 * Servicio de mapas con MapLibre - Optimizado para producción
 * Versión estable: NO debe bloquear viajes si el mapa falla
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
    this.hasFatalError = false;
    this._boundResize = null;
    this._loadTimeout = null;
    this._loadResolved = false;
  }

  async init(containerId) {
    return new Promise((resolve, reject) => {
      try {
        // Evitar doble init
        if (this.map) {
          try {
            this.destroy();
          } catch (e) {
            console.warn('No se pudo limpiar mapa previo:', e);
          }
        }

        this.isReady = false;
        this.hasFatalError = false;
        this._loadResolved = false;

        // Validar librería
        if (typeof window.maplibregl === 'undefined') {
          throw new Error('MapLibre no está cargado');
        }

        // Validar contenedor
        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error(`No existe el contenedor del mapa: ${containerId}`);
        }

        this.map = new window.maplibregl.Map({
          container: containerId,
          style: CONFIG.MAP_STYLE,
          center: CONFIG.DEFAULT_CENTER,
          zoom: CONFIG.DEFAULT_ZOOM,
          attributionControl: false,
          pitchWithRotate: false,
          dragRotate: false,
          touchZoomRotate: true
        });

        // Resize seguro (clave en mobile)
        this._boundResize = () => {
          try {
            this.map?.resize?.();
          } catch (e) {
            console.warn('No se pudo forzar resize del mapa:', e);
          }
        };

        // Reintentos de resize para Android / viewport dinámico
        setTimeout(this._boundResize, 300);
        setTimeout(this._boundResize, 900);
        setTimeout(this._boundResize, 1800);

        window.addEventListener('resize', this._boundResize);
        window.addEventListener('orientationchange', this._boundResize);

        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', this._boundResize);
        }

        // Error NO fatal: tiles, glyphs, sprites, etc.
        this.map.on('error', (e) => {
          console.warn('Map warning (no fatal):', e);

          if (!this.isReady && !this.map?.isStyleLoaded?.()) {
            console.warn('El estilo del mapa aún no cargó correctamente.');
          }
        });

        // Cuando carga OK
        this.map.on('load', () => {
          try {
            if (this._loadResolved) return;
            this._loadResolved = true;

            this.isReady = true;
            this.hasFatalError = false;

            if (this._loadTimeout) {
              clearTimeout(this._loadTimeout);
              this._loadTimeout = null;
            }

            this.map.resize();
            this._executePending();
            resolve(this.map);
          } catch (e) {
            reject(e);
          }
        });

        /**
         * MUY IMPORTANTE:
         * Si el mapa no carga, NO queremos romper la app de viajes.
         * Entonces marcamos fallo, pero resolvemos igualmente para no trabar init().
         */
        this._loadTimeout = setTimeout(() => {
          if (this._loadResolved) return;

          console.warn('Mapa no terminó de cargar a tiempo. Continuando en modo degradado.');
          this.hasFatalError = true;
          this.isReady = false;
          this._loadResolved = true;

          // Resolvemos igual para no bloquear viajes
          resolve(null);
        }, 8000);

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
        console.warn('Error ejecutando operación pendiente del mapa:', e);
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
      if (!this.map) return;

      if (!this.markers.driver) {
        const el = this._createMarkerElement('driver', '🚐');
        this.markers.driver = new window.maplibregl.Marker({
          element: el,
          rotation: heading
        })
          .setLngLat([lng, lat])
          .addTo(this.map);
      } else {
        this.markers.driver.setLngLat([lng, lat]);

        if (typeof this.markers.driver.setRotation === 'function') {
          this.markers.driver.setRotation(heading);
        }
      }

      // Solo recentrar si el usuario no está interactuando
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
      if (!this.map) return;

      this.clearTripMarkers();

      // Marcador de pickup
      const pickupEl = this._createMarkerElement('pickup', '👤');
      this.markers.pickup = new window.maplibregl.Marker({ element: pickupEl })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(this.map);

      // Marcador de destino
      const destEl = this._createMarkerElement('destination', '🏁');
      this.markers.destination = new window.maplibregl.Marker({ element: destEl })
        .setLngLat([destination.lng, destination.lat])
        .addTo(this.map);

      this._drawRouteLine(pickup, destination);

      if (fitBounds) {
        const bounds = new window.maplibregl.LngLatBounds()
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
      console.warn('No se pudieron limpiar marcadores de viaje:', e);
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
      console.warn('No se pudo limpiar el mapa:', e);
    }
  }

  resize() {
    try {
      if (this.map) {
        this.map.resize();
      }
    } catch (e) {
      console.warn('No se pudo redimensionar el mapa:', e);
    }
  }

  destroy() {
    try {
      this.clearAll();

      if (this.markers.driver) {
        this.markers.driver.remove();
        this.markers.driver = null;
      }

      if (this.map) {
        this.map.remove();
        this.map = null;
      }

      if (this._boundResize) {
        window.removeEventListener('resize', this._boundResize);
        window.removeEventListener('orientationchange', this._boundResize);

        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', this._boundResize);
        }
      }

      if (this._loadTimeout) {
        clearTimeout(this._loadTimeout);
        this._loadTimeout = null;
      }

    } catch (e) {
      console.warn('Error destruyendo mapa:', e);
    } finally {
      this.isReady = false;
      this.hasFatalError = false;
      this.pendingOperations = [];
      this._boundResize = null;
      this._loadResolved = false;
    }
  }

  // Calcular distancia entre dos puntos (Haversine)
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
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
