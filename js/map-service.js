/**
 * MIMI Driver - Map Service (PRODUCTION FINAL)
 * MapLibre GL stable + safe coords
 */

import CONFIG from './config.js';

class MapService {
  constructor() {
    this.map = null;
    this.markers = {};
    this.isInitialized = false;
    this.isLoaded = false;
    this.containerId = null;
  }

  // =========================================================
  // INIT
  // =========================================================

  async init(containerId) {
    if (this.isInitialized) {
      console.log('[Map] Already initialized');
      return true;
    }

    this.containerId = containerId;
    const container = document.getElementById(containerId);
    
    if (!container) {
      console.error('[Map] Container not found:', containerId);
      return false;
    }

    console.log('[Map] Initializing...');

    // Esperar a que MapLibre esté disponible
    const mapLibreReady = await this._waitForMapLibre();
    if (!mapLibreReady) {
      console.error('[Map] MapLibre GL not loaded');
      return false;
    }

    const fallbackCenter = [-64.1888, -31.4201]; // Córdoba
    const center = this._sanitizeLngLat(
      CONFIG.DEFAULT_CENTER?.[0],
      CONFIG.DEFAULT_CENTER?.[1],
      fallbackCenter
    );

    const zoom = this._sanitizeNumber(CONFIG.DEFAULT_ZOOM, 14);

    try {
      this.map = new window.maplibregl.Map({
        container: containerId,
        style: CONFIG.MAP_STYLE,
        center: center,
        zoom: zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        minZoom: 10,
        maxZoom: 18,
        failIfMajorPerformanceCaveat: false // Permitir fallback si WebGL lento
      });

      // Manejar errores de carga del estilo
      this.map.on('error', (e) => {
        console.error('[Map] Map error:', e);
      });

      // Esperar a que cargue
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Map load timeout'));
        }, 30000); // 30 segundos timeout

        this.map.on('load', () => {
          clearTimeout(timeout);
          this.isLoaded = true;
          console.log('[Map] Loaded successfully');
          resolve();
        });

