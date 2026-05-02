// COTIZACIÓN
// ==========================================

async function calcularRuta() {
    startPageTransition();
  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();
const estadosBloqueados = [
  'BUSCANDO_CHOFER',
  'OFERTANDO',
  'OFERTADO',
  'SIN_CHOFER',
  'ASIGNADO',
  'ACEPTADO',
  'EN_CAMINO',
  'INICIADO',
  'EN_CURSO'
];
if (state?.viajeId && estadosBloqueados.includes(estado)) {
  notif.show(
    'Viaje en proceso',
    'No podés volver a cotizar mientras haya un viaje activo.',
    'warning'
  );
  actualizarBotonCotizar?.();
  return;
}

  if (isCalculatingQuote) return;
  const requestId = ++currentQuoteRequestId;

  setLoadingCotizacion(true, 'Preparando ruta...');
  setSectionVisible('quoteCard', false);
  togglePriceBreakdown(false);

  try {
    const textoOrigen = document.getElementById('inputOrigen')?.value?.trim();
    const textoDestino = document.getElementById('inputDestino')?.value?.trim();

    if (!textoOrigen || !textoDestino) {
      throw new Error('Completá origen y destino');
    }

    let origenActual = state.origen;
    let destinoActual = state.destino;

    const origenNormalizado = normalizarTextoDireccion(textoOrigen);
    const destinoNormalizado = normalizarTextoDireccion(textoDestino);

const origenActualNormalizado = normalizarTextoDireccion(
  origenActual?.direccionCorta || origenActual?.direccion || ''
);

const origenCoincideAproximado =
  !!origenActual &&
  coordenadasValidas(origenActual.lat, origenActual.lng) &&
  (
    origenActualNormalizado === origenNormalizado ||
    origenNormalizado.includes(origenActualNormalizado) ||
    origenActualNormalizado.includes(origenNormalizado)
  );

if (!origenCoincideAproximado) {
  console.log('[calcularRuta] debug origen antes de resolver', {
    textoOrigen,
    stateOrigen: state?.origen || null
  });

  setLoadingCotizacion(true, 'Resolviendo origen...');
  const origenResuelto = await resolverPuntoDesdeTexto(textoOrigen);

  console.log('[calcularRuta] debug origen resuelto', origenResuelto);

  if (origenResuelto) {
    state.origen = {
      id: `stop_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      direccion: origenResuelto.direccion,
      direccionCorta: origenResuelto.direccionCorta,
      direccionSecundaria: origenResuelto.direccionSecundaria,
      lat: Number(origenResuelto.lat),
      lng: Number(origenResuelto.lng),
      raw: origenResuelto.raw || null
    };
    origenActual = state.origen;
  } else if (!origenActual || !coordenadasValidas(origenActual.lat, origenActual.lng)) {
    throw new Error(`No pudimos ubicar el origen: ${textoOrigen}`);
  } else {
    console.warn('[calcularRuta] se conserva state.origen válido aunque no se pudo re-geocodificar', {
      textoOrigen,
      origenActual
    });
  }
}
const destinoActualNormalizado = normalizarTextoDireccion(
  destinoActual?.direccionCorta || destinoActual?.direccion || ''
);

const destinoCoincideAproximado =
  !!destinoActual &&
  coordenadasValidas(destinoActual.lat, destinoActual.lng) &&
  (
    destinoActualNormalizado === destinoNormalizado ||
    destinoNormalizado.includes(destinoActualNormalizado) ||
    destinoActualNormalizado.includes(destinoNormalizado)
  );

if (!destinoCoincideAproximado) {
  console.log('[calcularRuta] debug destino antes de resolver', {
    textoDestino,
    stateDestino: state?.destino || null
  });

  setLoadingCotizacion(true, 'Resolviendo destino...');
  const destinoResuelto = await resolverPuntoDesdeTexto(textoDestino);

  console.log('[calcularRuta] debug destino resuelto', destinoResuelto);

  if (destinoResuelto) {
    state.destino = {
      id: `stop_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      direccion: destinoResuelto.direccion,
      direccionCorta: destinoResuelto.direccionCorta,
      direccionSecundaria: destinoResuelto.direccionSecundaria,
      lat: Number(destinoResuelto.lat),
      lng: Number(destinoResuelto.lng),
      raw: destinoResuelto.raw || null
    };
    destinoActual = state.destino;
  } else if (!destinoActual || !coordenadasValidas(destinoActual.lat, destinoActual.lng)) {
    throw new Error(`No pudimos ubicar el destino: ${textoDestino}`);
  } else {
    console.warn('[calcularRuta] se conserva state.destino válido aunque no se pudo re-geocodificar', {
      textoDestino,
      destinoActual
    });
  }
}
    
    setLoadingCotizacion(true, 'Resolviendo paradas...');
    const erroresWaypoints = await resolverWaypointsPendientes();

    if (erroresWaypoints.length > 0) {
      throw new Error(`No pudimos ubicar una o más paradas: ${erroresWaypoints.join(', ')}`);
    }

    const puntos = obtenerPuntosOrdenados();

    console.log('STATE.ORIGEN:', state.origen);
    console.log('STATE.WAYPOINTS:', state.waypoints);
    console.log('STATE.DESTINO:', state.destino);
    console.log('PUNTOS ORDENADOS FINAL:', puntos);

    if (!Array.isArray(puntos) || puntos.length < 2) {
      throw new Error('Ruta inválida: faltan puntos válidos');
    }

    const errorRuta = validarPuntosRuta(puntos);
    if (errorRuta) {
      throw new Error(errorRuta);
    }

    setLoadingCotizacion(true, 'Calculando ruta y precio...');

    const estimacionLocal = calcularEstimacionLocal(puntos);
    const payload = construirPayloadOptimizado(puntos, estimacionLocal);

    if (!payload) {
      throw new Error('No se pudo construir el payload de cotización');
    }

    payload.fechaHora = new Date().toISOString();
    payload.factor_zona = 1;
    payload.espera_min = 0;

    console.log('📦 Payload enviado (optimizado):', payload);

    const resultado = await cotizarViajeOptimizado(payload, requestId);

    if (requestId !== currentQuoteRequestId) return;

    if (!resultado || !resultado.exito) {
      throw new Error(resultado?.error || 'Error en la cotización');
    }

    if (Array.isArray(resultado.puntos_ruta) && resultado.puntos_ruta.length >= 2) {
      const puntosBackend = resultado.puntos_ruta;

      state.origen = puntosBackend.find((p) => p.rol === 'pickup') || puntosBackend[0];
      state.destino = puntosBackend.find((p) => p.rol === 'dropoff') || puntosBackend[puntosBackend.length - 1];

state.waypoints = puntosBackend
  .filter((p) => {
    const rol = String(p?.rol || '').toLowerCase();
    return rol === 'stop' || rol === 'waypoint' || rol === 'parada';
  })
  .map((p, idx) => ({
    id: p?.id || `waypoint-${idx + 1}`,
    data: {
      ...p,
      lat: Number(p?.lat),
      lng: Number(p?.lng),
      direccion: p?.direccion || p?.direccion_completa || p?.direccionCorta || `Parada ${idx + 1}`,
      direccionCorta: p?.direccion_corta || p?.direccionCorta || p?.direccion || `Parada ${idx + 1}`
    }
  }))
  .filter((wp) => coordenadasValidas(wp?.data?.lat, wp?.data?.lng));
      const inputOrigen = document.getElementById('inputOrigen');
      const inputDestino = document.getElementById('inputDestino');

      if (inputOrigen && state.origen) {
        inputOrigen.value =
          state.origen.direccion_corta ||
          state.origen.direccionCorta ||
          state.origen.direccion ||
          '';
      }

      if (inputDestino && state.destino) {
        inputDestino.value =
          state.destino.direccion_corta ||
          state.destino.direccionCorta ||
          state.destino.direccion ||
          '';
      }

      const wpInputs = document.querySelectorAll('.waypoint-input');
      puntosBackend
        .filter((p) => p.rol === 'stop')
        .forEach((p, idx) => {
          if (wpInputs[idx]) {
            wpInputs[idx].value =
              p.direccion_corta ||
              p.direccionCorta ||
              p.direccion ||
              '';
          }
        });
    }

    procesarRespuestaCotizacion(resultado, payload);

// El dibujo del mapa ya lo resuelve procesarRespuestaCotizacion()
  } catch (err) {
    if (requestId !== currentQuoteRequestId) return;
    console.error('❌ Error:', err);
    notif.show('Error', err.message || 'No se pudo calcular la ruta', 'error');
  } finally {
    if (requestId === currentQuoteRequestId) {
      setLoadingCotizacion(false);
    }
  }
} 
  
