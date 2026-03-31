/**
 * MIMI Driver - Map Service (PRODUCTION FINAL)
 * MapLibre GL stable + safe coords + OSRM routing + navigation follow + remaining route (Uber style)
 * OPTIMIZADO PARA TODOS LOS SMARTPHONES
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
    
    // Cache para evitar recálculos
    this._routeCache = new Map();
    this._maxCacheSize = 10;
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
        center: center,
        zoom: zoom,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        minZoom: 10,
        maxZoom: 18,
        failIfMajorPerformanceCaveat: false,
        // Optimizaciones para móviles
        antialias: false, // Mejor rendimiento en móviles
        preserveDrawingBuffer: false,
        trackResize: true
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

      // Control de navegación solo en tablets/desktop
      if (window.innerWidth > 768) {
        this.map.addControl(
          new window.maplibregl.NavigationControl({
            showCompass: true,
            showZoom: false
          }),
          'bottom-right'
        );
      }

      this._addCustomLayers();

      // Eventos táctiles optimizados
      this._setupTouchEvents();

      // Botón recenter
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
  // EVENTOS TÁCTILES OPTIMIZADOS
  // =========================================================
  _setupTouchEvents() {
    if (!this.map) return;

    let touchStartY = 0;
    let touchStartTime = 0;

    // Desactivar follow al tocar/mover el mapa
    this.map.on('touchstart', (e) => {
      touchStartY = e.originalEvent.touches[0].clientY;
      touchStartTime = Date.now();
    });

    this.map.on('touchmove', () => {
      if (this.followDriver) {
        this.followDriver = false;
        console.log('[Map] Follow disabled (user touched map)');
      }
    });

    // Doble tap para recenter
    this.map.on('touchend', (e) => {
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      // Detectar doble tap rápido
      if (touchDuration < 200 && this._lastTap && (touchEndTime - this._lastTap) < 300) {
        this.recenterOnDriver();
      }
      this._lastTap = touchEndTime;
    });

    // Drag para desktop
    this.map.on('dragstart', () => {
      this.followDriver = false;
      console.log('[Map] Follow disabled (user dragged map)');
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
  // UI BUTTON - OPTIMIZADO PARA MÓVILES
  // =========================================================
  _createRecenterButton() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Remover si existe
    const old = document.getElementById("btn-recenter");
    if (old) old.remove();

    const btn = document.createElement("button");
    btn.id = "btn-recenter";
    btn.title = "Centrar";
    btn.setAttribute('aria-label', 'Centrar mapa');

    // Icono SVG inline para evitar dependencias externas
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" style="width:24px;height:24px;pointer-events:none;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2"/>
      </svg>
    `;

    // Estilos responsive
    const isMobile = window.innerWidth <= 768;
    btn.style.cssText = `
      position: absolute;
      bottom: ${isMobile ? '140px' : '180px'};
      right: 14px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: rgba(28,28,30,0.95);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 9999;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 20px;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      transition: transform 0.15s, background 0.15s;
    `;

    // Eventos táctiles optimizados
    const handlePress = (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(0.9)';
      btn.style.background = 'rgba(39,110,241,0.9)';
    };

    const handleRelease = (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = 'scale(1)';
      btn.style.background = 'rgba(28,28,30,0.95)';
      this.recenterOnDriver();
    };

    btn.addEventListener('touchstart', handlePress, { passive: false });
    btn.addEventListener('touchend', handleRelease, { passive: false });
    btn.addEventListener('mousedown', handlePress);
    btn.addEventListener('mouseup', handleRelease);
    btn.addEventListener('click', (e) => e.preventDefault());

    container.style.position = "relative";
    container.appendChild(btn);

    console.log("[Map] Recenter button created");
  }

  // =========================================================
  // CAMERA - OPTIMIZADA PARA MÓVILES
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
      duration: 800, // Más rápido en móviles
      essential: true // No se puede desactivar por preferencias de movimiento
    });
  }

  setNavigationMode(enabled = true) {
    this.navigationMode = enabled;

    if (!this.map || !this.isLoaded) return;

    const isMobile = window.innerWidth <= 768;

    if (enabled) {
      this.map.easeTo({
        pitch: isMobile ? 50 : 45, // Más pitch en móviles
        zoom: isMobile ? 17 : 16,
        duration: 600
      });
    } else {
      this.map.easeTo({
        pitch: 0,
        zoom: isMobile ? 15 : 14,
        bearing: 0,
        duration: 600
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

    const isMobile = window.innerWidth <= 768;

    this.map.easeTo({
      center: [pos.lng, pos.lat],
      zoom: this.navigationMode ? (isMobile ? 17.5 : 16.5) : (isMobile ? 16 : 15),
      pitch: this.navigationMode ? (isMobile ? 50 : 45) : 0,
      bearing: this.navigationMode && isMobile ? this._lastHeading || 0 : 0,
      duration: 500 // Más rápido para respuesta táctil
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

    // Optimización: sampleo cada N puntos en rutas largas
    const step = this.routeGeometry.length > 500 ? 5 : 1;

    for (let i = 0; i < this.routeGeometry.length; i += step) {
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
    const remaining = this.routeGeometry.slice(Math.max(0, idx - 1));

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
  // MARKERS - OPTIMIZADOS PARA MÓVILES
  // =========================================================
  updateDriverMarker(lng, lat, heading = 0) {
    if (!this.map || !this.isLoaded) return;
    if (!this._isValidLatLng(lat, lng)) return;

    const safeHeading = this._sanitizeNumber(heading, 0);
    this._lastHeading = safeHeading;

    if (!this.markers.driver) {
      const el = document.createElement('div');
      el.className = 'driver-marker';
      el.style.cssText = `
        width: 40px;
        height: 40px;
        position: relative;
        will-change: transform;
      `;
      
      // SVG más simple para mejor rendimiento
      el.innerHTML = `
        <div style="
          width: 100%;
          height: 100%;
          transform: rotate(${safeHeading}deg);
          transition: transform 0.3s ease-out;
        ">
          <svg viewBox="0 0 24 24" style="width:100%;height:100%;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#276EF1" stroke="white" stroke-width="1.5"/>
          </svg>
        </div>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 0 2px #276EF1;
        "></div>
      `;

      this.markers.driver = new window.maplibregl.Marker({
        element: el,
        anchor: 'center',
        pitchAlignment: 'map',
        rotationAlignment: 'map'
      })
        .setLngLat([lng, lat])
        .addTo(this.map);

      console.log('[Map] Driver marker added at:', lat, lng);

    } else {
      this.markers.driver.setLngLat([lng, lat]);

      const arrow = this.markers.driver.getElement()?.querySelector('div');
      if (arrow) {
        arrow.style.transform = `rotate(${safeHeading}deg)`;
      }
    }
  }

  updateDriverPosition(lng, lat, heading = 0) {
    this.updateDriverMarker(lng, lat, heading);

    if (!this.map || !this.isLoaded) return;

    const safeHeading = this._sanitizeNumber(heading, 0);
    const isMobile = window.innerWidth <= 768;

    if (this.followDriver) {
      if (this.navigationMode) {
        // En móviles, seguimiento más suave
        const duration = isMobile ? 600 : 700;
        
        this.map.easeTo({
          center: [lng, lat],
          bearing: isMobile ? safeHeading : 0,
          pitch: isMobile ? 50 : 45,
          zoom: isMobile ? 17.5 : 16.5,
          duration: duration,
          essential: true
        });
      } else {
        this.map.easeTo({
          center: [lng, lat],
          duration: 600
        });
      }
    }

    // Actualizar ruta restante
    this._updateRemainingRoute(lat, lng);

    // Reroute automático (throttled)
    this._throttledReroute(lat, lng);
  }

  // Throttle para evitar muchas llamadas
  _throttledReroute(lat, lng) {
    const now = Date.now();
    if (!this._lastRerouteCheck || (now - this._lastRerouteCheck) > 2000) {
      this._lastRerouteCheck = now;
      this._checkReroute(lat, lng);
    }
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
      font-size: 18px;
      border: 3px solid white;
      box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      will-change: transform;
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
  // ROUTING - COMPATIBLE CON TODOS LOS SMARTPHONES
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

    // Guardar destino y ruta
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

      // Ajustar vista
      if (routeData.geometry.length >= 2) {
        const bounds = routeData.geometry.reduce(
          (b, coord) => b.extend(coord),
          new window.maplibregl.LngLatBounds(routeData.geometry[0], routeData.geometry[0])
        );

        const isMobile = window.innerWidth <= 768;
        this.map.fitBounds(bounds, {
          padding: isMobile ? 80 : 120,
          duration: 800,
          maxZoom: 18
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

  // =========================================================
  // CLEAR ROUTE
  // =========================================================
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

      this.routeGeometry = [];
      this.currentDestination = null;
      this._routeCache.clear();

      ['pickup', 'dropoff'].forEach(key => {
        if (this.markers[key]) {
          this.markers[key].remove();
          delete this.markers[key];
        }
      });

      console.log('[Map] Route cleared');

    } catch (error) {
      console.warn('[Map] Error clearing route:', error);
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
      console.log('[Map] 🚨 Driver desviándose, recalculando ruta...', Math.round(distToRoute));

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

  _getStraightLineRoute(from, to) {
    return {
      geometry: [
        [from.lng, from.lat],
        [to.lng, to.lat]
      ],
      distance: this._haversine(from.lat, from.lng, to.lat, to.lng),
      duration: Math.round(this._haversine(from.lat, from.lng, to.lat, to.lng) / 8.33), // ~30km/h
      isFallback: true
    };
  }

  // =========================================================
  // OSRM ROUTING - SIN VALHALLA (COMPATIBLE CORS)
  // =========================================================
  async _getOSRMRoute(from, to) {
    // Cache key
    const cacheKey = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}-${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
    
    if (this._routeCache.has(cacheKey)) {
      console.log('[Map] Usando ruta en caché');
      return this._routeCache.get(cacheKey);
    }

    // AbortController para timeout en móviles lentos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error("OSRM error HTTP " + res.status);
      }

      const data = await res.json();

      if (!data.routes || !data.routes[0]) {
        throw new Error("OSRM no devolvió rutas");
      }

      const route = data.routes[0];

      const result = {
        geometry: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        isFallback: false
      };

      // Guardar en caché
      if (this._routeCache.size >= this._maxCacheSize) {
        const firstKey = this._routeCache.keys().next().value;
        this._routeCache.delete(firstKey);
      }
      this._routeCache.set(cacheKey, result);

      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
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
      this._routeCache.clear();

      console.log('[Map] Destroy complete');

    } catch (error) {
      console.warn('[Map] destroy error:', error);
    }
  }
}

const mapService = new MapService();
export default mapService;
