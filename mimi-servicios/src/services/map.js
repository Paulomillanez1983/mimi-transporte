import {
  createMimiMap,
  fitMapToPositions,
  isValidLngLat,
  normalizePosition,
  scheduleMapResize,
  supportsWebGL,
  waitForMapLibre
} from "../../../js/mimi-maps/map-core.js";
import { createOrMoveMarker, removeMarker } from "../../../js/mimi-maps/map-markers.js";
import { distanceMeters, etaMinutes, updateRouteCoordinates, updateRouteLine } from "../../../js/mimi-maps/map-routing.js";

let map = null;
let providerMarker = null;
let clientMarker = null;
let lastFitKey = "";
let lastCameraMoveAt = 0;
let lastRoadRouteKey = "";
let lastRoadRouteAt = 0;
let lastRoadRouteCoordinates = [];
let providerSimulationFrame = null;
let providerSimulation = null;

const SERVICE_ROUTE_SOURCE = "mimi-services-tracking-route";
const PROVIDER_SIMULATION_SPEED_MPS = 7;
const PROVIDER_SIMULATION_MAX_PROGRESS = 0.88;
const PROVIDER_SIMULATION_MAX_AGE_MS = 190000;
const LIGHT_MAP_STYLE =
  window.MIMI_PROVIDER_MAP_STYLE ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function cameraKey(positions = []) {
  return positions
    .map((position) => normalizePosition(position))
    .filter(isValidLngLat)
    .map((position) => `${position.lat.toFixed(4)}:${position.lng.toFixed(4)}`)
    .join("|");
}

function shouldMoveCamera(nextKey) {
  const now = Date.now();
  if (nextKey && nextKey === lastFitKey && now - lastCameraMoveAt < 12000) {
    return false;
  }
  lastFitKey = nextKey;
  lastCameraMoveAt = now;
  return true;
}

function roadRouteKey(service, provider) {
  if (!isValidLngLat(service) || !isValidLngLat(provider)) return "";
  return [
    provider.lat.toFixed(4),
    provider.lng.toFixed(4),
    service.lat.toFixed(4),
    service.lng.toFixed(4)
  ].join(":");
}

