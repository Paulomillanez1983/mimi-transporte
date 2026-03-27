/**
 * Servicio de Routing - CORS-free
 * Soporta Valhalla (recomendado) y fallback a línea recta
 */

import CONFIG from './config.js';

class RoutingService {
  constructor() {
    this.currentRoute = null;
    this.instructions = [];
    this.abortController = null;
  }

  /**
   * Obtener ruta con fallback automático
   */
  async getRoute(start, end) {
    console.log('[Routing] Solicitando ruta:', { start, end });
    
    // Cancelar petición anterior
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      let route = null;

      // Intentar según proveedor configurado
      if (CONFIG.ROUTING_PROVIDER === 'valhalla') {
        route = await this._getValhallaRoute(start, end);
      } else if (CONFIG.ROUTING_PROVIDER === 'osrm') {
        route = await this._getOSRMRoute(start, end);
      }

      if (route) {
        console.log('[Routing] Ruta obtenida:', route.distance, 'm');
        this.currentRoute = route;
        return route;
      }

      throw new Error('No se pudo obtener ruta');

    } catch (error) {
      console.warn('[Routing] Error, usando línea recta:', error.message);
      return this._getStraightLineRoute(start, end);
    }
  }

  /**
   * Valhalla - Mejor soporte CORS
   */
  async _getValhallaRoute(start, end) {
    const body = {
      locations: [
        { lon: start.lng, lat: start.lat },
        { lon: end.lng, lat: end.lat }
      ],
      costing: 'auto',
      directions_options: { units: 'kilometers' },
      shape_format: 'geojson'
    };

    const response = await fetch(CONFIG.VALHALLA_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Valhalla HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.trip || data.trip.status !== 0) {
      throw new Error('Valhalla no encontró ruta');
    }

    const leg = data.trip.legs[0];
    
    // Convertir shape a GeoJSON si es necesario
    let geometry = leg.shape;
    if (typeof geometry === 'string') {
      geometry = this._decodePolyline(geometry);
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates: geometry.coordinates || geometry
      },
      distance: leg.summary.length * 1000, // km a metros
      duration: leg.summary.time,
      instructions: this._processValhallaManeuvers(leg.maneuvers),
      provider: 'valhalla'
    };
  }

  /**
   * OSRM con manejo de CORS
   */
  async _getOSRMRoute(start, end) {
    const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    const url = `${CONFIG.OSRM_URL}/route/v1/driving/${coords}?geometries=geojson&overview=full&steps=true`;

    // Intentar con mode: 'cors' primero
    try {
      const response = await fetch(url, {
        mode: 'cors',
        signal: this.abortController.signal
      });
      
      if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
      
      const data = await response.json();
      if (data.code !== 'Ok') throw new Error(data.message);

      const route = data.routes[0];
      return {
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
        instructions: this._processOSRMSteps(route.legs[0].steps),
        provider: 'osrm'
      };

    } catch (corsError) {
      // Si falla CORS, intentar con no-cors (opaque response)
      console.warn('[Routing] CORS failed, intentando no-cors mode');
      throw corsError; // Por ahora no soportamos no-cors
    }
  }

  /**
   * Fallback: Línea recta (siempre funciona)
   */
  _getStraightLineRoute(start, end) {
    console.log('[Routing] Usando línea recta');
    
    const coordinates = [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ];

    const distance = this._haversineDistance(start.lat, start.lng, end.lat, end.lng);

    return {
      geometry: {
        type: 'LineString',
        coordinates
      },
      distance: distance,
      duration: distance / 8.33, // ~30km/h estimado
      instructions: [{
        text: 'Dirígete al destino',
        type: 'straight',
        distance: distance
      }],
      provider: 'straight',
      isFallback: true
    };
  }

  _processValhallaManeuvers(maneuvers) {
    if (!maneuvers) return [];
    
    const typeMap = {
      1: 'straight',    // Continue
      2: 'slight_right',
      3: 'right',
      4: 'sharp_right',
      5: 'uturn',
      6: 'sharp_left',
      7: 'left',
      8: 'slight_left',
      9: 'straight',    // Stay straight
      10: 'roundabout',
      15: 'destination'
    };

    return maneuvers.map((m, i) => ({
      text: m.instruction || 'Continúa',
      type: typeMap[m.type] || 'straight',
      distance: m.length ? m.length * 1000 : 0,
      icon: this._getIconForType(typeMap[m.type])
    }));
  }

  _processOSRMSteps(steps) {
    return steps.map(s => ({
      text: s.name || 'Continúa',
      type: s.maneuver?.type || 'straight',
      distance: s.distance,
      icon: this._getIconForType(s.maneuver?.type)
    }));
  }

  _getIconForType(type) {
    const icons = {
      straight: '↑',
      left: '←',
      right: '→',
      slight_left: '↖',
      slight_right: '↗',
      uturn: '↩',
      roundabout: '↻',
      depart: '🚀',
      arrive: '🏁'
    };
    return icons[type] || '↑';
  }

  _decodePolyline(str) {
    // Implementación básica de decodificación polyline
    let index = 0, lat = 0, lng = 0, coordinates = [];
    const factor = 1e6;

    while (index < str.length) {
      let shift = 0, result = 0, byte;
      
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0; result = 0;
      
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      coordinates.push([lng / factor, lat / factor]);
    }

    return coordinates;
  }

  _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  getCurrentInstruction(position) {
    if (!this.currentRoute?.instructions?.length) return null;

    // Encontrar instrucción más cercana
    let closest = 0;
    let minDist = Infinity;

    // Simplificación: usar progreso basado en distancia al destino
    // En producción, usar proyección sobre la ruta
    
    return {
      current: this.currentRoute.instructions[closest],
      next: this.currentRoute.instructions[closest + 1] || null,
      remaining: this.currentRoute.instructions.slice(closest + 1)
    };
  }

  clear() {
    this.currentRoute = null;
    this.instructions = [];
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

const routingService = new RoutingService();
export default routingService;
