
const geocodingCache = new Map();

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
function getGeocodingClientBias() {
  const lat =
    Number(state?.currentLocation?.lat) ||
    Number(state?.miUbicacion?.lat) ||
    Number(state?.clienteUbicacion?.lat) ||
    null;

  const lng =
    Number(state?.currentLocation?.lng) ||
    Number(state?.miUbicacion?.lng) ||
    Number(state?.clienteUbicacion?.lng) ||
    null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function buildGeocodingCacheKey(query) {
  const bias = getGeocodingClientBias();

  return [
    normalizarBusqueda(query),
    bias ? `${bias.lat.toFixed(3)},${bias.lng.toFixed(3)}` : 'sin_bias'
  ].join('|');
}

function leerRecentPlaces() {
  try {
    const raw = JSON.parse(localStorage.getItem('mimi_recent_places_v1') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function guardarRecentPlaces(items) {
  try {
    localStorage.setItem(
      'mimi_recent_places_v1',
      JSON.stringify(Array.isArray(items) ? items.slice(0, 8) : [])
    );
  } catch (_) {}
}
function inferirAliasLugar(item) {
  const text = normalizarBusqueda(
    item?.display_name || item?.direccion || item?.direccionCorta || ''
  );

  if (!text) return 'Reciente';
  if (text.includes('casa')) return 'Casa';
  if (text.includes('hogar')) return 'Casa';
  if (text.includes('colegio') || text.includes('escuela') || text.includes('instituto')) return 'Colegio';
  if (text.includes('trabajo') || text.includes('oficina')) return 'Trabajo';
  if (text.includes('hospital') || text.includes('clinica') || text.includes('sanatorio')) return 'Salud';

  return 'Reciente';
}

function obtenerSugerenciasRecientes() {
  return leerRecentPlaces()
    .filter((item) => item && (item.display_name || item.direccion))
    .slice(0, 5)
    .map((item) => ({
      ...item,
      suggested_alias: inferirAliasLugar(item)
    }));
}
function pushRecentPlace(item) {
  if (!item?.display_name) return;

  const recent = leerRecentPlaces();
  const key = normalizarBusqueda(item.display_name);

  const next = recent.filter((x) => normalizarBusqueda(x?.display_name) !== key);
  next.unshift(item);
  guardarRecentPlaces(next);
}

function buscarDireccionFallbackLocal(query) {
  const q = normalizarBusqueda(query);
  if (!q || q.length < 3) return [];

  return leerRecentPlaces()
    .filter((item) => {
      const display = normalizarBusqueda(item?.display_name || '');
      return display.includes(q);
    })
    .slice(0, 5);
}

async function buscarDireccion(query) {
  const normalizedQuery = String(query || '').trim();

  if (normalizedQuery.length < 2) {
    return {
      resultados: [],
      exactMatch: false,
      approximateMatch: false,
      source: 'empty'
    };
  }

  const bias = getGeocodingClientBias();
  const cacheKey = buildGeocodingCacheKey(normalizedQuery);

  if (geocodingCache.has(cacheKey)) {
    const cached = geocodingCache.get(cacheKey) || {};
    return {
      resultados: Array.isArray(cached.resultados) ? cached.resultados : [],
      exactMatch: !!cached.exactMatch,
      approximateMatch: !!cached.approximateMatch,
      source: cached.source || 'memory'
    };
  }

  try {
    const result = await safeFetch(
      `${SUPABASE_URL}/functions/v1/geocodificar`,
      {
        method: 'POST',
        headers: getPublicSupabaseHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          query: normalizedQuery,
          limit: 5,
          client_lat: bias?.lat ?? null,
          client_lng: bias?.lng ?? null
        })
      },
      6500
    );

    if (!result.response) {
      const fallback = buscarDireccionFallbackLocal(normalizedQuery);
      return {
        resultados: fallback,
        exactMatch: false,
        approximateMatch: fallback.length > 0,
        source: 'fallback-local'
      };
    }

    const json = await safeReadJson(result.response);

    if (!result.response.ok) {
      console.warn(
        '⚠️ HTTP geocodificación:',
        json?.message || json?.error || json?.raw || result.response.status
      );

      const fallback = buscarDireccionFallbackLocal(normalizedQuery);
      return {
        resultados: fallback,
        exactMatch: false,
        approximateMatch: fallback.length > 0,
        source: 'fallback-local'
      };
    }

    if (!json || !json.exito) {
      console.warn('⚠️ Error geocodificación:', json?.error || 'Respuesta inválida');

      const fallback = buscarDireccionFallbackLocal(normalizedQuery);
      return {
        resultados: fallback,
        exactMatch: false,
        approximateMatch: fallback.length > 0,
        source: 'fallback-local'
      };
    }

    const resultados = Array.isArray(json.data) ? json.data : [];
    const payload = {
      resultados,
      exactMatch: !!json.exact_match,
      approximateMatch: !!json.approximate_match,
      source: json.source || 'nominatim'
    };

    setGeocodingCache(cacheKey, payload);

    if (resultados.length) {
      resultados.forEach(pushRecentPlace);
    }

    return payload;
  } catch (err) {
    console.error('❌ Error buscando dirección:', err);

    const fallback = buscarDireccionFallbackLocal(normalizedQuery);
    return {
      resultados: fallback,
      exactMatch: false,
      approximateMatch: fallback.length > 0,
      source: 'fallback-local'
    };
  }
}
  async function guardarFeedbackGeocoding(rawQuery, item) {
  try {
    if (!rawQuery || !item) return;

    const bias = getGeocodingClientBias();

    await safeFetch(
      `${SUPABASE_URL}/functions/v1/geocodificar`,
      {
        method: 'POST',
        headers: getPublicSupabaseHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          mode: 'feedback',
          raw_query: rawQuery,
          display_name: item.display_name || item.direccion || '',
          lat: Number(item.lat),
          lng: Number(item.lon ?? item.lng),
          address: item.address || {},
          source: 'user_selection',
          client_lat: bias?.lat ?? null,
          client_lng: bias?.lng ?? null
        })
      },
      5000
    );
  } catch (err) {
    console.warn('[geocoding-feedback] no se pudo guardar feedback:', err);
  }
}
