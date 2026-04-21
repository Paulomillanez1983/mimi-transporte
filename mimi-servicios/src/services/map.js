let map;
let providerMarker;
let clientMarker;

export function initMap(containerId, initialCenter, zoom) {
  if (!window.maplibregl) return null;
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
      layers: [{ id: "osm", type: "raster", source: "osm" }]
    },
    center: initialCenter,
    zoom
  });
  map.addControl(new window.maplibregl.NavigationControl(), "top-right");
  return map;
}

function ensureMarker(marker, color) {
  if (marker) return marker;
  const element = document.createElement("div");
  element.style.width = "18px";
  element.style.height = "18px";
  element.style.borderRadius = "50%";
  element.style.border = "3px solid white";
  element.style.background = color;
  element.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
  return new window.maplibregl.Marker({ element });
}

export function updateTrackingMarkers({ clientPosition, providerPosition }) {
  if (!map) return;

  if (clientPosition?.lng && clientPosition?.lat) {
    clientMarker = ensureMarker(clientMarker, "#38bdf8");
    clientMarker.setLngLat([clientPosition.lng, clientPosition.lat]).addTo(map);
  }

  if (providerPosition?.lng && providerPosition?.lat) {
    providerMarker = ensureMarker(providerMarker, "#49dea4");
    providerMarker.setLngLat([providerPosition.lng, providerPosition.lat]).addTo(map);
  }

  const points = [clientPosition, providerPosition].filter(Boolean);
  if (points.length === 2) {
    const bounds = new window.maplibregl.LngLatBounds();
    points.forEach((point) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 64, maxZoom: 15 });
  } else if (points.length === 1) {
    map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 14 });
  }
}
