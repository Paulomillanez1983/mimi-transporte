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
import { etaMinutes, updateRouteCoordinates, updateRouteLine } from "../../../js/mimi-maps/map-routing.js";

let map = null;
let providerMarker = null;
let clientMarker = null;
let lastFitKey = "";
let lastCameraMoveAt = 0;
let lastRoadRouteKey = "";
let lastRoadRouteAt = 0;

const SERVICE_ROUTE_SOURCE = "mimi-services-tracking-route";
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
      updateRouteCoordinates(map, coordinates, {
        sourceId: SERVICE_ROUTE_SOURCE,
        lineColor: "#10b981",
        glowColor: "#0f766e"
      });
    })
    .catch((error) => {
      console.warn("[MIMI Maps] road route fallback:", error?.message || error);
    });
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

function setMarkers({ servicePosition, providerPosition }) {
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

  providerMarker = isValidLngLat(provider)
    ? createOrMoveMarker({
        map,
        marker: providerMarker,
        position: provider,
        type: "provider",
        anchor: "center",
        options: { label: "P", pulse: true, title: "Prestador asignado" }
      })
    : removeMarker(providerMarker);

  return { service, provider };
}

function updateServiceMap({ servicePosition, providerPosition, fitPadding = null }) {
  if (!map) return;

  const { service, provider } = setMarkers({ servicePosition, providerPosition });
  const positions = [service, provider].filter(isValidLngLat);

  updateRouteLine(map, positions, {
    sourceId: SERVICE_ROUTE_SOURCE,
    lineColor: "#10b981",
    glowColor: "#0f766e"
  });

  if (provider && service) {
    fetchRoadRoute({ service, provider });
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
