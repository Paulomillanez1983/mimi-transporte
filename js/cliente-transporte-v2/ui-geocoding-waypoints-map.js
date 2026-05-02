// UI LOADING
// ==========================================
function actualizarUILoading(btn, isLoading, texto) {
  if (!btn) return;

  const loaderText = btn.querySelector('.btn-loader span:last-child');

  isCalculatingQuote = isLoading;
  btn.disabled = isLoading;
  btn.classList.toggle('loading', isLoading);
  btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');

  if (loaderText && texto) {
    loaderText.textContent = texto;
  }

  document.querySelectorAll('.route-input, .btn-input-action, .btn-add-stop').forEach((input) => {
    input.disabled = isLoading;

    if (input.classList.contains('btn-add-stop')) {
      input.style.opacity = isLoading ? '0.6' : '1';
      input.style.pointerEvents = isLoading ? 'none' : 'auto';
    }
  });
}

function setLoadingCotizacion(isLoading, texto = 'Cotizando...') {
  const btn = document.getElementById('btnCalcular');

  if (!isLoading && btn?.classList.contains('loading')) {
    setTimeout(() => actualizarUILoading(btn, false, texto), CONFIG.TIMEOUTS.UI_FEEDBACK);
    return;
  }

  actualizarUILoading(btn, isLoading, texto);
}

// ==========================================
// GEOCODIFICACIÓN / FORMATEO
// ==========================================
async function resolverPuntoDesdeTexto(texto) {
  if (!texto || texto.trim().length < 3) return null;

  try {
    const geo = await buscarDireccion(texto.trim());
    const resultados = Array.isArray(geo?.resultados) ? geo.resultados : [];

    if (resultados.length === 0) return null;

    const mejor = resultados[0];
    if (!mejor?.lat || !mejor?.lon) return null;

    return {
      direccion: mejor.display_name,
      direccionCorta: formatearDireccionCorta(mejor),
      direccionSecundaria: formatearDireccionSecundaria(mejor),
      lat: parseFloat(mejor.lat),
      lng: parseFloat(mejor.lon),
      raw: mejor
    };
  } catch (error) {
    console.error('❌ Error resolviendo punto desde texto:', texto, error);
    return null;
  }
}

function formatearDireccionCorta(r) {
  if (!r || !r.display_name) return 'Dirección';

  const addr = r.address || {};
  const named = r.namedetails || {};

  const nombreLugar =
    named.name ||
    addr.amenity ||
    addr.shop ||
    addr.tourism ||
    addr.building ||
    addr.school ||
    '';

  const calle = addr.road || addr.pedestrian || addr.footway || '';
  const numero = addr.house_number || '';
  const barrio =
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.quarter ||
    '';

  if (nombreLugar && calle) {
    return `${nombreLugar} · ${calle}${numero ? ' ' + numero : ''}`;
  }

  if (calle) {
    return `${calle}${numero ? ' ' + numero : ''}${barrio ? ', ' + barrio : ''}`;
  }

  const partes = r.display_name.split(',').map((p) => p.trim()).filter(Boolean);
  return partes.slice(0, 2).join(', ');
}

function formatearDireccionSecundaria(r) {
  if (!r) return '';

  const addr = r.address || {};
  const barrio =
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.quarter ||
    '';

  const ciudad =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    'Córdoba';

  const provincia = addr.state || 'Córdoba';

  return [barrio, ciudad, provincia]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' · ');
}

// ==========================================
// AUTOCOMPLETE
// ==========================================
function setupAutocomplete(inputId, sugerenciasId, onSelect) {
  const input = document.getElementById(inputId);
  const contenedor = document.getElementById(sugerenciasId);

  if (!input || !contenedor) return;

  let timer = null;
  let requestId = 0;
  let suppressNextInputSearch = false;

  input.addEventListener('input', () => {
    if (suppressNextInputSearch) {
      suppressNextInputSearch = false;
      return;
    }

    clearTimeout(timer);
    const texto = input.value.trim();

    onSelect(null);

if (texto.length < 2) {
  const recientes = obtenerSugerenciasRecientes();
  if (recientes.length) {
    mostrarSugerencias(
      contenedor,
      recientes,
      (r) => {
        const direccionCorta = formatearDireccionCorta(r);
        const direccionSecundaria = formatearDireccionSecundaria(r);

        suppressNextInputSearch = true;
        input.value = direccionCorta;

onSelect({
  id: `stop_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  direccion: r.display_name,
  direccionCorta,
  direccionSecundaria,
  lat: parseFloat(r.lat),
  lng: parseFloat(r.lon ?? r.lng),
  raw: r
});

setTimeout(() => {
  try {
    dibujarRutaEnMapa();
  } catch (err) {
    console.warn('[AUTO] error refrescando mapa', err);
  }
}, 0);

        guardarFeedbackGeocoding?.(texto, r).catch?.(() => {});
        pushRecentPlace?.(r);
        input.setAttribute(
          'title',
          `${direccionCorta}${direccionSecundaria ? ' - ' + direccionSecundaria : ''}`
        );

        hideSuggestions(contenedor);
        input.setAttribute('aria-expanded', 'false');
      },
      {
        source: 'history',
        query: texto
      }
    );
    input.setAttribute('aria-expanded', 'true');
  } else {
    hideSuggestions(contenedor);
    contenedor.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  }
  return;
}
    const currentRequest = ++requestId;

    timer = setTimeout(async () => {
      contenedor.innerHTML = `
        <div class="sugerencia-item sugerencia-loading" aria-disabled="true">
          <div class="sugerencia-icon" aria-hidden="true">⏳</div>
          <div class="sugerencia-text">
            <div class="sugerencia-main">Buscando direcciones...</div>
          </div>
        </div>
      `;
      showSuggestions(contenedor);
      input.setAttribute('aria-expanded', 'true');

      const respuesta = await buscarDireccion(texto);

      if (currentRequest !== requestId) return;
      if (document.activeElement !== input) return;

      const resultados = Array.isArray(respuesta?.resultados)
        ? respuesta.resultados
        : [];

      mostrarSugerencias(
        contenedor,
        resultados,
        (r) => {
          const direccionCorta = formatearDireccionCorta(r);
          const direccionSecundaria = formatearDireccionSecundaria(r);

          suppressNextInputSearch = true;
          input.value = direccionCorta;


           onSelect({
            id: `stop_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            direccion: r.display_name,
            direccionCorta,
            direccionSecundaria,
            lat: parseFloat(r.lat),
           lng: parseFloat(r.lon ?? r.lng),
           raw: r
          });
 
        setTimeout(() => {
          try {
            dibujarRutaEnMapa();
             } catch (err) {
             console.warn('[AUTO] error refrescando mapa', err);
            }
           }, 0);

           guardarFeedbackGeocoding?.(texto, r).catch?.(() => {});
           pushRecentPlace?.(r);

           input.setAttribute(
          'title',
          `${direccionCorta}${direccionSecundaria ? ' - ' + direccionSecundaria : ''}`
         );

          hideSuggestions(contenedor);
          input.setAttribute('aria-expanded', 'false');
        },
        {
          exactMatch: !!respuesta?.exactMatch,
          approximateMatch: !!respuesta?.approximateMatch,
          source: respuesta?.source || 'unknown',
          query: texto
        }
      );

      if (!resultados.length) {
        contenedor.innerHTML = `
          <div class="sugerencia-item sugerencia-empty" aria-disabled="true">
            <div class="sugerencia-icon" aria-hidden="true">⚠️</div>
            <div class="sugerencia-text">
              <div class="sugerencia-main">No encontramos coincidencias</div>
              <div class="sugerencia-secondary">Probá con calle y altura</div>
            </div>
          </div>
        `;
        showSuggestions(contenedor);
        input.setAttribute('aria-expanded', 'true');
      }
    }, 220);
  });

  input.addEventListener('focus', () => {
    const texto = input.value.trim();
        if (texto.length >= 2 && !contenedor.innerHTML.trim()) {
         input.dispatchEvent(new Event('input'));
       }
   });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!contenedor.contains(active) && active !== input) {
        hideSuggestions(contenedor);
        input.setAttribute('aria-expanded', 'false');
      }
    }, 200);
  });
}

