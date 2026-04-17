(function () {
  function limpiarCanalChoferRealtime() {
    try {
      if (window.choferRealtimeChannel && window.sbRealtime) {
        window.sbRealtime.removeChannel(window.choferRealtimeChannel);
      }
    } catch (err) {
      console.warn('[realtime-chofer] no se pudo remover canal previo:', err);
    } finally {
      window.choferRealtimeChannel = null;
    }
  }

  function limpiarMarkerChofer() {
    try {
      if (window.choferMarker) window.choferMarker.remove();
    } catch (_) {}

    try {
      if (window.choferPulseMarker) window.choferPulseMarker.remove();
    } catch (_) {}

    window.choferMarker = null;
    window.choferPulseMarker = null;

    if (window.state) {
      window.state.choferLocation = null;
    }
  }

  function asegurarAnimacionMarkerChofer() {
    if (document.getElementById('mimi-driver-marker-style')) return;

    const style = document.createElement('style');
    style.id = 'mimi-driver-marker-style';
    style.textContent = `
      @keyframes mimiDriverPulse {
        0% { transform: scale(0.85); opacity: 0.85; }
        70% { transform: scale(1.65); opacity: 0; }
        100% { transform: scale(1.65); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  function crearElementoMarkerChofer() {
    const wrap = document.createElement('div');
    wrap.className = 'mimi-driver-marker-wrap';
    wrap.style.width = '26px';
    wrap.style.height = '26px';
    wrap.style.position = 'relative';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';

    const pulse = document.createElement('div');
    pulse.style.position = 'absolute';
    pulse.style.width = '26px';
    pulse.style.height = '26px';
    pulse.style.borderRadius = '999px';
    pulse.style.background = 'rgba(21,101,192,0.18)';
    pulse.style.border = '2px solid rgba(21,101,192,0.22)';
    pulse.style.animation = 'mimiDriverPulse 1.8s ease-out infinite';

    const dot = document.createElement('div');
    dot.style.width = '14px';
    dot.style.height = '14px';
    dot.style.borderRadius = '999px';
    dot.style.background = '#1565c0';
    dot.style.border = '3px solid #ffffff';
    dot.style.boxShadow = '0 4px 14px rgba(0,0,0,0.22)';

    wrap.appendChild(pulse);
    wrap.appendChild(dot);
    return wrap;
  }

function actualizarMarkerChoferEnMapa(lat, lng, opts = {}) {
  const mapa = window.mapaCliente;
  const listo = window.mapReady;

  if (!mapa || !listo) {
    console.warn('[chofer-map] mapa no listo, reintentando...', { mapa: !!mapa, listo });

    setTimeout(() => {
      actualizarMarkerChoferEnMapa(lat, lng, opts);
    }, 500);

    return;
  }

  if (typeof window.coordenadasValidas !== 'function') return;
  if (!window.coordenadasValidas(lat, lng)) return;
  if (!window.maplibregl) return;

  asegurarAnimacionMarkerChofer();

  const lngLat = [Number(lng), Number(lat)];

  if (!window.choferMarker) {
    window.choferMarker = new window.maplibregl.Marker({
      element: crearElementoMarkerChofer(),
      anchor: 'center'
    })
      .setLngLat(lngLat)
      .addTo(mapa);

    console.log('[chofer-map] marker creado', { lat, lng });

  } else {
    window.choferMarker.setLngLat(lngLat);
    console.log('[chofer-map] marker actualizado', { lat, lng });
  }

  if (window.state) {
    window.state.choferLocation = {
      lat: Number(lat),
      lng: Number(lng),
      heading: Number(opts?.heading || 0)
    };
  }
}
  const estadoUpper = String(window.state?.estadoViaje || '').toUpperCase();
const origenCliente = window.state?.origen || null;

if (
  ['ASIGNADO', 'ACEPTADO', 'EN_CAMINO'].includes(estadoUpper) &&
  origenCliente &&
  typeof window.dibujarRutaChoferHastaCliente === 'function'
) {
  window.dibujarRutaChoferHastaCliente(
    { lat: Number(lat), lng: Number(lng) },
    { lat: Number(origenCliente.lat), lng: Number(origenCliente.lng) }
  );
}
async function cargarUbicacionActualChofer(choferId) {
  if (!choferId || !window.sbRealtime) return null;

  try {
    const { data: sessionData, error: sessionError } = await window.sbRealtime.auth.getSession();

    if (sessionError) {
      console.warn('[realtime-chofer] error obteniendo sesión:', sessionError);
      return null;
    }

    const accessToken = sessionData?.session?.access_token || null;
    if (!accessToken) {
      console.warn('[realtime-chofer] no hay access token para leer ubicación del chofer');
      return null;
    }

    const url =
      `https://xrphpqmutvadjrucqicn.supabase.co/rest/v1/choferes` +
      `?select=id_uuid,lat,lng,heading,last_seen_at` +
      `&id_uuid=eq.${encodeURIComponent(choferId)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });

    const json = await resp.json().catch(() => null);

    if (!resp.ok) {
      console.warn('[realtime-chofer] error leyendo ubicación inicial:', json || resp.status);
      return null;
    }

    const data = Array.isArray(json) ? (json[0] || null) : null;

    if (!data) {
      console.warn('[realtime-chofer] sin fila visible para el chofer asignado', { choferId });
      return null;
    }

    if (
      typeof window.coordenadasValidas === 'function' &&
      window.coordenadasValidas(data.lat, data.lng)
    ) {
      actualizarMarkerChoferEnMapa(data.lat, data.lng, {
        heading: data.heading || 0
      });
    }

    return data;
  } catch (err) {
    console.warn('[realtime-chofer] error ubicación inicial chofer:', err);
    return null;
  }
}
  function suscribirseUbicacionChoferRealtime(choferId) {
    if (!choferId || !window.sbRealtime) {
      console.warn('[realtime-chofer] faltan datos para suscribirse');
      return null;
    }

    if (
      window.state?.choferId &&
      String(window.state.choferId) === String(choferId) &&
      window.choferRealtimeChannel
    ) {
      return window.choferRealtimeChannel;
    }

    limpiarCanalChoferRealtime();

    if (window.state) {
      window.state.choferId = choferId;
    }

    cargarUbicacionActualChofer(choferId).catch(() => null);

    window.choferRealtimeChannel = window.sbRealtime
      .channel(`chofer-location-${choferId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'choferes',
          filter: `id_uuid=eq.${choferId}`
        },
        (payload) => {
        console.log('[chofer realtime] update recibido', payload?.new);

          try {
            const row = payload?.new || {};
            if (typeof window.coordenadasValidas !== 'function') return;
            if (!window.coordenadasValidas(row.lat, row.lng)) return;

            actualizarMarkerChoferEnMapa(row.lat, row.lng, {
              heading: row.heading || 0
            });

            const estadoUpper = String(window.state?.estadoViaje || '').toUpperCase();

            if (
              ['ASIGNADO', 'ACEPTADO', 'EN_CAMINO'].includes(estadoUpper) &&
              typeof window.actualizarEstadoSolicitudUI === 'function'
            ) {
              window.actualizarEstadoSolicitudUI({
                estado: 'EN_CAMINO',
                texto: 'Tu chofer se está acercando al punto de retiro.'
              });
            }
          } catch (err) {
            console.error('[realtime-chofer] error procesando ubicación:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[realtime-chofer] subscribe status:', status);
      });

    return window.choferRealtimeChannel;
  }

  window.limpiarCanalChoferRealtime = limpiarCanalChoferRealtime;
  window.limpiarMarkerChofer = limpiarMarkerChofer;
  window.actualizarMarkerChoferEnMapa = actualizarMarkerChoferEnMapa;
  window.cargarUbicacionActualChofer = cargarUbicacionActualChofer;
  window.suscribirseUbicacionChoferRealtime = suscribirseUbicacionChoferRealtime;
})();
