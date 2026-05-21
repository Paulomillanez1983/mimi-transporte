function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidLatLng(lat, lng) {
  const normalizedLat = numberOrNull(lat);
  const normalizedLng = numberOrNull(lng);
  if (normalizedLat === null || normalizedLng === null) return false;
  if (Math.abs(normalizedLat) > 90 || Math.abs(normalizedLng) > 180) return false;
  if (normalizedLat === 0 && normalizedLng === 0) return false;
  return true;
}

export function buildProviderNavigationUrl({
  lat,
  lng,
  addressText,
  app = "google"
} = {}) {
  const normalizedLat = numberOrNull(lat);
  const normalizedLng = numberOrNull(lng);
  const hasCoordinates = hasValidLatLng(normalizedLat, normalizedLng);
  const cleanAddress = String(addressText ?? "").trim();

  if (String(app).toLowerCase() === "waze") {
    if (!hasCoordinates) return null;
    return `https://waze.com/ul?ll=${encodeURIComponent(`${normalizedLat},${normalizedLng}`)}&navigate=yes`;
  }

  const destination = hasCoordinates
    ? `${normalizedLat},${normalizedLng}`
    : cleanAddress;

  if (!destination) return null;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