function mostrarSugerencias(contenedor, resultados, callback, meta = {}) {
  contenedor.innerHTML = '';

  if (!Array.isArray(resultados) || resultados.length === 0) {
    hideSuggestions(contenedor);
    return;
  }

  resultados.forEach((r, index) => {
    const item = document.createElement('div');
    item.className = 'sugerencia-item';
    item.setAttribute('role', 'option');
    item.tabIndex = 0;

    const direccionPrincipal = formatearDireccionCorta(r);
    const direccionSecundaria = formatearDireccionSecundaria(r);

let badge = '';

if (meta.source === 'history' && r?.suggested_alias) {
  badge = `<span class="sugerencia-badge">${r.suggested_alias}</span>`;
} else if (meta.approximateMatch && index === 0) {
  badge = `<span class="sugerencia-badge">Aprox.</span>`;
}
    item.innerHTML = `
      <div class="sugerencia-icon" aria-hidden="true">📍</div>
      <div class="sugerencia-text">
        <div class="sugerencia-main">
          ${direccionPrincipal}
          ${badge}
        </div>
        ${
          direccionSecundaria
            ? `<div class="sugerencia-secondary">${direccionSecundaria}</div>`
            : ''
        }
      </div>
    `;

    const selectItem = () => callback(r);

    item.addEventListener('click', selectItem);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectItem();
      }
    });

    contenedor.appendChild(item);
  });

  if (meta.approximateMatch && resultados.length > 0) {
    const aviso = document.createElement('div');
    aviso.className = 'sugerencia-help';
    aviso.innerHTML = 'Dirección aproximada. Verificá calle y altura.';
    contenedor.appendChild(aviso);
  }

  if (meta.source === 'fallback-local' && resultados.length > 0) {
    const avisoFallback = document.createElement('div');
    avisoFallback.className = 'sugerencia-help';
    avisoFallback.innerHTML = 'Mostrando sugerencias guardadas localmente.';
    contenedor.appendChild(avisoFallback);
  }
if (meta.source === 'history' && resultados.length > 0) {
  const avisoHistory = document.createElement('div');
  avisoHistory.className = 'sugerencia-help';
  avisoHistory.innerHTML = 'Tus lugares recientes.';
  contenedor.appendChild(avisoHistory);
}
  showSuggestions(contenedor);
}
// ==========================================
// WAYPOINTS
// ==========================================
function agregarWaypoint() {
  if (state.waypoints.length >= CONFIG.MAX_WAYPOINTS) {
    notif.show('Límite alcanzado', `Máximo ${CONFIG.MAX_WAYPOINTS} paradas permitidas`, 'warning');
    return;
  }

  waypointCounter++;
  const waypointId = `waypoint-${waypointCounter}`;
  const numeroParada = state.waypoints.length + 1;

  const container = document.getElementById('waypointsContainer');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'route-input-group';
  div.id = `group-${waypointId}`;
  div.innerHTML = `
    <div class="route-input-wrapper">
      <span class="route-input-icon" aria-hidden="true">📍</span>
      <input
        type="text"
        id="${waypointId}"
        class="route-input waypoint-input"
        placeholder="Parada ${numeroParada}"
        autocomplete="off"
        autocapitalize="words"
        autocorrect="off"
        spellcheck="false"
        inputmode="search"
        enterkeyhint="search"
        aria-label="Parada ${numeroParada}"
      >
      <div class="route-input-actions">
        <button
          class="btn-input-action delete"
          type="button"
          title="Eliminar"
          aria-label="Eliminar parada ${numeroParada}"
          data-waypoint-id="${waypointId}"
        >✕</button>
      </div>
    </div>
    <div id="sugerencias-${waypointId}" class="sugerencias" role="listbox" aria-label="Sugerencias de parada"></div>
  `;

  container.appendChild(div);

  state.waypoints.push({
    id: waypointId,
    data: null
  });

  const deleteBtn = div.querySelector(`[data-waypoint-id="${waypointId}"]`);
  deleteBtn?.addEventListener('click', () => eliminarWaypoint(waypointId));

  setupAutocomplete(waypointId, `sugerencias-${waypointId}`, (data) => {
    const wp = state.waypoints.find((w) => w.id === waypointId);
    if (wp) wp.data = data;
  });

  actualizarTimeline();
  renumerarWaypoints();
  setTimeout(() => {
  try {
    dibujarRutaEnMapa();
  } catch (_) {}
}, 0);

  setTimeout(() => {
    document.getElementById(waypointId)?.focus();
  }, 80);
}

function eliminarWaypoint(id) {
  const group = document.getElementById(`group-${id}`);
  if (group) group.remove();

  state.waypoints = state.waypoints.filter((w) => w.id !== id);

  actualizarTimeline();
  renumerarWaypoints();
  setTimeout(() => {
  try {
    dibujarRutaEnMapa();
  } catch (_) {}
}, 0);
}

function renumerarWaypoints() {
  const inputs = document.querySelectorAll('#waypointsContainer .waypoint-input');
  inputs.forEach((input, index) => {
    input.placeholder = `Parada ${index + 1}`;
    input.setAttribute('aria-label', `Parada ${index + 1}`);
  });
}

