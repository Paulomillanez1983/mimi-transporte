/**
 * MIMI Driver - Map Service (PRODUCTION FINAL)
 * MapLibre GL stable + safe coords + OSRM routing + navigation follow + remaining route (Uber style)
 */

import CONFIG from './config.js';

class MapService {
  constructor() {
    this.map = null;
    this.markers = {};
    this.isInitialized = false;
    this.isLoaded = false;
    this.containerId = null;

    // Seguimiento tipo Uber
    this.followDriver = true;
    this.navigationMode = false;

    // Routing + reroute
    this.currentDestination = null;
    this.lastRouteUpdate = 0;
    this.routeUpdateCooldown = 15000; // 15s
    this.rerouteDistanceThreshold = 60; // metros

    // Ruta completa guardada (OSRM)
    this.routeGeometry = [];
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
        center,
        zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        minZoom: 10,
        maxZoom: 18,
        failIfMajorPerformanceCaveat: false
      });

      this.map.on('error', (e) => {
        console.error('[Map] Map error:', e);
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Map load timeout'));
        }, 30000);

        this.map.on('load', () => {
          clearTimeout(timeout);
          this.isLoaded = true;
          console.log('[Map] Loaded successfully');
          resolve();
        });
      });

      this.map.addControl(
        new window.maplibregl.NavigationControl({
          showCompass: true,
          showZoom: false
        }),
        'bottom-right'
      );

      this._addCustomLayers();

      // Si el usuario mueve el mapa, se desactiva el follow
      this.map.on('dragstart', () => {
        this.followDriver = false;
        console.log('[Map] Follow disabled (user dragged map)');
      });

      // Botón 🎯
      this._createRecenterButton();

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

  _haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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

      if (!this.map.getLayer('route-line-border')) {
        this.map.addLayer({
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

    } catch (e) {
      console.error('[Map] Error adding layers:', e);
    }
  }

// =========================================================
// UI BUTTON
// =========================================================
_createRecenterButton() {
  const container = document.getElementById(this.containerId);
  if (!container) return;

  // si ya existe, lo borramos para recrearlo actualizado
  const old = document.getElementById("btn-recenter");
  if (old) old.remove();

  const btn = document.createElement("button");
  btn.id = "btn-recenter";
  btn.title = "Centrar";

  btn.innerHTML = `
    <img 
      src="https://upload.wikimedia.org/wikipedia/commons/9/9d/Google_Maps_icon_%282020%29.svg"
      style="width:26px;height:26px;"
    />
  `;

  btn.style.cssText = `
    position: absolute;
    bottom: 180px;
    right: 14px;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    background: rgba(28,28,30,0.95);
    box-shadow: 0 6px 18px rgba(0,0,0,0.5);
    z-index: 9999;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  btn.addEventListener("click", () => {
    this.recenterOnDriver();
  });

  container.style.position = "relative";
  container.appendChild(btn);

  console.log("[Map] Recenter button created/updated");
}

  
  // =========================================================
  // CAMERA
  // =========================================================
  setCenter(lng, lat, zoom = null) {
    if (!this.map || !this.isLoaded) return;
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

  setNavigationMode(enabled = true) {
    this.navigationMode = enabled;

    if (!this.map || !this.isLoaded) return;

    if (enabled) {
      this.map.easeTo({
        pitch: 45,
        zoom: 16,
        duration: 800
      });
    } else {
      this.map.easeTo({
        pitch: 0,
        zoom: 14,
        bearing: 0,
        duration: 800
      });
    }

    console.log('[Map] Navigation mode:', enabled);
  }

  recenterOnDriver() {
    if (!this.map || !this.isLoaded) return;
    if (!this.markers.driver) return;

    const pos = this.markers.driver.getLngLat();
    if (!pos) return;

    this.followDriver = true;

    this.map.easeTo({
      center: [pos.lng, pos.lat],
      zoom: this.navigationMode ? 16.5 : 15,
      pitch: this.navigationMode ? 45 : 0,
      duration: 700
    });

    console.log('[Map] Recentered on driver');
  }

  // =========================================================
  // ROUTE TRIM (UBER STYLE)
  // =========================================================
  _getClosestRouteIndex(lat, lng) {
    if (!this.routeGeometry || this.routeGeometry.length < 2) return 0;

    let minDist = Infinity;
    let bestIndex = 0;

    for (let i = 0; i < this.routeGeometry.length; i++) {
      const coord = this.routeGeometry[i];
      const d = this._haversine(lat, lng, coord[1], coord[0]);

      if (d < minDist) {
        minDist = d;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  _updateRemainingRoute(lat, lng) {
    if (!this.map || !this.isLoaded) return;
    if (!this.routeGeometry || this.routeGeometry.length < 2) return;

    const idx = this._getClosestRouteIndex(lat, lng);
    const remaining = this.routeGeometry.slice(idx);

    if (remaining.length < 2) return;

    const source = this.map.getSource('route');
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: remaining
        }
      });
    }
  }

  // =========================================================
  // MARKERS
  // =========================================================
  updateDriverMarker(lng, lat, heading = 0) {
    if (!this.map || !this.isLoaded) return;
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

      console.log('[Map] Driver marker added at:', lat, lng);

    } else {
      this.markers.driver.setLngLat([lng, lat]);

      const arrow = this.markers.driver.getElement()?.querySelector('.marker-arrow');
      if (arrow) arrow.style.transform = `rotate(${safeHeading}deg)`;
    }
  }

  updateDriverPosition(lng, lat, heading = 0) {
    this.updateDriverMarker(lng, lat, heading);

    if (!this.map || !this.isLoaded) return;

    const safeHeading = this._sanitizeNumber(heading, 0);

    if (this.followDriver) {
      if (this.navigationMode) {
        this.map.easeTo({
          center: [lng, lat],
          bearing: safeHeading,
          pitch: 45,
          zoom: 16.5,
          duration: 700
        });
      } else {
        this.map.easeTo({
          center: [lng, lat],
          duration: 800
        });
      }
    }

    // actualizar ruta tipo Uber (solo lo que falta)
    this._updateRemainingRoute(lat, lng);

    // reroute automático
    this._checkReroute(lat, lng);
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
    if (!this.map || !this.isLoaded) return null;
    if (!from || !to) return null;
    if (!this._isValidLatLng(from.lat, from.lng)) return null;
    if (!this._isValidLatLng(to.lat, to.lng)) return null;

    this.setNavigationMode(true);
    this.clearRoute();

    this.addPickupMarker(from.lng, from.lat);
    this.addDropoffMarker(to.lng, to.lat);

    let routeData = null;

    try {
      routeData = await this._getOSRMRoute(from, to);

      if (!routeData?.geometry || routeData.geometry.length < 2) {
        throw new Error('Ruta inválida o vacía');
      }

      console.log('[Map] Ruta OSRM cargada (calles reales)');

    } catch (err) {
      console.warn('[Map] OSRM falló, usando línea recta:', err);
      routeData = this._getStraightLineRoute(from, to);
    }

    // guardar destino y ruta completa
    this.currentDestination = to;
    this.routeGeometry = routeData.geometry || [];

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

      // mostrar ruta completa inicialmente y luego se va recortando
      if (routeData.geometry.length >= 2) {
        const bounds = routeData.geometry.reduce(
          (b, coord) => b.extend(coord),
          new window.maplibregl.LngLatBounds(routeData.geometry[0], routeData.geometry[0])
        );

        this.map.fitBounds(bounds, {
          padding: 120,
          duration: 1000
        });
      }

      console.log('[Map] Route drawn', {
        distance: Math.round(routeData.distance),
        duration: Math.round(routeData.duration),
        fallback: routeData.isFallback
      });

      return routeData;

    } catch (e) {
      console.error('[Map] Error showing route:', e);
      return null;
    }
  }

  _distanceToRoute(lat, lng) {
    if (!this.routeGeometry || this.routeGeometry.length < 2) return 0;

    let minDist = Infinity;

    for (const coord of this.routeGeometry) {
      const d = this._haversine(lat, lng, coord[1], coord[0]);
      if (d < minDist) minDist = d;
    }

    return minDist;
  }

  async _checkReroute(lat, lng) {
    if (!this.navigationMode) return;
    if (!this.currentDestination) return;

    const now = Date.now();
    if (now - this.lastRouteUpdate < this.routeUpdateCooldown) return;

    const distToRoute = this._distanceToRoute(lat, lng);

    if (distToRoute > this.rerouteDistanceThreshold) {
      console.log('[Map] 🚨 Driver desviándose, recalculando ruta...', distToRoute);

      this.lastRouteUpdate = now;

      const from = { lat, lng };
      const to = this.currentDestination;

      try {
        const routeData = await this._getOSRMRoute(from, to);

        if (routeData?.geometry?.length > 2) {
          this.routeGeometry = routeData.geometry;

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

          console.log('[Map] ✅ Ruta actualizada en vivo');
        }

      } catch (err) {
        console.warn('[Map] ❌ Falló reroute OSRM:', err);
      }
    }
  }

async _getOSRMRoute(from, to) {

  // ===========================
  // VALHALLA (RECOMENDADO)
  // ===========================
  if (CONFIG.ROUTING_PROVIDER === "valhalla") {
    const body = {
      locations: [
        { lat: from.lat, lon: from.lng },
        { lat: to.lat, lon: to.lng }
      ],
      costing: "auto",
      directions_options: {
        units: "kilometers"
      }
    };

    const res = await fetch(CONFIG.VALHALLA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error("Valhalla error HTTP " + res.status);
    }

    const data = await res.json();

    if (!data.trip || !data.trip.legs || !data.trip.legs[0]) {
      throw new Error("Valhalla no devolvió ruta");
    }

    const leg = data.trip.legs[0];

    // decode polyline -> devuelve [lat,lng]
    const decoded = this._decodePolyline(leg.shape);

    return {
      geometry: decoded.map(p => [p[1], p[0]]), // a formato MapLibre: [lng, lat]
      distance: (data.trip.summary.length || 0) * 1000,
      duration: data.trip.summary.time || 0,
      isFallback: false
    };
  }

  // ===========================
  // OSRM (FALLBACK)
  // ===========================
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("OSRM error HTTP " + res.status);
  }

  const data = await res.json();

  if (!data.routes || !data.routes[0]) {
    throw new Error("OSRM no devolvió rutas");
  }

  const route = data.routes[0];

  return {
    geometry: route.geometry.coordinates,
    distance: route.distance,
    duration: route.duration,
    isFallback: false
  };
}
_decodePolyline(str, precision = 6) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let b, shift = 0, result = 0;

    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

  // =========================================================
  // DESTROY
  // =========================================================
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

      console.log('[Map] Destroy complete');

    } catch (error) {
      console.warn('[Map] destroy error:', error);
    }
  }
}

const mapService = new MapService();
export default mapService;
