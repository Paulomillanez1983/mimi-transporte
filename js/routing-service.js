/**
 * Servicio de Routing con OSRM / Valhalla (CORS-free)
 */

import CONFIG from './config.js';

class RoutingService {
  constructor() {
    this.currentRoute = null;
    this.instructions = [];
    this.abortController = null;
  }

  async getRoute(start, end) {
    console.log('[Routing] Solicitando ruta:', { start, end });

    if (!start || !end) {
      throw new Error('Faltan puntos de ruta');
    }

    if (
      !Number.isFinite(Number(start.lat)) ||
      !Number.isFinite(Number(start.lng)) ||
      !Number.isFinite(Number(end.lat)) ||
      !Number.isFinite(Number(end.lng))
    ) {
      throw new Error('Coordenadas inválidas');
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      let route = null;

      const directDistance = this._haversineDistance(
        Number(start.lat),
        Number(start.lng),
        Number(end.lat),
        Number(end.lng)
      );

      if (directDistance < 20) {
        route = this._getStraightLineRoute(start, end);
      } else if (CONFIG.ROUTING_PROVIDER === 'osrm') {
        route = await this._getOsrmRoute(start, end);
      } else if (CONFIG.ROUTING_PROVIDER === 'valhalla') {
        route = await this._getValhallaRoute(start, end);
      } else {
        console.warn('[Routing] ROUTING_PROVIDER no reconocido, usando fallback');
        route = this._getStraightLineRoute(start, end);
      }

      if (!route) {
        throw new Error('No se pudo obtener ruta');
      }

      console.log('[Routing] Ruta obtenida:', route.distance, 'm', 'provider:', route.provider);

      this.currentRoute = route;
      this.instructions = Array.isArray(route.instructions) ? route.instructions : [];

      if (this.abortController) {
        this.abortController = null;
      }

      return route;
    } catch (error) {
      console.warn('[Routing] Error, usando línea recta:', error?.message || error);

      const fallbackRoute = this._getStraightLineRoute(start, end);
      this.currentRoute = fallbackRoute;
      this.instructions = fallbackRoute.instructions || [];
      this.abortController = null;

      return fallbackRoute;
    }
  }

  async _getOsrmRoute(start, end) {
    const url =
      `${CONFIG.OSRM_URL}/route/v1/driving/` +
      `${Number(start.lng)},${Number(start.lat)};${Number(end.lng)},${Number(end.lat)}` +
      `?overview=full&geometries=geojson&steps=true`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      },
      signal: this.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`OSRM HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || !data.routes[0]) {
      throw new Error('OSRM no devolvió rutas');
    }

    const route = data.routes[0];
    const steps = route.legs?.[0]?.steps || [];
    const coordinates = route.geometry?.coordinates || [];

    if (!Array.isArray(coordinates) || !coordinates.length) {
      throw new Error('OSRM devolvió geometría vacía');
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates
      },
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
      instructions: this._processOsrmSteps(steps),
      provider: 'osrm'
    };
  }

  _processOsrmSteps(steps) {
    if (!steps || !steps.length) return [];

    const maneuverMap = {
      straight: 'straight',
      'slight right': 'slight_right',
      right: 'right',
      'sharp right': 'sharp_right',
      uturn: 'uturn',
      'sharp left': 'sharp_left',
      left: 'left',
      'slight left': 'slight_left',
      roundabout: 'roundabout',
      rotary: 'roundabout',
      arrive: 'destination',
      depart: 'straight',
      merge: 'straight',
      fork: 'straight',
      end: 'destination'
    };

    return steps.map((step) => {
      const modifier = step?.maneuver?.modifier || '';
      const type = step?.maneuver?.type || '';

      return {
        text:
          step?.maneuver?.instruction ||
          step?.name ||
          type ||
          'Continúa',
        type:
          maneuverMap[modifier] ||
          maneuverMap[type] ||
          'straight',
        distance: Number(step?.distance) || 0
      };
    });
  }

  async _getValhallaRoute(start, end) {
    const body = {
      locations: [
        { lon: Number(start.lng), lat: Number(start.lat) },
        { lon: Number(end.lng), lat: Number(end.lat) }
      ],
      costing: 'auto',
      directions_options: { units: 'kilometers' },
      shape_format: 'geojson'
    };

    const response = await fetch(CONFIG.VALHALLA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Valhalla HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.trip || data.trip.status !== 0 || !data.trip.legs?.[0]) {
      throw new Error('Valhalla no encontró ruta');
    }

    const leg = data.trip.legs[0];
    const coordinates = leg.shape || [];

    if (!Array.isArray(coordinates) || !coordinates.length) {
      throw new Error('Valhalla devolvió geometría vacía');
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates
      },
      distance: (Number(leg.summary?.length) || 0) * 1000,
      duration: Number(leg.summary?.time) || 0,
      instructions: this._processValhallaManeuvers(leg.maneuvers),
      provider: 'valhalla'
    };
  }

  _getStraightLineRoute(start, end) {
    console.log('[Routing] Usando línea recta');

    const coordinates = [
      [Number(start.lng), Number(start.lat)],
      [Number(end.lng), Number(end.lat)]
    ];

    const distance = this._haversineDistance(
      Number(start.lat),
      Number(start.lng),
      Number(end.lat),
      Number(end.lng)
    );

    return {
      geometry: {
        type: 'LineString',
        coordinates
      },
      distance,
      duration: distance / 8.33,
      instructions: [
        {
          text: 'Dirígete al destino',
          type: 'straight',
          distance
        }
      ],
      provider: 'straight',
      isFallback: true
    };
  }

  _processValhallaManeuvers(maneuvers) {
    if (!maneuvers || !maneuvers.length) return [];

    const typeMap = {
      1: 'straight',
      2: 'slight_right',
      3: 'right',
      4: 'sharp_right',
      5: 'uturn',
      6: 'sharp_left',
      7: 'left',
      8: 'slight_left',
      9: 'straight',
      10: 'roundabout',
      15: 'destination'
    };

    return maneuvers.map((m) => ({
      text: m?.instruction || 'Continúa',
      type: typeMap[m?.type] || 'straight',
      distance: m?.length ? Number(m.length) * 1000 : 0
    }));
  }

  _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = Number(lat1) * Math.PI / 180;
    const φ2 = Number(lat2) * Math.PI / 180;
    const Δφ = (Number(lat2) - Number(lat1)) * Math.PI / 180;
    const Δλ = (Number(lon2) - Number(lon1)) * Math.PI / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
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