function actualizarTimeline() {
  const timeline = document.getElementById('routeTimeline');
  if (!timeline) return;

  const cantidadParadas = state.waypoints.length;
  let dots = `<div class="timeline-dot origin"></div>`;

  for (let i = 0; i < cantidadParadas; i++) {
    const topPercent = ((i + 1) / (cantidadParadas + 1)) * 100;
    dots += `<div class="timeline-dot waypoint" style="top:${topPercent}%; transform: translateY(-50%);"></div>`;
  }

  dots += `<div class="timeline-dot destination"></div>`;
  timeline.innerHTML = dots;
}
let routeRequestId = 0;
async function resolverWaypointsPendientes() {
  const waypointInputs = [...document.querySelectorAll('.waypoint-input')];
  const errores = [];

  for (const input of waypointInputs) {
    const texto = input.value.trim();
    const wp = state.waypoints.find((w) => w.id === input.id);

    if (!texto) {
      if (wp) wp.data = null;
      input.removeAttribute('title');
      continue;
    }

    const textoActualNormalizado = normalizarTextoDireccion(texto);
    const textoGuardadoNormalizado = normalizarTextoDireccion(
      wp?.data?.direccionCorta || wp?.data?.direccion || ''
    );

    const necesitaResolver =
      !wp?.data || textoActualNormalizado !== textoGuardadoNormalizado;

    if (!necesitaResolver) continue;

    const resuelto = await resolverPuntoDesdeTexto(texto);

    if (!resuelto) {
      if (wp) wp.data = null;
      input.removeAttribute('title');
      errores.push(texto);
      continue;
    }

    const dataNormalizada = {
      id: wp?.data?.id || `stop_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      direccion: resuelto.direccion,
      direccionCorta: resuelto.direccionCorta,
      direccionSecundaria: resuelto.direccionSecundaria,
      lat: Number(resuelto.lat),
      lng: Number(resuelto.lng),
      raw: resuelto.raw || null
    };

    if (wp) {
      wp.data = dataNormalizada;
    }

    input.value = dataNormalizada.direccionCorta;
    input.setAttribute('title', construirTooltip(dataNormalizada));
  }

setTimeout(() => {
  try {
    dibujarRutaEnMapa();
  } catch (_) {}
}, 0);

return errores;
}

// ==========================================
// RUTA / PUNTOS
// ==========================================
function sonMismoPunto(a, b) {
  if (!a || !b) return false;

  const latA = Number(a.lat);
  const lngA = Number(a.lng);
  const latB = Number(b.lat);
  const lngB = Number(b.lng);

  if (
    Number.isFinite(latA) &&
    Number.isFinite(lngA) &&
    Number.isFinite(latB) &&
    Number.isFinite(lngB)
  ) {
    return Math.abs(latA - latB) < 0.00005 &&
           Math.abs(lngA - lngB) < 0.00005;
  }

  const dirA = normalizarTextoDireccion(a.direccionCorta || a.direccion || '');
  const dirB = normalizarTextoDireccion(b.direccionCorta || b.direccion || '');
  return !!dirA && !!dirB && dirA === dirB;
}

function obtenerPuntosOrdenados() {
  const origen = state.origen;
  const destinoPrincipal = state.destino;

  if (!origen || !destinoPrincipal) return [];

  const waypointsValidos = (state.waypoints || [])
    .filter((w) =>
      w &&
      w.data &&
      Number.isFinite(Number(w.data.lat)) &&
      Number.isFinite(Number(w.data.lng))
    )
    .map((w) => w.data);

  const destinosAdicionales = [];
  let retornoFinal = null;

  for (const wp of waypointsValidos) {
    if (!wp || !coordenadasValidas(wp.lat, wp.lng)) continue;

    // Si coincide con origen, lo tratamos como retorno final
    if (sonMismoPunto(wp, origen)) {
      retornoFinal = wp;
      continue;
    }

    // Si coincide con el destino principal, no duplicar
    if (sonMismoPunto(wp, destinoPrincipal)) continue;

    // Evitar duplicados entre destinos adicionales
    if (destinosAdicionales.some((x) => sonMismoPunto(x, wp))) continue;

    destinosAdicionales.push(wp);
  }

  // NUEVA LÓGICA:
  // origen -> destino principal -> destinos adicionales
  const puntos = [origen, destinoPrincipal, ...destinosAdicionales];

  if (retornoFinal) {
    puntos.push({
      ...retornoFinal,
      id: retornoFinal.id || `stop_tmp_return_${Date.now()}`
    });
  }

  return puntos.filter((p) => p && coordenadasValidas(p.lat, p.lng));
}  
function limpiarPuntos(puntos) {
  if (!Array.isArray(puntos)) return [];

  const validos = puntos.filter((p) =>
    p &&
    coordenadasValidas(p.lat, p.lng)
  );

  if (validos.length <= 1) return validos;

  const resultado = [];

  for (const p of validos) {
    const anterior = resultado[resultado.length - 1];

    // solo elimina duplicados consecutivos
    // NO elimina A -> B -> A
    if (anterior && sonMismoPunto(anterior, p)) continue;

    resultado.push(p);
  }

  return resultado;
}  
  function validarPuntosRuta(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) {
    return 'Ruta incompleta';
  }

  const intermedios = puntos.slice(1, -1);

  for (let i = 0; i < intermedios.length; i++) {
    for (let j = i + 1; j < intermedios.length; j++) {
      if (sonMismoPunto(intermedios[i], intermedios[j])) {
        return `La parada ${i + 1} y la parada ${j + 1} son la misma ubicación`;
      }
    }
  }

  return null;
}

function detectarRetornoAlOrigenConPuntos(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) return false;
  return sonMismoPunto(puntos[0], puntos[puntos.length - 1]);
}

function detectarRetornoAlOrigenFrontend() {
  const puntos = obtenerPuntosOrdenados();
  if (!Array.isArray(puntos) || puntos.length < 2) return false;

  const origen = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  const distancia = turf.distance(
    [Number(origen.lng), Number(origen.lat)],
    [Number(ultimo.lng), Number(ultimo.lat)],
    { units: 'kilometers' }
  );

  if (distancia <= 0.08) return true;

  const intermedios = puntos.slice(1, -1);
  return intermedios.some((p) => {
    const d = turf.distance(
      [Number(origen.lng), Number(origen.lat)],
      [Number(p.lng), Number(p.lat)],
      { units: 'kilometers' }
    );
    return d <= 0.08;
  });
}

function construirResumenRuta() {
  return construirResumenRutaConPuntos(obtenerPuntosOrdenados());
}

function construirResumenRutaConPuntos(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) return 'Ruta incompleta';

  const nombres = puntos.map((p, index) => {
    if (index === 0) return p.direccionCorta || 'Origen';
    if (index === puntos.length - 1) return p.direccionCorta || 'Destino';
    return p.direccionCorta || `Parada ${index}`;
  });

  const resumen = nombres.join(' → ');
  return detectarRetornoAlOrigenConPuntos(puntos) ? `${resumen} ↺` : resumen;
}

function construirPayloadWaypointsIntermedios() {
  const puntos = obtenerPuntosOrdenados();
  if (puntos.length <= 2) return [];

  return puntos.slice(1, -1).map((p, index) => ({
    orden: index + 1,
    direccion: p.direccionCorta || p.direccion || `Parada ${index + 1}`,
    direccion_completa: p.direccion || p.direccionCorta || `Parada ${index + 1}`,
    lat: Number(p.lat),
    lng: Number(p.lng)
  }));
}

function calcularEstimacionLocal(puntos) {
  const puntosValidos = puntos.filter((p) => p && coordenadasValidas(p.lat, p.lng));
  if (puntosValidos.length < 2) {
    throw new Error('No hay suficientes coordenadas válidas');
  }

  let distancia = 0;
  let duracion = 0;
  const coords = puntosValidos.map((p) => [Number(p.lng), Number(p.lat)]);

  for (let i = 0; i < puntosValidos.length - 1; i++) {
    const from = [Number(puntosValidos[i].lng), Number(puntosValidos[i].lat)];
    const to = [Number(puntosValidos[i + 1].lng), Number(puntosValidos[i + 1].lat)];
    const kmTramo = turf.distance(from, to, { units: 'kilometers' });

    distancia += kmTramo;
    duracion += (kmTramo / 28) * 60;
  }

  return {
    distanciaKm: numeroSeguro(distancia.toFixed(1), 0),
    duracionMin: Math.max(1, Math.round(duracion)),
    coords
  };
}
function limpiarPuntosRuta(puntos) {
  if (!Array.isArray(puntos)) return [];

  const validos = puntos.filter((p) =>
    p &&
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng))
  );

  if (validos.length <= 1) return validos;

  const resultado = [];

  for (const p of validos) {
    const anterior = resultado[resultado.length - 1];

    // Solo elimina duplicados consecutivos exactos
    if (anterior && sonMismoPunto(anterior, p)) continue;

    resultado.push(p);
  }

  return resultado;
}
  
  function construirPayloadOptimizado(puntos, estimacionLocal = null) {
  if (!Array.isArray(puntos) || puntos.length < 2) return null;

  const puntosLimpios = limpiarPuntosRuta(puntos);
  if (puntosLimpios.length < 2) return null;

  const origen = puntosLimpios[0];
  const destino = puntosLimpios[puntosLimpios.length - 1];
  const retornoAlOrigen = detectarRetornoAlOrigenConPuntos(puntosLimpios);

  const distanciaKm = Number(estimacionLocal?.distanciaKm || 0);
  const duracionMin = Number(estimacionLocal?.duracionMin || 0);

  const puntosRuta = puntosLimpios.map((p, index) => ({
    id: p.id || `stop_${index + 1}`,
    orden: index + 1,
    rol: index === 0 ? 'pickup' : index === puntosLimpios.length - 1 ? 'dropoff' : 'stop',
    tipo: index === 0 ? 'origen' : index === puntosLimpios.length - 1 ? 'destino' : 'parada',
    direccion: p.direccionCorta || p.direccion || `Punto ${index + 1}`,
    direccion_completa: p.direccion || p.direccionCorta || `Punto ${index + 1}`,
    lat: Number(p.lat),
    lng: Number(p.lng)
  }));

  const paradas = puntosRuta
    .filter((p) => p.rol === 'stop')
    .map((p) => ({
      id: p.id,
      orden: p.orden,
      rol: p.rol,
      direccion: p.direccion,
      direccion_completa: p.direccion_completa,
      lat: p.lat,
      lng: p.lng
    }));

  return {
    servicio: retornoAlOrigen ? 'IDA_Y_VUELTA_ESCOLAR' : 'IDA_ESCOLAR',

    origen: origen.direccion,
    origen_corto: origen.direccionCorta || origen.direccion,
    origen_lat: Number(origen.lat),
    origen_lng: Number(origen.lng),

    destino: destino.direccion,
    destino_corto: destino.direccionCorta || destino.direccion,
    destino_lat: Number(destino.lat),
    destino_lng: Number(destino.lng),

    distancia_km: distanciaKm,
    duracion_min: duracionMin,
    distancia_km_total: distanciaKm,
    duracion_min_total: duracionMin,

    paradas,
    waypoints: paradas,
    stops: puntosRuta,
    puntos_ruta: puntosRuta,

    resumen_ruta_front: construirResumenRutaConPuntos(puntosLimpios),
    segmentos_totales_front: Math.max(1, puntosLimpios.length - 1),
    retorno_al_origen_front: retornoAlOrigen,
    cantidad_paradas_front: paradas.length,
    ruta_calculada_completa: true,
    cotizacion_multitramo: puntosLimpios.length > 2,
    fechaHora: new Date().toISOString(),
    espera_min: 0,
    factor_zona: 1
  };
}

async function dibujarRutaChoferHastaCliente(origenChofer, destinoCliente) {
  let coords = null;

  try {
    if (!window.mapaCliente || !window.mapReady) return;
    if (!origenChofer || !destinoCliente) return;
    if (
      typeof window.mapaCliente.isStyleLoaded === 'function' &&
      !window.mapaCliente.isStyleLoaded()
    ) {
      return;
    }

    const choferLat = Number(origenChofer.lat);
    const choferLng = Number(origenChofer.lng);
    const clienteLat = Number(destinoCliente.lat);
    const clienteLng = Number(destinoCliente.lng);

    if (
      !coordenadasValidas(choferLat, choferLng) ||
      !coordenadasValidas(clienteLat, clienteLng)
    ) {
      return;
    }

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${choferLng},${choferLat};${clienteLng},${clienteLat}` +
      `?overview=full&geometries=geojson&steps=false`;

    const currentRequest = ++routeRequestId;
    const resp = await fetch(url);

    if (currentRequest !== routeRequestId) return;

    if (!resp.ok) {
      throw new Error(`OSRM_HTTP_${resp.status}`);
    }

    const json = await resp.json().catch(() => null);

    coords = json?.routes?.[0]?.geometry?.coordinates || null;
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error('OSRM_SIN_GEOMETRIA');
    }

    coords = coords
      .map((c) => [Number(c?.[0]), Number(c?.[1])])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    if (coords.length < 2) {
      throw new Error('GEOMETRIA_INVALIDA');
    }

    const exactStart = [choferLng, choferLat];
    const exactEnd = [clienteLng, clienteLat];

    const almostEqual = (a, b, epsilon = 0.00001) => Math.abs(a - b) <= epsilon;

    const first = coords[0];
    const last = coords[coords.length - 1];

    if (
      !almostEqual(first[0], exactStart[0]) ||
      !almostEqual(first[1], exactStart[1])
    ) {
      coords.unshift(exactStart);
    }

    if (
      !almostEqual(last[0], exactEnd[0]) ||
      !almostEqual(last[1], exactEnd[1])
    ) {
      coords.push(exactEnd);
    }

    const sourceId = 'driver-to-client-route';
    const lineLayerId = 'driver-to-client-route-line';

    if (window.mapaCliente.getLayer(lineLayerId)) {
      window.mapaCliente.removeLayer(lineLayerId);
    }

    if (window.mapaCliente.getSource(sourceId)) {
      window.mapaCliente.removeSource(sourceId);
    }

    window.mapaCliente.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords
        }
      }
    });

    window.mapaCliente.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#111111',
        'line-width': 2.6,
        'line-opacity': 0.96
      }
    });

    // Guardar la ruta real actual para el resto del flujo
    state.routeData = {
      ...(state.routeData || {}),
      geometry: {
        type: 'LineString',
        coordinates: coords
      },
      fallback: false,
      updatedAt: new Date().toISOString()
    };

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );

    window.mapaCliente.fitBounds(bounds, {
      padding: { top: 22, bottom: 22, left: 22, right: 22 },
      duration: 600,
      maxZoom: 16.8
    });

    setTimeout(() => {
      try {
        window.mapaCliente?.resize?.();
      } catch (_) {}
    }, 80);

  } catch (err) {
    console.warn('[mapa] no se pudo dibujar ruta chofer→cliente:', err);

    try {
      const choferLat = Number(origenChofer?.lat);
      const choferLng = Number(origenChofer?.lng);
      const clienteLat = Number(destinoCliente?.lat);
      const clienteLng = Number(destinoCliente?.lng);

      if (
        !coordenadasValidas(choferLat, choferLng) ||
        !coordenadasValidas(clienteLat, clienteLng)
      ) {
        return;
      }

      const fallbackCoords = [
        [choferLng, choferLat],
        [clienteLng, clienteLat]
      ];

      const sourceId = 'driver-to-client-route';
      const lineLayerId = 'driver-to-client-route-line';

      if (window.mapaCliente?.getLayer?.(lineLayerId)) {
        window.mapaCliente.removeLayer(lineLayerId);
      }

      if (window.mapaCliente?.getSource?.(sourceId)) {
        window.mapaCliente.removeSource(sourceId);
      }

      window.mapaCliente.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: fallbackCoords
          }
        }
      });

      window.mapaCliente.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#111111',
          'line-width': 2.2,
          'line-opacity': 0.72
        }
      });

      state.routeData = {
        ...(state.routeData || {}),
        geometry: {
          type: 'LineString',
          coordinates: fallbackCoords
        },
        fallback: true,
        updatedAt: new Date().toISOString()
      };
    } catch (fallbackErr) {
      console.warn('[mapa] también falló fallback chofer→cliente:', fallbackErr);
    }
  }
}  
function limpiarRutaChoferHastaCliente() {
  try {
    if (!window.mapaCliente) return;

    const sourceId = 'driver-to-client-route';
    const layerIds = [
      'driver-to-client-route-line'
    ];

    layerIds.forEach((layerId) => {
      if (window.mapaCliente.getLayer(layerId)) {
        window.mapaCliente.removeLayer(layerId);
      }
    });

    if (window.mapaCliente.getSource(sourceId)) {
      window.mapaCliente.removeSource(sourceId);
    }
  } catch (err) {
    console.warn('[mapa] no se pudo limpiar ruta chofer→cliente:', err);
  }
}  
// ==========================================
// MAPA - MARKERS
// ==========================================
function crearMarkerElement(label, type) {
  const el = document.createElement('div');
  el.className = `route-marker ${type}`;

  let contenidoInterno = '';

  if (type === 'origin') {
    contenidoInterno = '<span class="route-marker-dot-origin"></span>';
  } else if (type === 'dest') {
    contenidoInterno = '<span class="route-marker-dot-dest"></span>';
  } else {
    contenidoInterno = `<span class="route-marker-stop-label">${label}</span>`;
  }

  el.innerHTML = `
    <div class="route-marker-halo"></div>
    <div class="route-marker-body">
      ${contenidoInterno}
    </div>
  `;

  return el;
}  
  async function initMapa() {
  console.log('[initMapa] entrando', {
    mapaClienteActual: mapaCliente,
    mapReadyActual: mapReady
  });

if (mapaCliente) {
  console.log('[initMapa] ya existe mapaCliente');

  const mapSection = document.getElementById('mapSection');
  if (mapSection) {
    mapSection.style.display = 'block';
    mapSection.style.visibility = 'visible';
  }

  setTimeout(() => {
    try {
      mapaCliente.resize();
    } catch (_) {}
  }, 50);

  return Promise.resolve();
}
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.warn('[initMapa] no existe #map');
    return Promise.resolve();
  }

  const mapSection = document.getElementById('mapSection');
  const wasHidden = mapSection && getComputedStyle(mapSection).display === 'none';

  if (wasHidden) {
    mapSection.style.display = 'block';
    mapSection.style.visibility = 'hidden';
  }

  if (!soportaWebGLMapa()) {
    console.warn('[initMapa] WebGL no disponible; fallback sin mapa interactivo');

    mapReady = false;
    window.mapReady = false;
    mapaCliente = null;
    window.mapaCliente = null;

    mostrarFallbackMapaSinWebGL();

    if (wasHidden) {
      mapSection.style.visibility = 'visible';
    }

    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      const esMobile = window.innerWidth <= 768;
      const temaOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;

      mapaCliente = new maplibregl.Map({
        container: 'map',
        style: temaOscuro
          ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
          : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [-64.19, -31.42],
        zoom: esMobile ? 11.8 : 12.4,
        pitch: esMobile ? 0 : 18,
        bearing: 0,
        antialias: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        renderWorldCopies: false
      });

      window.mapaCliente = mapaCliente;
      window.__mapaClienteDebug = mapaCliente;

      mapaCliente.dragPan.disable();
      mapaCliente.scrollZoom.disable();
      mapaCliente.boxZoom.disable();
      mapaCliente.doubleClickZoom.disable();
      mapaCliente.touchZoomRotate.disable();
      mapaCliente.keyboard.disable();

      window.__userInteractingMap = false;
      window.__userInteractingMapTimer = null;

      const marcarInteraccionUsuarioMapa = () => {
        window.__userInteractingMap = true;

        if (window.__userInteractingMapTimer) {
          clearTimeout(window.__userInteractingMapTimer);
        }

        window.__userInteractingMapTimer = setTimeout(() => {
          window.__userInteractingMap = false;
        }, 8000);
      };

      mapaCliente.on('dragstart', marcarInteraccionUsuarioMapa);
      mapaCliente.on('zoomstart', marcarInteraccionUsuarioMapa);
      mapaCliente.on('rotatestart', marcarInteraccionUsuarioMapa);
      mapaCliente.on('pitchstart', marcarInteraccionUsuarioMapa);

      mapaCliente.on('load', () => {
        console.log('[initMapa] map load OK');

        mapReady = true;
        window.mapReady = true;

        setTimeout(() => {
          try {
            mapaCliente.resize();

            mapaCliente.easeTo({
              center: [-64.19, -31.42],
              zoom: esMobile ? 11.8 : 12.4,
              duration: 700
            });
          } catch (err) {
            console.warn('[initMapa] resize/easeTo error', err);
          }

          if (wasHidden) {
            mapSection.style.visibility = 'visible';
          }

          console.log('[initMapa] listo', {
            mapaClienteExiste: !!mapaCliente,
            mapReady
          });

          resolve();
        }, 180);
      });

mapaCliente.on('error', (e) => {
  console.warn('[initMapa] map error:', e?.error || e);

  if (!mapReady) {
    console.warn('[initMapa] fallback por error de mapa');

    mapReady = false;
    window.mapReady = false;

    try {
      mapaCliente?.remove?.();
    } catch (_) {}

    mapaCliente = null;
    window.mapaCliente = null;

    mostrarFallbackMapaSinWebGL();

    if (wasHidden) {
      mapSection.style.visibility = 'visible';
    }

    resolve(); // 🔥 ESTO ES LO QUE TE FALTABA
  }
});
      setTimeout(() => {
        if (!mapReady && mapaCliente) {
          console.warn('[initMapa] timeout de espera load; continúo igual');

          mapReady = true;
          window.mapReady = true;

          try {
            mapaCliente.resize();
          } catch (err) {
            console.warn('[initMapa] resize post-timeout error', err);
          }

          if (wasHidden) {
            mapSection.style.visibility = 'visible';
          }

          resolve();
        }
      }, 2500);

    } catch (err) {
      console.error('[initMapa] error creando mapa:', err);

      mapReady = false;
      window.mapReady = false;

      try {
        mapaCliente?.remove?.();
      } catch (_) {}

      mapaCliente = null;
      window.mapaCliente = null;

      mostrarFallbackMapaSinWebGL();

      if (wasHidden) {
        mapSection.style.visibility = 'visible';
      }

      resolve();
    }
  });
}
  
