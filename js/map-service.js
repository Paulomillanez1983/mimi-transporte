/**
 * MIMI Driver - Map Service (PRODUCTION FINAL)
 * MapLibre GL stable + safe coords
 */

class MapService {
  constructor() {
    this.map = null;
    this.markers = {};
    this.isInitialized = false;
    this.isLoaded = false;
  }

  // =========================================================
  // INIT
  // =========================================================

  async init(containerId) {
    if (this.isInitialized) return true;

    const container = document.getElementById(containerId);
    if (!container) throw new Error('Map container not found');

    await this._waitForMapLibre();

    const fallbackCenter = [-64.1888, -31.4201]; // Córdoba
    const center = this._sanitizeLngLat(
      CONFIG.DEFAULT_CENTER?.[0],
      CONFIG.DEFAULT_CENTER?.[1],
      fallbackCenter
    );

    const zoom = this._sanitizeNumber(CONFIG.DEFAULT_ZOOM, 14);

    const style = CONFIG.MAP_STYLE || "https://demotiles.maplibre.org/style.json";

    this.map = new window.maplibregl.Map({
      container: containerId,
      style: style,
      center: center,
      zoom: zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      minZoom: 10,
      maxZoom: 18
    });

    this.map.addControl(
      new window.maplibregl.NavigationControl({
        showCompass: true,
        showZoom: false
      }),
      'bottom-right'
    );

    await new Promise(resolve => {
      this.map.on('load', () => {
        this.isLoaded = true;
        resolve();
      });
    });

    this._addCustomLayers();

    this.isInitialized = true;
    console.log('[Map] Initialized');
    return true;
  }

  async _waitForMapLibre() {
    if (window.maplibregl) return true;

    return new Promise(resolve => {
      const check = setInterval(() => {
        if (window.maplibregl) {
          clearInterval(check);
          resolve(true);
        }
      }, 100);
    });
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
          'line-color': '#000000',
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
            'line-opacity': 0.3,
            'line-gap-width': 6
          }
        },
        'route-line'
      );
    }
  }

  // =========================================================
  // CAMERA
  // =========================================================

  setCenter(lng, lat, zoom = null) {
    if (!this.map) return;

    if (!this._isValidLatLng(lat, lng)) return;

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
    if (!this.map) return;
    if (!this._isValidLatLng(lat, lng)) return;

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

    } else {
      this.markers.driver.setLngLat([lng, lat]);

      const arrow = this.markers.driver.getElement()?.querySelector('.marker-arrow');
      if (arrow) arrow.style.transform = `rotate(${safeHeading}deg)`;
    }
  }

  addPickupMarker(lng, lat) {
    this._addPOIMarker('pickup', lng, lat, '📍', '#276EF1');
  }

  addDropoffMarker(lng, lat) {
    this._addPOIMarker('dropoff', lng, lat, '🏁', '#05944F');
  }

  _addPOIMarker(key, lng, lat, emoji, color) {
    if (!this.map) return;
    if (!this._isValidLatLng(lat, lng)) return;

    if (this.markers[key]) {
      this.markers[key].remove();
      delete this.markers[key];
    }

    const el = document.createElement('div');
    el.className = 'poi-marker';
    el.style.backgroundColor = color;
    el.textContent = emoji;

    this.markers[key] = new window.maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat([lng, lat])
      .addTo(this.map);
  }

  // =========================================================
  // ROUTING (FALLBACK ONLY)
  // =========================================================

  async showRoute(from, to) {
    if (!this.map || !this.isLoaded) return null;
    if (!from || !to) return null;

    if (!this._isValidLatLng(from.lat, from.lng)) return null;
    if (!this._isValidLatLng(to.lat, to.lng)) return null;

    const routeData = this._getStraightLineRoute(from, to);

    const source = this.map.getSource('route');
    if (!source) {
      this._addCustomLayers();
    }

    const finalSource = this.map.getSource('route');
    if (finalSource) {
      finalSource.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: routeData.geometry
        }
      });
    }

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