async function cotizarViajeOptimizado(payload, requestId) {
  const controller = new AbortController();
  const startedAt = performance.now();

  const timeoutId = setTimeout(() => {
    controller.abort('timeout_cotizacion');
  }, CONFIG.TIMEOUTS.COTIZACION);

  try {
    console.log('📦 PAYLOAD FINAL:', JSON.stringify(payload, null, 2));
    console.log('⏱️ inicio cotización');

    const apiKey = SUPABASE_ANON_KEY;

    if (!apiKey) {
      throw new Error('No se encontró la API Key de Supabase');
    }

    if (requestId !== currentQuoteRequestId) return null;

    const headers = {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`
    };

    console.log('Headers enviados:', {
      apikey: apiKey ? 'presente' : 'ausente',
      auth: apiKey ? 'presente' : 'ausente'
    });

    const tFetch = performance.now();
    const response = await fetch(CONFIG.COTIZAR_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log('⏱️ fetch respondió headers en ms:', Math.round(performance.now() - tFetch));
    console.log('Response status:', response.status);

    if (requestId !== currentQuoteRequestId) return null;

    const tBody = performance.now();
    const rawText = await response.text();
    console.log('⏱️ body leído en ms:', Math.round(performance.now() - tBody));
    console.log('Raw response:', rawText.substring(0, 1000));

    if (requestId !== currentQuoteRequestId) return null;

    let dataRes = null;

    try {
      dataRes = rawText ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.error('Error parseando JSON:', parseErr);
      throw new Error(`Respuesta inválida del servidor (${response.status})`);
    }

    if (!response.ok) {
      console.error('Error HTTP:', response.status, dataRes);
      throw new Error(dataRes?.error || dataRes?.message || `Error ${response.status}`);
    }

    if (!dataRes?.exito) {
      throw new Error(dataRes?.error || 'Error en la cotización');
    }

    console.log('📥 RESPUESTA COTIZAR:', dataRes);
    console.log('⏱️ cotización exitosa total ms:', Math.round(performance.now() - startedAt));

    return dataRes;
  } catch (err) {
    if (requestId !== currentQuoteRequestId) return null;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
  
  
function usarFallbackLocal(payload, requestId) {
  if (requestId !== currentQuoteRequestId) return;

  // Fallback muy básico: calculamos distancia en línea recta entre origen y destino
  // Como no tenemos coordenadas (el backend falló), usamos valores estimados genéricos
  // o podemos intentar geocodificar solo para el fallback (opcional)
  
  notif.show(
    'Cotización rápida',
    'Usando calculadora de emergencia (sin ruta exacta)',
    'warning'
  );

  // Estimación muy básica basada en texto (puedes mejorar esto)
  const tarifaBase = 1200;
  const factorDistancia = 1.5; // asumimos 1.5km por defecto si no sabemos
  
  // Intentar geocodificar solo origen y destino para el fallback (paralelo)
  Promise.all([
    resolverPuntoDesdeTexto(payload.origen),
    resolverPuntoDesdeTexto(payload.destino)
  ]).then(([origen, destino]) => {
    if (origen && destino && requestId === currentQuoteRequestId) {
      const distanciaKm = turf.distance(
        [origen.lng, origen.lat],
        [destino.lng, destino.lat],
        { units: 'kilometers' }
      );
      
      const duracionMin = Math.round((distanciaKm / 30) * 60);
      const precioEstimado = Math.max(2200, Math.round((tarifaBase + (distanciaKm * 1100)) / 50) * 50);
      
      // Guardar para poder confirmar el viaje
      state.origen = origen;
      state.destino = destino;
      
      mostrarCotizacion(precioEstimado, distanciaKm, duracionMin);
      
      // Dibujar línea simple
      setSectionVisible('mapSection', true);
      setTimeout(() => {
  try {
    mapaCliente?.resize?.();
  } catch (_) {}
}, 80);
      initMapa().then(() => {
        dibujarRutaLineal([[origen.lng, origen.lat], [destino.lng, destino.lat]]);
      });
    }
  }).catch(() => {
    // Si incluso el fallback falla, mostrar precio genérico
    mostrarCotizacion(2500, 0, 0);
  });
}
function procesarRespuestaCotizacion(data, payload) {
  console.log('📦 PAYLOAD', payload);
  console.log('📡 RESPUESTA', data);

  const precio = numeroSeguro(data?.precio, 0);

  let distancia = numeroSeguro(data?.distancia_km, 0);
  if (distancia < 2) {
    distancia *= 0.85;
  } else if (distancia < 5) {
    distancia *= 0.9;
  }

  const duracion = numeroSeguro(data?.duracion_min, 0);
  const detallePrecio = data?.detalle_precio || {};

  const fallbackUsado =
    data?.fallback_usado === true ||
    detallePrecio?.fallback_usado === true ||
    data?.metodo_calculo === 'fallback_haversine' ||
    detallePrecio?.proveedor_ruta === 'fallback_haversine' ||
    data?.source === 'fallback' ||
    data?.source === 'mixed';

  const metodoCalculo =
    data?.metodo_calculo ||
    detallePrecio?.proveedor_ruta ||
    data?.source ||
    'desconocido';

  console.log('📍 ORIGEN PAYLOAD', payload?.origen, payload?.origen_lat, payload?.origen_lng);
  console.log('🏁 DESTINO PAYLOAD', payload?.destino, payload?.destino_lat, payload?.destino_lng);
  console.log('📏 DISTANCIA BACKEND', data?.distancia_km);
  console.log('⏱️ DURACION BACKEND', data?.duracion_min);
  console.log('🧠 METODO', metodoCalculo);
  console.log('⚠️ FALLBACK', fallbackUsado);
  console.log('🧭 SOURCE', data?.source || 'sin-source');
  console.log('🗺️ ROUTE_GEOMETRY puntos', Array.isArray(data?.route_geometry) ? data.route_geometry.length : 0);
  console.log('🧵 GEOMETRY puntos', Array.isArray(data?.geometry) ? data.geometry.length : 0);
  console.log('🦵 LEGS', Array.isArray(data?.legs) ? data.legs.length : 0);
  console.log('📌 PUNTOS_RUTA', Array.isArray(data?.puntos_ruta) ? data.puntos_ruta.length : 0);

  const resumenRuta =
    data?.resumen_ruta ||
    data?.resumen_ruta_front ||
    [
      payload?.origen || '',
      ...((payload?.paradas || payload?.waypoints || []).map(p => p?.direccion || p?.direccionCorta).filter(Boolean)),
      payload?.destino || ''
    ]
      .filter(Boolean)
      .join(' → ');

  const limpiarCoordsRuta = (arr) => {
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
  };

  const mergearGeometriasLegs = (legs) => {
    if (!Array.isArray(legs) || !legs.length) return null;

    const merged = [];
    const casiIguales = (a, b, epsilon = 0.00001) =>
      Math.abs(Number(a) - Number(b)) <= epsilon;

    legs.forEach((leg, index) => {
      const g = limpiarCoordsRuta(leg?.geometry);
      if (!g) return;

      const fromReal = [Number(leg?.from?.lng), Number(leg?.from?.lat)];
      const toReal = [Number(leg?.to?.lng), Number(leg?.to?.lat)];

      const tramo = [...g];

      if (
        Number.isFinite(fromReal[0]) &&
        Number.isFinite(fromReal[1]) &&
        (
          !casiIguales(tramo[0]?.[0], fromReal[0]) ||
          !casiIguales(tramo[0]?.[1], fromReal[1])
        )
      ) {
        tramo.unshift(fromReal);
      }

      const ultimo = tramo[tramo.length - 1];
      if (
        Number.isFinite(toReal[0]) &&
        Number.isFinite(toReal[1]) &&
        (
          !casiIguales(ultimo?.[0], toReal[0]) ||
          !casiIguales(ultimo?.[1], toReal[1])
        )
      ) {
        tramo.push(toReal);
      }

      if (index === 0 || merged.length === 0) {
        merged.push(...tramo);
      } else {
        merged.push(...tramo.slice(1));
      }
    });

    return merged.length >= 2 ? limpiarCoordsRuta(merged) : null;
  };

  const coordsRouteGeometry = limpiarCoordsRuta(data?.route_geometry);
  const coordsGeometry = !coordsRouteGeometry ? limpiarCoordsRuta(data?.geometry) : null;

  const coordsLegsCrudas =
    Array.isArray(data?.legs) && data.legs.length
      ? mergearGeometriasLegs(data.legs)
      : null;

  let coordsPuntos = null;
  if (!coordsRouteGeometry && !coordsGeometry && !coordsLegsCrudas && Array.isArray(data?.puntos_ruta)) {
    const simples = data.puntos_ruta
      .map((p) => [Number(p?.lng), Number(p?.lat)])
      .filter((c) =>
        Number.isFinite(c[0]) &&
        Number.isFinite(c[1]) &&
        Math.abs(c[0]) <= 180 &&
        Math.abs(c[1]) <= 90
      );

    coordsPuntos = simples.length >= 2 ? limpiarCoordsRuta(simples) : null;
  }

  const coordsBase =
    coordsRouteGeometry ||
    coordsGeometry ||
    coordsLegsCrudas ||
    coordsPuntos ||
    null;

  const esRutaReal = !!(coordsRouteGeometry || coordsGeometry || coordsLegsCrudas);
  const esProvisoria = !esRutaReal && !!coordsPuntos;

  const puntosRutaNormalizados = Array.isArray(data?.puntos_ruta)
    ? data.puntos_ruta
        .map((p, idx) => {
          const rol = String(p?.rol || '').toLowerCase();

          return {
            ...p,
            lat:
              rol === 'pickup'
                ? Number(data?.origen_lat ?? p?.lat)
                : rol === 'dropoff'
                  ? Number(data?.destino_lat ?? p?.lat)
                  : Number(p?.lat),
            lng:
              rol === 'pickup'
                ? Number(data?.origen_lng ?? p?.lng)
                : rol === 'dropoff'
                  ? Number(data?.destino_lng ?? p?.lng)
                  : Number(p?.lng),
            direccion:
              p?.direccion ||
              p?.direccion_completa ||
              p?.direccionCorta ||
              `Punto ${idx + 1}`,
            direccionCorta:
              p?.direccion_corta ||
              p?.direccionCorta ||
              p?.direccion ||
              `Punto ${idx + 1}`
          };
        })
        .filter((p) => coordenadasValidas(p?.lat, p?.lng))
    : [];

  const coordsFinales = coordsBase
    ? forzarRutaAPasarPorPuntos(coordsBase, puntosRutaNormalizados)
    : null;

  const cotizacionNormalizada = {
    ...data,
    precio,
    distancia_km: distancia,
    duracion_min: duracion,
    resumen_ruta: resumenRuta,
    fallback_usado: fallbackUsado,
    metodo_calculo: metodoCalculo,
    source: data?.source || null,
    puntos_ruta: puntosRutaNormalizados
  };

  state.cotizacion = cotizacionNormalizada;

  if (!debeMostrarSimuladoresChoferes() && window.DriverSim?.stop) {
    window.DriverSim.stop();
  }

  if (puntosRutaNormalizados.length >= 2) {
    state.origen =
      puntosRutaNormalizados.find((p) => String(p?.rol || '').toLowerCase() === 'pickup') ||
      puntosRutaNormalizados[0];

    state.destino =
      puntosRutaNormalizados.find((p) => String(p?.rol || '').toLowerCase() === 'dropoff') ||
      puntosRutaNormalizados[puntosRutaNormalizados.length - 1];

    state.waypoints = puntosRutaNormalizados
      .filter((p) => String(p?.rol || '').toLowerCase() === 'stop')
      .map((p, idx) => ({
        id: p?.id || `waypoint-${idx + 1}`,
        data: p
      }));
  }

  const visualConnectors = construirConectoresVisuales(cotizacionNormalizada);
  console.log('[visual-connectors] generados:', visualConnectors.length);

  state.routeData = {
    distance: distancia,
    duration: duracion,
    resumenRuta,
    fallback: fallbackUsado,
    source: data?.source || null,
    esRutaReal,
    provisional: esProvisoria,
    geometry: coordsFinales
      ? {
          type: 'LineString',
          coordinates: coordsFinales
        }
      : null,
    visualConnectors
  };

  if (coordsFinales) {
    setSectionVisible('mapSection', true);

    const puntosRutaForFit =
      Array.isArray(state?.cotizacion?.puntos_ruta) && state.cotizacion.puntos_ruta.length
        ? state.cotizacion.puntos_ruta
        : (Array.isArray(data?.stops) ? data.stops : []);

    setTimeout(() => {
      try {
        mapaCliente?.resize?.();
      } catch (_) {}
    }, 80);

    initMapa().then(async () => {
      try {
        await dibujarRutaReal(coordsFinales, { autoFit: false });
        ajustarVistaRuta(coordsFinales, window.innerWidth <= 768 ? 520 : 700, puntosRutaForFit);
      } catch (e) {
        console.warn('[mapa] fallo dibujarRutaReal:', e);

        if (!esRutaReal && coordsFinales) {
          try {
            dibujarRutaLineal(coordsFinales, { autoFit: false });
            ajustarVistaRuta(coordsFinales, window.innerWidth <= 768 ? 520 : 700, puntosRutaForFit);
          } catch (_) {}
        }
      }
    });
  }

  if ((data?.source === 'fallback' || data?.source === 'mixed' || fallbackUsado) && !esRutaReal) {
    notif.show(
      'Ruta estimada',
      'Se usó cálculo aproximado. El precio puede ajustarse levemente.',
      'warning'
    );
  }

  if (data?.source === 'mixed') {
    console.warn('[cotizacion] ruta mixta: algunos tramos vinieron por OSRM y otros por fallback');
  }

  mostrarCotizacion(precio, distancia, duracion);
  guardarViajeActivoEnStorage();
}

  
// ==========================================
// UI COTIZACIÓN
// ==========================================

 function mostrarCotizacion(precio, km, minutos) {
  const card = document.getElementById('quoteCard');
  if (!card) return;

  const dp = state.cotizacion?.detalle_precio || null;
  const legs = Array.isArray(state.cotizacion?.legs) ? state.cotizacion.legs : [];
  const puntosRuta = Array.isArray(state.cotizacion?.puntos_ruta) ? state.cotizacion.puntos_ruta : [];

  const kmSeguro = numeroSeguro(km, numeroSeguro(state.routeData?.distance, 0));
  const minSeguro = numeroSeguro(minutos, numeroSeguro(state.routeData?.duration, 0));

  const paradasIntermedias =
    numeroSeguro(state.cotizacion?.waypoints_count, -1) >= 0
      ? numeroSeguro(state.cotizacion?.waypoints_count, 0)
      : numeroSeguro(dp?.cantidad_paradas_intermedias, -1) >= 0
        ? numeroSeguro(dp?.cantidad_paradas_intermedias, 0)
        : Math.max(0, puntosRuta.length - 2);

  const segmentos =
    numeroSeguro(state.cotizacion?.segmentos_totales, 0) ||
    numeroSeguro(state.routeData?.segmentos, 0) ||
    legs.length ||
    Math.max(1, puntosRuta.length - 1);

  const retornoAlOrigen =
    dp?.vuelve_al_origen ??
    state.cotizacion?.retorno_al_origen ??
    state.routeData?.retornoAlOrigen ??
    false;

  const fallbackUsado = !!(
    state.cotizacion?.fallback_usado ||
    dp?.fallback_usado ||
    state.routeData?.fallback ||
    state.cotizacion?.modo === 'fallback_local'
  );

  const metodoCalculo =
    state.cotizacion?.metodo_calculo ||
    dp?.proveedor_ruta ||
    dp?.metodo_calculo ||
    (fallbackUsado ? 'fallback_local_frontend' : 'backend');

  const precioTexto =
    state.cotizacion?.precio_formateado ||
    '$' + Number(precio || 0).toLocaleString('es-AR');

  const quotePrice = document.getElementById('quotePrice');
  if (quotePrice) quotePrice.textContent = precioTexto;

let label = fallbackUsado ? 'Estimación provisoria' : 'Precio calculado';
   
  const labelEl = document.querySelector('.quote-price-label');
  if (labelEl) labelEl.textContent = label;

  const detailDistance = document.getElementById('detailDistance');
  if (detailDistance) detailDistance.textContent = `${kmSeguro.toFixed(1)} km`;

  const detailDuration = document.getElementById('detailDuration');
  if (detailDuration) detailDuration.textContent = `${Math.round(minSeguro)} min`;

  const detailStops = document.getElementById('detailStops');
  if (detailStops) detailStops.textContent = String(paradasIntermedias);

  const resumenRuta =
    state.cotizacion?.resumen_ruta ||
    state.routeData?.resumenRuta ||
    construirResumenRuta();

  const resumenParadas = document.getElementById('resumenParadas');
  if (resumenParadas) {
    resumenParadas.textContent = retornoAlOrigen
      ? `${paradasIntermedias} paradas · retorno`
      : `${paradasIntermedias} paradas`;
    resumenParadas.title = resumenRuta;
  }

  const breakdown = document.getElementById('priceBreakdown');
  const breakdownContent = document.getElementById('priceBreakdownContent');
  const toggleBtn = document.getElementById('btnToggleBreakdown');

  if (breakdown && breakdownContent) {
    if (dp) {
      const filas = [
        ['Tarifa base', dp.tarifa_base],
        ['Subtotal tramos', dp.subtotal_tramos],
        ['Recargo paradas', dp.recargo_paradas],
        ['Recargo retorno', dp.recargo_retorno_origen],
        ['Recargo servicio', dp.recargo_servicio],
        ['Recargo espera', dp.recargo_espera]
      ]
        .filter(([, valor]) => Number(valor || 0) > 0)
        .map(([labelFila, valor]) => `
          <div style="display:flex; justify-content:space-between; gap:12px;">
            <span>${labelFila}</span>
            <strong>$${Number(valor).toLocaleString('es-AR')}</strong>
          </div>
        `)
        .join('');

      const metaRows = [
        `<div>Método: <strong>${metodoCalculo}</strong></div>`,
        `<div>Hora pico: <strong>${dp.nombre_hora_pico || 'normal'}</strong></div>`,
        `<div>Factor zona: <strong>${dp.factor_zona || 1}</strong></div>`,
        `<div>Segmentos: <strong>${segmentos}</strong></div>`,
        `<div>Retorno: <strong>${retornoAlOrigen ? 'Sí' : 'No'}</strong></div>`,
        `<div>Ruta aproximada: <strong>${fallbackUsado ? 'Sí' : 'No'}</strong></div>`
      ].join('');

      const meta = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.08); font-size:13px; color:#666;">
          ${metaRows}
        </div>
      `;

      breakdownContent.innerHTML =
        (filas || '<div>Sin recargos adicionales</div>') + meta;

      if (toggleBtn) {
        toggleBtn.style.display = 'flex';
      }

      if (breakdown.hidden === false && toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
      } else if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    } else {
      breakdownContent.innerHTML = '<div>Sin desglose disponible</div>';
      breakdown.hidden = true;

      if (toggleBtn) {
        toggleBtn.style.display = 'none';
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    }
  }

  setSectionVisible('quoteCard', true);
} 
  
// ==========================================
// ACCIONES
// ==========================================

  
async function confirmarViaje() {
  if (!state.origen || !state.destino || !state.routeData) {
    notif.show('Faltan datos', 'Primero calculá el viaje', 'warning');
    return;
  }

  try {
    if (window.isConfirmingTrip) return;
    window.isConfirmingTrip = true;

    console.log('[confirmarViaje] iniciando...');
    console.log('[confirmarViaje] state:', JSON.parse(JSON.stringify({
      origen: state.origen,
      destino: state.destino,
      routeData: state.routeData,
      cotizacion: state.cotizacion,
      waypoints: state.waypoints
    })));

    const session = await asegurarSesionCliente();

    if (!session?.access_token) {
      return;
    }

    console.log('[confirmarViaje] session resumen:', {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      userId: session?.user?.id || null,
      email: session?.user?.email || null,
      expiresAt: session?.expires_at || null,
      tokenType: session?.token_type || null
    });

    let tokenPayload = null;
    try {
      const tokenPart = session.access_token.split('.')[1];
      if (tokenPart) {
        const normalized = tokenPart
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        tokenPayload = JSON.parse(atob(normalized));
      }
    } catch (tokenErr) {
      console.warn('[confirmarViaje] no se pudo decodificar access token:', tokenErr);
    }

    console.log('[confirmarViaje] access_token payload:', tokenPayload);

    let authCheck = null;
    try {
      authCheck = await window.sbRealtime.auth.getUser(session.access_token);
      console.log('[confirmarViaje] auth.getUser() check:', authCheck);
    } catch (authCheckErr) {
      console.warn('[confirmarViaje] auth.getUser() check error:', authCheckErr);
    }

    if (!authCheck?.data?.user) {
      notif.show(
        'Ingresá para continuar',
        'Ingresas con Google para pedir conexion con un chofer registrado',
        'info'
      );

      localStorage.removeItem('mimi_pending_trip_request');
      await loginConGoogleParaViaje();
      return;
    }

    const puntos = obtenerPuntosOrdenados();
    console.log('[confirmarViaje] puntos ordenados:', puntos);

    if (!Array.isArray(puntos) || puntos.length < 2) {
      throw new Error('Ruta incompleta');
    }

    const origen = puntos[0];
    const destino = puntos[puntos.length - 1];
    const waypointsIntermedios = puntos.slice(1, -1);

    const resumenRuta =
      state.cotizacion?.resumen_ruta ||
      state.cotizacion?.resumen_ruta_front ||
      state.routeData?.resumen_ruta ||
      state.routeData?.resumenRuta ||
      state.routeData?.resumen_ruta_front ||
      construirResumenRuta();

    const precioFinal = Number(
      state.cotizacion?.precio ??
      state.routeData?.precio ??
      0
    );

    const kmFinal = Number(
      state.cotizacion?.distancia_km_total ??
      state.cotizacion?.distancia_km ??
      state.routeData?.distancia_km_total ??
      state.routeData?.distance ??
      0
    );

    const duracionFinal = Number(
      state.cotizacion?.duracion_min_total ??
      state.cotizacion?.duracion_min ??
      state.routeData?.duracion_min_total ??
      state.routeData?.duration ??
      0
    );

const payload = {
  origen: origen.direccion || origen.direccionCompleta || origen.direccionCorta || '',
  origen_lat: Number(origen.lat),
  origen_lng: Number(origen.lng),

  destino: destino.direccion || destino.direccionCompleta || destino.direccionCorta || '',
  destino_lat: Number(destino.lat),
  destino_lng: Number(destino.lng),

  precio: Number.isFinite(precioFinal) ? precioFinal : 0,
  km: Number.isFinite(kmFinal) ? kmFinal : 0,
  duracion_min: Number.isFinite(duracionFinal) ? duracionFinal : 0,

  resumen_ruta: resumenRuta || '',

  waypoints: waypointsIntermedios.map((p, i) => ({
    orden: i + 1,
    direccion: p.direccion || p.direccionCompleta || p.direccionCorta || `Parada ${i + 1}`,
    direccionCorta: p.direccionCorta || p.direccion || `Parada ${i + 1}`,
    lat: Number(p.lat),
    lng: Number(p.lng)
  })),

  cantidad_paradas: waypointsIntermedios.length,

  observaciones: state.observaciones || state.comentarios || '',

  pasajero_nombre:
    state.pasajeroNombre ||
    state.nombrePasajero ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    '',

  pasajero_telefono:
    state.pasajeroTelefono ||
    state.telefonoPasajero ||
    session?.user?.user_metadata?.phone ||
    '',

  cotizacion_id:
    state?.cotizacion?.id ||
    state?.cotizacion?.cotizacion_id ||
    state?.routeData?.cotizacion_id ||
    null,

  cliente_auth_id: session?.user?.id || null,
  cliente_email: session?.user?.email || ''
};    
  console.log('[confirmarViaje] payload:', payload);
    console.log('[confirmarViaje] url:', `${SUPABASE_URL}/functions/v1/solicitar-viaje-ts`);
    
     if (!payload.cotizacion_id) {
      throw new Error('Falta cotizacion_id en la solicitud del viaje');
     }
    
    if (!payload.origen || !payload.destino) {
      throw new Error('Faltan origen o destino');
    }

    if (
      !Number.isFinite(payload.origen_lat) ||
      !Number.isFinite(payload.origen_lng) ||
      !Number.isFinite(payload.destino_lat) ||
      !Number.isFinite(payload.destino_lng)
    ) {
      throw new Error('Coordenadas inválidas en origen o destino');
    }

actualizarEstadoSolicitudUI({
  estado: 'buscando_chofer',
  texto: 'Enviando solicitud...'
});

if (typeof actualizarCentroNotificacionesViaje === 'function') {
  actualizarCentroNotificacionesViaje({
    estado: 'BUSCANDO_CHOFER',
    texto: 'Enviando solicitud...'
  });
}
    const { response: res, rawText } = await fetchEdgeFunctionWithAuthRetry(
      `${SUPABASE_URL}/functions/v1/solicitar-viaje-ts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    console.log('[confirmarViaje] response status:', res.status);
    console.log('[confirmarViaje] response ok:', res.ok);
    console.log('[confirmarViaje] raw response text:', rawText);

    let json = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.error('[confirmarViaje] JSON parse error:', parseErr);
      throw new Error('La función solicitar-viaje devolvió una respuesta inválida');
    }

    console.log('[confirmarViaje] response json:', json);

    if (!res.ok || json?.ok === false || !json?.viaje_id) {
      throw new Error(
        json?.error ||
        json?.message ||
        `No se pudo solicitar el viaje (HTTP ${res.status})`
      );
    }

    state.viajeId = json.viaje_id;
    ultimoEstadoNotificado = null;

    // compatibilidad total: guardamos en ambos nombres
const dispatchInfo = json?.dispatch || null;
const dispatchResultado = dispatchInfo?.resultado || null;
const viajeActualizado = dispatchResultado?.viaje_actualizado || null;

const estadoInicialSeguro =
  viajeActualizado?.estado ||
  dispatchResultado?.estado ||
  json?.estado ||
  'BUSCANDO_CHOFER';

state.viajeEstado = estadoInicialSeguro;
state.estadoViaje = normalizarEstadoUpper(estadoInicialSeguro);

// 🔥 al pasar de cotización a viaje activo, no arrastrar ruta vieja
state.routeData = null;
state.cotizacion = null;

actualizarBotonCancelarViaje();
actualizarBotonCotizar();
guardarViajeActivoEnStorage();
actualizarPanelPlanificacionViaje();
actualizarResumenCotizacionCompacto();
actualizarBotonConfirmarViaje();
actualizarBotonReiniciarRuta?.();
    
    console.log('[confirmarViaje] viaje creado OK:', {
      viajeId: state.viajeId,
      estado: state.viajeEstado,
      estadoViaje: state.estadoViaje,
      dispatch: json?.dispatch || null
    });

    const dispatchOk = !!dispatchInfo?.ok;
const choferDetectado =
  dispatchResultado?.viaje_actualizado?.assigned_driver_id ||
  dispatchResultado?.viaje_actualizado?.chofer_id_uuid ||
  dispatchResultado?.assigned_driver_id ||
  dispatchResultado?.chofer_id_uuid ||
  null;
    
if (dispatchOk) {
  // ✅ NO forzar "ASIGNADO" solo porque el dispatch vinculó un chofer.
  // La asignación real debe venir por estado confirmado del backend/realtime.
  if (choferDetectado) {
    state.viajeEstado = 'ofertando';
    state.estadoViaje = 'OFERTANDO';
  } else {
    state.viajeEstado = 'buscando_chofer';
    state.estadoViaje = 'BUSCANDO_CHOFER';
  }

  state.routeData = null;
  state.cotizacion = null;

  actualizarBotonCancelarViaje();
  actualizarBotonCotizar();
  guardarViajeActivoEnStorage();
  actualizarPanelPlanificacionViaje();
  actualizarResumenCotizacionCompacto();
  actualizarBotonConfirmarViaje();
  actualizarBotonReiniciarRuta?.();

  actualizarEstadoSolicitudUI({
    estado: state.viajeEstado,
    texto: choferDetectado
      ? 'Estamos notificando choferes cercanos...'
      : 'Viaje creado. Buscando chofer disponible...'
  });

  if (typeof actualizarCentroNotificacionesViaje === 'function') {
    actualizarCentroNotificacionesViaje({
      estado: state.estadoViaje,
      texto: choferDetectado
        ? 'Estamos notificando choferes cercanos...'
        : 'Viaje creado. Buscando chofer disponible...'
    });
  }
} else {
  state.viajeEstado = 'buscando_chofer';
  state.estadoViaje = 'BUSCANDO_CHOFER';

  actualizarBotonCancelarViaje();
  actualizarBotonCotizar();
  guardarViajeActivoEnStorage();
  actualizarPanelPlanificacionViaje();
  actualizarResumenCotizacionCompacto();
  actualizarBotonConfirmarViaje();
  actualizarBotonReiniciarRuta?.();

  actualizarEstadoSolicitudUI({
    estado: state.viajeEstado,
    texto: 'Viaje creado. Buscando chofer disponible...'
  });

  if (typeof actualizarCentroNotificacionesViaje === 'function') {
    actualizarCentroNotificacionesViaje({
      estado: 'BUSCANDO_CHOFER',
      texto: 'Viaje creado. Buscando chofer disponible...'
    });
  }

  console.warn('[confirmarViaje] dispatch interno no exitoso o pendiente:', dispatchInfo);

  notif.show(
    'Viaje creado',
    'La solicitud se guardó correctamente. Estamos iniciando la búsqueda de chofer.',
    'info'
  );
}

// 🔥 ACTUALIZAR CARD INMEDIATAMENTE
actualizarCardChofer({
  estado: state.estadoViaje
});

if (typeof suscribirseEstadoViajeRealtime === 'function' && state?.viajeId) {
  suscribirseEstadoViajeRealtime(state.viajeId);
}
    notif.show('Solicitud enviada', 'Buscando chofer disponible...', 'success');
    activarModoViajeLive();
  } catch (err) {
    console.error('[confirmarViaje] ERROR completo:', err);
    console.error('[confirmarViaje] ERROR message:', err?.message);
    console.error('[confirmarViaje] ERROR stack:', err?.stack);

    notif.show('Error', err?.message || 'No se pudo solicitar el viaje', 'error');
    confirmarViajePorWhatsAppFallback();
  } finally {
    window.isConfirmingTrip = false;
  }
}
  
function actualizarBotonCancelarViaje() {
  const btnCancelar = document.getElementById('btnCancelarViaje');
  const btnCancelarLive = document.getElementById('btnCancelarViajeLive');
  const tripActiveActions = document.getElementById('tripActiveActions');

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  const visible = !!state?.viajeId && !['CANCELADO', 'COMPLETADO'].includes(estado);

  // Botón inferior viejo: siempre oculto para evitar duplicado
  if (btnCancelar) {
    btnCancelar.hidden = true;
    btnCancelar.style.display = 'none';
    btnCancelar.setAttribute('aria-hidden', 'true');
  }

  // Acciones live (chat + cancelar)
  if (tripActiveActions) {
    tripActiveActions.hidden = !visible;
  }

  if (btnCancelarLive) {
    btnCancelarLive.hidden = !visible;
    btnCancelarLive.style.display = visible ? '' : 'none';
    btnCancelarLive.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
}
  
function actualizarBotonCotizar() {
  const btnCalcular = document.getElementById('btnCalcular');
  if (!btnCalcular) return;

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

const estadosBloqueados = [
  'BUSCANDO_CHOFER',
  'OFERTANDO',
  'OFERTADO',
  'SIN_CHOFER',
  'ASIGNADO',
  'ACEPTADO',
  'EN_CAMINO',
  'INICIADO',
  'EN_CURSO'
];
  const bloquear = !!state?.viajeId && estadosBloqueados.includes(estado);

  btnCalcular.disabled = bloquear;
  btnCalcular.hidden = bloquear;
  btnCalcular.style.display = bloquear ? 'none' : '';
  btnCalcular.style.pointerEvents = bloquear ? 'none' : 'auto';
  btnCalcular.setAttribute('aria-hidden', bloquear ? 'true' : 'false');
}  
  function actualizarPanelPlanificacionViaje() {
  const routePlanner = document.getElementById('routePlanner');
  if (!routePlanner) return;

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  const estadosOcultos = [
    'BUSCANDO_CHOFER',
    'OFERTANDO',
    'OFERTADO',
    'SIN_CHOFER',
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ];

  const ocultar = !!state?.viajeId && estadosOcultos.includes(estado);

  routePlanner.hidden = ocultar;
  routePlanner.style.display = ocultar ? 'none' : '';
  routePlanner.setAttribute('aria-hidden', ocultar ? 'true' : 'false');

  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const btnSwapRoute = document.getElementById('btnSwapRoute');
  const btnAddStop = document.getElementById('btnAddStop');

  [inputOrigen, inputDestino, btnSwapRoute, btnAddStop].forEach((el) => {
    if (!el) return;
    el.disabled = ocultar;
    el.style.pointerEvents = ocultar ? 'none' : 'auto';
  });
}
  function actualizarResumenCotizacionCompacto() {
  const quoteMain = document.querySelector('.quote-main');
  if (!quoteMain) return;

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  const estadosOcultarPrecio = [
    'BUSCANDO_CHOFER',
    'OFERTANDO',
    'OFERTADO',
    'SIN_CHOFER',
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ];

  const ocultarPrecio = !!state?.viajeId && estadosOcultarPrecio.includes(estado);

  quoteMain.hidden = ocultarPrecio;
  quoteMain.style.display = ocultarPrecio ? 'none' : '';
  quoteMain.setAttribute('aria-hidden', ocultarPrecio ? 'true' : 'false');
}

function actualizarBotonConfirmarViaje() {
  const btnConfirmarViaje = document.getElementById('btnConfirmarViaje');
  if (!btnConfirmarViaje) return;

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  const estadosOcultar = [
    'BUSCANDO_CHOFER',
    'OFERTANDO',
    'OFERTADO',
    'SIN_CHOFER',
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ];

  const ocultar = !!state?.viajeId && estadosOcultar.includes(estado);

  btnConfirmarViaje.hidden = ocultar;
  btnConfirmarViaje.disabled = ocultar;
  btnConfirmarViaje.style.display = ocultar ? 'none' : '';
  btnConfirmarViaje.style.pointerEvents = ocultar ? 'none' : 'auto';
  btnConfirmarViaje.setAttribute('aria-hidden', ocultar ? 'true' : 'false');
}  
function actualizarBotonReiniciarRuta() {
  const btn = document.getElementById('btnReiniciarRuta');
  if (!btn) return;

  const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  const estadosOcultar = [
    'BUSCANDO_CHOFER',
    'OFERTANDO',
    'OFERTADO',
    'SIN_CHOFER',
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ];

  const ocultar = !!state?.viajeId && estadosOcultar.includes(estado);

  btn.hidden = ocultar;
  btn.disabled = ocultar;
  btn.style.display = ocultar ? 'none' : '';
  btn.style.pointerEvents = ocultar ? 'none' : 'auto';
  btn.setAttribute('aria-hidden', ocultar ? 'true' : 'false');
}
  
function confirmarViajePorWhatsAppFallback() {
  const cotizacionId = state.cotizacion?.cotizacion_id || 'sin-id';
  const precioTexto =
    state.cotizacion?.precio_formateado ||
    document.getElementById('quotePrice')?.textContent ||
    '$0';

  const resumenRuta =
    state.cotizacion?.resumen_ruta ||
    state.routeData?.resumenRuta ||
    construirResumenRuta();

  const puntos = obtenerPuntosOrdenados();

  const paradasTexto = puntos.slice(1, -1).map((p, i) =>
    `📍 *Parada ${i + 1}:* ${p.direccionCorta || p.direccion}`
  ).join('\n');

  const mensaje = `🚐 *MIMI Transporte Escolar*

🧾 *Cotización:* ${cotizacionId}

📍 *Origen:* ${puntos[0].direccionCorta || puntos[0].direccion}
${paradasTexto ? paradasTexto + '\n' : ''}🏁 *Destino:* ${puntos[puntos.length - 1].direccionCorta || puntos[puntos.length - 1].direccion}

🛣️ *Ruta:* ${resumenRuta}
📏 *Distancia:* ${state.routeData?.distance || 0} km
⏱️ *Duración:* ${state.routeData?.duration || 0} min
💰 *Precio:* ${precioTexto}

⚠️ No pudimos enviar la solicitud automática.
¿Confirmamos el viaje por WhatsApp?`;

  window.open(
    `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`,
    '_blank'
  );
}

function actualizarEstadoSolicitudUI({ estado, texto = '', viaje = null }) {
  const quoteCard = document.getElementById('quoteCard');
  const quoteActions = document.querySelector('.quote-actions');
  let box = document.getElementById('tripRequestStatus');

  if (!box) {
    box = document.createElement('div');
    box.id = 'tripRequestStatus';
    box.style.marginBottom = '12px';
    box.style.padding = '14px';
    box.style.borderRadius = '14px';
    box.style.fontSize = '14px';
    box.style.lineHeight = '1.45';
    box.style.transition = 'all 0.25s ease';
    box.style.backdropFilter = 'blur(6px)';

    if (quoteActions && quoteActions.parentNode) {
      quoteActions.parentNode.insertBefore(box, quoteActions);
    } else if (quoteCard) {
      quoteCard.appendChild(box);
    }
  }

const estadoRaw = String(estado || '').trim();
const estadoKey = estadoRaw.toLowerCase();
const estadoUpper = estadoRaw.toUpperCase();
  
  const estadosUI = {
    pendiente: {
      label: 'Pendiente',
      texto: 'Estamos preparando tu solicitud...',
      bg: 'rgba(120,120,120,0.10)',
      border: '1px solid rgba(120,120,120,0.20)',
      color: '#374151',
      badgeBg: 'rgba(120,120,120,0.16)',
      badgeColor: '#374151',
      icon: '⏳'
    },
    buscando_chofer: {
      label: 'Buscando chofer',
      texto: 'Buscando chofer disponible...',
      bg: 'rgba(21,101,192,0.08)',
      border: '1px solid rgba(21,101,192,0.18)',
      color: '#0f3d91',
      badgeBg: 'rgba(21,101,192,0.14)',
      badgeColor: '#0f3d91',
      icon: '🔎'
    },
    ofertando: {
      label: 'Ofertando',
      texto: 'Estamos notificando choferes cercanos...',
      bg: 'rgba(255,152,0,0.10)',
      border: '1px solid rgba(255,152,0,0.22)',
      color: '#a15c00',
      badgeBg: 'rgba(255,152,0,0.16)',
      badgeColor: '#a15c00',
      icon: '📣'
    },
    sin_chofer: {
      label: 'Sin chofer',
      texto: 'No encontramos chofer por el momento. Vamos a reintentar.',
      bg: 'rgba(244,67,54,0.08)',
      border: '1px solid rgba(244,67,54,0.18)',
      color: '#b3261e',
      badgeBg: 'rgba(244,67,54,0.14)',
      badgeColor: '#b3261e',
      icon: '⚠️'
    },
    asignado: {
      label: 'Chofer asignado',
      texto: 'Tu chofer fue asignado correctamente.',
      bg: 'rgba(76,175,80,0.10)',
      border: '1px solid rgba(76,175,80,0.22)',
      color: '#1f6f37',
      badgeBg: 'rgba(76,175,80,0.16)',
      badgeColor: '#1f6f37',
      icon: '✅'
    },
    aceptado: {
      label: 'Chofer asignado',
      texto: 'Tu chofer aceptó el viaje.',
      bg: 'rgba(76,175,80,0.10)',
      border: '1px solid rgba(76,175,80,0.22)',
      color: '#1f6f37',
      badgeBg: 'rgba(76,175,80,0.16)',
      badgeColor: '#1f6f37',
      icon: '✅'
    },
    en_camino: {
      label: 'En camino',
      texto: 'El chofer está en camino.',
      bg: 'rgba(33,150,243,0.10)',
      border: '1px solid rgba(33,150,243,0.20)',
      color: '#0b63b6',
      badgeBg: 'rgba(33,150,243,0.16)',
      badgeColor: '#0b63b6',
      icon: '🚗'
    },
    en_viaje: {
      label: 'En viaje',
      texto: 'Tu viaje está en curso.',
      bg: 'rgba(103,58,183,0.10)',
      border: '1px solid rgba(103,58,183,0.20)',
      color: '#5b32a3',
      badgeBg: 'rgba(103,58,183,0.16)',
      badgeColor: '#5b32a3',
      icon: '🛣️'
    },
    en_curso: {
      label: 'En viaje',
      texto: 'Tu viaje está en curso.',
      bg: 'rgba(103,58,183,0.10)',
      border: '1px solid rgba(103,58,183,0.20)',
      color: '#5b32a3',
      badgeBg: 'rgba(103,58,183,0.16)',
      badgeColor: '#5b32a3',
      icon: '🛣️'
    },
    finalizado: {
      label: 'Finalizado',
      texto: 'Viaje completado.',
      bg: 'rgba(0,150,136,0.10)',
      border: '1px solid rgba(0,150,136,0.20)',
      color: '#0d7a70',
      badgeBg: 'rgba(0,150,136,0.16)',
      badgeColor: '#0d7a70',
      icon: '🏁'
    },
    completado: {
      label: 'Finalizado',
      texto: 'Viaje completado.',
      bg: 'rgba(0,150,136,0.10)',
      border: '1px solid rgba(0,150,136,0.20)',
      color: '#0d7a70',
      badgeBg: 'rgba(0,150,136,0.16)',
      badgeColor: '#0d7a70',
      icon: '🏁'
    },
    cancelado: {
      label: 'Cancelado',
      texto: 'Viaje cancelado.',
      bg: 'rgba(96,96,96,0.10)',
      border: '1px solid rgba(96,96,96,0.22)',
      color: '#4b5563',
      badgeBg: 'rgba(96,96,96,0.16)',
      badgeColor: '#4b5563',
      icon: '❌'
    },

    // compatibilidad con estados viejos
    ofertado: {
      label: 'Buscando chofer',
      texto: 'Buscando chofer disponible...',
      bg: 'rgba(21,101,192,0.08)',
      border: '1px solid rgba(21,101,192,0.18)',
      color: '#0f3d91',
      badgeBg: 'rgba(21,101,192,0.14)',
      badgeColor: '#0f3d91',
      icon: '🔎'
    }
  };

  const estadoInfo = estadosUI[estadoKey] || {
    label: estadoRaw || 'Pendiente',
    texto: 'Procesando solicitud...',
    bg: 'rgba(120,120,120,0.10)',
    border: '1px solid rgba(120,120,120,0.20)',
    color: '#374151',
    badgeBg: 'rgba(120,120,120,0.16)',
    badgeColor: '#374151',
    icon: 'ℹ️'
  };

box.style.background = estadoInfo.bg;
box.style.border = estadoInfo.border;
box.style.color = estadoInfo.color;
box.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';

box.classList.remove(
  'trip-status-searching',
  'trip-status-assigned',
  'trip-status-onway',
  'trip-status-inprogress'
);

if (['BUSCANDO_CHOFER', 'OFERTANDO', 'OFERTADO', 'SIN_CHOFER'].includes(estadoUpper)) {
  box.classList.add('trip-status-searching');
} else if (['ASIGNADO', 'ACEPTADO'].includes(estadoUpper)) {
  box.classList.add('trip-status-assigned');
} else if (['EN_CAMINO'].includes(estadoUpper)) {
  box.classList.add('trip-status-onway');
} else if (['INICIADO', 'EN_CURSO', 'EN_VIAJE'].includes(estadoUpper)) {
  box.classList.add('trip-status-inprogress');
}

const mensaje = texto || estadoInfo.texto;
  const choferNombre = viaje?.chofer_nombre || viaje?.choferNombre || '';
  const choferTelefono = viaje?.chofer_telefono || viaje?.choferTelefono || '';

box.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:nowrap;">
    <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
      <span style="font-size:16px;line-height:1;flex:0 0 auto;">${estadoInfo.icon}</span>
      <div style="min-width:0;flex:1;">
        <div style="font-size:12px;font-weight:800;line-height:1.2;">${estadoInfo.label}</div>
        <div style="font-size:12px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${mensaje}
        </div>
      </div>
    </div>

    <span style="
      display:inline-flex;
      align-items:center;
      justify-content:center;
      padding:5px 9px;
      border-radius:999px;
      background:${estadoInfo.badgeBg};
      color:${estadoInfo.badgeColor};
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
      flex:0 0 auto;
    ">
      ${estadoInfo.label}
    </span>
  </div>
`;
}
function escucharEstadoViajeCliente(viajeId) {
  if (!window.sbRealtime || !viajeId) return;

  if (window.currentTripChannel) {
    try {
      window.sbRealtime.removeChannel(window.currentTripChannel);
    } catch (_) {}
  }

  window.currentTripChannel = window.sbRealtime
    .channel(`cliente-viaje-${viajeId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'viajes',
        filter: `id=eq.${viajeId}`
      },
      (payload) => {
        const viaje = payload?.new;
        if (!viaje) return;

        state.viajeId = viaje.id;
        state.viajeEstado = viaje.estado || '';
        state.estadoViaje = String(viaje.estado || '').toUpperCase();

        actualizarEstadoSolicitudUI({
          estado: viaje.estado,
          viaje
        });

        if (viaje.estado === 'ACEPTADO') {
          notif.show('Chofer asignado', 'Tu viaje fue aceptado', 'success');
          if (typeof actualizarCentroNotificacionesViaje === 'function') {
            actualizarCentroNotificacionesViaje({
              estado: 'ACEPTADO',
              texto: 'Tu viaje fue aceptado'
            });
          }
        }

        if (viaje.estado === 'EN_CAMINO') {
          notif.show('Chofer en camino', 'Tu chofer va rumbo al origen', 'info');
          if (typeof actualizarCentroNotificacionesViaje === 'function') {
            actualizarCentroNotificacionesViaje({
              estado: 'EN_CAMINO',
              texto: 'Tu chofer va rumbo al origen'
            });
          }
        }

        if (viaje.estado === 'EN_CURSO') {
          notif.show('Viaje iniciado', 'Tu viaje comenzó', 'info');
          if (typeof actualizarCentroNotificacionesViaje === 'function') {
            actualizarCentroNotificacionesViaje({
              estado: 'EN_CURSO',
              texto: 'Tu viaje comenzó'
            });
          }
        }

        if (viaje.estado === 'COMPLETADO') {
          notif.show('Viaje finalizado', 'Gracias por viajar con MIMI', 'success');
          if (typeof actualizarCentroNotificacionesViaje === 'function') {
            actualizarCentroNotificacionesViaje({
              estado: 'COMPLETADO',
              texto: 'Gracias por viajar con MIMI'
            });
          }
        }

        if (viaje.estado === 'CANCELADO') {
          notif.show('Viaje cancelado', 'La solicitud fue cancelada', 'warning');
          if (typeof actualizarCentroNotificacionesViaje === 'function') {
            actualizarCentroNotificacionesViaje({
              estado: 'CANCELADO',
              texto: 'La solicitud fue cancelada'
            });
          }
        }
      }
    )
    .subscribe((status) => {
      console.log('[cliente-viaje subscribe]', status);
    });
}
  
function compartirRuta() {
  if (!state.routeData) {
    notif.show('Sin ruta', 'Primero calculá el recorrido', 'warning');
    return;
  }

  const resumenRuta =
    state.cotizacion?.resumen_ruta ||
    state.routeData?.resumenRuta ||
    construirResumenRuta();

  const texto = `🚐 MIMI Transporte Escolar

📍 Ruta: ${resumenRuta}
📏 Distancia: ${state.routeData.distance} km
⏱️ Duración: ${state.routeData.duration} min
💰 Precio: ${state.cotizacion?.precio_formateado || document.getElementById('quotePrice').textContent}`;

  if (navigator.share) {
    navigator.share({
      title: 'MIMI Transporte Escolar',
      text: texto
    }).catch(() => {});
  } else if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(texto)
      .then(() => notif.show('Copiado', 'Resumen copiado al portapapeles', 'success'))
      .catch(() => notif.show('No disponible', 'No se pudo compartir', 'warning'));
  } else {
    notif.show('No disponible', 'No se pudo compartir', 'warning');
  }
}
function intercambiarOrigenDestino() {
  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const breakdown = document.getElementById('priceBreakdown');
  const breakdownBtn = document.getElementById('btnToggleBreakdown');
  const breakdownContent = document.getElementById('priceBreakdownContent');

  const origenTmp = state.origen;
  const destinoTmp = state.destino;

  state.origen = destinoTmp || null;
  state.destino = origenTmp || null;

  if (inputOrigen) {
    inputOrigen.value = state.origen?.direccionCorta || '';
    if (state.origen?.direccion) {
      inputOrigen.setAttribute('title', construirTooltip(state.origen));
    } else {
      inputOrigen.removeAttribute('title');
    }
  }

  if (inputDestino) {
    inputDestino.value = state.destino?.direccionCorta || '';
    if (state.destino?.direccion) {
      inputDestino.setAttribute('title', construirTooltip(state.destino));
    } else {
      inputDestino.removeAttribute('title');
    }
  }

  // Limpiar resultado anterior para no mostrar ruta/cotización vieja
  state.routeData = null;
  state.cotizacion = null;

  if (mapaCliente && mapReady) {
    try {
limpiarCapasRutaMapa();
    } catch (_) {}
  }

  if (Array.isArray(state.markers) && state.markers.length) {
    state.markers.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
  }
  state.markers = [];

  if (breakdownContent) breakdownContent.innerHTML = '';
  if (breakdown) breakdown.hidden = true;

  if (breakdownBtn) {
    breakdownBtn.setAttribute('aria-expanded', 'false');
    breakdownBtn.style.display = 'none';
  }

  setSectionVisible('mapSection', false);
  setSectionVisible('quoteCard', false);

  notif.show('Ruta actualizada', 'Se intercambiaron origen y destino', 'info', 2500);
}

  
  function togglePriceBreakdown(forceOpen = null) {
  const btn = document.getElementById('btnToggleBreakdown');
  const box = document.getElementById('priceBreakdown');

  if (!btn || !box) return;

  // Si está oculto y nos piden cerrar, cerramos igual silenciosamente
  if (btn.style.display === 'none') {
    if (forceOpen === false) {
      btn.setAttribute('aria-expanded', 'false');
      box.hidden = true;
    }
    return;
  }

  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;

  btn.setAttribute('aria-expanded', String(nextOpen));
  box.hidden = !nextOpen;
}

async function fetchEdgeFunctionWithAuthRetry(url, options = {}) {
  const normalizarHeaders = (headersLike) => {
    try {
      return headersLike instanceof Headers
        ? Object.fromEntries(headersLike.entries())
        : { ...(headersLike || {}) };
    } catch (_) {
      return { ...(headersLike || {}) };
    }
  };

  const tokenExpiraPronto = (token) => {
    try {
      const payload = decodificarJwtPayload(token);
      const expMs = Number(payload?.exp || 0) * 1000;
      if (!expMs) return false;
      return (expMs - Date.now()) < 60_000;
    } catch (_) {
      return false;
    }
  };

  const construirHeaders = (session, extraHeaders = {}) => ({
    ...normalizarHeaders(extraHeaders),
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`
  });

  let session = await obtenerSesionCliente(false);

  if (!session?.access_token) {
    session = await obtenerSesionCliente(true);
  }

  if (!session?.access_token) {
    throw new Error('No hay sesión válida para llamar la función protegida');
  }

  if (tokenExpiraPronto(session.access_token)) {
    limpiarSesionCache();
    session = await obtenerSesionCliente(true);
  }

  if (!session?.access_token) {
    throw new Error('No se pudo refrescar la sesión del usuario');
  }

  try {
    const userCheck = await window.sbRealtime.auth.getUser(session.access_token);
    if (!userCheck?.data?.user) {
      limpiarSesionCache();
      session = await obtenerSesionCliente(true);
    }
  } catch (_) {
    limpiarSesionCache();
    session = await obtenerSesionCliente(true);
  }

  if (!session?.access_token) {
    throw new Error('La sesión del usuario no es válida. Volvé a iniciar sesión.');
  }

  let headers = construirHeaders(session, options.headers);

  let response = await fetch(url, {
    ...options,
    headers
  });

  let rawText = await response.text();

  const es401 = response.status === 401;
  const texto401 = String(rawText || '').toLowerCase();

  const requiereRetryAuth =
    es401 &&
    (
      texto401.includes('invalid jwt') ||
      texto401.includes('jwt') ||
      texto401.includes('unauthorized') ||
      texto401.includes('auth') ||
      texto401.includes('token')
    );

  if (!requiereRetryAuth) {
    return { response, rawText, session };
  }

  limpiarSesionCache();
  session = await obtenerSesionCliente(true);

  if (!session?.access_token) {
    throw new Error('No se pudo refrescar la sesión. Volvé a iniciar sesión.');
  }

  try {
    const userCheck = await window.sbRealtime.auth.getUser(session.access_token);
    if (!userCheck?.data?.user) {
      throw new Error('JWT inválido luego del refresh');
    }
  } catch (_) {
    throw new Error('La sesión del usuario no es válida. Volvé a iniciar sesión.');
  }

  headers = construirHeaders(session, options.headers);

  response = await fetch(url, {
    ...options,
    headers
  });

  rawText = await response.text();

  if (response.status === 401) {
    throw new Error('La función protegida rechazó la sesión del usuario (401). Revisá la validación JWT en la Edge Function.');
  }

  return { response, rawText, session };
}

async function cancelarViajeCliente() {
  const btnCancelar = document.getElementById('btnCancelarViaje');
  const btnCancelarLive = document.getElementById('btnCancelarViajeLive');
  const btnConfirmar = document.getElementById('btnConfirmarViaje');

  const setCancelBtnLoading = (loading) => {
    const buttons = [btnCancelar, btnCancelarLive].filter(Boolean);

    buttons.forEach((btn) => {
      btn.disabled = loading;
      btn.style.opacity = loading ? '0.7' : '1';
      btn.style.pointerEvents = loading ? 'none' : 'auto';

      const isLive = btn.id === 'btnCancelarViajeLive';

      btn.innerHTML = loading
        ? '<span aria-hidden="true">⏳</span><span>Cancelando...</span>'
        : (
            isLive
              ? '<span aria-hidden="true">✕</span><span>Cancelar</span>'
              : '<span aria-hidden="true">✕</span><span>Cancelar viaje</span>'
          );
    });
  };

  try {
    if (!state?.viajeId) {
      notif.show(
        'Sin viaje activo',
        'No hay un viaje confirmado para cancelar',
        'warning'
      );
      actualizarBotonCancelarViaje?.();
      return;
    }

    let session = await obtenerSesionCliente(false);

    if (!session?.access_token || !session?.user) {
      notif.show(
        'Ingresá para continuar',
        'Necesitás iniciar sesión para cancelar el viaje',
        'info'
      );

      await loginConGoogleParaViaje();
      return;
    }

    if (decodificarJwtPayload(session.access_token)?.exp) {
      const expMs = Number(decodificarJwtPayload(session.access_token)?.exp || 0) * 1000;
      if (expMs && expMs - Date.now() < 60_000) {
        limpiarSesionCache();
        session = await obtenerSesionCliente(true);
      }
    }

    if (!session?.access_token || !session?.user) {
      notif.show(
        'Sesión vencida',
        'Volvé a iniciar sesión para cancelar el viaje',
        'warning'
      );
      await loginConGoogleParaViaje();
      return;
    }

    const confirmar = window.confirm('¿Querés cancelar este viaje?');
    if (!confirmar) return;

    setCancelBtnLoading(true);

    const { response: res, rawText } = await fetchEdgeFunctionWithAuthRetry(
      `${SUPABASE_URL}/functions/v1/cancelar-viaje-ts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          viaje_id: state.viajeId,
          cancelado_por: 'cliente',
          motivo: 'cancelacion_cliente'
        })
      }
    );

    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (parseErr) {
      console.error('[cancelarViajeCliente] JSON parse error:', parseErr, rawText);
      throw new Error('La función cancelar-viaje devolvió una respuesta inválida');
    }

    if (!res.ok || !data?.exito) {
      throw new Error(
        data?.error ||
        data?.message ||
        `No se pudo cancelar el viaje (HTTP ${res.status})`
      );
    }

    state.viajeEstado = 'CANCELADO';
    state.estadoViaje = 'CANCELADO';
    state.viajeId = null;
    state.choferId = null;
    state.choferLocation = null;
    state.routeData = null;
    state.cotizacion = null;

    limpiarViajeActivoEnStorage?.();
    desactivarModoViajeLive?.();

    actualizarBotonCancelarViaje?.();
    actualizarBotonCotizar?.();
    actualizarPanelPlanificacionViaje?.();
    actualizarResumenCotizacionCompacto?.();
    actualizarBotonConfirmarViaje?.();
    actualizarBotonReiniciarRuta?.();

    if (typeof actualizarEstadoSolicitudUI === 'function') {
      actualizarEstadoSolicitudUI({
        estado: 'CANCELADO',
        texto: 'Viaje cancelado'
      });
    }

    setSectionVisible?.('mapSection', false);
    setSectionVisible?.('quoteCard', false);

    if (btnConfirmar) {
      btnConfirmar.disabled = false;
      btnConfirmar.style.opacity = '1';
      btnConfirmar.style.pointerEvents = 'auto';
    }

    notif.show(
      'Viaje cancelado',
      'Tu viaje fue cancelado correctamente',
      'success'
    );

    if (typeof actualizarCentroNotificacionesViaje === 'function') {
      actualizarCentroNotificacionesViaje({
        estado: 'CANCELADO',
        texto: 'Tu viaje fue cancelado correctamente'
      });
    }
  } catch (err) {
    console.error('[cancelarViajeCliente] ERROR:', err);

    const msg = String(err?.message || '').toLowerCase();

    if (
      msg.includes('jwt') ||
      msg.includes('sesión') ||
      msg.includes('sesion') ||
      msg.includes('unauthorized') ||
      msg.includes('401')
    ) {
      notif.show(
        'Sesión vencida',
        'Volvé a iniciar sesión para cancelar el viaje',
        'warning'
      );
      return;
    }

    if (msg.includes('no pertenece al usuario autenticado') || msg.includes('403')) {
      notif.show(
        'No autorizado',
        'Este viaje no pertenece al usuario logueado',
        'error'
      );
      return;
    }

    if (
      msg.includes('ya fue completado') ||
      msg.includes('estado_final') ||
      msg.includes('estado_invalido') ||
      msg.includes('409')
    ) {
      notif.show(
        'No se puede cancelar',
        err?.message || 'El viaje ya no puede cancelarse',
        'warning'
      );
      return;
    }

    notif.show(
      'Error',
      err?.message || 'No se pudo cancelar el viaje',
      'error'
    );
  } finally {
    setCancelBtnLoading(false);
  }
}
function bindUIActions() {
  const btnAddStop = document.getElementById('btnAddStop');
  const btnCalcular = document.getElementById('btnCalcular');
  const btnCentrarRuta = document.getElementById('btnCentrarRuta');
  const btnReiniciarRuta = document.getElementById('btnReiniciarRuta');
  const btnConfirmarViaje = document.getElementById('btnConfirmarViaje');
  const btnCompartirRuta = document.getElementById('btnCompartirRuta');
  const btnCancelarViaje = document.getElementById('btnCancelarViaje');
  const btnCancelarViajeLive = document.getElementById('btnCancelarViajeLive');
  const btnChatChofer = document.getElementById('btnChatChofer');
  const btnSwapRoute = document.getElementById('btnSwapRoute');
  const btnToggleBreakdown = document.getElementById('btnToggleBreakdown');
  const btnLoginHeader = document.getElementById('btnLoginHeader');
  const btnLogoutHeader = document.getElementById('btnLogoutHeader');
  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const btnClearOrigen = document.getElementById('btnClearOrigen');
  const btnClearDestino = document.getElementById('btnClearDestino');

  if (inputOrigen && !inputOrigen.dataset.autocompleteBound) {
setupAutocomplete('inputOrigen', 'sugerenciasOrigen', (data) => {
  state.origen = data;

  if (inputOrigen) {
    inputOrigen.setAttribute(
      'title',
      data
        ? `${data.direccionCorta || data.direccion || ''}${data.direccionSecundaria ? ' - ' + data.direccionSecundaria : ''}`
        : ''
    );
  }

  actualizarBotonesClearDireccion();
  guardarViajeActivoEnStorage?.();

  setTimeout(() => {
    try {
      dibujarRutaEnMapa();
    } catch (_) {}
  }, 0);
});
    
    inputOrigen.dataset.autocompleteBound = '1';
  }

  if (inputDestino && !inputDestino.dataset.autocompleteBound) {
setupAutocomplete('inputDestino', 'sugerenciasDestino', (data) => {
  state.destino = data;

  if (inputDestino) {
    inputDestino.setAttribute(
      'title',
      data
        ? `${data.direccionCorta || data.direccion || ''}${data.direccionSecundaria ? ' - ' + data.direccionSecundaria : ''}`
        : ''
    );
  }

  actualizarBotonesClearDireccion();
  guardarViajeActivoEnStorage?.();

  setTimeout(() => {
    try {
      dibujarRutaEnMapa();
    } catch (_) {}
  }, 0);
});
    
    inputDestino.dataset.autocompleteBound = '1';
  }

  if (inputOrigen && !inputOrigen.dataset.clearBound) {
    inputOrigen.addEventListener('input', actualizarBotonesClearDireccion);
    inputOrigen.dataset.clearBound = '1';
  }

  if (inputDestino && !inputDestino.dataset.clearBound) {
    inputDestino.addEventListener('input', actualizarBotonesClearDireccion);
    inputDestino.dataset.clearBound = '1';
  }

  if (btnClearOrigen && !btnClearOrigen.dataset.bound) {
    btnClearOrigen.addEventListener('click', () => limpiarCampoDireccion('origen'));
    btnClearOrigen.dataset.bound = '1';
  }

  if (btnClearDestino && !btnClearDestino.dataset.bound) {
    btnClearDestino.addEventListener('click', () => limpiarCampoDireccion('destino'));
    btnClearDestino.dataset.bound = '1';
  }

  actualizarBotonesClearDireccion();
  if (btnAddStop && !btnAddStop.dataset.bound) {
    btnAddStop.addEventListener('click', agregarWaypoint);
    btnAddStop.dataset.bound = '1';
  }

  if (btnCalcular && !btnCalcular.dataset.bound) {
    btnCalcular.addEventListener('click', calcularRuta);
    btnCalcular.dataset.bound = '1';
  }

  if (btnCentrarRuta && !btnCentrarRuta.dataset.bound) {
    btnCentrarRuta.addEventListener('click', centrarEnRuta);
    btnCentrarRuta.dataset.bound = '1';
  }

  if (btnReiniciarRuta && !btnReiniciarRuta.dataset.bound) {
    btnReiniciarRuta.addEventListener('click', reiniciarRuta);
    btnReiniciarRuta.dataset.bound = '1';
  }

  if (btnConfirmarViaje && !btnConfirmarViaje.dataset.bound) {
    btnConfirmarViaje.addEventListener('click', confirmarViaje);
    btnConfirmarViaje.dataset.bound = '1';
  }

  if (btnCompartirRuta && !btnCompartirRuta.dataset.bound) {
    btnCompartirRuta.addEventListener('click', compartirRuta);
    btnCompartirRuta.dataset.bound = '1';
  }

  if (btnCancelarViaje && !btnCancelarViaje.dataset.bound) {
    btnCancelarViaje.addEventListener('click', cancelarViajeCliente);
    btnCancelarViaje.dataset.bound = '1';
  }

  if (btnCancelarViajeLive && !btnCancelarViajeLive.dataset.bound) {
    btnCancelarViajeLive.addEventListener('click', cancelarViajeCliente);
    btnCancelarViajeLive.dataset.bound = '1';
  }

if (btnChatChofer && !btnChatChofer.dataset.bound) {
  btnChatChofer.addEventListener('click', async () => {
    const viajeActivo =
      state?.viajeActual ||
      state?.viajeRealtime ||
      state?.viajePendiente ||
      (state?.viajeId ? { id: state.viajeId } : null) ||
      {};

    await actualizarCardChofer(viajeActivo);
    btnChatChofer.onclick?.();
  });
  btnChatChofer.dataset.bound = '1';
}
  

  if (btnSwapRoute && !btnSwapRoute.dataset.bound) {
    btnSwapRoute.addEventListener('click', intercambiarOrigenDestino);
    btnSwapRoute.dataset.bound = '1';
  }

  if (btnToggleBreakdown && !btnToggleBreakdown.dataset.bound) {
    btnToggleBreakdown.addEventListener('click', () => {
      if (btnToggleBreakdown.style.display === 'none') return;
      togglePriceBreakdown();
    });
    btnToggleBreakdown.dataset.bound = '1';
  }

  if (btnLoginHeader && !btnLoginHeader.dataset.bound) {
    btnLoginHeader.addEventListener('click', async () => {
      try {
        await loginConGoogleParaViaje();
      } catch (err) {
        console.error('[auth] login header error:', err);
        notif.show('Error', 'No se pudo iniciar sesión con Google', 'error');
      }
    });
    btnLoginHeader.dataset.bound = '1';
  }

  if (btnLogoutHeader && !btnLogoutHeader.dataset.bound) {
    btnLogoutHeader.addEventListener('click', cerrarSesionCliente);
    btnLogoutHeader.dataset.bound = '1';
  }
}  

  
  // ==========================================
  // MIMI NEXT LEVEL UI
  // Seguro: no rompe la lógica existente
  // ==========================================

  function initNextLevelUI() {
    initHeaderScrollFX();
    initPageTransitionsFX();
    initAuthLoadingFX();
    initButtonPulseFX();
    replayVehicleIntroIfNeeded();
  }

  function initHeaderScrollFX() {
    const header = document.querySelector('.header');
    if (!header) return;

    let ticking = false;

    const updateHeader = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      header.classList.toggle('header-scrolled', y > 20);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateHeader);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateHeader();
  }

  function initPageTransitionsFX() {
    const triggerTransition = () => {
      document.body.classList.add('page-transitioning');
      clearTimeout(window.__mimiPageTransitionTimer);
      window.__mimiPageTransitionTimer = setTimeout(() => {
        document.body.classList.remove('page-transitioning');
      }, 260);
    };

    const ids = [
      'btnCalcular',
      'btnConfirmarViaje',
      'btnCompartirRuta',
      'btnReiniciarRuta',
      'btnSwapRoute',
      'btnAddStop'
    ];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener('click', triggerTransition);
    });
  }

  function initAuthLoadingFX() {
    const btnLogin = document.getElementById('btnLoginHeader');
    const btnLogout = document.getElementById('btnLogoutHeader');

    btnLogin?.addEventListener('click', () => {
      setHeaderAuthLoading(true);
    });

    btnLogout?.addEventListener('click', () => {
      setHeaderAuthLoading(true);
      setTimeout(() => setHeaderAuthLoading(false), 1200);
    });

    window.addEventListener('pageshow', () => {
      setTimeout(() => setHeaderAuthLoading(false), 500);
    });
  }

  function initButtonPulseFX() {
    const btn = document.getElementById('btnCalcular');
    if (!btn) return;

    const stopPulseWhileTyping = () => {
      btn.style.animation = 'none';
      clearTimeout(window.__mimiBtnPulseTimer);
      window.__mimiBtnPulseTimer = setTimeout(() => {
        btn.style.animation = '';
      }, 1200);
    };

    ['inputOrigen', 'inputDestino'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', stopPulseWhileTyping);
    });
  }

  function replayVehicleIntroIfNeeded() {
    const jeep = document.querySelector('.vehicle-img');
    if (!jeep) return;

    jeep.addEventListener('load', () => {
      jeep.style.animation = 'none';
      void jeep.offsetWidth;
      jeep.style.animation = 'mimiJeepIntro 900ms cubic-bezier(0.22, 1, 0.36, 1) both';
    });
  }
window.renderSesionUI = renderSesionUI;
window.loginConGoogleParaViaje = loginConGoogleParaViaje;
window.setSectionVisible = setSectionVisible;

  (function patchRenderSesionUI() {
    if (typeof window.renderSesionUI !== 'function') return;

    const original = window.renderSesionUI;
    window.renderSesionUI = function patchedRenderSesionUI(session) {
      setHeaderAuthLoading(false);
      original(session);

      const avatar = document.getElementById('userAvatar');
      const box = document.getElementById('userSessionBox');

      if (session?.user && avatar && box) {
        box.animate(
          [
            { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
          ],
          {
            duration: 280,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
          }
        );

        avatar.animate(
          [
            { opacity: 0, transform: 'scale(0.86)' },
            { opacity: 1, transform: 'scale(1)' }
          ],
          {
            duration: 320,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'both'
          }
        );
      }
    };
  })();
function actualizarBotonesClearDireccion() {
  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const btnClearOrigen = document.getElementById('btnClearOrigen');
  const btnClearDestino = document.getElementById('btnClearDestino');

  if (btnClearOrigen) {
    btnClearOrigen.hidden = !inputOrigen?.value?.trim();
  }

  if (btnClearDestino) {
    btnClearDestino.hidden = !inputDestino?.value?.trim();
  }
}

function limpiarCampoDireccion(tipo) {
  if (tipo === 'origen') {
    const input = document.getElementById('inputOrigen');
    const sugerencias = document.getElementById('sugerenciasOrigen');

    if (input) {
      input.value = '';
      input.removeAttribute('title');
    }

    if (sugerencias) {
      sugerencias.innerHTML = '';
      hideSuggestions(sugerencias);
    }

    state.origen = null;
  }

  if (tipo === 'destino') {
    const input = document.getElementById('inputDestino');
    const sugerencias = document.getElementById('sugerenciasDestino');

    if (input) {
      input.value = '';
      input.removeAttribute('title');
    }

    if (sugerencias) {
      sugerencias.innerHTML = '';
      hideSuggestions(sugerencias);
    }

    state.destino = null;
  }

  guardarViajeActivoEnStorage?.();
  actualizarBotonesClearDireccion();

  setTimeout(() => {
    try {
      dibujarRutaEnMapa?.();
    } catch (_) {}
  }, 0);
}

(function patchLoginConGoogleParaViaje() {
  if (typeof window.loginConGoogleParaViaje !== 'function') return;

  const original = window.loginConGoogleParaViaje;
  window.loginConGoogleParaViaje = async function patchedLoginConGoogleParaViaje() {
    try {
      setHeaderAuthLoading(true);
      return await original();
    } catch (err) {
      setHeaderAuthLoading(false);
      throw err;
    }
  };
})();

(function patchSetSectionVisible() {
  if (typeof window.setSectionVisible !== 'function') return;

  const original = window.setSectionVisible;
  window.setSectionVisible = function patchedSetSectionVisible(elementId, visible) {
    original(elementId, visible);

    if (!visible) return;

    const el = document.getElementById(elementId);
    if (!el) return;

    el.animate(
      [
        { opacity: 0, transform: 'translateY(10px) scale(0.99)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ],
      {
        duration: 320,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both'
      }
    );
  };
})();

document.addEventListener('DOMContentLoaded', initNextLevelUI);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (typeof window.initClientPwaOnboarding === 'function') {
      await window.initClientPwaOnboarding();
    }
  } catch (err) {
    console.warn('[client-pwa] init error:', err);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  
  bindUIActions();

  setTimeout(async () => {
    try {
      const session = await obtenerSesionCliente(false);

      if (!session?.access_token || !session?.user) {
        console.log('[legal-gate] auto check omitido: sin sesión');
        return;
      }

      console.log('[legal-gate] auto check client');
      await enforceLegalGate('client');
    } catch (err) {
      console.error('[legal-gate] auto check error:', err);
    }
  }, 1200);

  try {
    if (!state.currentLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.currentLocation = {
            lat: Number(pos.coords.latitude),
            lng: Number(pos.coords.longitude)
          };
        },
        () => {},
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 60000
        }
      );
    }
  } catch (_) {}
});

(function initClientInstallBannerScrollBehavior() {
  const banner = document.getElementById('clientInstallBanner');
  if (!banner) return;

  let lastY = window.scrollY || 0;
  let ticking = false;

  function updateOnScroll() {
    const currentY = window.scrollY || 0;
    const delta = currentY - lastY;

    if (currentY > 70 && delta > 6) {
      banner.classList.add('is-hidden-by-scroll');
    } else if (delta < -6 || currentY <= 24) {
      banner.classList.remove('is-hidden-by-scroll');
    }

    lastY = currentY;
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateOnScroll);
        ticking = true;
      }
    },
    { passive: true }
  );
})();

function initTripLiveCardDraggable() {
  const card = document.getElementById('quoteCard');
  if (!card || card.dataset.dragReady === '1') return;

  card.dataset.dragReady = '1';

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  const onStart = (y) => {
    if (!document.body.classList.contains('trip-live-mode')) return;
    dragging = true;
    startY = y;
    card.style.transition = 'none';
  };

  const onMove = (y) => {
    if (!dragging) return;
    currentY = Math.max(0, y - startY);
    card.style.transform = `translateY(${Math.min(currentY, 220)}px)`;
  };

  const onEnd = () => {
    if (!dragging) return;

    dragging = false;
    card.style.transition = 'transform 0.25s ease';

    if (currentY > 120) {
      card.style.transform = 'translateY(180px)';
      card.classList.add('trip-live-collapsed');
    } else {
      card.style.transform = 'translateY(0)';
      card.classList.remove('trip-live-collapsed');
    }

    currentY = 0;
  };

  card.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches?.[0]) return;
      onStart(e.touches[0].clientY);
    },
    { passive: true }
  );

  card.addEventListener(
    'touchmove',
    (e) => {
      if (!e.touches?.[0]) return;
      onMove(e.touches[0].clientY);
    },
    { passive: true }
  );

  card.addEventListener('touchend', onEnd);
}