function detenerAnimacionRuta() {
  if (routeAnimationFrame) {
    cancelAnimationFrame(routeAnimationFrame);
    routeAnimationFrame = null;
  }
}

function limpiarCapasRutaMapa() {
  if (!mapaCliente || !mapReady) return;

  detenerAnimacionRuta();

  if (window.DriverSim) {
    window.DriverSim.stop(mapaCliente);
  }

  try {
const layers = [
  'route-connectors-line',
  'route-anim',
  'route-line',
  'route-glow',
  'route-casing',
  'route-shadow'
];

const sources = [
  'route-connectors',
  'route',
  'route-source',
  'route-line-source'
];
    layers.forEach((layerId) => {
      if (mapaCliente.getLayer(layerId)) {
        mapaCliente.removeLayer(layerId);
        console.log('[MAP] layer eliminado:', layerId);
      }
    });

    sources.forEach((sourceId) => {
      if (mapaCliente.getSource(sourceId)) {
        mapaCliente.removeSource(sourceId);
        console.log('[MAP] source eliminado:', sourceId);
      }
    });

  } catch (err) {
    console.warn('[MAP] error limpiando capas:', err);
  }
}
function limpiarMarkersMapa() {
  if (Array.isArray(state.markers)) {
    state.markers.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
  }
  state.markers = [];
}

