export const MIMI_MAP_DEFAULT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export const MIMI_MAP_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const MIMI_MAP_DEFAULT_CENTER = [-64.1888, -31.4201];

export function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function isValidLngLat(position) {
  const lat = toNumber(position?.lat);
  const lng = toNumber(position?.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function normalizePosition(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const lat = toNumber(source.lat ?? source.latitude ?? source.service_lat ?? source.provider_lat);
  const lng = toNumber(source.lng ?? source.lon ?? source.longitude ?? source.service_lng ?? source.provider_lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { ...source, lat, lng };
}

export function safePositions(positions = []) {
  return positions.map(normalizePosition).filter(isValidLngLat);
}

export function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl", { antialias: false }) ||
          canvas.getContext("experimental-webgl", { antialias: false }))
    );
  } catch {
    return false;
  }
}

export async function waitForMapLibre(timeoutMs = 3500) {
  if (window.maplibregl?.Map) return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    if (window.maplibregl?.Map) return true;
  }

  return false;
}

export function createMimiMap({
  container,
  style = MIMI_MAP_DEFAULT_STYLE,
  center = MIMI_MAP_DEFAULT_CENTER,
  zoom = 12,
  interactive = true,
  attributionControl = false,
  pitch = 0,
  bearing = 0
} = {}) {
  if (!window.maplibregl?.Map || !container) return null;

  const map = new window.maplibregl.Map({
    container,
    style,
    center,
    zoom,
    pitch,
    bearing,
    attributionControl,
    dragRotate: false,
    pitchWithRotate: false,
    renderWorldCopies: false,
    antialias: false,
    preserveDrawingBuffer: false,
    trackResize: true,
    failIfMajorPerformanceCaveat: false
  });

  if (!interactive) {
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();
  }

  return map;
}

export function scheduleMapResize(map, delays = [60, 220, 620]) {
  delays.forEach((delay) => {
    window.setTimeout(() => {
      try {
        map?.resize?.();
      } catch {
        // The map may have been removed during route changes.
      }
    }, delay);
  });
}

export function fitMapToPositions(map, positions = [], options = {}) {
  const safe = safePositions(positions);
  if (!map || !safe.length) return false;

  const isMobile = window.innerWidth <= 768;
  const padding =
    options.padding ??
    (isMobile
      ? { top: 112, right: 28, bottom: 260, left: 28 }
      : { top: 96, right: 96, bottom: 180, left: 96 });

  if (safe.length === 1) {
    map.easeTo({
      center: [safe[0].lng, safe[0].lat],
      zoom: options.singleZoom ?? (isMobile ? 14.4 : 14.8),
      duration: options.duration ?? 500,
      essential: true
    });
    return true;
  }

  const bounds = new window.maplibregl.LngLatBounds();
  safe.forEach((position) => bounds.extend([position.lng, position.lat]));

  map.fitBounds(bounds, {
    padding,
    maxZoom: options.maxZoom ?? 15.8,
    duration: options.duration ?? 650,
    essential: true
  });

  return true;
}

export function mapLoaded(map) {
  return Boolean(map?.loaded?.() || map?.isStyleLoaded?.());
}
