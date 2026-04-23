let map = null;
let providerMarker = null;
let clientMarker = null;
let routeSourceReady = false;

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
  if (marker) {
    return marker;
  }

  return new window.maplibregl.Marker({
    element: createMarkerElement(color)
  });
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
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm"
        }
      ]
    },
    center: initialCenter,
    zoom,
    attributionControl: true
  });

  map.addControl(new window.maplibregl.NavigationControl(), "top-right");

  map.on("load", () => {
    ensureRouteLayer();
  });

  return map;
}

function clearMarker(marker) {
  marker?.remove?.();
  return null;
}

function fitToPoints(points) {
  const safePoints = points.filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.lng)) &&
      Number.isFinite(Number(point.lat))
  );

  if (!map || !safePoints.length) return;

  if (safePoints.length === 1) {
    map.flyTo({
      center: [safePoints[0].lng, safePoints[0].lat],
      zoom: 14,
      speed: 0.8
    });
    return;
  }

  const bounds = new window.maplibregl.LngLatBounds();
  safePoints.forEach((point) => bounds.extend([point.lng, point.lat]));

  map.fitBounds(bounds, {
    padding: 64,
    maxZoom: 15,
    duration: 700
  });
}

function ensureRouteLayer() {
  if (!map || routeSourceReady || !map.isStyleLoaded()) return;

  if (!map.getSource("tracking-route")) {
    map.addSource("tracking-route", {
      type: "geojson",
      data: emptyRoute()
    });
  }

  if (!map.getLayer("tracking-route-line")) {
    map.addLayer({
      id: "tracking-route-line",
      type: "line",
      source: "tracking-route",
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#163867",
        "line-width": 4,
        "line-opacity": 0.7
      }
    });
  }

  routeSourceReady = true;
}

function updateRoute(points) {
  if (!map) return;

  if (!map.isStyleLoaded()) {
    map.once("load", () => updateRoute(points));
    return;
  }

  ensureRouteLayer();

  const source = map.getSource("tracking-route");
  if (!source) return;

  const safePoints = points.filter(
    (point) =>
      point &&
      Number.isFinite(Number(point.lng)) &&
      Number.isFinite(Number(point.lat))
  );

  if (safePoints.length < 2) {
    source.setData(emptyRoute());
    return;
  }

  source.setData({
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: safePoints.map((point) => [point.lng, point.lat])
    },
    properties: {}
  });
}

function emptyRoute() {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: []
    },
    properties: {}
  };
}

export function updateClientMap({ servicePosition, providerPosition }) {
  if (!map) return;

  if (
    Number.isFinite(Number(servicePosition?.lng)) &&
    Number.isFinite(Number(servicePosition?.lat))
  ) {
    clientMarker = ensureMarker(clientMarker, "#38bdf8");
    clientMarker.setLngLat([servicePosition.lng, servicePosition.lat]).addTo(map);
  } else {
    clientMarker = clearMarker(clientMarker);
  }

  if (
    Number.isFinite(Number(providerPosition?.lng)) &&
    Number.isFinite(Number(providerPosition?.lat))
  ) {
    providerMarker = ensureMarker(providerMarker, "#49dea4");
    providerMarker.setLngLat([providerPosition.lng, providerPosition.lat]).addTo(map);
  } else {
    providerMarker = clearMarker(providerMarker);
  }

  updateRoute([servicePosition, providerPosition]);
  fitToPoints([servicePosition, providerPosition]);
}

export function updateProviderMap({ providerPosition, servicePosition }) {
  if (!map) return;

  if (
    Number.isFinite(Number(providerPosition?.lng)) &&
    Number.isFinite(Number(providerPosition?.lat))
  ) {
    providerMarker = ensureMarker(providerMarker, "#49dea4");
    providerMarker.setLngLat([providerPosition.lng, providerPosition.lat]).addTo(map);
  } else {
    providerMarker = clearMarker(providerMarker);
  }

  if (
    Number.isFinite(Number(servicePosition?.lng)) &&
    Number.isFinite(Number(servicePosition?.lat))
  ) {
    clientMarker = ensureMarker(clientMarker, "#f59e0b");
    clientMarker.setLngLat([servicePosition.lng, servicePosition.lat]).addTo(map);
  } else {
    clientMarker = clearMarker(clientMarker);
  }

  updateRoute([providerPosition, servicePosition]);
  fitToPoints([providerPosition, servicePosition]);
}

export function updateTrackingMarkers({ clientPosition, providerPosition }) {
  updateClientMap({
    servicePosition: clientPosition,
    providerPosition
  });
}