function agregarMarkersRutaDesdeCoords(puntosOverride = null) {
  limpiarMarkersMapa();

  const puntos =
    Array.isArray(puntosOverride) && puntosOverride.length >= 2
      ? puntosOverride
      : obtenerPuntosOrdenados();

  console.log('[MARKERS] puntos usados:', puntos);

  if (!Array.isArray(puntos) || puntos.length < 2 || !mapaCliente) return;

  puntos.forEach((punto, index) => {
    const lat = Number(punto?.lat);
    const lng = Number(punto?.lng);

    if (!coordenadasValidas(lat, lng)) return;

    const rol = String(punto?.rol || '').toLowerCase();
    const isOrigin = rol ? rol === 'pickup' : index === 0;
    const isDest = rol ? rol === 'dropoff' : index === puntos.length - 1;

    const label = isOrigin ? 'A' : isDest ? 'B' : String(index);
    const type = isOrigin ? 'origin' : isDest ? 'dest' : 'waypoint';

    try {
      const marker = new maplibregl.Marker({
        element: crearMarkerElement(label, type),
        anchor: 'center'
      })
        .setLngLat([lng, lat])
        .addTo(mapaCliente);

      state.markers.push(marker);
    } catch (err) {
      console.error('[MARKERS] error creando marker', err);
    }
  });

  console.log('[MARKERS] total renderizados:', state.markers.length);
}

  function ajustarVistaRuta(coords, duration = 800, puntosExtras = []) {
  if (!mapaCliente || !Array.isArray(coords) || coords.length < 2) return;

  try {
    const coordsRuta = coords
      .map((c) => [Number(c?.[0]), Number(c?.[1])])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    const coordsPuntos = Array.isArray(puntosExtras)
      ? puntosExtras
          .map((p) => [Number(p?.lng), Number(p?.lat)])
          .filter((c) =>
            Number.isFinite(c[0]) &&
            Number.isFinite(c[1]) &&
            Math.abs(c[0]) <= 180 &&
            Math.abs(c[1]) <= 90
          )
      : [];

    const coordsLimpias = [...coordsRuta, ...coordsPuntos];

    if (coordsLimpias.length < 2) return;

    const bounds = coordsLimpias.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coordsLimpias[0], coordsLimpias[0])
    );

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const deltaLng = Math.abs(ne.lng - sw.lng);
    const deltaLat = Math.abs(ne.lat - sw.lat);
    const span = Math.max(deltaLng, deltaLat);

    const isMobile = window.innerWidth <= 768;
    const quoteCard = document.getElementById('quoteCard');
    const quoteVisible =
      !!quoteCard &&
      quoteCard.classList.contains('visible') &&
      quoteCard.getAttribute('aria-hidden') !== 'true';

    const quoteHeight = quoteVisible
      ? Math.min(quoteCard.offsetHeight || 0, isMobile ? 220 : 260)
      : 0;

    const cantidadParadas = Math.max(
      0,
      (Array.isArray(puntosExtras) ? puntosExtras.length : 0) - 2
    );