        this.map.on('style.load', () => {
          console.log('[Map] Style loaded');
        });
      });

      // Agregar controles
      this.map.addControl(
        new window.maplibregl.NavigationControl({
          showCompass: true,
          showZoom: false
        }),
        'bottom-right'
      );

      this._addCustomLayers();
      this.isInitialized = true;

      return true;

    } catch (error) {
      console.error('[Map] Initialization failed:', error);
      return false;
    }
  }

  async _waitForMapLibre(timeoutMs = 10000) {
    if (window.maplibregl) return true;

    console.log('[Map] Waiting for MapLibre...');
    const start = Date.now();

    while (!window.maplibregl) {
      await new Promise((r) => setTimeout(r, 100));
      if (Date.now() - start > timeoutMs) {
        console.error('[Map] Timeout waiting for MapLibre');
        return false;
      }
    }

    return true;
  }

  // =========================================================
  // HELPERS
  // =========================================================

  _sanitizeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _sanitizeLngLat(lng, lat, fallback = [0, 0]) {
    const safeLng = this._sanitizeNumber(lng, fallback[0]);
    const safeLat = this._sanitizeNumber(lat, fallback[1]);

    if (!Number.isFinite(safeLng) || !Number.isFinite(safeLat)) {
      return fallback;
    }

    return [safeLng, safeLat];
  }

  _isValidLatLng(lat, lng) {
    if (lat == null || lng == null) return false;

    const la = Number(lat);
    const ln = Number(lng);

    if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
    if (la < -90 || la > 90) return false;
    if (ln < -180 || ln > 180) return false;

    return true;
  }

  // =========================================================
  // LAYERS
  // =========================================================

  _addCustomLayers() {
    if (!this.map || !this.isLoaded) return;

    try {
      if (!this.map.getSource('route')) {
        this.map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          }
        });
      }

      if (!this.map.getLayer('route-line')) {
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
            'line-width': 6,
            'line-opacity': 0.9
          }
        });
      }

      if (!this.map.getLayer('route-line-border')) {
        this.map.addLayer(
          {
            id: 'route-line-border',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 10,
              'line-opacity': 0.3
            }
          },
          'route-line'
        );
      }
    } catch (e) {
      console.error('[Map] Error adding layers:', e);
    }
  }

  // =========================================================
  // CAMERA
  // =========================================================

  setCenter(lng, lat, zoom = null) {
    if (!this.map || !this.isLoaded) {
      console.warn('[Map] Not ready for setCenter');
      return;
    }

    if (!this._isValidLatLng(lat, lng)) {
      console.warn('[Map] Invalid coordinates:', lat, lng);
      return;
    }

    const safeZoom = zoom !== null
      ? this._sanitizeNumber(zoom, this.map.getZoom())
      : this.map.getZoom();

    this.map.easeTo({
      center: [lng, lat],
      zoom: safeZoom,
      duration: 1000
    });
  }

  // =========================================================
  // MARKERS
  // =========================================================

  updateDriverMarker(lng, lat, heading = 0) {
    if (!this.map || !this.isLoaded) {
      console.warn('[Map] Not ready for driver marker');
      return;
    }

    if (!this._isValidLatLng(lat, lng)) {
      console.warn('[Map] Invalid driver coordinates:', lat, lng);
      return;
    }

    const safeHeading = this._sanitizeNumber(heading, 0);

    if (!this.markers.driver) {
      const el = document.createElement('div');
      el.className = 'driver-marker';
      el.innerHTML = `
        <div class="marker-arrow" style="transform: rotate(${safeHeading}deg)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#276EF1"/>
          </svg>
        </div>
        <div class="marker-pulse"></div>
      `;

      this.markers.driver = new window.maplibregl.Marker({
        element: el,
        anchor: 'center'
      })
        .setLngLat([lng, lat])
        .addTo(this.map);

      console.log('[Map] Driver marker added at:', lat, lng);

    } else {
      this.markers.driver.setLngLat([lng, lat]);

      const arrow = this.markers.driver.getElement()?.querySelector('.marker-arrow');
      if (arrow) arrow.style.transform = `rotate(${safeHeading}deg)`;
    }

    // Centrar mapa en el conductor (opcional, puede ser molesto si el usuario está viendo otra zona)
    // this.setCenter(lng, lat);
  }

  addPickupMarker(lng, lat) {
    this._addPOIMarker('pickup', lng, lat, '📍', '#276EF1');
  }

  addDropoffMarker(lng, lat) {
    this._addPOIMarker('dropoff', lng, lat, '🏁', '#05944F');
  }

  _addPOIMarker(key, lng, lat, emoji, color) {
    if (!this.map || !this.isLoaded) return;
    if (!this._isValidLatLng(lat, lng)) return;

    if (this.markers[key]) {
      this.markers[key].remove();
      delete this.markers[key];
    }

    const el = document.createElement('div');
    el.className = 'poi-marker';
    el.style.cssText = `
      background: ${color};
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    el.textContent = emoji;

    this.markers[key] = new window.maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }

  // =========================================================
  // ROUTING
  // =========================================================

  async showRoute(from, to) {
    if (!this.map || !this.isLoaded) {
      console.warn('[Map] Not ready for route');
      return null;
    }

    if (!from || !to) {
      console.warn('[Map] Missing from/to for route');
      return null;
    }

    if (!this._isValidLatLng(from.lat, from.lng)) {
      console.warn('[Map] Invalid from coordinates');
      return null;
    }

    if (!this._isValidLatLng(to.lat, to.lng)) {
      console.warn('[Map] Invalid to coordinates');
      return null;
    }

    // Usar línea recta como fallback (puedes integrar Valhalla después)
    const routeData = this._getStraightLineRoute(from, to);

    try {
      const source = this.map.getSource('route');
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeData.geometry
          }
        });
      }

      // Ajustar vista a la ruta
      if (routeData.geometry.length >= 2) {
        const bounds = routeData.geometry.reduce(
          (b, coord) => b.extend(coord),
          new window.maplibregl.LngLatBounds(routeData.geometry[0], routeData.geometry[0])
        );

        this.map.fitBounds(bounds, {
          padding: 100,
          duration: 1000
        });
      }

      return routeData;
    } catch (e) {
      console.error('[Map] Error showing route:', e);
      return null;
    }
  }

  _getStraightLineRoute(from, to) {
    const coordinates = [
      [from.lng, from.lat],
      [to.lng, to.lat]
    ];

    const R = 6371e3;
    const φ1 = from.lat * Math.PI / 180;
    const φ2 = to.lat * Math.PI / 180;
    const Δφ = (to.lat - from.lat) * Math.PI / 180;
    const Δλ = (to.lng - from.lng) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return {
      geometry: coordinates,
      distance: distance,
      duration: distance / 8.33,
      isFallback: true
    };
  }

  clearRoute() {
    if (!this.map || !this.isLoaded) return;

    try {
      const source = this.map.getSource('route');
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        });
      }

      ['pickup', 'dropoff'].forEach(key => {
        if (this.markers[key]) {
          this.markers[key].remove();
          delete this.markers[key];
        }
      });
    } catch (e) {
      console.error('[Map] Error clearing route:', e);
    }
  }

  destroy() {
    try {
      this.clearRoute();

      Object.values(this.markers).forEach(marker => {
        try { marker.remove(); } catch (e) {}
      });

      this.markers = {};

      if (this.map) {
        this.map.remove();
        this.map = null;
      }

      this.isInitialized = false;
      this.isLoaded = false;

    } catch (error) {
      console.warn('[Map] destroy error:', error);
    }
  }
}

const mapService = new MapService();
export default mapService;
