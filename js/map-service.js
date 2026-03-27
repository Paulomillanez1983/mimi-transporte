/**
 * MIMI Driver - Map Service
 * MapLibre GL with custom styling and routing
 */

class MapService {
  constructor() {
    this.map = null;
    this.markers = {};
    this.routeLayer = null;
    this.isInitialized = false;
  }

  async init(containerId) {
    if (this.isInitialized) return;

    const container = document.getElementById(containerId);
    if (!container) throw new Error('Map container not found');

    // Wait for MapLibre
    if (!window.maplibregl) {
      await new Promise(resolve => {
        const check = setInterval(() => {
          if (window.maplibregl) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    this.map = new window.maplibregl.Map({
      container: containerId,
      style: CONFIG.MAP_STYLE,
      center: CONFIG.DEFAULT_CENTER,
      zoom: CONFIG.DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      minZoom: 10,
      maxZoom: 18
    });

    // Add navigation control
    this.map.addControl(
      new window.maplibregl.NavigationControl({
        showCompass: true,
        showZoom: false
      }),
      'bottom-right'
    );

    // Wait for load
    await new Promise(resolve => {
      this.map.on('load', resolve);
    });

    // Add custom layers
    this._addCustomLayers();

    this.isInitialized = true;
    console.log('[Map] Initialized');
  }

  _addCustomLayers() {
    // Route layer
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
        'line-opacity': 0.3,
        'line-gap-width': 6
      }
    }, 'route-line');
  }

  setCenter(lng, lat, zoom = null) {
    if (!this.map) return;
    
    this.map.easeTo({
      center: [lng, lat],
      zoom: zoom || this.map.getZoom(),
      duration: 1000
    });
  }

  updateDriverMarker(lng, lat, heading = 0) {
    if (!this.map) return;

    if (!this.markers.driver) {
      // Create custom element
      const el = document.createElement('div');
      el.className = 'driver-marker';
      el.innerHTML = `
        <div class="marker-arrow" style="transform: rotate(${heading}deg)">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="#276EF1"/>
          </svg>
        </div>
        <div class="marker-pulse"></div>
      `;
      
      this.markers.driver = new window.maplibregl.Marker({
        element: el,
        anchor: 'center'
      }).setLngLat([lng, lat]).addTo(this.map);
    } else {
      this.markers.driver.setLngLat([lng, lat]);
      const arrow = this.markers.driver.getElement().querySelector('.marker-arrow');
      if (arrow) arrow.style.transform = `rotate(${heading}deg)`;
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

    // Remove existing
    if (this.markers[key]) {
      this.markers[key].remove();
    }

    const el = document.createElement('div');
    el.className = 'poi-marker';
    el.style.backgroundColor = color;
    el.textContent = emoji;

    this.markers[key] = new window.maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    }).setLngLat([lng, lat]).addTo(this.map);
  }

  async showRoute(from, to) {
    if (!this.map) return null;

    try {
      // Fetch route from Valhalla
      const response = await fetch(CONFIG.VALHALLA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locations: [
            { lon: from.lng, lat: from.lat },
            { lon: to.lng, lat: to.lat }
          ],
          costing: 'auto',
          directions_options: { units: 'kilometers' }
        })
      });

      if (!response.ok) throw new Error('Route fetch failed');

      const data = await response.json();
      const leg = data.trip.legs[0];

      // Update route line
      this.map.getSource('route').setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: leg.shape
        }
      });

      // Fit bounds
      const coordinates = leg.shape;
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new window.maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

      this.map.fitBounds(bounds, {
        padding: 100,
        duration: 1000
      });

      return {
        distance: leg.summary.length * 1000, // meters
        duration: leg.summary.time, // seconds
        geometry: leg.shape
      };

    } catch (error) {
      console.error('[Map] Route error:', error);
      
      // Fallback to straight line
      this._showStraightLine(from, to);
      return null;
    }
  }

  _showStraightLine(from, to) {
    const coordinates = [[from.lng, from.lat], [to.lng, to.lat]];
    
    this.map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates
      }
    });

    // Calculate distance
    const R = 6371e3;
    const φ1 = from.lat * Math.PI / 180;
    const φ2 = to.lat * Math.PI / 180;
    const Δφ = (to.lat - from.lat) * Math.PI / 180;
    const Δλ = (to.lng - from.lng) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return {
      distance: R * c,
      duration: (R * c) / 8.33, // ~30km/h average
      geometry: coordinates,
      isFallback: true
    };
  }

  clearRoute() {
    if (!this.map) return;
    
    this.map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: []
      }
    });

    // Remove POI markers
    ['pickup', 'dropoff'].forEach(key => {
      if (this.markers[key]) {
        this.markers[key].remove();
        delete this.markers[key];
      }
    });
  }

  destroy() {
    this.clearRoute();
    
    Object.values(this.markers).forEach(marker => marker.remove());
    this.markers = {};
    
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    
    this.isInitialized = false;
  }
}

const mapService = new MapService();
