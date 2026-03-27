/**
 * Servicio de mapas con MapLibre + OSRM Routing
 * Rutas reales por calles, no líneas rectas
 */

import CONFIG from './config.js';
import routingService from './routing-service.js';

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
    this._boundResize = null;
    this._navigationMode = false;
  }

  async init(containerId) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof window.maplibregl === 'undefined') {
          throw new Error('MapLibre no está cargado');
        }

        const container = document.getElementById(containerId);
        if (!container) {
          throw new Error(`Contenedor no encontrado: ${containerId}`);
        }

        if (this.map) {
          this.destroy();
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

        this._setupEventListeners();
        
        this.map.on('load', () => {
          this.isReady = true;
          this.map.resize();
          this._executePending();
          resolve(this.map);
        });

        // Timeout de seguridad
        setTimeout(() => {
          if (!this.isReady) {
            console.warn('Mapa cargando lentamente...');
            resolve(null);
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  _setupEventListeners() {
    this._boundResize = () => {
      try { this.map?.resize(); } catch (e) {}
    };

    window.addEventListener('resize', this._boundResize);
    window.addEventListener('orientationchange', this._boundResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._boundResize);
    }

    // Silenciar errores de tiles
    this.map.on('error', (e) => {
      if (e?.error?.status === 404 || e?.error?.message?.includes('tile')) {
        return;
      }
      console.warn('Map warning:', e.error?.message || e);
    });
  }

  _executePending() {
    while (this.pendingOperations.length > 0) {
      const op = this.pendingOperations.shift();
      try { op(); } catch (e) {}
    }
  }

  _whenReady(operation) {
    if (this.isReady && this.map) {
      try { operation(); } catch (e) {}
    } else {
      this.pendingOperations.push(operation);
    }
  }

  /**
   * Mostrar ruta REAL por calles usando OSRM
   */
  async showRealRoute(pickup, destination, fitBounds = true) {
    if (!this.isReady || !pickup || !destination) return;

    // Limpiar ruta anterior
    this.clearRoute();

    try {
      // Obtener ruta real de OSRM
      const route = await routingService.getRoute(
        [pickup.lng, pickup.lat],
        [destination.lng, destination.lat]
      );

      if (!route || !route.geometry) {
        console.warn('No se pudo obtener ruta, usando línea recta como fallback');
        this._drawStraightLine(pickup, destination);
        return;
      }

      // Dibujar la ruta real en el mapa
      this._drawRouteLine(route.geometry);

      // Actualizar marcadores
      this._updateMarkers(pickup, destination);

      // Ajustar vista
      if (fitBounds) {
        this._fitRouteBounds(route.geometry);
      }

      return route;

    } catch (error) {
      console.error('Error mostrando ruta:', error);
      this._drawStraightLine(pickup, destination);
    }
  }

  /**
   * Dibujar línea de ruta real
   */
  _drawRouteLine(geometry) {
    this._whenReady(() => {
      // Remover capa anterior si existe
      if (this.map.getLayer('route-line')) {
        this.map.removeLayer('route-line');
      }
      if (this.map.getSource('route')) {
        this.map.removeSource('route');
      }

      // Agregar fuente con la geometría real
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: geometry
        },
        lineMetrics: true
      });

      // Línea de ruta estilo Uber (negra con borde blanco)
      this.map.addLayer({
        id: 'route-line-border',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': CONFIG.COLORS.routeLineBorder,
          'line-width': CONFIG.COLORS.routeLineWidth + 4,
          'line-opacity': 0.9
        }
      }, 'osm');

      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': CONFIG.COLORS.routeLine,
          'line-width': CONFIG.COLORS.routeLineWidth,
          'line-opacity': 1
        }
      }, 'route-line-border');

      // Animar la línea (efecto de progreso)
      this._animateRouteLine();
    });
  }

  /**
   * Animar línea de ruta
   */
  _animateRouteLine() {
    let offset = 0;
    const animate = () => {
      if (!this.map.getLayer('route-line')) return;
      
      offset = (offset + 1) % 100;
      this.map.setPaintProperty('route-line', 'line-dasharray', [
        0.5, 
        0.5
      ]);
      
      requestAnimationFrame(animate);
    };
    // animate(); // Descomentar para animación continua
  }

  /**
   * Fallback: línea recta si OSRM falla
   */
  _drawStraightLine(from, to) {
    this._whenReady(() => {
      const coordinates = [
        [from.lng, from.lat],
        [to.lng, to.lat]
      ];

      const geojson = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates
        }
      };

      if (this.map.getSource('route')) {
        this.map.getSource('route').setData(geojson);
      } else {
        this.map.addSource('route', {
          type: 'geojson',
          data: geojson
        });

        this.map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#276EF1',
            'line-width': 4,
            'line-dasharray': [2, 2]
          }
        });
      }
    });
  }

  /**
   * Ajustar bounds a la ruta
   */
  _fitRouteBounds(geometry) {
    try {
      const coords = geometry.coordinates;
      if (!coords || coords.length === 0) return;

      const bounds = new window.maplibregl.LngLatBounds();
      coords.forEach(coord => bounds.extend(coord));

      this.map.fitBounds(bounds, {
        padding: { 
          top: 120, 
          bottom: 350, // Espacio para panel inferior
          left: 50, 
          right: 50 
        },
        duration: 1000,
        maxZoom: 16
      });
    } catch (e) {
      console.warn('Error ajustando bounds:', e);
    }
  }

  _updateMarkers(pickup, destination) {
    // Pickup marker
    if (this.markers.pickup) {
      this.markers.pickup.setLngLat([pickup.lng, pickup.lat]);
    } else {
      const el = this._createMarkerElement('pickup', '👤');
      this.markers.pickup = new window.maplibregl.Marker({ element: el })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(this.map);
    }

    // Destination marker
    if (this.markers.destination) {
      this.markers.destination.setLngLat([destination.lng, destination.lat]);
    } else {
      const el = this._createMarkerElement('destination', '🏁');
      this.markers.destination = new window.maplibregl.Marker({ element: el })
        .setLngLat([destination.lng, destination.lat])
        .addTo(this.map);
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
    
    el.style.cssText = `
      width: ${type === 'driver' ? '48px' : '40px'};
      height: ${type === 'driver' ? '48px' : '40px'};
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

      // Seguimiento suave en modo navegación
      if (this._navigationMode && !this.map.isMoving()) {
        this.map.easeTo({
          center: [lng, lat],
          bearing: heading || 0,
          pitch: 60,
          duration: 1000
        });
      }
    });
  }

  setNavigationMode(enabled) {
    this._navigationMode = enabled;
    if (enabled && this.isReady) {
      this.map.setPitch(60);
    } else if (this.isReady) {
      this.map.setPitch(0);
    }
  }

  clearRoute() {
    this._whenReady(() => {
      if (this.map.getLayer('route-line')) {
        this.map.removeLayer('route-line');
      }
      if (this.map.getLayer('route-line-border')) {
        this.map.removeLayer('route-line-border');
      }
      if (this.map.getSource('route')) {
        this.map.removeSource('route');
      }
    });
    routingService.clear();
  }

  clearTripMarkers() {
    ['pickup', 'destination'].forEach(type => {
      if (this.markers[type]) {
        this.markers[type].remove();
        this.markers[type] = null;
      }
    });
  }

  clearAll() {
    this.clearRoute();
    this.clearTripMarkers();
  }

  resize() {
    try { this.map?.resize(); } catch (e) {}
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
    } catch (e) {}
    this.isReady = false;
  }
}

const mapService = new MapService();
export default mapService;
