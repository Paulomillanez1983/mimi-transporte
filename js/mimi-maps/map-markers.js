export function createMimiMarkerElement(type = "point", options = {}) {
  const element = document.createElement("div");
  element.className = `mimi-map-marker mimi-map-marker--${type}`;
  element.dataset.markerType = type;

  const label = options.label || "";
  const title = options.title || "";
  if (title) element.title = title;

  const inner = document.createElement("span");
  inner.className = "mimi-map-marker__inner";
  inner.textContent = label;
  element.appendChild(inner);

  if (options.pulse) {
    const pulse = document.createElement("span");
    pulse.className = "mimi-map-marker__pulse";
    element.appendChild(pulse);
  }

  return element;
}

export function createOrMoveMarker({
  map,
  marker,
  position,
  type,
  options = {},
  anchor = "center"
}) {
  if (!map || !window.maplibregl || !position) return marker ?? null;

  const lngLat = [Number(position.lng), Number(position.lat)];

  if (!marker) {
    marker = new window.maplibregl.Marker({
      element: createMimiMarkerElement(type, options),
      anchor
    })
      .setLngLat(lngLat)
      .addTo(map);
    return marker;
  }

  marker.setLngLat(lngLat);
  return marker;
}

export function removeMarker(marker) {
  try {
    marker?.remove?.();
  } catch {
    // noop
  }
  return null;
}
