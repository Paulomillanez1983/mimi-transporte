let map = null;
let providerMarker = null;
let clientMarker = null;
let routeSourceReady = false;

const LIGHT_MAP_STYLE = window.MIMI_PROVIDER_MAP_STYLE || "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function createMarkerElement(color) {
  const element = document.createElement("div");
  element.style.width = "18px";
  element.style.height = "18px";
  element.style.borderRadius = "50%";
  element.style.border = "3px solid white";
  element.style.background = color;
  element.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
  return element;
}

function ensureMarker(marker, color) {
  return marker || new window.maplibregl.Marker({ element: createMarkerElement(color) });
}

export function initMap(containerId, initialCenter, zoom) {
  if (!window.maplibregl) return null;
  if (map) {
    map.remove();
    map = null;
    providerMarker = null;
    clientMarker = null;
    routeSourceReady = false;
  }

  map = new window.maplibregl.Map({
    container: containerId,
    style: LIGHT_MAP_STYLE,
    center: initialCenter,
    zoom,
    pitch: 0,
    bearing: 0,
    attributionControl: false
  });

  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), "top-right");
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }));
  map.on("load", ensureRouteLayer);
  return map;
}

function clearMarker(marker) { marker?.remove?.(); return null; }
function emptyRoute() { return { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} }; }

function fitToPoints(points) {
  const safePoints = points.filter((p) => p && Number.isFinite(Number(p.lng)) && Number.isFinite(Number(p.lat)));
  if (!map || !safePoints.length) return;
  if (safePoints.length === 1) return map.easeTo({ center: [safePoints[0].lng, safePoints[0].lat], zoom: 14, duration: 700 });
  const bounds = new window.maplibregl.LngLatBounds();
  safePoints.forEach((p) => bounds.extend([p.lng, p.lat]));
  map.fitBounds(bounds, { padding: 72, maxZoom: 15.2, duration: 800 });
}

function ensureRouteLayer() {
  if (!map || routeSourceReady || !map.isStyleLoaded()) return;
  if (!map.getSource("tracking-route")) map.addSource("tracking-route", { type: "geojson", data: emptyRoute() });
  if (!map.getLayer("tracking-route-glow")) map.addLayer({ id: "tracking-route-glow", type: "line", source: "tracking-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#60a5fa", "line-width": 10, "line-opacity": 0.18 } });
  if (!map.getLayer("tracking-route-line")) map.addLayer({ id: "tracking-route-line", type: "line", source: "tracking-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.9 } });
  routeSourceReady = true;
}

function updateRoute(points) {
  if (!map) return;
  if (!map.isStyleLoaded()) return map.once("load", () => updateRoute(points));
  ensureRouteLayer();
  const source = map.getSource("tracking-route");
  if (!source) return;
  const safePoints = points.filter((p) => p && Number.isFinite(Number(p.lng)) && Number.isFinite(Number(p.lat)));
  source.setData(safePoints.length < 2 ? emptyRoute() : { type: "Feature", geometry: { type: "LineString", coordinates: safePoints.map((p) => [p.lng, p.lat]) }, properties: {} });
}

export function updateClientMap({ servicePosition, providerPosition }) {
  if (!map) return;
  clientMarker = Number.isFinite(Number(servicePosition?.lng)) && Number.isFinite(Number(servicePosition?.lat)) ? ensureMarker(clientMarker, "#38bdf8").setLngLat([servicePosition.lng, servicePosition.lat]).addTo(map) : clearMarker(clientMarker);
  providerMarker = Number.isFinite(Number(providerPosition?.lng)) && Number.isFinite(Number(providerPosition?.lat)) ? ensureMarker(providerMarker, "#22c55e").setLngLat([providerPosition.lng, providerPosition.lat]).addTo(map) : clearMarker(providerMarker);
  updateRoute([servicePosition, providerPosition]);
  fitToPoints([servicePosition, providerPosition]);
}

export function updateProviderMap({ providerPosition, servicePosition }) {
  if (!map) return;
  providerMarker = Number.isFinite(Number(providerPosition?.lng)) && Number.isFinite(Number(providerPosition?.lat)) ? ensureMarker(providerMarker, "#22c55e").setLngLat([providerPosition.lng, providerPosition.lat]).addTo(map) : clearMarker(providerMarker);
  clientMarker = Number.isFinite(Number(servicePosition?.lng)) && Number.isFinite(Number(servicePosition?.lat)) ? ensureMarker(clientMarker, "#f59e0b").setLngLat([servicePosition.lng, servicePosition.lat]).addTo(map) : clearMarker(clientMarker);
  updateRoute([providerPosition, servicePosition]);
  fitToPoints([providerPosition, servicePosition]);
}

export function updateTrackingMarkers({ clientPosition, providerPosition }) {
  updateClientMap({ servicePosition: clientPosition, providerPosition });
}
