import { isValidLngLat, safePositions } from "./map-core.js";

export function emptyRouteFeature() {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: []
    },
    properties: {}
  };
}

export function ensureRouteLayers(map, options = {}) {
  if (!map?.isStyleLoaded?.()) return false;

  const sourceId = options.sourceId || "mimi-route";
  const glowLayerId = options.glowLayerId || `${sourceId}-glow`;
  const lineLayerId = options.lineLayerId || `${sourceId}-line`;
  const glowColor = options.glowColor || "#0f766e";
  const lineColor = options.lineColor || "#10b981";

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: emptyRouteFeature()
    });
  }

  if (!map.getLayer(glowLayerId)) {
    map.addLayer({
      id: glowLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": glowColor,
        "line-width": 12,
        "line-opacity": 0.16
      }
    });
  }

  if (!map.getLayer(lineLayerId)) {
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": lineColor,
        "line-width": 5,
        "line-opacity": 0.95
      }
    });
  }

  return true;
}

export function updateRouteLine(map, positions = [], options = {}) {
  const sourceId = options.sourceId || "mimi-route";

  if (!map) return false;

  if (!map.isStyleLoaded?.()) {
    map.once("load", () => updateRouteLine(map, positions, options));
    return false;
  }

  ensureRouteLayers(map, options);

  const source = map.getSource(sourceId);
  if (!source) return false;

  const safe = safePositions(positions);
  const feature =
    safe.length >= 2
      ? {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: safe.map((position) => [position.lng, position.lat])
          },
          properties: {}
        }
      : emptyRouteFeature();

  source.setData(feature);
  return true;
}

export function distanceMeters(from, to) {
  if (!isValidLngLat(from) || !isValidLngLat(to)) return null;
  const earthRadius = 6371000;
  const lat1 = (Number(from.lat) * Math.PI) / 180;
  const lat2 = (Number(to.lat) * Math.PI) / 180;
  const dLat = ((Number(to.lat) - Number(from.lat)) * Math.PI) / 180;
  const dLng = ((Number(to.lng) - Number(from.lng)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

export function etaMinutes(from, to, speedKmh = 28) {
  const meters = distanceMeters(from, to);
  if (!Number.isFinite(meters)) return null;
  const metersPerMinute = (Math.max(Number(speedKmh) || 28, 5) * 1000) / 60;
  return Math.max(1, Math.round(meters / metersPerMinute));
}
