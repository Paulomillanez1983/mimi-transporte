import { appConfig } from "../../config.js";
let map = null;
let providerMarker = null;
let clientMarker = null;
let userInteracting = false;

export function initMap(containerId = "trackingMap") {
  const container = document.getElementById(containerId);
  if (!container || !window.maplibregl || map) return map;

  map = new window.maplibregl.Map({
    container,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: appConfig.mapInitialCenter,
    zoom: appConfig.mapInitialZoom,
  });

  map.addControl(new window.maplibregl.NavigationControl(), "top-right");

  map.on("dragstart", () => {
    userInteracting = true;
  });

  map.on("zoomstart", () => {
    userInteracting = true;
  });

  return map;
}

function ensureMarker(existingMarker, lngLat, color) {
  if (!map || !lngLat) return existingMarker;

  if (!existingMarker) {
    return new window.maplibregl.Marker({ color }).setLngLat(lngLat).addTo(map);
  }

  existingMarker.setLngLat(lngLat);
  return existingMarker;
}

function fitIfNeeded({ clientPosition, providerPosition }) {
  if (!map || userInteracting) return;

  if (clientPosition && providerPosition) {
    const bounds = new window.maplibregl.LngLatBounds();
    bounds.extend([clientPosition.lng, clientPosition.lat]);
    bounds.extend([providerPosition.lng, providerPosition.lat]);

    map.fitBounds(bounds, {
      padding: 70,
      maxZoom: 15,
      duration: 900,
    });

    return;
  }

  if (providerPosition) {
    map.easeTo({
      center: [providerPosition.lng, providerPosition.lat],
      zoom: 14,
      duration: 900,
    });
    return;
  }

  if (clientPosition) {
    map.easeTo({
      center: [clientPosition.lng, clientPosition.lat],
      zoom: 14,
      duration: 900,
    });
  }
}

export function updateTrackingMarkers({ clientPosition, providerPosition }) {
  if (!map) return;

  providerMarker = providerPosition
    ? ensureMarker(providerMarker, [providerPosition.lng, providerPosition.lat], "#2563eb")
    : providerMarker;

  clientMarker = clientPosition
    ? ensureMarker(clientMarker, [clientPosition.lng, clientPosition.lat], "#10b981")
    : clientMarker;

  fitIfNeeded({ clientPosition, providerPosition });
}
