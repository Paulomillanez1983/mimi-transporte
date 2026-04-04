/**
 * Servicio de Routing con Valhalla (CORS-free)
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

      const directDistance = this._haversineDistance(start.lat, start.lng, end.lat, end.lng);

      if (directDistance < 20) {
        route = this._getStraightLineRoute(start, end);
      } else if (CONFIG.ROUTING_PROVIDER === 'valhalla') {
        route = await this._getValhallaRoute(start, end);
      }

      if (route) {
        console.log('[Routing] Ruta obtenida:', route.distance, 'm');
        this.currentRoute = route;
        this.instructions = Array.isArray(route.instructions) ? route.instructions : [];
        return route;
      }

      throw new Error('No se pudo obtener ruta');

    } catch (error) {
      console.warn('[Routing] Error, usando línea recta:', error.message);
      const fallbackRoute = this._getStraightLineRoute(start, end);
      this.currentRoute = fallbackRoute;
      this.instructions = fallbackRoute.instructions || [];
      return fallbackRoute;
    }
  }

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
    this.abortController = null;

    if (!data.trip || data.trip.status !== 0) {
      throw new Error('Valhalla no encontró ruta');
    }

    const leg = data.trip.legs[0];

    return {
      geometry: {
        type: 'LineString',
        coordinates: leg.shape
      },
      distance: leg.summary.length * 1000,
      duration: leg.summary.time,
      instructions: this._processValhallaManeuvers(leg.maneuvers),
      provider: 'valhalla'
    };
  }

  _getStraightLineRoute(start, end) {
    console.log('[Routing] Usando línea recta');

    const coordinates = [
      [start.lng, start.lat],
      [end.lng, end.lat]
    ];

    const distance = this._haversineDistance(start.lat, start.lng, end.lat, end.lng);

    return {
      geometry: { type: 'LineString', coordinates },
      distance: distance,
      duration: distance / 8.33,
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
      1: 'straight', 2: 'slight_right', 3: 'right', 4: 'sharp_right',
      5: 'uturn', 6: 'sharp_left', 7: 'left', 8: 'slight_left',
      9: 'straight', 10: 'roundabout', 15: 'destination'
    };

    return maneuvers.map(m => ({
      text: m.instruction || 'Continúa',
      type: typeMap[m.type] || 'straight',
      distance: m.length ? m.length * 1000 : 0
    }));
  }

  _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
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