const baseBottom = isMobile
  ? (
      quoteVisible
        ? Math.max(92, Math.min(132, quoteHeight + 18))
        : 42
    )
  : Math.max(52, quoteHeight + 24);

const isHorizontal = deltaLng > deltaLat * 1.45;

const padding = isMobile
  ? {
      top: isHorizontal ? 28 : 44,
      right: isHorizontal ? 20 : 28,
      left: isHorizontal ? 20 : 28,
      bottom: Math.max(
        36,
        Math.min(120, baseBottom + (cantidadParadas >= 1 ? 8 : 0))
      )
    }
  : {
      top: span < 0.03 ? 64 : 52,
      right: span < 0.03 ? 64 : 52,
      left: span < 0.03 ? 64 : 52,
      bottom: baseBottom + (cantidadParadas >= 1 ? 8 : 0)
    };
    
    let maxZoom;
    if (span < 0.008) {
      maxZoom = isMobile ? 16.4 : 17.2;   // viaje corto
    } else if (span < 0.03) {
      maxZoom = isMobile ? 15.6 : 16.4;   // urbano medio
    } else if (span < 0.12) {
      maxZoom = isMobile ? 14.8 : 15.6;   // recorrido amplio
    } else {
      maxZoom = isMobile ? 13.8 : 14.8;   // viaje largo
    }

    try {
      mapaCliente.resize();
      mapaCliente.stop?.();
    } catch (_) {}

    mapaCliente.fitBounds(bounds, {
      padding,
      duration,
      maxZoom,
      linear: false
    });

    setTimeout(() => {
      try {
        mapaCliente.resize();
      } catch (_) {}
    }, 120);
  } catch (err) {
    console.warn('[MAP] error ajustando vista de ruta:', err);
  }
}
  function iniciarAnimacionRuta() {
  if (!mapaCliente || !mapReady || !mapaCliente.getLayer('route-anim')) return;

  detenerAnimacionRuta();
  routeDashPhase = 0;

  const step = () => {
    routeDashPhase += 0.045;

    if (routeDashPhase > 6) {
      routeDashPhase = 0;
    }

    try {
      mapaCliente.setPaintProperty('route-anim', 'line-dasharray', [
        0,
        routeDashPhase,
        0.7,
        2.2
      ]);
    } catch (_) {}

    routeAnimationFrame = requestAnimationFrame(step);
  };

  routeAnimationFrame = requestAnimationFrame(step);
}
  
  
function dibujarRutaLineal(coords, { autoFit = true } = {}) {
  if (!mapaCliente || !mapReady || !Array.isArray(coords) || coords.length < 2) return;

  requestAnimationFrame(() => {
    const coordinates = coords
      .map((c) => [Number(c?.[0]), Number(c?.[1])])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    if (coordinates.length < 2) return;

    const coordsFinales = [];
    for (const c of coordinates) {
      const last = coordsFinales[coordsFinales.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) {
        coordsFinales.push(c);
      }
    }

    if (coordsFinales.length < 2) return;

    limpiarCapasRutaMapa();
    limpiarMarkersMapa();

    mapaCliente.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordsFinales
        }
      }
    });

    mapaCliente.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#111111',
        'line-width': 2.6,
        'line-opacity': 0.96
      }
    });

const puntosBackendMarkers = Array.isArray(state?.cotizacion?.puntos_ruta)
  ? state.cotizacion.puntos_ruta
  : null;

agregarMarkersRutaDesdeCoords(puntosBackendMarkers);

if (autoFit) {
  ajustarVistaRuta(coordsFinales, 500);
}

if (window.DriverSim?.stop) {
  window.DriverSim.stop();
}

  if (window.DriverSim && debeMostrarSimuladoresChoferes()) {
    window.DriverSim.start(
      mapaCliente,
       coordsFinales,
       window.innerWidth <= 768 ? 5 : 8
      );
     }
  });
}
function construirConectoresVisuales(data) {
  const features = [];

  function limpiarCoordsMapa(arr) {
    if (!Array.isArray(arr)) return null;

    const limpias = arr
      .map((c) => [Number(c?.[0]), Number(c?.[1])])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    if (limpias.length < 2) return null;

    const resultado = [];
    for (const c of limpias) {
      const last = resultado[resultado.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) {
        resultado.push(c);
      }
    }

    return resultado.length >= 2 ? resultado : null;
  }

  function agregarConector(a, b) {
    const ax = Number(a?.[0]);
    const ay = Number(a?.[1]);
    const bx = Number(b?.[0]);
    const by = Number(b?.[1]);

    if (
      !Number.isFinite(ax) || !Number.isFinite(ay) ||
      !Number.isFinite(bx) || !Number.isFinite(by)
    ) {
      return;
    }

    if (ax === bx && ay === by) return;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [ax, ay],
          [bx, by]
        ]
      },
      properties: {}
    });
  }

  function distancia2(a, b) {
    const dx = Number(a[0]) - Number(b[0]);
    const dy = Number(a[1]) - Number(b[1]);
    return (dx * dx) + (dy * dy);
  }

  const routeGeom =
    limpiarCoordsMapa(data?.route_geometry) ||
    limpiarCoordsMapa(data?.geometry);

  const puntos = Array.isArray(data?.puntos_ruta) ? data.puntos_ruta : [];

  if (!routeGeom || routeGeom.length < 2 || puntos.length < 1) {
    return features;
  }

  puntos.forEach((p) => {
    const punto = [Number(p?.lng), Number(p?.lat)];
    if (!Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) return;

    let nearest = routeGeom[0];
    let best = distancia2(punto, nearest);

    for (let i = 1; i < routeGeom.length; i++) {
      const candidate = routeGeom[i];
      const d = distancia2(punto, candidate);
      if (d < best) {
        best = d;
        nearest = candidate;
      }
    }

    agregarConector(punto, nearest);
  });

  return features;
}
  function forzarRutaAPasarPorPuntos(coords, puntosRuta) {
  if (!Array.isArray(coords) || coords.length < 2) return coords;
  if (!Array.isArray(puntosRuta) || puntosRuta.length < 2) return coords;

  const casiIguales = (a, b, epsilon = 0.00001) =>
    Math.abs(Number(a) - Number(b)) <= epsilon;

  const distancia2 = (a, b) => {
    const dx = Number(a[0]) - Number(b[0]);
    const dy = Number(a[1]) - Number(b[1]);
    return (dx * dx) + (dy * dy);
  };

  const ruta = coords
    .map((c) => [Number(c?.[0]), Number(c?.[1])])
    .filter((c) =>
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1]) &&
      Math.abs(c[0]) <= 180 &&
      Math.abs(c[1]) <= 90
    );

  if (ruta.length < 2) return coords;

  let desdeIndice = 0;

  puntosRuta.forEach((p) => {
    const punto = [Number(p?.lng), Number(p?.lat)];

    if (
      !Number.isFinite(punto[0]) ||
      !Number.isFinite(punto[1]) ||
      Math.abs(punto[0]) > 180 ||
      Math.abs(punto[1]) > 90
    ) {
      return;
    }

    let mejorIdx = desdeIndice;
    let mejorDist = Infinity;

    for (let i = desdeIndice; i < ruta.length; i++) {
      const d = distancia2(ruta[i], punto);
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }

    const actual = ruta[mejorIdx];

    if (
      !actual ||
      !casiIguales(actual[0], punto[0]) ||
      !casiIguales(actual[1], punto[1])
    ) {
      ruta.splice(mejorIdx, 0, punto);
      desdeIndice = mejorIdx + 1;
    } else {
      desdeIndice = mejorIdx;
    }
  });

  const dedup = [];
  for (const c of ruta) {
    const last = dedup[dedup.length - 1];
    if (!last || !casiIguales(last[0], c[0]) || !casiIguales(last[1], c[1])) {
      dedup.push(c);
    }
  }

  return dedup.length >= 2 ? dedup : coords;
}

