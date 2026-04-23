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
  const displayName = item?.display_name || item?.direccion;
  if (!displayName) return;

  const recent = leerRecentServicePlaces();
  const key = normalizarBusqueda(displayName);
  const next = recent.filter(
    (entry) => normalizarBusqueda(entry?.display_name || entry?.direccion || "") !== key
  );

  next.unshift(item);
  guardarRecentServicePlaces(next);
}

function buscarDireccionFallbackLocalServicio(query) {
  const normalizedQuery = normalizarBusqueda(query);
  if (!normalizedQuery || normalizedQuery.length < 3) {
    return [];
  }

  return leerRecentServicePlaces()
    .filter((item) =>
      normalizarBusqueda(item?.display_name || item?.direccion || "").includes(normalizedQuery)
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
      return buildFallbackResponse(normalizedQuery);
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

    if (error || !data?.exito) {
      return buildFallbackResponse(normalizedQuery);
    }

    const payload = {
      resultados: Array.isArray(data.data) ? data.data : [],
      exactMatch: Boolean(data.exact_match),
      approximateMatch: Boolean(data.approximate_match),
      source: data.source || "geocodificar"
    };

    setGeocodingCache(cacheKey, payload);
    payload.resultados.forEach(pushRecentServicePlace);

    return payload;
  } catch {
    return buildFallbackResponse(normalizedQuery);
  }
}

export async function guardarFeedbackGeocodingServicio(rawQuery, item, bias = null) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase?.functions?.invoke) return;

    await supabase.functions.invoke("geocodificar", {
      body: {
        mode: "feedback",
        raw_query: rawQuery,
        display_name: item?.display_name || item?.direccion || "",
        lat: Number(item?.lat),
        lng: Number(item?.lon ?? item?.lng),
        address: item?.address || {},
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
