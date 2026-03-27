/**
 * Map Service - Con integración de routing real
 */

import CONFIG from './config.js';
import routingService from './routing-service.js';

class MapService {
  constructor() {
    this.map = null;
    this.markers = {};
    this.isReady = false;
    this.pendingOps = [];
  }

  async init(containerId) {
    return new Promise((resolve, reject) => {
      console.log('[MapService] Iniciando mapa...');
      
      if (!window.maplibregl) {
        reject(new Error('MapLibre no cargado'));
        return;
      }

      const container = document.getElementById(containerId);
      if (!container) {
        reject(new Error(`Contenedor ${containerId} no encontrado`));
        return;
      }

      this.map = new window.maplibregl.Map({
        container: containerId,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: [
                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
              ],
              tileSize: 256
            }
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
        },
        center: CONFIG.DEFAULT_CENTER,
        zoom: CONFIG.DEFAULT_ZOOM,
        attributionControl: false
      });

      this.map.on('load', () => {
        console.log('[MapService] Mapa cargado');
        this.isReady = true;
        this._executePending();
        resolve(this.map);
      });

      this.map.on('error', (e) => {
        console.warn('[MapService] Error:', e.error?.message);
      });

      setTimeout(() => {
        if (!this.isReady) {
          console.warn('[MapService] Timeout cargando mapa');
          resolve(null);
        }
      }, 10000);
    });
  }

  _executePending() {
    while (this.pendingOps.length) {
      const op = this.pendingOps.shift();
      try { op(); } catch (e) {}
    }
  }

  _whenReady(op) {
    if (this.isReady) {
      try { op(); } catch (e) {}
    } else {
      this.pendingOps.push(op);
    }
  }

  /**
   * Mostrar ruta REAL usando el servicio de routing
   */
  async showRealRoute(origin, destination) {
    console.log('[MapService] Solicitando ruta real...');
    
    const route = await routingService.getRoute(origin, destination);
    
    if (!route) {
      console.warn('[MapService] No se obtuvo ruta');
      return null;
    }

    this._whenReady(() => {
      // Limpiar ruta anterior
      this.clearRoute();

      // Dibujar nueva ruta
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: route.geometry
        }
      });

      // Borde blanco
      this.map.addLayer({
        id: 'route-border',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': CONFIG.COLORS.routeBorder,
          'line-width': 8,
          'line-opacity': 0.9
        }
      });

      // Línea negra interior
      this.map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': CONFIG.COLORS.routeLine,
          'line-width': 5,
          'line-opacity': 1
        }
      });

      // Marcadores
      this._addMarker('pickup', origin, '#05944F', '👤');
      this._addMarker('destination', destination, '#E11900', '🏁');

      // Ajustar vista
      this._fitBounds(route.geometry.coordinates);
    });

    return route;
  }

  _addMarker(id, coords, color, emoji) {
    if (this.markers[id]) {
      this.markers[id].setLngLat([coords.lng, coords.lat]);
      return;
    }

    const el = document.createElement('div');
    el.style.cssText = `
      width: 40px; height: 40px; background: ${color};
      border-radius: 50%; border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
    `;
    el.textContent = emoji;

    this.markers[id] = new window.maplibregl.Marker({ element: el })
      .setLngLat([coords.lng, coords.lat])
      .addTo(this.map);
  }

  _fitBounds(coordinates) {
    try {
      const bounds = new window.maplibregl.LngLatBounds();
      coordinates.forEach(coord => bounds.extend(coord));
      
      this.map.fitBounds(bounds, {
        padding: { top: 100, bottom: 300, left: 50, right: 50 },
        duration: 1000
      });
    } catch (e) {
      console.warn('[MapService] Error ajustando bounds:', e);
    }
  }

  updateDriverPosition(lng, lat, heading) {
    this._whenReady(() => {
      if (!this.markers.driver) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 48px; height: 48px; background: #276EF1;
          border-radius: 50%; border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
        `;
        el.textContent = '🚐';
        
        this.markers.driver = new window.maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(this.map);
      } else {
        this.markers.driver.setLngLat([lng, lat]);
      }
    });
  }

  clearRoute() {
    this._whenReady(() => {
      ['route-line', 'route-border'].forEach(layer => {
        if (this.map.getLayer(layer)) this.map.removeLayer(layer);
      });
      if (this.map.getSource('route')) this.map.removeSource('route');
    });
    
    ['pickup', 'destination'].forEach(id => {
      if (this.markers[id]) {
        this.markers[id].remove();
        delete this.markers[id];
      }
    });
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.isReady = false;
  }
}

export default new MapService();