async function dibujarRutaReal(coords, { autoFit = true } = {}) {
  if (!Array.isArray(coords) || coords.length < 2) return;

  setSectionVisible('mapSection', true);

  setTimeout(() => {
    try {
      mapaCliente?.resize?.();
    } catch (_) {}
  }, 80);

  await initMapa();

  if (!mapaCliente || !mapReady) {
    console.warn('[dibujarRutaReal] mapa no disponible; se omite dibujo de ruta');
    return;
  }

  if (!mapaCliente.isStyleLoaded()) {
    await new Promise((resolve) => mapaCliente.once('load', resolve));
  }

  const coordsLimpias = coords
    .map((c) => [Number(c?.[0]), Number(c?.[1])])
    .filter((c) =>
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1]) &&
      Math.abs(c[0]) <= 180 &&
      Math.abs(c[1]) <= 90
    );

  if (coordsLimpias.length < 2) return;

  const coordsFinales = [];
  for (const c of coordsLimpias) {
    const last = coordsFinales[coordsFinales.length - 1];
    if (!last || last[0] !== c[0] || last[1] !== c[1]) {
      coordsFinales.push(c);
    }
  }

  if (coordsFinales.length < 2) return;

  limpiarCapasRutaMapa();
  limpiarMarkersMapa();

  mapaCliente.addSource('route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordsFinales
      }
    }
  });

mapaCliente.addLayer({
  id: 'route-line',
  type: 'line',
  source: 'route',
  layout: {
    'line-join': 'round',
    'line-cap': 'round'
  },
  paint: {
    'line-color': '#5f6368',
    'line-width': [
      'interpolate',
      ['linear'],
      ['zoom'],
      5, 3,
      8, 4,
      10, 5,
      12, 6,
      14, 7,
      16, 8
    ],
    'line-opacity': 0.95
  }
});
  if (!mapaCliente.getLayer('route-casing')) {
  mapaCliente.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': 'rgba(17,17,17,0.18)',
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        5, 5,
        8, 6.5,
        10, 7.5,
        12, 8.5,
        14, 9.5,
        16, 10.5
      ],
      'line-opacity': 0.55
    }
  }, 'route-line');
}

const connectorFeatures =
  Array.isArray(state.routeData?.visualConnectors) && state.routeData.visualConnectors.length
    ? state.routeData.visualConnectors
    : construirConectoresVisuales(state.cotizacion || {});

if (!state.routeData) state.routeData = {};
state.routeData.visualConnectors = connectorFeatures;


if (connectorFeatures.length) {
  try {
    if (mapaCliente.getLayer('route-connectors-line')) {
      mapaCliente.removeLayer('route-connectors-line');
    }

    if (mapaCliente.getSource('route-connectors')) {
      mapaCliente.removeSource('route-connectors');
    }

    mapaCliente.addSource('route-connectors', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: connectorFeatures
      }
    });

    if (!mapaCliente.getLayer('route-connectors-line')) {
      mapaCliente.addLayer({
        id: 'route-connectors-line',
        type: 'line',
        source: 'route-connectors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'rgba(95,99,104,0.40)',
          'line-width': 1.6,
          'line-opacity': 0.7,
          'line-dasharray': [1, 1.6]
        }
      });
    }
  } catch (err) {
    console.warn('[route-connectors-line] no se pudo crear la capa:', err);
  }
}
  if (!state.routeData) state.routeData = {};
  state.routeData.geometry = {
    type: 'LineString',
    coordinates: coordsFinales
  };

const puntosBackendMarkers = Array.isArray(state?.cotizacion?.puntos_ruta)
  ? state.cotizacion.puntos_ruta
  : null;

agregarMarkersRutaDesdeCoords(puntosBackendMarkers);

if (autoFit) {
  ajustarVistaRuta(coordsFinales, window.innerWidth <= 768 ? 120 : 220);
}

if (window.DriverSim?.stop) {
  window.DriverSim.stop();
}

if (window.DriverSim && debeMostrarSimuladoresChoferes()) {
  window.DriverSim.start(
    mapaCliente,
    coordsFinales,
    window.innerWidth <= 768 ? 5 : 8
  );
}
  setTimeout(() => {
    try {
      mapaCliente.resize();
    } catch (_) {}
  }, 180);

  setTimeout(() => {
    try {
      mapaCliente.resize();
    } catch (_) {}
  }, 450);
}
window.dibujarRutaEnMapa = async function(coords) {
  if (!coords || coords.length < 2) return;

  try {
    await dibujarRutaReal(coords);
  } catch (e) {
    console.warn('[wrapper dibujarRutaEnMapa] error:', e);
  }
};
  
function mostrarMapaInmediato(_puntos, _coords) {
  setSectionVisible('mapSection', true);
  setTimeout(() => {
  try {
    mapaCliente?.resize?.();
  } catch (_) {}
}, 80);

  requestAnimationFrame(() => {
    initMapa().then(() => {
      try {
        mapaCliente?.resize?.();
      } catch (_) {}
    });
  });
}
function centrarEnRuta() {
  if (!mapaCliente) return;

  const coords = Array.isArray(state.routeData?.geometry?.coordinates)
    ? state.routeData.geometry.coordinates
        .map((c) => [Number(c?.[0]), Number(c?.[1])])
        .filter((c) =>
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1]) &&
          Math.abs(c[0]) <= 180 &&
          Math.abs(c[1]) <= 90
        )
    : null;

  if (!coords || coords.length < 2) return;

  const puntosRuta = Array.isArray(state?.cotizacion?.puntos_ruta)
    ? state.cotizacion.puntos_ruta
    : (
        Array.isArray(state?.cotizacion?.stops)
          ? state.cotizacion.stops
          : []
      );

  ajustarVistaRuta(coords, 650, puntosRuta);
}
  
window.dibujarRutaChoferHastaCliente = dibujarRutaChoferHastaCliente;
window.limpiarRutaChoferHastaCliente = limpiarRutaChoferHastaCliente;