function fetchRoadRoute({ service, provider }) {
  if (!map || !isValidLngLat(service) || !isValidLngLat(provider)) return;

  const key = roadRouteKey(service, provider);
  const now = Date.now();
  if (!key || (key === lastRoadRouteKey && now - lastRoadRouteAt < 15000)) return;

  lastRoadRouteKey = key;
  lastRoadRouteAt = now;

  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${provider.lng},${provider.lat};${service.lng},${service.lat}` +
    "?overview=full&geometries=geojson&steps=false";

  fetch(url)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const coordinates = data?.routes?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      lastRoadRouteCoordinates = coordinates;
      updateRouteCoordinates(map, coordinates, {
        sourceId: SERVICE_ROUTE_SOURCE,
        lineColor: "#10b981",
        glowColor: "#0f766e"
      });

      if (providerSimulation?.realKey === key) {
        const lngLat = providerMarker?.getLngLat?.();
        const displayProvider = lngLat
          ? { lat: Number(lngLat.lat), lng: Number(lngLat.lng) }
          : provider;

        startProviderSimulation({
          service,
          provider: isValidLngLat(displayProvider) ? displayProvider : provider,
          routeCoordinates: coordinates,
          force: true,
          realKeyOverride: key
        });
      }
    })
    .catch((error) => {
      console.warn("[MIMI Maps] road route fallback:", error?.message || error);
    });
}

function stopProviderSimulation() {
  if (providerSimulationFrame) {
    window.cancelAnimationFrame(providerSimulationFrame);
    providerSimulationFrame = null;
  }

  providerSimulation = null;
}

function coordsToPositions(coordinates = []) {
  return coordinates
    .map((coord) => ({
      lng: Number(coord?.[0]),
      lat: Number(coord?.[1])
    }))
    .filter(isValidLngLat);
}

function routeDistance(route = []) {
  let total = 0;

  for (let index = 1; index < route.length; index += 1) {
    const segment = distanceMeters(route[index - 1], route[index]);
    if (Number.isFinite(segment)) total += segment;
  }

  return total;
}

function interpolateRoute(route = [], progress = 0) {
  if (!Array.isArray(route) || route.length < 2) return route?.[0] ?? null;

  const total = routeDistance(route);
  if (!Number.isFinite(total) || total <= 0) return route[0];

  const target = Math.max(0, Math.min(progress, 1)) * total;
  let walked = 0;

  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const segment = distanceMeters(from, to);
    if (!Number.isFinite(segment) || segment <= 0) continue;

    if (walked + segment >= target) {
      const ratio = (target - walked) / segment;
      return {
        lat: from.lat + (to.lat - from.lat) * ratio,
        lng: from.lng + (to.lng - from.lng) * ratio
      };
    }

    walked += segment;
  }

  return route[route.length - 1];
}

function markProviderEstimated(isEstimated) {
  const element = providerMarker?.getElement?.();
  if (!element) return;

  element.dataset.estimated = isEstimated ? "true" : "false";
  element.title = isEstimated
    ? "Ubicacion estimada del prestador"
    : "Prestador asignado";
}

function buildSimulationRoute({ service, provider, routeCoordinates = [] }) {
  const roadRoute = coordsToPositions(routeCoordinates);
  const hasUsableRoadRoute =
    roadRoute.length >= 2 &&
    Number.isFinite(distanceMeters(provider, roadRoute[0])) &&
    distanceMeters(provider, roadRoute[0]) < 1500;

  if (hasUsableRoadRoute) {
    let closestIndex = 0;
    let closestDistance = Infinity;

    roadRoute.forEach((point, index) => {
      const distance = distanceMeters(provider, point);
      if (Number.isFinite(distance) && distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return [provider, ...roadRoute.slice(Math.max(closestIndex, 1))].filter(isValidLngLat);
  }

  return [provider, service].filter(isValidLngLat);
}

function startProviderSimulation({
  service,
  provider,
  routeCoordinates = lastRoadRouteCoordinates,
  force = false,
  realKeyOverride = null
} = {}) {
  if (!map || !providerMarker || !isValidLngLat(service) || !isValidLngLat(provider)) {
    stopProviderSimulation();
    return;
  }

  const realKey = realKeyOverride || roadRouteKey(service, provider);
  if (!force && providerSimulation?.realKey === realKey) return;

  stopProviderSimulation();

  const route = buildSimulationRoute({ service, provider, routeCoordinates });
  if (route.length < 2) return;

  const totalMeters = routeDistance(route);
  const durationMs = Math.max(
    30000,
    Math.min(PROVIDER_SIMULATION_MAX_AGE_MS, (totalMeters / PROVIDER_SIMULATION_SPEED_MPS) * 1000)
  );

  providerSimulation = {
    realKey,
    route,
    startedAt: Date.now(),
    durationMs,
    maxAgeMs: PROVIDER_SIMULATION_MAX_AGE_MS
  };

  providerMarker.setLngLat([provider.lng, provider.lat]);
  markProviderEstimated(false);

  const tick = () => {
    if (!providerSimulation || !providerMarker) return;

    const elapsed = Date.now() - providerSimulation.startedAt;
    const rawProgress = elapsed / providerSimulation.durationMs;
    const progress = Math.min(rawProgress, PROVIDER_SIMULATION_MAX_PROGRESS);
    const next = interpolateRoute(providerSimulation.route, progress);

    if (isValidLngLat(next)) {
      providerMarker.setLngLat([next.lng, next.lat]);
      markProviderEstimated(progress > 0.02);
    }

    if (elapsed < providerSimulation.maxAgeMs && progress < PROVIDER_SIMULATION_MAX_PROGRESS) {
      providerSimulationFrame = window.requestAnimationFrame(tick);
    } else {
      providerSimulationFrame = null;
    }
  };

  providerSimulationFrame = window.requestAnimationFrame(tick);
}

function removeMap() {
  try {
    map?.remove?.();
  } catch {
    // noop
  }
  map = null;
  providerMarker = null;
  clientMarker = null;
  lastFitKey = "";
  lastRoadRouteKey = "";
  lastRoadRouteAt = 0;
  lastRoadRouteCoordinates = [];
  stopProviderSimulation();
}

export async function initMap(containerId, initialCenter, zoom) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const mapLibreReady = await waitForMapLibre();
  if (!mapLibreReady || !supportsWebGL()) return null;

  if (map) {
    removeMap();
  }

  map = createMimiMap({
    container: containerId,
    style: LIGHT_MAP_STYLE,
    center: initialCenter,
    zoom,
    interactive: true,
    attributionControl: false
  });

  if (!map) return null;

  map.addControl(
    new window.maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }),
    "top-right"
  );
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }));

  map.on("load", () => {
    updateRouteLine(map, [], {
      sourceId: SERVICE_ROUTE_SOURCE,
      lineColor: "#10b981",
      glowColor: "#0f766e"
    });
    scheduleMapResize(map);
  });

  map.on("error", (event) => {
    console.warn("[MIMI Maps] services map error:", event?.error || event);
  });

  scheduleMapResize(map);
  return map;
}

function setMarkers({ servicePosition, providerPosition, preserveProviderMarker = false }) {
  const service = normalizePosition(servicePosition);
  const provider = normalizePosition(providerPosition);

  clientMarker = isValidLngLat(service)
    ? createOrMoveMarker({
        map,
        marker: clientMarker,
        position: service,
        type: "service",
        anchor: "center",
        options: { label: "C", pulse: true, title: "Domicilio del cliente" }
      })
    : removeMarker(clientMarker);

  if (isValidLngLat(provider)) {
    if (!preserveProviderMarker || !providerMarker) {
      providerMarker = createOrMoveMarker({
        map,
        marker: providerMarker,
        position: provider,
        type: "provider",
        anchor: "center",
        options: { label: "P", pulse: true, title: "Prestador asignado" }
      });
      markProviderEstimated(false);
    }
  } else {
    providerMarker = removeMarker(providerMarker);
  }

  return { service, provider };
}

function updateServiceMap({
  servicePosition,
  providerPosition,
  fitPadding = null,
  simulateProviderMovement = false
}) {
  if (!map) return;

  const nextService = normalizePosition(servicePosition);
  const nextProvider = normalizePosition(providerPosition);
  const simulationKey = roadRouteKey(nextService, nextProvider);
  const preserveProviderMarker =
    simulateProviderMovement &&
    providerMarker &&
    providerSimulation?.realKey === simulationKey;
  const { service, provider } = setMarkers({
    servicePosition,
    providerPosition,
    preserveProviderMarker
  });
  const positions = [service, provider].filter(isValidLngLat);

  updateRouteLine(map, positions, {
    sourceId: SERVICE_ROUTE_SOURCE,
    lineColor: "#10b981",
    glowColor: "#0f766e"
  });

  if (provider && service) {
    fetchRoadRoute({ service, provider });

    if (simulateProviderMovement) {
      startProviderSimulation({ service, provider });
    } else {
      stopProviderSimulation();
      markProviderEstimated(false);
    }
  } else {
    stopProviderSimulation();
  }

  const nextKey = cameraKey(positions);
  if (positions.length && shouldMoveCamera(nextKey)) {
    fitMapToPositions(map, positions, {
      padding: fitPadding,
      maxZoom: provider && service ? 15.8 : 14.8,
      duration: 620
    });
  }

  const eta = provider && service ? etaMinutes(provider, service) : null;
  if (Number.isFinite(eta)) {
    map.getCanvasContainer()?.setAttribute("data-mimi-eta-min", String(eta));
  }
}

export function updateClientMap({ servicePosition, providerPosition }) {
  updateServiceMap({
    servicePosition,
    providerPosition,
    simulateProviderMovement: true,
    fitPadding: window.innerWidth <= 768
      ? { top: 104, right: 24, bottom: 300, left: 24 }
      : { top: 96, right: 96, bottom: 190, left: 96 }
  });
}

export function updateProviderMap({ providerPosition, servicePosition }) {
  updateServiceMap({
    servicePosition,
    providerPosition,
    fitPadding: window.innerWidth <= 768
      ? { top: 112, right: 28, bottom: 280, left: 28 }
      : { top: 112, right: 96, bottom: 220, left: 96 }
  });
}

export function updateTrackingMarkers({ clientPosition, providerPosition }) {
  updateClientMap({ servicePosition: clientPosition, providerPosition });
}

export function getServicesMap() {
  return map;
}
