/**
 * Servicio de Routing con OSRM
 * Rutas reales por calles, no líneas rectas
 */

import CONFIG from './config.js';

class RoutingService {
  constructor() {
    this.currentRoute = null;
    this.routeLine = null;
    this.instructions = [];
    this.abortController = null;
  }

  /**
   * Obtener ruta real entre dos puntos usando OSRM
   */
  async getRoute(startLngLat, endLngLat, options = {}) {
    const { 
      alternatives = false, 
      steps = true, 
      geometries = 'geojson',
      overview = 'full'
    } = options;

    // Cancelar petición anterior si existe
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const coords = `${startLngLat[0]},${startLngLat[1]};${endLngLat[0]},${endLngLat[1]}`;
    const url = `${CONFIG.OSRM_BASE_URL}/route/v1/${CONFIG.OSRM_PROFILE}/${coords}?` +
      `alternatives=${alternatives}&` +
      `steps=${steps}&` +
      `geometries=${geometries}&` +
      `overview=${overview}&` +
      `annotations=true`;

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OSRM error: ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No se encontró ruta');
      }

      const route = data.routes[0];
      
      // Procesar instrucciones
      this.instructions = this._processInstructions(route);
      
      this.currentRoute = {
        geometry: route.geometry,
        distance: route.distance, // metros
        duration: route.duration, // segundos
        legs: route.legs,
        instructions: this.instructions,
        waypoints: data.waypoints
      };

      return this.currentRoute;

    } catch (error) {
      if (error.name === 'AbortError') {
        return null; // Petición cancelada intencionalmente
      }
      console.error('Routing error:', error);
      
      // Fallback: intentar con Valhalla si OSRM falla
      return this._fallbackValhalla(startLngLat, endLngLat);
    }
  }

  /**
   * Fallback con Valhalla si OSRM no responde
   */
  async _fallbackValhalla(startLngLat, endLngLat) {
    try {
      const response = await fetch(`${CONFIG.VALHALLA_URL}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [
            { lon: startLngLat[0], lat: startLngLat[1] },
            { lon: endLngLat[0], lat: endLngLat[1] }
          ],
          costing: 'auto',
          directions_options: { units: 'kilometers' }
        })
      });

      const data = await response.json();
      
      if (!data.trip || !data.trip.legs) {
        throw new Error('Valhalla no encontró ruta');
      }

      // Convertir formato Valhalla a formato compatible
      const leg = data.trip.legs[0];
      const coordinates = leg.shape ? this._decodePolyline(leg.shape) : [];

      return {
        geometry: { type: 'LineString', coordinates },
        distance: leg.summary.length * 1000, // km a metros
        duration: leg.summary.time,
        instructions: leg.maneuvers || [],
        source: 'valhalla'
      };

    } catch (error) {
      console.error('Valhalla fallback error:', error);
      return null;
    }
  }

  /**
   * Procesar instrucciones de maniobra
   */
  _processInstructions(route) {
    const instructions = [];
    
    route.legs.forEach((leg, legIndex) => {
      leg.steps.forEach((step, stepIndex) => {
        instructions.push({
          text: step.name || 'Continúa',
          maneuver: step.maneuver,
          distance: step.distance,
          duration: step.duration,
          type: this._classifyManeuver(step.maneuver),
          icon: this._getManeuverIcon(step.maneuver),
          intersection: step.intersections?.[0],
          legIndex,
          stepIndex
        });
      });
    });

    return instructions;
  }

  /**
   * Clasificar tipo de maniobra
   */
  _classifyManeuver(maneuver) {
    const type = maneuver?.type || '';
    const modifier = maneuver?.modifier || '';
    
    const types = {
      'turn': modifier || 'straight',
      'new name': 'straight',
      'depart': 'depart',
      'arrive': 'arrive',
      'merge': 'merge',
      'on ramp': 'on_ramp',
      'off ramp': 'off_ramp',
      'fork': 'fork',
      'end of road': 'end_of_road',
      'continue': 'straight',
      'roundabout': 'roundabout',
      'rotary': 'roundabout',
      'roundabout turn': 'roundabout',
      'exit roundabout': 'roundabout',
      'notification': 'notification',
      'exit rotary': 'roundabout'
    };
    
    return types[type] || 'straight';
  }

  /**
   * Obtener icono según maniobra
   */
  _getManeuverIcon(maneuver) {
    const type = maneuver?.type;
    const modifier = maneuver?.modifier;
    
    const icons = {
      'turn': {
        'uturn': '↩️',
        'sharp right': '↱',
        'right': '➡️',
        'slight right': '↗️',
        'straight': '⬆️',
        'slight left': '↖️',
        'left': '⬅️',
        'sharp left': '↰'
      },
      'new name': '⬆️',
      'depart': '🚀',
      'arrive': '🏁',
      'merge': '🔀',
      'on ramp': '↗️',
      'off ramp': '↘️',
      'fork': '🔱',
      'roundabout': '↻',
      'rotary': '↻',
      'continue': '⬆️'
    };
    
    if (type === 'turn' && modifier) {
      return icons.turn[modifier] || '⬆️';
    }
    
    return icons[type] || '⬆️';
  }

  /**
   * Decodificar polyline encoded (para Valhalla)
   */
  _decodePolyline(str, precision = 6) {
    let index = 0,
      lat = 0,
      lng = 0,
      coordinates = [],
      shift = 0,
      result = 0,
      byte = null,
      latitude_change,
      longitude_change,
      factor = Math.pow(10, precision);

    while (index < str.length) {
      byte = null;
      shift = 0;
      result = 0;

      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = result = 0;

      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);

      longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

      lat += latitude_change;
      lng += longitude_change;

      coordinates.push([lng / factor, lat / factor]);
    }

    return coordinates;
  }

  /**
   * Obtener la instrucción actual basada en la posición
   */
  getCurrentInstruction(positionLngLat, routeProgress = null) {
    if (!this.currentRoute || !this.instructions.length) {
      return null;
    }

    // Si tenemos progreso calculado, usarlo
    if (routeProgress !== null) {
      const stepIndex = Math.floor(routeProgress * this.instructions.length);
      return this.instructions[Math.min(stepIndex, this.instructions.length - 1)];
    }

    // Calcular distancia a cada paso y encontrar el más cercano
    let closestIndex = 0;
    let minDistance = Infinity;

    this.instructions.forEach((inst, index) => {
      if (inst.maneuver?.location) {
        const dist = this._haversineDistance(
          positionLngLat[1], positionLngLat[0],
          inst.maneuver.location[1], inst.maneuver.location[0]
        );
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = index;
        }
      }
    });

    // Devolver instrucción actual y siguiente
    return {
      current: this.instructions[closestIndex],
      next: this.instructions[closestIndex + 1] || null,
      remaining: this.instructions.slice(closestIndex + 1),
      progress: closestIndex / this.instructions.length
    };
  }

  /**
   * Calcular distancia haversine
   */
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

  /**
   * Limpiar ruta actual
   */
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
