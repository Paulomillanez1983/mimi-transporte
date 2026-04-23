import { getSupabaseClient } from "./supabase.js";

const GEOCODING_TIMEOUT_MS = 6500;
const CACHE_MAX_SIZE = 100;
const RECENT_PLACES_KEY = "mimi_services_recent_places_v1";

const geocodingCache = new Map();

function normalizarBusqueda(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function setGeocodingCache(key, value) {
  if (!key) return;

  if (geocodingCache.has(key)) {
    geocodingCache.delete(key);
  }

  geocodingCache.set(key, value);

  if (geocodingCache.size > CACHE_MAX_SIZE) {
    const firstKey = geocodingCache.keys().next().value;
    if (firstKey !== undefined) {
      geocodingCache.delete(firstKey);
    }
  }
}

function buildCacheKey(query, bias = null) {
  return [
    normalizarBusqueda(query),
    bias ? `${Number(bias.lat).toFixed(3)},${Number(bias.lng).toFixed(3)}` : "sin_bias"
  ].join("|");
}

function leerRecentServicePlaces() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_PLACES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function guardarRecentServicePlaces(items) {
  try {
    localStorage.setItem(
      RECENT_PLACES_KEY,
      JSON.stringify(Array.isArray(items) ? items.slice(0, 8) : [])
    );
  } catch {
    // noop
  }
}

function pushRecentServicePlace(item) {
  const normalized = normalizarReverseResult(item, item?.source || "recent");
  const displayName = normalized?.display_name || normalized?.direccion;

  if (!displayName) return;

  const recent = leerRecentServicePlaces();
  const key = normalizarBusqueda(displayName);

  const next = recent.filter(
    (entry) =>
      normalizarBusqueda(entry?.display_name || entry?.direccion || "") !== key
  );

  next.unshift(normalized);
  guardarRecentServicePlaces(next);
}

function buscarDireccionFallbackLocalServicio(query) {
  const normalizedQuery = normalizarBusqueda(query);

  if (!normalizedQuery || normalizedQuery.length < 3) {
    return [];
  }

  return leerRecentServicePlaces()
    .filter((item) =>
      normalizarBusqueda(item?.display_name || item?.direccion || "").includes(
        normalizedQuery
      )
    )
    .slice(0, 5);
}

function withTimeout(promise, timeoutMs = GEOCODING_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("GEOCODING_TIMEOUT")), timeoutMs);
    })
  ]);
}

function buildFallbackResponse(query) {
  const fallback = buscarDireccionFallbackLocalServicio(query);

  return {
    resultados: fallback,
    exactMatch: false,
    approximateMatch: fallback.length > 0,
    source: "fallback-local"
  };
}

function normalizarReverseResult(item, source = "reverse") {
  if (!item) return null;

  const displayName =
    item.display_name ||
    item.direccion ||
    item.address_text ||
    item.formatted_address ||
    "";

  const lat = Number(item.lat ?? item.latitude);
  const lng = Number(item.lon ?? item.lng ?? item.longitude);

  if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    display_name: displayName,
    direccion: displayName,
    lat,
    lon: lng,
    lng,
    address: item.address || {},
    source
  };
}

async function reverseGeocodeWithNominatim(lat, lng) {
  const response = await withTimeout(
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&addressdetails=1`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    )
  );

  if (!response.ok) {
    throw new Error("REVERSE_GEOCODING_FAILED");
  }

  const data = await response.json();

  return normalizarReverseResult(data, "nominatim-reverse");
}

export async function buscarDireccionServicio(query, options = {}) {
  const normalizedQuery = String(query || "").trim();

  if (normalizedQuery.length < 2) {
    return {
      resultados: [],
      exactMatch: false,
      approximateMatch: false,
      source: "empty"
    };
  }

  const bias = options?.bias ?? null;
  const cacheKey = buildCacheKey(normalizedQuery, bias);

  if (geocodingCache.has(cacheKey)) {
    return geocodingCache.get(cacheKey);
  }

  try {
    const supabase = getSupabaseClient();

    if (!supabase?.functions?.invoke) {
      const fallback = buildFallbackResponse(normalizedQuery);
      setGeocodingCache(cacheKey, fallback);
      return fallback;
    }

    const { data, error } = await withTimeout(
      supabase.functions.invoke("geocodificar", {
        body: {
          query: normalizedQuery,
          limit: 5,
          client_lat: bias?.lat ?? null,
          client_lng: bias?.lng ?? null,
          vertical: "services"
        }
      })
    );

    if (error || data?.exito === false) {
      const fallback = buildFallbackResponse(normalizedQuery);
      setGeocodingCache(cacheKey, fallback);
      return fallback;
    }

    const resultados = Array.isArray(data?.data)
      ? data.data
          .map((item) => normalizarReverseResult(item, data?.source || "geocodificar"))
          .filter(Boolean)
      : [];

    const payload = {
      resultados,
      exactMatch: Boolean(data?.exact_match),
      approximateMatch: Boolean(data?.approximate_match),
      source: data?.source || "geocodificar"
    };

    setGeocodingCache(cacheKey, payload);
    payload.resultados.forEach(pushRecentServicePlace);

    return payload;
  } catch {
    const fallback = buildFallbackResponse(normalizedQuery);
    setGeocodingCache(cacheKey, fallback);
    return fallback;
  }
}

export async function resolverDireccionActualServicio(lat, lng, options = {}) {
  const safeLat = Number(lat);
  const safeLng = Number(lng);

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    return null;
  }

  try {
    const supabase = getSupabaseClient();

    if (supabase?.functions?.invoke) {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("geocodificar", {
          body: {
            mode: "reverse",
            lat: safeLat,
            lng: safeLng,
            client_lat: options?.bias?.lat ?? null,
            client_lng: options?.bias?.lng ?? null,
            vertical: "services"
          }
        })
      );

      const rawItem = Array.isArray(data?.data)
        ? data.data[0]
        : data?.data ?? data?.result ?? null;

      const normalized =
        !error && data?.exito !== false
          ? normalizarReverseResult(
              rawItem,
              data?.source || "geocodificar-reverse"
            )
          : null;

      if (normalized) {
        pushRecentServicePlace(normalized);
        return normalized;
      }
    }
  } catch {
    // noop
  }

  try {
    const fallback = await reverseGeocodeWithNominatim(safeLat, safeLng);

    if (fallback) {
      pushRecentServicePlace(fallback);
      return fallback;
    }
  } catch {
    // noop
  }

  const fallbackLabel = `Ubicación actual (${safeLat.toFixed(5)}, ${safeLng.toFixed(
    5
  )})`;

  return {
    display_name: fallbackLabel,
    direccion: fallbackLabel,
    lat: safeLat,
    lon: safeLng,
    lng: safeLng,
    address: {},
    source: "coords-fallback"
  };
}

export async function guardarFeedbackGeocodingServicio(rawQuery, item, bias = null) {
  try {
    const supabase = getSupabaseClient();

    if (!supabase?.functions?.invoke) return;

    const normalized = normalizarReverseResult(item, item?.source || "user_selection");

    if (!normalized) return;

    await supabase.functions.invoke("geocodificar", {
      body: {
        mode: "feedback",
        raw_query: rawQuery,
        display_name: normalized.display_name,
        lat: Number(normalized.lat),
        lng: Number(normalized.lng),
        address: normalized.address || {},
        source: "user_selection",
        client_lat: bias?.lat ?? null,
        client_lng: bias?.lng ?? null,
        vertical: "services"
      }
    });
  } catch {
    // noop
  }
}

export function obtenerRecentServicePlaces() {
  return leerRecentServicePlaces().slice(0, 5);
}
