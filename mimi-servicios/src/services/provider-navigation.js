export const PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY =
  "mimi_provider_external_navigation_started";

const GOOGLE_DIRECTIONS_URL = "https://www.google.com/maps/dir/";
const WAZE_NAVIGATION_URL = "https://waze.com/ul";
const EXTERNAL_NAVIGATION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const EMPTY_ADDRESS_LABELS = new Set([
  "",
  "pendiente",
  "ubicacion a confirmar",
  "ruta activa en el mapa"
]);

export function normalizeNavigationAddress(addressText) {
  const value = String(addressText ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_ADDRESS_LABELS.has(value.toLowerCase()) ? "" : value;
}

export function isValidNavigationLatLng(position = {}) {
  const lat = Number(position.lat);
  const lng = Number(position.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

export function buildProviderNavigationUrl({
  lat = null,
  lng = null,
  addressText = "",
  app = "google"
} = {}) {
  const targetApp = String(app || "google").trim().toLowerCase();
  const hasDestinationCoordinates = isValidNavigationLatLng({ lat, lng });

  if (targetApp === "waze") {
    if (!hasDestinationCoordinates) return null;
    return `${WAZE_NAVIGATION_URL}?ll=${Number(lat)},${Number(lng)}&navigate=yes`;
  }

  if (hasDestinationCoordinates) {
    return `${GOOGLE_DIRECTIONS_URL}?api=1&destination=${Number(lat)},${Number(lng)}&travelmode=driving`;
  }

  const address = normalizeNavigationAddress(addressText);
  if (!address) return null;

  return `${GOOGLE_DIRECTIONS_URL}?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

function localStorageSafe() {
  try {
    return window?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function markProviderExternalNavigationStarted({
  storage = localStorageSafe(),
  now = Date.now()
} = {}) {
  if (!storage?.setItem) return false;
  storage.setItem(PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY, String(Number(now) || Date.now()));
  return true;
}

export function hasProviderExternalNavigationStarted({
  storage = localStorageSafe(),
  now = Date.now(),
  maxAgeMs = EXTERNAL_NAVIGATION_MAX_AGE_MS
} = {}) {
  if (!storage?.getItem) return false;
  const raw = storage.getItem(PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY);
  if (!raw) return false;

  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return true;
  return Number(now) - startedAt <= maxAgeMs;
}

export function clearProviderExternalNavigationStarted({
  storage = localStorageSafe()
} = {}) {
  if (!storage?.removeItem) return false;
  storage.removeItem(PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY);
  return true;
}