function reiniciarRuta() {
  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const waypointsContainer = document.getElementById('waypointsContainer');
  const breakdown = document.getElementById('priceBreakdown');
  const breakdownContent = document.getElementById('priceBreakdownContent');
  const breakdownBtn = document.getElementById('btnToggleBreakdown');
  const resumenParadas = document.getElementById('resumenParadas');
  const quotePrice = document.getElementById('quotePrice');
  const detailDistance = document.getElementById('detailDistance');
  const detailDuration = document.getElementById('detailDuration');
  const detailStops = document.getElementById('detailStops');
  const labelEl = document.querySelector('.quote-price-label');

  if (inputOrigen) {
    inputOrigen.value = '';
    inputOrigen.removeAttribute('title');
  }

  if (inputDestino) {
    inputDestino.value = '';
    inputDestino.removeAttribute('title');
  }

  if (waypointsContainer) {
    waypointsContainer.innerHTML = '';
  }

  document.querySelectorAll('.sugerencias').forEach((el) => {
    el.innerHTML = '';
    hideSuggestions(el);
  });

if (mapaCliente && mapReady) {
  limpiarCapasRutaMapa();
}

limpiarMarkersMapa();
state = {
  origen: null,
  destino: null,
  waypoints: [],
  routeData: null,
  map: null,
  markers: [],
  cotizacion: null,
  viajeId: null,
  viajeEstado: null,
  estadoViaje: null,
  choferId: null,
  choferLocation: null
};
actualizarBotonCancelarViaje();
  waypointCounter = 0;
  isCalculatingQuote = false;
  currentQuoteRequestId++;

  if (quotePrice) quotePrice.textContent = '$0';
  if (detailDistance) detailDistance.textContent = '0 km';
  if (detailDuration) detailDuration.textContent = '0 min';
  if (detailStops) detailStops.textContent = '0';
  if (resumenParadas) {
    resumenParadas.textContent = '0 paradas';
    resumenParadas.removeAttribute('title');
  }
  if (labelEl) labelEl.textContent = 'Precio estimado';

  if (breakdownContent) breakdownContent.innerHTML = '';
  if (breakdown) breakdown.hidden = true;

  if (breakdownBtn) {
    breakdownBtn.setAttribute('aria-expanded', 'false');
    breakdownBtn.style.display = 'none';
  }

  actualizarTimeline();
  setSectionVisible('mapSection', false);
  setSectionVisible('quoteCard', false);
  setLoadingCotizacion(false);
  togglePriceBreakdown(false);

  notif.show('Nueva ruta', 'Planificá tu nuevo viaje', 'info');
}
function limpiarMarkersRutaCotizacion() {
  try {
    if (Array.isArray(state?.markers)) {
      state.markers.forEach((marker) => {
        try {
          marker?.remove?.();
        } catch (_) {}
      });
    }

    state.markers = [];
  } catch (err) {
    console.warn('[MAP] no se pudieron limpiar markers de cotización:', err);
  }
}
  function mostrarSoloPickupClienteEnMapa() {
  try {
    if (!window.mapaCliente || !window.mapReady) return;
    if (!state?.origen) return;

    const lat = Number(state.origen.lat);
    const lng = Number(state.origen.lng);

    if (!coordenadasValidas(lat, lng)) return;

    const el = document.createElement('div');
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '999px';
    el.style.background = '#16a34a';
    el.style.border = '3px solid #ffffff';
    el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.22)';

    const pickupMarker = new maplibregl.Marker({
      element: el,
      anchor: 'center'
    }).setLngLat([lng, lat]).addTo(window.mapaCliente);

    if (!Array.isArray(state.markers)) {
      state.markers = [];
    }

    state.markers.push(pickupMarker);
  } catch (err) {
    console.warn('[MAP] no se pudo mostrar pickup del cliente:', err);
  }
}

function actualizarCamaraSeguimientoChofer() {
  try {
    if (!window.mapaCliente || !window.mapReady) return;
const estadoActual = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();
const usarDestinoFinal = estadoUsaDestinoFinal(estadoActual);
const puntoObjetivo = usarDestinoFinal ? state?.destino : state?.origen;

if (!state?.choferLocation || !puntoObjetivo) return;
    if (window.__userInteractingMap) return;

    const choferLat = Number(state.choferLocation.lat);
    const choferLng = Number(state.choferLocation.lng);
const clienteLat = Number(puntoObjetivo.lat);
const clienteLng = Number(puntoObjetivo.lng);
    if (
      !coordenadasValidas(choferLat, choferLng) ||
      !coordenadasValidas(clienteLat, clienteLng)
    ) {
      return;
    }

    const distanciaMetros = turf.distance(
      [choferLng, choferLat],
      [clienteLng, clienteLat],
      { units: 'kilometers' }
    ) * 1000;

    let zoomObjetivo = 11.8;
    let bearingObjetivo = 0;
    let pitchObjetivo = window.innerWidth <= 768 ? 0 : 18;

    if (distanciaMetros <= 6000) zoomObjetivo = 12.6;
    if (distanciaMetros <= 3000) zoomObjetivo = 13.4;
    if (distanciaMetros <= 1500) zoomObjetivo = 14.2;
    if (distanciaMetros <= 800)  zoomObjetivo = 15.1;
    if (distanciaMetros <= 400)  zoomObjetivo = 16.0;
    if (distanciaMetros <= 200)  zoomObjetivo = 16.9;

    const dx = clienteLng - choferLng;
    const dy = clienteLat - choferLat;

    // cámara un poco adelantada hacia el cliente
    let factorCentro = 0.42;

    if (distanciaMetros <= 300) {
      factorCentro = 0.58;
      zoomObjetivo = Math.max(zoomObjetivo, 17.2);
      pitchObjetivo = 38;

      const anguloRad = Math.atan2(dx, dy);
      bearingObjetivo = (anguloRad * 180 / Math.PI);

      if (!Number.isFinite(bearingObjetivo)) {
        bearingObjetivo = 0;
      }
    }

    const centerLng = choferLng + (dx * factorCentro);
    const centerLat = choferLat + (dy * factorCentro);

    if (!window.__lastCameraUpdate) {
      window.__lastCameraUpdate = 0;
    }

    const now = Date.now();
    if (now - window.__lastCameraUpdate < 1200) {
      return;
    }
    window.__lastCameraUpdate = now;

    const currentCenter = window.mapaCliente.getCenter();
    const currentZoom = window.mapaCliente.getZoom();
    const currentBearing = window.mapaCliente.getBearing();
    const currentPitch = window.mapaCliente.getPitch();

    const deltaLng = Math.abs(currentCenter.lng - centerLng);
    const deltaLat = Math.abs(currentCenter.lat - centerLat);
    const deltaZoom = Math.abs(currentZoom - zoomObjetivo);
    const deltaBearing = Math.abs(currentBearing - bearingObjetivo);
    const deltaPitch = Math.abs(currentPitch - pitchObjetivo);

    if (
      deltaLng < 0.00015 &&
      deltaLat < 0.00015 &&
      deltaZoom < 0.12 &&
      deltaBearing < 2 &&
      deltaPitch < 2
    ) {
      return;
    }

    window.mapaCliente.easeTo({
      center: [centerLng, centerLat],
      zoom: zoomObjetivo,
      bearing: bearingObjetivo,
      pitch: pitchObjetivo,
      duration: 1400,
      easing: (t) => t * (2 - t),
      essential: true
    });
  } catch (err) {
    console.warn('[MAP] no se pudo actualizar cámara chofer/cliente:', err);
  }
}

window.actualizarCamaraSeguimientoChofer = actualizarCamaraSeguimientoChofer;  

let lastRouteRefreshAt = 0;
let lastRouteSignature = '';

async function actualizarRutaChoferDinamica() {
  try {
    const estadoActual = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

    const estadosSeguimiento = [
      'ASIGNADO',
      'ACEPTADO',
      'EN_CAMINO',
      'INICIADO',
      'EN_CURSO'
    ];

    if (!estadosSeguimiento.includes(estadoActual)) return;
    if (!state?.choferLocation) return;

    const usarDestinoFinal = estadoUsaDestinoFinal(estadoActual);
    const puntoObjetivo = usarDestinoFinal ? state?.destino : state?.origen;

    if (!puntoObjetivo) return;

    const choferLat = Number(state.choferLocation.lat);
    const choferLng = Number(state.choferLocation.lng);
    const objetivoLat = Number(puntoObjetivo.lat);
    const objetivoLng = Number(puntoObjetivo.lng);

    if (!coordenadasValidas(choferLat, choferLng)) return;
    if (!coordenadasValidas(objetivoLat, objetivoLng)) return;

    const now = Date.now();

    // Firma reducida para detectar cambio real de posición/ruta
    const routeSignature = [
      choferLat.toFixed(5),
      choferLng.toFixed(5),
      objetivoLat.toFixed(5),
      objetivoLng.toFixed(5),
      estadoActual
    ].join('|');

    const cambioRuta = routeSignature !== lastRouteSignature;

    // Si cambió realmente la posición o el objetivo, refrescar más rápido
    if (!cambioRuta && (now - lastRouteRefreshAt < 2500)) {
      return;
    }

    lastRouteRefreshAt = now;
    lastRouteSignature = routeSignature;

    await window.dibujarRutaChoferHastaCliente(
      {
        lat: choferLat,
        lng: choferLng
      },
      {
        lat: objetivoLat,
        lng: objetivoLng
      }
    );
  } catch (err) {
    console.warn('[tracking] no se pudo refrescar ruta dinámica del chofer:', err);
  }
}  
async function esperarMapaClienteListo(timeoutMs = 2500) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (
      mapaCliente &&
      typeof mapaCliente.isStyleLoaded === 'function' &&
      mapaCliente.isStyleLoaded()
    ) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return false;
}
  // ==========================================
