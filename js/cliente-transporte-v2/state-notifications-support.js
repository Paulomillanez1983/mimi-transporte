// ESTADO GLOBAL
// ==========================================
let state = {
  origen: null,
  destino: null,
  waypoints: [],
  routeData: null,
  map: null,
  markers: [],
  cotizacion: null,
  viajeId: null,
  estadoViaje: null,
  choferId: null,
  choferLocation: null,

  // 🔥 tracking persistente
  driverETA: null,
  driverHeading: null,
  lastTrackingUpdate: null
};
window.mapaCliente = null;
window.mapReady = false;

let mapaCliente = window.mapaCliente;
let mapReady = window.mapReady;

let isCalculatingQuote = false;
let currentQuoteRequestId = 0;
let waypointCounter = 0;
let routeAnimationFrame = null;
let routeDashPhase = 0;

window.choferRealtimeChannel = null;
window.choferMarker = null;
window.choferPulseMarker = null;  
// ==========================================
// NOTIFICACIONES
// ==========================================
class NotificationSystem {
  constructor() {
    this.container = document.getElementById('toastContainer');
  }

  show(title, message, type = 'info', duration = 4000) {
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" type="button" aria-label="Cerrar notificación">×</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => toast.remove());

    this.container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'slideInDown 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }
}

const notif = new NotificationSystem();


  
// ==========================================
// HEADER NOTIFICATIONS (PERSISTENTE)
// ==========================================
const notifBtn = document.getElementById('tripNotificationsBtn');
const notifPanel = document.getElementById('tripNotificationsPanel');
const notifOverlay = document.getElementById('tripNotificationsOverlay');
const notifList = document.getElementById('tripNotificationsList');
const notifSummary = document.getElementById('tripNotificationsSummary');
const notifStatusCard = document.getElementById('tripNotificationsStatusCard');
const notifStatusTitle = document.getElementById('tripNotificationsStatusTitle');
const notifStatusText = document.getElementById('tripNotificationsStatusText');
const notifDot = document.querySelector('.trip-notifications-dot');
const notifBadge = document.getElementById('tripNotificationsBadge');
const notifMarkReadBtn = document.getElementById('tripNotificationsMarkReadBtn');
const notifClearBtn = document.getElementById('tripNotificationsClearBtn');

const NOTIF_STORAGE_KEY = 'mimi_trip_notifications_v2';
const NOTIF_UNREAD_KEY = 'mimi_trip_notifications_unread_v2';
const NOTIF_LAST_STATE_KEY = 'mimi_trip_last_state_v2';
const ACTIVE_TRIP_STORAGE_KEY = 'mimi_trip_active_v2';

const MAX_NOTIFICATIONS = 30;

let historial = [];
let unreadCount = 0;
let ultimoEstadoNotificado = null;
let currentTripChannel = null;
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizarEstadoUpper(v) {
  return String(v || '').trim().toUpperCase();
}

function guardarNotificacionesEnStorage() {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(historial));
    localStorage.setItem(NOTIF_UNREAD_KEY, String(unreadCount));
    localStorage.setItem(NOTIF_LAST_STATE_KEY, ultimoEstadoNotificado || '');
  } catch (err) {
    console.warn('[notif] no se pudo persistir storage:', err);
  }
}

function cargarNotificacionesDesdeStorage() {
  try {
    const hist = JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || '[]');
    historial = Array.isArray(hist) ? hist : [];
    unreadCount = Math.max(0, Number(localStorage.getItem(NOTIF_UNREAD_KEY) || '0'));
    ultimoEstadoNotificado = localStorage.getItem(NOTIF_LAST_STATE_KEY) || null;
  } catch (err) {
    console.warn('[notif] no se pudo leer storage:', err);
    historial = [];
    unreadCount = 0;
    ultimoEstadoNotificado = null;
  }
}
  function marcarNotificacionesComoLeidas() {
  historial = historial.map(item => ({
    ...item,
    read: true
  }));

  unreadCount = 0;

  renderizarCentroNotificaciones();
  actualizarBadgeNotificaciones();
  guardarNotificacionesEnStorage();
}
function marcarNotificacionComoLeidaPorId(id) {
  let cambio = false;

  historial = historial.map(item => {
    if (String(item.id) !== String(id)) return item;

    if (!item.read) {
      cambio = true;
      return { ...item, read: true };
    }

    return item;
  });

  if (cambio) {
    unreadCount = historial.filter(item => !item.read).length;
    renderizarCentroNotificaciones();
    actualizarBadgeNotificaciones();
    guardarNotificacionesEnStorage();
  }
}
function vaciarNotificaciones() {
  historial = [];
  unreadCount = 0;

  renderizarCentroNotificaciones();
  actualizarBadgeNotificaciones();
  guardarNotificacionesEnStorage();
}

function resolverEstadoViajeCliente(viajeLike = {}) {
  const estadoBase = normalizarEstadoUpper(viajeLike?.estado);

  // Respetar el estado REAL del backend.
  if (!estadoBase) {
    return 'PENDIENTE';
  }

  // Normalizaciones suaves para compatibilidad
  if (estadoBase === 'EN_CURSO') return 'INICIADO';
  if (estadoBase === 'COMPLETADO') return 'COMPLETADO';
  if (estadoBase === 'CANCELADO') return 'CANCELADO';

  return estadoBase;
}async function enriquecerViajeConChofer(viajeLike = null) {
  if (!viajeLike || typeof viajeLike !== 'object') return viajeLike;

  const choferNombreExistente = String(
    viajeLike?.chofer_nombre ||
    viajeLike?.choferNombre ||
    ''
  ).trim();
  const choferTelefonoExistente = String(
    viajeLike?.chofer_telefono ||
    viajeLike?.choferTelefono ||
    ''
  ).trim();

  if (choferNombreExistente && choferTelefonoExistente) {
    return viajeLike;
  }

  const choferId = viajeLike?.assigned_driver_id || viajeLike?.chofer_id_uuid || null;
  if (!choferId || !window.supabaseRest) return viajeLike;

  try {
const { data, error } = await window.supabaseRest
  .from('choferes')
  .select('id_uuid, nombre, telefono, email, lat, lng, heading, last_seen_at')
  .eq('id_uuid', choferId)
  .single();
    
    if (error || !data) {
      if (error) {
        console.warn('[cliente] no se pudo enriquecer chofer:', error);
      }
      return viajeLike;
    }

     return {
    ...viajeLike,
    chofer_nombre: choferNombreExistente || data.nombre || data.email || '',
    chofer_telefono: choferTelefonoExistente || data.telefono || '',
    chofer_lat: Number(data.lat),
    chofer_lng: Number(data.lng),
    chofer_heading: Number(data.heading || 0),
    chofer_last_seen_at: data.last_seen_at || null
  };

  } catch (err) {
    console.warn('[cliente] error enriqueciendo viaje con chofer:', err);
    return viajeLike;
  }
}

function construirMensajeEstadoViaje(viaje = {}, estado = '', fallback = '') {
  const estadoUpper = normalizarEstadoUpper(estado);
  const choferNombre = String(
    viaje?.chofer_nombre ||
    viaje?.choferNombre ||
    ''
  ).trim();

  if ((estadoUpper === 'ASIGNADO' || estadoUpper === 'ACEPTADO') && choferNombre) {
    return `${choferNombre} aceptó tu viaje y está yendo a buscarte.`;
  }

  if (estadoUpper === 'EN_CAMINO' && choferNombre) {
    return `${choferNombre} va en camino a tu punto de retiro.`;
  }

  return fallback;
}

function guardarViajeActivoEnStorage(extra = {}) {
  try {
    const estado = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

    const estadosSeguimiento = [
      'ASIGNADO',
      'ACEPTADO',
      'EN_CAMINO',
      'INICIADO',
      'EN_CURSO'
    ];

    const enSeguimiento = estadosSeguimiento.includes(estado);

    const previous = leerViajeActivoEnStorage() || {};
    const nowIso = new Date().toISOString();

    const etaValue =
      Number.isFinite(Number(extra?.driverETA)) ? Number(extra.driverETA) :
      Number.isFinite(Number(state?.driverETA)) ? Number(state.driverETA) :
      Number.isFinite(Number(previous?.driverETA)) ? Number(previous.driverETA) :
      null;

    const headingValue =
      Number.isFinite(Number(extra?.driverHeading)) ? Number(extra.driverHeading) :
      Number.isFinite(Number(state?.driverHeading)) ? Number(state.driverHeading) :
      Number.isFinite(Number(previous?.driverHeading)) ? Number(previous.driverHeading) :
      null;

    const trackingLocation =
      extra?.choferLocation ||
      state?.choferLocation ||
      previous?.choferLocation ||
      null;

    const payload = {
      viajeId: state?.viajeId || previous?.viajeId || null,
      estadoViaje: state?.estadoViaje || state?.viajeEstado || previous?.estadoViaje || null,
      viajeEstado: state?.viajeEstado || state?.estadoViaje || previous?.viajeEstado || null,

      origen: state?.origen || previous?.origen || null,
      destino: state?.destino || previous?.destino || null,
      waypoints: Array.isArray(state?.waypoints)
        ? state.waypoints
        : (Array.isArray(previous?.waypoints) ? previous.waypoints : []),

      choferId: state?.choferId || previous?.choferId || null,
      choferLocation: trackingLocation,

      driverETA: etaValue,
      driverHeading: headingValue,
      lastTrackingUpdate:
        extra?.lastTrackingUpdate ||
        state?.lastTrackingUpdate ||
        previous?.lastTrackingUpdate ||
        nowIso,

      routeData: state?.routeData || previous?.routeData || null,
      cotizacion: enSeguimiento ? null : (state?.cotizacion || previous?.cotizacion || null),

      inputOrigen: document.getElementById('inputOrigen')?.value || previous?.inputOrigen || '',
      inputDestino: document.getElementById('inputDestino')?.value || previous?.inputDestino || '',
      waypointTexts: [...document.querySelectorAll('.waypoint-input')].map((el) => el.value || ''),

      ts: Date.now(),
      updatedAt: nowIso
    };

    localStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[trip] no se pudo guardar viaje activo:', err);
  }
}
function limpiarViajeActivoEnStorage() {
  try {
    localStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
  } catch (_) {}
}

function leerViajeActivoEnStorage() {
  try {
    const raw = localStorage.getItem(ACTIVE_TRIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
  function restaurarInputsViajeDesdeStorage(viajeLocal) {
  const inputOrigen = document.getElementById('inputOrigen');
  const inputDestino = document.getElementById('inputDestino');
  const waypointsContainer = document.getElementById('waypointsContainer');

  if (inputOrigen) {
    inputOrigen.value =
      viajeLocal?.inputOrigen ||
      viajeLocal?.origen?.direccionCorta ||
      viajeLocal?.origen?.direccion ||
      '';
  }

  if (inputDestino) {
    inputDestino.value =
      viajeLocal?.inputDestino ||
      viajeLocal?.destino?.direccionCorta ||
      viajeLocal?.destino?.direccion ||
      '';
  }

  if (waypointsContainer) {
    waypointsContainer.innerHTML = '';
  }

  state.waypoints = [];
  waypointCounter = 0;

  const waypoints = Array.isArray(viajeLocal?.waypoints) ? viajeLocal.waypoints : [];
  const waypointTexts = Array.isArray(viajeLocal?.waypointTexts) ? viajeLocal.waypointTexts : [];

  waypoints.forEach((wp, index) => {
    agregarWaypoint();

    const ultimoWp = state.waypoints[state.waypoints.length - 1];
    if (ultimoWp) {
      ultimoWp.data = wp?.data || wp || null;

      const input = document.getElementById(ultimoWp.id);
      if (input) {
        input.value =
          waypointTexts[index] ||
          ultimoWp?.data?.direccionCorta ||
          ultimoWp?.data?.direccion ||
          '';

        if (ultimoWp?.data) {
          input.setAttribute('title', construirTooltip(ultimoWp.data));
        }
      }
    }
  });

  actualizarTimeline();
}
function estadoUsaSeguimientoChofer(estado) {
  const e = String(estado || '').trim().toUpperCase();
  return [
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ].includes(e);
}
function calcularEtaMinutosSimple(origen, destino) {
  try {
    if (!coordenadasValidas(origen?.lat, origen?.lng)) return null;
    if (!coordenadasValidas(destino?.lat, destino?.lng)) return null;

    const toRad = (deg) => (Number(deg) * Math.PI) / 180;
    const R = 6371000;

    const lat1 = toRad(origen.lat);
    const lat2 = toRad(destino.lat);
    const dLat = toRad(Number(destino.lat) - Number(origen.lat));
    const dLng = toRad(Number(destino.lng) - Number(origen.lng));

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanciaMetros = R * c;

    // velocidad urbana simple ~ 28 km/h
    const minutos = (distanciaMetros / 1000) / 28 * 60;

    return Math.max(1, Math.round(minutos));
  } catch (_) {
    return null;
  }
}

function obtenerObjetivoSeguimientoSegunEstado(estado, viajeLike = null) {
  const estadoUpper = String(estado || '').trim().toUpperCase();
  const viaje = viajeLike || {};

  if (estadoUsaDestinoFinal(estadoUpper)) {
    return viaje?.destino || state?.destino || null;
  }

  return viaje?.origen || state?.origen || null;
}

async function hidratarTrackingDesdeStorage(viajeLocal) {
  try {
    if (!viajeLocal || !estadoUsaSeguimientoChofer(viajeLocal?.estadoViaje || viajeLocal?.viajeEstado)) {
      return;
    }

    const estado = normalizarEstadoUpper(viajeLocal?.estadoViaje || viajeLocal?.viajeEstado);

    state.choferId = viajeLocal?.choferId || state?.choferId || null;
    state.choferLocation = viajeLocal?.choferLocation || state?.choferLocation || null;
    state.driverETA = Number.isFinite(Number(viajeLocal?.driverETA))
      ? Number(viajeLocal.driverETA)
      : null;
    state.driverHeading = Number.isFinite(Number(viajeLocal?.driverHeading))
      ? Number(viajeLocal.driverHeading)
      : null;
    state.lastTrackingUpdate = viajeLocal?.lastTrackingUpdate || null;

    activarModoViajeLive?.();

    const objetivo = obtenerObjetivoSeguimientoSegunEstado(estado, viajeLocal);

    if (coordenadasValidas(state?.choferLocation?.lat, state?.choferLocation?.lng)) {
      if (typeof window.actualizarPosicionChoferEnMapa === 'function') {
        window.actualizarPosicionChoferEnMapa({
          lat: Number(state.choferLocation.lat),
          lng: Number(state.choferLocation.lng),
          heading: Number(state.driverHeading || 0),
          animate: false
        });
      }

      if (objetivo && typeof window.dibujarRutaChoferHastaCliente === 'function') {
        window.dibujarRutaChoferHastaCliente(
          {
            lat: Number(state.choferLocation.lat),
            lng: Number(state.choferLocation.lng)
          },
          {
            lat: Number(objetivo.lat),
            lng: Number(objetivo.lng)
          }
        );
      }

      if (!Number.isFinite(Number(state.driverETA)) && objetivo) {
        state.driverETA = calcularEtaMinutosSimple(state.choferLocation, objetivo);
      }

      guardarViajeActivoEnStorage({
        choferLocation: state.choferLocation,
        driverETA: state.driverETA,
        driverHeading: state.driverHeading,
        lastTrackingUpdate: state.lastTrackingUpdate || new Date().toISOString()
      });
    }

    if (typeof actualizarMetaTrackingChoferUI === 'function') {
      actualizarMetaTrackingChoferUI({
        estado,
        etaMin: state.driverETA,
        lastTrackingUpdate: state.lastTrackingUpdate
      });
    }
  } catch (err) {
    console.warn('[tracking] no se pudo hidratar tracking desde storage:', err);
  }
}

async function reconectarRealtimeViajeTrasRefresh(viajeId) {
  try {
    if (!viajeId) return;

    await syncRealtimeAuthToken(true);

    if (typeof suscribirseEstadoViajeRealtime === 'function') {
      suscribirseEstadoViajeRealtime(viajeId);
    }

    if (typeof suscribirseUbicacionChoferRealtime === 'function') {
      suscribirseUbicacionChoferRealtime(viajeId);
    }
  } catch (err) {
    console.warn('[reconnect] no se pudo reconectar realtime del viaje:', err);
  }
}
function estadoUsaDestinoFinal(estado) {
  const e = String(estado || '').trim().toUpperCase();
  return [
    'INICIADO',
    'EN_CURSO'
  ].includes(e);
}  

function activarModoViajeLive() {
  document.body.classList.add('trip-live-mode');

  const driverCard = document.getElementById('tripDriverCard');
  const actions = document.getElementById('tripActiveActions');
  const card = document.getElementById('quoteCard');

  if (driverCard) driverCard.hidden = false;
  if (actions) actions.hidden = false;
  if (card) card.classList.remove('trip-live-collapsed');

  actualizarBotonCancelarViaje?.();
  initTripLiveCardDraggable?.();

  console.log('[LIVE MODE] activado');
}
function desactivarModoViajeLive() {
  document.body.classList.remove('trip-live-mode');

  const driverCard = document.getElementById('tripDriverCard');
  const actions = document.getElementById('tripActiveActions');
  const card = document.getElementById('quoteCard');

  if (driverCard) driverCard.hidden = true;
  if (actions) actions.hidden = true;
  if (card) card.classList.remove('trip-live-collapsed');

  console.log('[LIVE MODE] desactivado');
}
  
function actualizarCardChofer(viaje = {}) {
  const card = document.getElementById('tripDriverCard');
  const avatar = document.getElementById('tripDriverAvatar');
  const name = document.getElementById('tripDriverName');
  const meta = document.getElementById('tripDriverMeta');
  const contact = document.getElementById('tripDriverContact');
  const btnChat = document.getElementById('btnChatChofer');

  if (!card || !name || !meta || !contact) return;

  const estado = String(
    viaje?.estado ||
    state?.estadoViaje ||
    state?.viajeEstado ||
    ''
  ).toUpperCase();

  const estadosConChoferReal = ['ASIGNADO', 'ACEPTADO', 'EN_CAMINO', 'INICIADO', 'EN_CURSO'];

  const choferNombre = String(
    viaje?.chofer_nombre ||
    viaje?.choferNombre ||
    viaje?.driver_name ||
    ''
  ).trim();

  const choferTelefono = String(
    viaje?.chofer_telefono ||
    viaje?.choferTelefono ||
    viaje?.driver_phone ||
    ''
  ).trim();

  card.hidden = false;

  if (!estadosConChoferReal.includes(estado)) {
    name.textContent = 'Estado del viaje';

if (estado === 'OFERTANDO' || estado === 'OFERTADO') {
  meta.textContent = 'Estamos notificando choferes cercanos';
} else if (estado === 'SIN_CHOFER') {
  meta.textContent = 'Todavía no encontramos un chofer';
} else {
  meta.textContent = 'Buscando chofer disponible';
}
    contact.textContent = 'Sin chofer asignado todavía';

    if (avatar) {
      avatar.textContent = '🚐';
    }

if (btnChat) {
  btnChat.onclick = async () => {
    try {
      const viajeChat = {
        ...viaje,
        id: viaje?.id || state?.viajeId || null,
        assigned_driver_id:
          viaje?.assigned_driver_id ||
          viaje?.chofer_id_uuid ||
          state?.choferId ||
          null,
        chofer_id_uuid:
          viaje?.chofer_id_uuid ||
          viaje?.assigned_driver_id ||
          state?.choferId ||
          null,
        chofer_nombre:
          viaje?.chofer_nombre ||
          viaje?.choferNombre ||
          state?.choferNombre ||
          '',
        cliente_nombre:
          state?.sessionUser?.nombre ||
          state?.profile?.nombre ||
          'Cliente'
      };

      if (!window.tripChat?.openTripChatForClientTrip) {
        notif.show('Chat', 'El módulo de chat todavía no está disponible', 'warning');
        return;
      }

      await window.tripChat.openTripChatForClientTrip(viajeChat);
    } catch (err) {
       console.error('[cliente.chatChofer]', err);
       notif.show('Chat', err?.message || 'No se pudo abrir el chat con el chofer', 'error');
      }
    };
   }
  }
}
  



async function restaurarMapaYCotizacionDesdeStorage(viajeLocal) {
  try {
    if (!viajeLocal) return;

    state.origen = viajeLocal.origen || null;
    state.destino = viajeLocal.destino || null;
    state.waypoints = Array.isArray(viajeLocal.waypoints) ? viajeLocal.waypoints : [];
    state.routeData = viajeLocal.routeData || null;
    state.cotizacion = viajeLocal.cotizacion || null;

    restaurarInputsViajeDesdeStorage(viajeLocal);

    if (state.cotizacion) {
      mostrarCotizacion(
        Number(state.cotizacion?.precio || 0),
        Number(state.cotizacion?.distancia_km || state.routeData?.distance || 0),
        Number(state.cotizacion?.duracion_min || state.routeData?.duration || 0)
      );
    }

const estadoActual = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();
const usarSeguimientoChofer = estadoUsaSeguimientoChofer(estadoActual);
const usarDestinoFinal = estadoUsaDestinoFinal(estadoActual);
    if (usarSeguimientoChofer) {
  activarModoViajeLive();
  actualizarCardChofer(viajeLocal || {});
} else {
  desactivarModoViajeLive();
}
    
setSectionVisible('quoteCard', true);
setSectionVisible('mapSection', true);

await initMapa();

setTimeout(() => {
  try {
    mapaCliente?.resize?.();
  } catch (_) {}
}, 80);

await esperarMapaClienteListo(2500);

setTimeout(() => {
  try {
    mapaCliente?.resize?.();
  } catch (_) {}
}, 250);      
    
if (usarSeguimientoChofer) {
  if (typeof limpiarCapasRutaMapa === 'function') {
    limpiarCapasRutaMapa();
  }

  if (typeof limpiarMarkersRutaCotizacion === 'function') {
    limpiarMarkersRutaCotizacion();
  }

  if (typeof window.limpiarRutaChoferHastaCliente === 'function') {
    window.limpiarRutaChoferHastaCliente();
  }

const origenCliente = state?.origen || null;
const destinoCliente = state?.destino || null;
const puntoObjetivo = usarDestinoFinal ? destinoCliente : origenCliente;

let rutaSeguimientoDibujada = false;

console.log('[restore-map] estadoActual', estadoActual);
console.log('[restore-map] state.choferId', state?.choferId);
console.log('[restore-map] state.choferLocation', state?.choferLocation);
console.log('[restore-map] origenCliente', origenCliente);
console.log('[restore-map] destinoCliente', destinoCliente);
console.log('[restore-map] puntoObjetivo', puntoObjetivo);
  
if (typeof mostrarSoloPickupClienteEnMapa === 'function' && !usarDestinoFinal) {
  try {
    mostrarSoloPickupClienteEnMapa();
  } catch (err) {
    console.warn('[restore-map] no se pudo mostrar pickup', err);
  }
}
  
try {
  if (
    state?.choferLocation &&
    puntoObjetivo &&
    typeof window.dibujarRutaChoferHastaCliente === 'function'
  ) {
    await window.dibujarRutaChoferHastaCliente(
      {
        lat: Number(state.choferLocation.lat),
        lng: Number(state.choferLocation.lng)
      },
      {
        lat: Number(puntoObjetivo.lat),
        lng: Number(puntoObjetivo.lng)
      }
    );
    rutaSeguimientoDibujada = true;
    console.log('[restore-map] ruta seguimiento dibujada con choferLocation');
  } else if (
    state?.choferId &&
    puntoObjetivo &&
    typeof window.cargarUbicacionActualChofer === 'function' &&
    typeof window.dibujarRutaChoferHastaCliente === 'function'
  ) {
    const driverData = await window.cargarUbicacionActualChofer(state.choferId);
    console.log('[restore-map] driverData', driverData);

    if (
      driverData &&
      Number.isFinite(Number(driverData.lat)) &&
      Number.isFinite(Number(driverData.lng))
    ) {
      state.choferLocation = {
        lat: Number(driverData.lat),
        lng: Number(driverData.lng)
      };

      await window.dibujarRutaChoferHastaCliente(
        {
          lat: Number(driverData.lat),
          lng: Number(driverData.lng)
        },
        {
          lat: Number(puntoObjetivo.lat),
          lng: Number(puntoObjetivo.lng)
        }
      );
      rutaSeguimientoDibujada = true;
      console.log('[restore-map] ruta seguimiento dibujada con driverData');
    }
  }
} catch (err) {
  console.warn('[restore-map] error dibujando seguimiento', err);
}
  
if (!rutaSeguimientoDibujada && puntoObjetivo) {
  console.warn('[restore-map] fallback a centrar objetivo');

  if (
    state?.choferLocation &&
    typeof window.dibujarRutaChoferHastaCliente === 'function'
  ) {
    try {
      await window.dibujarRutaChoferHastaCliente(
        {
          lat: Number(state.choferLocation.lat),
          lng: Number(state.choferLocation.lng)
        },
        {
          lat: Number(puntoObjetivo.lat),
          lng: Number(puntoObjetivo.lng)
        }
      );
      rutaSeguimientoDibujada = true;
    } catch (err) {
      console.warn('[restore-map] fallback de dibujo también falló', err);
    }
  }

  if (!rutaSeguimientoDibujada) {
    if (typeof centrarMapaEnPunto === 'function') {
      centrarMapaEnPunto(Number(puntoObjetivo.lat), Number(puntoObjetivo.lng), 15);
    } else if (mapaCliente && typeof mapaCliente.easeTo === 'function') {
      mapaCliente.easeTo({
        center: [Number(puntoObjetivo.lng), Number(puntoObjetivo.lat)],
        zoom: 15,
        duration: 800
      });
    }
  }
}
  
  setTimeout(() => {
    try {
      mapaCliente?.resize?.();
    } catch (_) {}
  }, 80);
}
const coords =
  state?.routeData?.geometry?.coordinates ||
  state?.cotizacion?.route_geometry ||
  null;

if (Array.isArray(coords) && coords.length >= 2) {
  await dibujarRutaReal(coords);
} else if (!usarSeguimientoChofer) {
  const puntos = obtenerPuntosOrdenados();
  const coordsFallback = puntos
    .map((p) => [Number(p?.lng), Number(p?.lat)])
    .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));

  if (coordsFallback.length >= 2) {
    dibujarRutaLineal(coordsFallback);
  }
}
  } catch (err) {
    console.warn('[restore-trip] no se pudo restaurar mapa/cotización:', err);
  }
}
  function actualizarModoViajeLiveConTracking() {
  const estadoActual = String(state?.estadoViaje || state?.viajeEstado || '').toUpperCase();

  if (!estadoUsaSeguimientoChofer(estadoActual)) {
    desactivarModoViajeLive();
    return;
  }

  activarModoViajeLive();
  actualizarCardChofer({
    estado: estadoActual,
    chofer_nombre: state?.choferNombre || state?.chofer_nombre || '',
    chofer_telefono: state?.choferTelefono || state?.chofer_telefono || ''
  });

  actualizarRutaChoferDinamica?.().catch?.(() => null);
}
function abrirPanelNotificaciones() {
  if (!notifBtn || !notifPanel) return;

  notifPanel.hidden = false;
  notifPanel.classList.add('is-open', 'open', 'visible', 'active');
  notifPanel.setAttribute('aria-hidden', 'false');

  if (notifOverlay) {
    notifOverlay.hidden = false;
    notifOverlay.classList.add('is-open', 'open', 'visible', 'active');
  }

  notifBtn.setAttribute('aria-expanded', 'true');

  unreadCount = 0;
  actualizarBadgeNotificaciones();
  guardarNotificacionesEnStorage();
  renderizarCentroNotificaciones();
}
function cerrarPanelNotificaciones() {
  if (!notifBtn || !notifPanel) return;

  notifPanel.classList.remove('is-open', 'open', 'visible', 'active');
  notifPanel.setAttribute('aria-hidden', 'true');
  notifPanel.hidden = true;

  if (notifOverlay) {
    notifOverlay.classList.remove('is-open', 'open', 'visible', 'active');
    notifOverlay.hidden = true;
  }

  notifBtn.setAttribute('aria-expanded', 'false');
}
function togglePanelNotificaciones() {
  const abierto = notifPanel?.getAttribute('aria-hidden') === 'false';

  if (abierto) {
    cerrarPanelNotificaciones();
  } else {
    abrirPanelNotificaciones();
  }
}

if (notifBtn && notifBtn.dataset.bound !== '1') {
  notifBtn.dataset.bound = '1';

  notifBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePanelNotificaciones();
  });
}

if (notifOverlay && notifOverlay.dataset.bound !== '1') {
  notifOverlay.dataset.bound = '1';
  notifOverlay.addEventListener('click', cerrarPanelNotificaciones);
}
  
  function panelNotificacionesAbierto() {
  return !!notifPanel?.classList.contains('is-open');
}

function actualizarBadgeNotificaciones() {
  if (notifBadge) {
    notifBadge.textContent = String(unreadCount);
    notifBadge.hidden = unreadCount <= 0;
  }

  if (notifDot) {
    notifDot.style.display =
      !panelNotificacionesAbierto() && unreadCount > 0 ? 'block' : 'none';
  }
}

function renderizarCentroNotificaciones() {
  if (!notifList || !notifSummary) return;

  if (!historial.length) {
    notifList.innerHTML = `
      <div class="trip-notification-empty">
        Todavía no hay notificaciones.
      </div>
    `;
    notifSummary.textContent = 'Sin novedades por ahora.';
    actualizarBadgeNotificaciones();
    return;
  }

  notifList.innerHTML = historial.map(item => `
    <div class="trip-notification-item ${item.read ? 'is-read' : 'is-unread'}" data-id="${escapeHtml(item.id)}">
      <div class="trip-notification-main">
        <strong>${escapeHtml(item.estado)}</strong>
        <span>${escapeHtml(item.texto)}</span>
        <span class="trip-notification-date">${escapeHtml(item.fecha || '')}</span>
      </div>

      <button
        class="trip-notification-delete"
        type="button"
        data-action="delete"
        data-id="${escapeHtml(item.id)}"
        aria-label="Eliminar notificación"
        title="Eliminar"
      >
        ✕
      </button>
    </div>
  `).join('');

  notifSummary.textContent =
    historial[0]?.texto || 'Tenés novedades del viaje.';

  actualizarBadgeNotificaciones();
}

function agregarNotificacionViaje({ estado, texto, fecha = null, id = null, read = false, persist = true }) {
  const item = {
    id: id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    estado: String(estado || 'INFO').trim() || 'INFO',
    texto: String(texto || 'Tenés novedades del viaje.').trim(),
    fecha: fecha || new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    }),
    read: !!read
  };

  historial = [item, ...historial].slice(0, MAX_NOTIFICATIONS);

  if (!panelNotificacionesAbierto()) {
    unreadCount += 1;
  }

  renderizarCentroNotificaciones();

  if (persist) {
    guardarNotificacionesEnStorage();
  }

  return item;
}

function actualizarCentroNotificacionesViaje({ estado, texto }) {
  return agregarNotificacionViaje({ estado, texto });
}

function eliminarNotificacionPorId(id) {
  const before = historial.length;

  historial = historial.filter(item => String(item.id) !== String(id));
  unreadCount = historial.filter(item => !item.read).length;

  if (historial.length !== before) {
    renderizarCentroNotificaciones();
    actualizarBadgeNotificaciones();
    guardarNotificacionesEnStorage();
  }
}
  
  function mapearEstadoANotificacion(estado) {
  const e = normalizarEstadoUpper(estado);

  switch (e) {
    case 'BUSCANDO_CHOFER':
      return { estado: 'BUSCANDO_CHOFER', texto: 'Estamos buscando un chofer disponible.' };
    case 'OFERTANDO':
    case 'OFERTADO':
      return { estado: 'OFERTANDO', texto: 'Estamos notificando choferes cercanos.' };
    case 'ASIGNADO':
    case 'ACEPTADO':
      return { estado: 'ACEPTADO', texto: 'Tu viaje fue aceptado por un chofer.' };
    case 'EN_CAMINO':
      return { estado: 'EN_CAMINO', texto: 'El chofer va en camino al punto de retiro.' };
    case 'EN_CURSO':
      return { estado: 'EN_CURSO', texto: 'Tu viaje está en curso.' };
    case 'COMPLETADO':
      return { estado: 'COMPLETADO', texto: 'El viaje fue completado.' };
    case 'CANCELADO':
      return { estado: 'CANCELADO', texto: 'El viaje fue cancelado.' };
    case 'SIN_CHOFER':
      return { estado: 'SIN_CHOFER', texto: 'Todavía no encontramos chofer disponible.' };
    default:
      return { estado: e || 'INFO', texto: 'Hubo una actualización en tu viaje.' };
  }
}
function actualizarStatusCardNotificaciones(estado) {
  if (!notifStatusCard || !notifStatusTitle || !notifStatusText) return;

  const e = normalizarEstadoUpper(estado);
  const notifData = mapearEstadoANotificacion(e);

  const estadosVisibles = [
    'BUSCANDO_CHOFER',
    'OFERTANDO',
    'OFERTADO',
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'EN_CURSO',
    'SIN_CHOFER',
    'CANCELADO',
    'COMPLETADO'
  ];

  if (!e || !estadosVisibles.includes(e)) {
    notifStatusCard.hidden = true;
    return;
  }

  notifStatusTitle.textContent = notifData.estado || 'Estado del viaje';
  notifStatusText.textContent = notifData.texto || 'Sin novedades por ahora.';
  notifStatusCard.hidden = false;
}
function animarCampanitaNotificaciones() {
  if (!notifBtn) return;
  notifBtn.classList.remove('ring', 'pulse');
  void notifBtn.offsetWidth;
  notifBtn.classList.add('ring', 'pulse');

  setTimeout(() => notifBtn?.classList.remove('ring'), 950);
  setTimeout(() => notifBtn?.classList.remove('pulse'), 1200);
}

let audioContextNotifs = null;
function reproducirSonidoSoporte() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContextNotifs) {
      audioContextNotifs = new AudioCtx();
    }

    const ctx = audioContextNotifs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(660, now);
    osc2.frequency.setValueAtTime(880, now + 0.06);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.06);

    osc1.stop(now + 0.16);
    osc2.stop(now + 0.26);
  } catch (err) {
    console.warn('[notif] no se pudo reproducir sonido soporte:', err);
  }
}
function reproducirSonidoAceptado() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContextNotifs) {
      audioContextNotifs = new AudioCtx();
    }

    const ctx = audioContextNotifs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(880, now);
    osc2.frequency.setValueAtTime(1320, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);

    osc1.stop(now + 0.18);
    osc2.stop(now + 0.32);
  } catch (err) {
    console.warn('[notif] no se pudo reproducir sonido:', err);
  }
}

function vibrarNotificacionAceptada() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([120, 80, 160]);
    }
  } catch (err) {
    console.warn('[notif] no se pudo vibrar:', err);
  }
}

function ejecutarFeedbackAceptado() {
  animarCampanitaNotificaciones();
  reproducirSonidoAceptado();
  vibrarNotificacionAceptada();
}

function limpiarCanalViajeCliente() {
  try {
    if (currentTripChannel && window.sbRealtime) {
      window.sbRealtime.removeChannel(currentTripChannel);
    }
  } catch (err) {
    console.warn('[realtime] no se pudo remover canal previo:', err);
  } finally {
    currentTripChannel = null;
  }
}

function actualizarEstadoLocalViaje(nuevoEstado) {
  const upper = normalizarEstadoUpper(nuevoEstado);
  state.viajeEstado = upper;
  state.estadoViaje = upper;

  // 🔥 limpiar datos de cotización en estados de seguimiento
  if ([
    'ASIGNADO',
    'ACEPTADO',
    'EN_CAMINO',
    'INICIADO',
    'EN_CURSO'
  ].includes(upper)) {
    state.routeData = null;
    state.cotizacion = null;
  }

  if (['COMPLETADO', 'CANCELADO'].includes(upper)) {
    limpiarViajeActivoEnStorage();
  } else {
    guardarViajeActivoEnStorage();
  }

  if (typeof actualizarBotonCancelarViaje === 'function') {
    actualizarBotonCancelarViaje();
  }

  if (typeof actualizarBotonCotizar === 'function') {
    actualizarBotonCotizar();
  }

  if (typeof actualizarPanelPlanificacionViaje === 'function') {
    actualizarPanelPlanificacionViaje();
  }

  if (typeof actualizarResumenCotizacionCompacto === 'function') {
    actualizarResumenCotizacionCompacto();
  }

  if (typeof actualizarBotonConfirmarViaje === 'function') {
    actualizarBotonConfirmarViaje();
  }

  if (typeof actualizarEstadoSolicitudUI === 'function') {
    const notifData = mapearEstadoANotificacion(upper);
    actualizarEstadoSolicitudUI({
      estado: upper,
      texto: notifData.texto
    });
  }

  actualizarStatusCardNotificaciones(upper);
}  
function suscribirseEstadoViajeRealtime(viajeId) {
  if (!viajeId || !window.sbRealtime) {
    console.warn('[realtime] No hay viajeId o cliente supabase');
    return null;
  }

  limpiarCanalViajeCliente();

  console.log('[realtime] Suscribiendo a viaje:', viajeId);

  currentTripChannel = window.sbRealtime
    .channel(`viaje-estado-${viajeId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'viajes',
        filter: `id=eq.${viajeId}`
      },
      async (payload) => {
        try {
          console.log('[realtime][viajes] payload old:', payload?.old);
          console.log('[realtime][viajes] payload new:', payload?.new);
          console.log('[realtime][viajes] eventType:', payload?.eventType);

          const oldRow = payload?.old || {};
          const newRow = await enriquecerViajeConChofer(payload?.new || {});

          const choferAntes = !!(oldRow?.assigned_driver_id || oldRow?.chofer_id_uuid);
          const choferAhora = !!(newRow?.assigned_driver_id || newRow?.chofer_id_uuid);
          const choferRecienAsignado = !choferAntes && choferAhora;
          const choferIdActual = newRow?.assigned_driver_id || newRow?.chofer_id_uuid || null;

          if (choferIdActual) {
            actualizarCardChofer(newRow);
            state.choferId = choferIdActual;

            if (coordenadasValidas(newRow?.chofer_lat, newRow?.chofer_lng)) {
              actualizarMarkerChoferEnMapa(newRow.chofer_lat, newRow.chofer_lng, {
                heading: newRow?.chofer_heading || 0
              });
            }

            if (viajeId && typeof suscribirseUbicacionChoferRealtime === 'function') {
               suscribirseUbicacionChoferRealtime(viajeId);
               }
            }

               let nuevoEstado = resolverEstadoViajeCliente(newRow);

             // No forzar ASIGNADO solo porque apareció assigned_driver_id.
             // Esperamos confirmación real del backend.
             if (choferRecienAsignado && ['BUSCANDO_CHOFER', 'OFERTANDO', 'OFERTADO', 'PENDIENTE'].includes(nuevoEstado)) {
             console.log('[cliente] chofer vinculado pero aún no aceptado:', {
             viajeId,
             estado_db: newRow?.estado || null,
             assigned_driver_id: newRow?.assigned_driver_id || null,
             chofer_id_uuid: newRow?.chofer_id_uuid || null
           });
         }
          console.log('[realtime][viajes] estado resuelto cliente:', {
            estado_db: payload?.new?.estado,
            assigned_driver_id: payload?.new?.assigned_driver_id || null,
            chofer_id_uuid: payload?.new?.chofer_id_uuid || null,
            nuevoEstado
          });

          if (!nuevoEstado) return;
          if (nuevoEstado === ultimoEstadoNotificado && !choferRecienAsignado) return;

          ultimoEstadoNotificado = nuevoEstado;

actualizarEstadoLocalViaje(nuevoEstado);

if (['ASIGNADO', 'ACEPTADO', 'EN_CAMINO', 'INICIADO', 'EN_CURSO'].includes(nuevoEstado)) {
  activarModoViajeLive();
}
          // 🔥 REEMPLAZAR RUTA COTIZADA POR RUTA CHOFER → CLIENTE
if (
  nuevoEstado === 'ASIGNADO' ||
  nuevoEstado === 'ACEPTADO' ||
  nuevoEstado === 'EN_CAMINO' ||
  nuevoEstado === 'INICIADO' ||
  nuevoEstado === 'EN_CURSO'
) {
  console.log('[MAP] cambiando a ruta chofer → cliente');

  if (typeof limpiarCapasRutaMapa === 'function') {
    limpiarCapasRutaMapa();
  }

  if (typeof limpiarMarkersRutaCotizacion === 'function') {
    limpiarMarkersRutaCotizacion();
  }

  if (typeof mostrarSoloPickupClienteEnMapa === 'function') {
    mostrarSoloPickupClienteEnMapa();
  }

const origenCliente = state?.origen || null;
const destinoCliente = state?.destino || null;
const puntoObjetivo =
  (nuevoEstado === 'INICIADO' || nuevoEstado === 'EN_CURSO')
    ? destinoCliente
    : origenCliente;

if (
  state?.choferLocation &&
  puntoObjetivo &&
  typeof window.dibujarRutaChoferHastaCliente === 'function'
) {
  await window.dibujarRutaChoferHastaCliente(
    {
      lat: Number(state.choferLocation.lat),
      lng: Number(state.choferLocation.lng)
    },
    {
      lat: Number(puntoObjetivo.lat),
      lng: Number(puntoObjetivo.lng)
    }
  );
} else if (
  state?.viajeId &&
  typeof window.cargarUltimoTrackingViaje === 'function'
) {
  window.cargarUltimoTrackingViaje(state.viajeId).then((trackData) => {
    if (
      trackData &&
      puntoObjetivo &&
      typeof window.dibujarRutaChoferHastaCliente === 'function'
    ) {
      window.dibujarRutaChoferHastaCliente(
        {
          lat: Number(trackData.lat),
          lng: Number(trackData.lng)
         },
          {
            lat: Number(puntoObjetivo.lat),
            lng: Number(puntoObjetivo.lng)
          }
        );
      }
    }).catch((err) => {
      console.warn('[MAP] no se pudo dibujar ruta chofer → cliente desde tracking', err);
    });
  }
}
const notifData = mapearEstadoANotificacion(nuevoEstado);
          const textoEstado = construirMensajeEstadoViaje(newRow, nuevoEstado, notifData.texto);

          if (typeof actualizarEstadoSolicitudUI === 'function') {
            actualizarEstadoSolicitudUI({
              estado: nuevoEstado,
              texto: textoEstado,
              viaje: newRow
            });
          }

          actualizarCentroNotificacionesViaje({
            estado: notifData.estado,
            texto: textoEstado
          });

          guardarNotificacionesEnStorage();
          guardarViajeActivoEnStorage();

if (nuevoEstado === 'ACEPTADO' || nuevoEstado === 'ASIGNADO') {
  ejecutarFeedbackAceptado();

  notif.show(
    'Chofer asignado',
    textoEstado || 'Tu viaje fue aceptado por un chofer.',
    'success',
    3500
  );
}
          if (nuevoEstado === 'EN_CURSO') {
            notif.show(
              'Viaje en curso',
              'Tu viaje ya comenzó.',
              'info',
              2800
            );
          }

          if (nuevoEstado === 'COMPLETADO') {
            notif.show(
              'Viaje completado',
              'El viaje finalizó correctamente.',
              'success',
              3000
            );
          }

if (nuevoEstado === 'COMPLETADO' || nuevoEstado === 'CANCELADO') {
  desactivarModoViajeLive();

  if (typeof limpiarCanalChoferRealtime === 'function') {
    limpiarCanalChoferRealtime();
  }

  if (typeof limpiarMarkerChofer === 'function') {
    limpiarMarkerChofer();
  }

  if (typeof window.limpiarRutaChoferHastaCliente === 'function') {
    window.limpiarRutaChoferHastaCliente();
  }

  state.choferId = null;
}
          if (nuevoEstado === 'CANCELADO') {
            notif.show(
              'Viaje cancelado',
              'El viaje fue cancelado.',
              'warning',
              3000
            );
          }
        } catch (err) {
          console.error('[realtime] error procesando evento', err);
        }
      }
    )
    .subscribe((status) => {
      console.log('[realtime] estado canal viaje:', status, { viajeId });
    });

  return currentTripChannel;
}
function construirTextoEstadoChofer(estado) {
  switch (String(estado || '').toUpperCase()) {
    case 'BUSCANDO_CHOFER':
      return 'Buscando chofer disponible';
    case 'OFERTANDO':
    case 'OFERTADO':
      return 'Estamos notificando choferes cercanos';
    case 'SIN_CHOFER':
      return 'Todavía no encontramos un chofer';
    case 'ASIGNADO':
      return 'Chofer asignado';
    case 'ACEPTADO':
      return 'En camino a buscarte';
    case 'EN_CAMINO':
      return 'Llegando al punto de recogida';
    case 'INICIADO':
    case 'EN_CURSO':
      return 'Viaje en curso';
    default:
      return 'Estado del viaje';
  }
}
  function actualizarMetaTrackingChoferUI({ estado, etaMin = null, lastTrackingUpdate = null } = {}) {
  const metaEl = document.getElementById('tripDriverMeta');
  if (!metaEl) return;

  const textoBase = construirTextoEstadoChofer(estado);

  let texto = textoBase;

  if (Number.isFinite(Number(etaMin)) && Number(etaMin) > 0) {
    texto += ` · ETA ${Math.round(Number(etaMin))} min`;
  }

  if (lastTrackingUpdate) {
    const ms = new Date(lastTrackingUpdate).getTime();
    if (Number.isFinite(ms)) {
      const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (diffSec <= 90) {
        texto += ' · en vivo';
      }
    }
  }

  metaEl.textContent = texto;
}

// 🔥 EXPONER HELPERS PARA cliente-chofer-tracking.js
window.calcularEtaMinutosSimple = calcularEtaMinutosSimple;
window.obtenerObjetivoSeguimientoSegunEstado = obtenerObjetivoSeguimientoSegunEstado;
window.hidratarTrackingDesdeStorage = hidratarTrackingDesdeStorage;
window.reconectarRealtimeViajeTrasRefresh = reconectarRealtimeViajeTrasRefresh;
window.actualizarMetaTrackingChoferUI = actualizarMetaTrackingChoferUI;
window.guardarViajeActivoEnStorage = guardarViajeActivoEnStorage;

async function restaurarViajeActivoCliente() {
  try {
    const viajeLocal = leerViajeActivoEnStorage();
    const session = await obtenerSesionCliente(true);

    if (session?.user) {
      renderSesionUI(session);
    }

    const estadosActivos = new Set([
      'PENDIENTE',
      'BUSCANDO_CHOFER',
      'OFERTANDO',
      'OFERTADO',
      'SIN_CHOFER',
      'ASIGNADO',
      'ACEPTADO',
      'EN_CAMINO',
      'INICIADO',
      'EN_CURSO'
    ]);

    // =========================================
    // CASO 0: SIN SESIÓN TODAVÍA, PERO CON STORAGE
    // =========================================
    if (!session?.user) {
      if (viajeLocal?.viajeId && viajeLocal?.estadoViaje) {
        const estadoStorage = normalizarEstadoUpper(viajeLocal.estadoViaje);

        const tsMs = Number(viajeLocal?.ts || 0);
        const updatedAtMs = viajeLocal?.updatedAt
          ? new Date(viajeLocal.updatedAt).getTime()
          : 0;

        const referenciaMs = updatedAtMs || tsMs || 0;

        const storageExpirado =
          !referenciaMs ||
          Number.isNaN(referenciaMs) ||
          (Date.now() - referenciaMs > 1000 * 60 * 60 * 6);

        if (estadosActivos.has(estadoStorage) && !storageExpirado) {
          state.viajeId = viajeLocal.viajeId;
          state.viajeEstado = estadoStorage;
          state.estadoViaje = estadoStorage;
          state.origen = viajeLocal.origen || null;
          state.destino = viajeLocal.destino || null;
          state.waypoints = Array.isArray(viajeLocal.waypoints) ? viajeLocal.waypoints : [];
          state.routeData = viajeLocal.routeData || null;
          state.cotizacion = viajeLocal.cotizacion || null;
          state.choferId = viajeLocal?.choferId || null;
          state.choferLocation = viajeLocal?.choferLocation || null;

          await restaurarMapaYCotizacionDesdeStorage(viajeLocal);

          if (typeof actualizarStatusCardNotificaciones === 'function') {
            actualizarStatusCardNotificaciones(estadoStorage);
          }

          if (typeof actualizarBotonCancelarViaje === 'function') {
            actualizarBotonCancelarViaje();
          }
          if (typeof actualizarBotonCotizar === 'function') {
            actualizarBotonCotizar();
          }
          if (typeof actualizarPanelPlanificacionViaje === 'function') {
            actualizarPanelPlanificacionViaje();
          }
          if (typeof actualizarResumenCotizacionCompacto === 'function') {
            actualizarResumenCotizacionCompacto();
          }
          if (typeof actualizarBotonConfirmarViaje === 'function') {
            actualizarBotonConfirmarViaje();
          }
          if (typeof actualizarBotonReiniciarRuta === 'function') {
            actualizarBotonReiniciarRuta();
          }

          if (typeof actualizarEstadoSolicitudUI === 'function') {
            const textosEstado = {
              PENDIENTE: 'Tu viaje sigue pendiente de confirmación.',
              BUSCANDO_CHOFER: 'Estamos buscando un chofer para tu viaje.',
              OFERTANDO: 'Estamos notificando choferes cercanos.',
              OFERTADO: 'Tu solicitud fue enviada a choferes cercanos.',
              SIN_CHOFER: 'Todavía no encontramos chofer disponible.',
              ASIGNADO: 'Tu viaje ya tiene chofer asignado.',
              ACEPTADO: 'Tu chofer aceptó el viaje.',
              EN_CAMINO: 'Tu chofer va en camino.',
              INICIADO: 'Tu viaje está en curso.',
              EN_CURSO: 'Tu viaje está en curso.'
            };

            actualizarEstadoSolicitudUI({
              estado: estadoStorage,
              texto: textosEstado[estadoStorage] || 'Recuperamos tu viaje activo.',
              viaje: viajeLocal
            });
          }

          renderizarCentroNotificaciones();
          return;
        }
      }

      if (notifStatusCard) notifStatusCard.hidden = true;
      renderizarCentroNotificaciones();
      return;
    }

    const clienteId = session.user.id;
    const clienteEmail = String(session.user.email || '').toLowerCase();

    let { data: viaje, error } = await window.supabaseRest
      .from('viajes')
      .select(`
        id,
        estado,
        cliente_auth_id,
        cliente_email,
        assigned_driver_id,
        chofer_id_uuid,
        origen_lat,
        origen_lng,
        origen_direccion,
        destino_lat,
        destino_lng,
        destino_direccion,
        created_at,
        updated_at
      `)
      .or(`cliente_auth_id.eq.${clienteId},cliente_email.eq.${clienteEmail}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn('[restore-trip] error leyendo viaje:', error);
    }

    const estado = resolverEstadoViajeCliente(viaje);

    if (viaje?.id && estadosActivos.has(estado)) {
      // ============================
      // CASO 1: VIAJE ACTIVO REAL
      // ============================
      viaje = await enriquecerViajeConChofer(viaje);

      state.viajeId = viaje.id;
      state.viajeEstado = estado;
      state.estadoViaje = estado;
      state.choferId = viaje?.assigned_driver_id || viaje?.chofer_id_uuid || null;
      state.choferLocation = null;

      if (coordenadasValidas(viaje?.chofer_lat, viaje?.chofer_lng)) {
        state.choferLocation = {
          lat: Number(viaje.chofer_lat),
          lng: Number(viaje.chofer_lng)
        };
      }

      const viajeRestore = {
        viajeId: viaje.id,
        estadoViaje: estado,
        viajeEstado: estado,

        origen:
          (coordenadasValidas(viaje?.origen_lat, viaje?.origen_lng)
            ? {
                lat: Number(viaje.origen_lat),
                lng: Number(viaje.origen_lng),
                direccion: viaje?.origen_direccion || '',
                direccionCorta: viaje?.origen_direccion || ''
              }
            : null) ||
          state?.origen ||
          viajeLocal?.origen ||
          null,

        destino:
          (coordenadasValidas(viaje?.destino_lat, viaje?.destino_lng)
            ? {
                lat: Number(viaje.destino_lat),
                lng: Number(viaje.destino_lng),
                direccion: viaje?.destino_direccion || '',
                direccionCorta: viaje?.destino_direccion || ''
              }
            : null) ||
          state?.destino ||
          viajeLocal?.destino ||
          null,

        waypoints: Array.isArray(viajeLocal?.waypoints) ? viajeLocal.waypoints : [],
        routeData: viajeLocal?.routeData || null,
        cotizacion: null,
        
        inputOrigen:
          viajeLocal?.inputOrigen ||
          viaje?.origen_direccion ||
          '',

        inputDestino:
          viajeLocal?.inputDestino ||
          viaje?.destino_direccion ||
          '',

        waypointTexts: Array.isArray(viajeLocal?.waypointTexts)
          ? viajeLocal.waypointTexts
          : []
      };

      await restaurarMapaYCotizacionDesdeStorage(viajeRestore);

      state.driverHeading = Number.isFinite(Number(viaje?.chofer_heading))
        ? Number(viaje.chofer_heading)
        : null;

      state.lastTrackingUpdate = viaje?.chofer_last_seen_at || new Date().toISOString();

      const objetivoSeguimiento = obtenerObjetivoSeguimientoSegunEstado(estado, viajeRestore);

      state.driverETA =
        state.choferLocation && objetivoSeguimiento
          ? calcularEtaMinutosSimple(state.choferLocation, objetivoSeguimiento)
          : null;

      guardarViajeActivoEnStorage({
        choferLocation: state.choferLocation,
        driverETA: state.driverETA,
        driverHeading: state.driverHeading,
        lastTrackingUpdate: state.lastTrackingUpdate
      });

      await hidratarTrackingDesdeStorage({
        ...viajeRestore,
        choferId: state.choferId,
        choferLocation: state.choferLocation,
        driverETA: state.driverETA,
        driverHeading: state.driverHeading,
        lastTrackingUpdate: state.lastTrackingUpdate
      });

      await reconectarRealtimeViajeTrasRefresh(state.viajeId);

      actualizarStatusCardNotificaciones(estado);
      const notifData = mapearEstadoANotificacion(estado);

      if (!historial.length) {
        agregarNotificacionViaje({
          estado: notifData.estado,
          texto: notifData.texto,
          read: true
        });
      } else {
        renderizarCentroNotificaciones();
      }

      if (typeof actualizarBotonCancelarViaje === 'function') {
        actualizarBotonCancelarViaje();
      }
      if (typeof actualizarBotonCotizar === 'function') {
        actualizarBotonCotizar();
      }
      if (typeof actualizarPanelPlanificacionViaje === 'function') {
        actualizarPanelPlanificacionViaje();
      }
      if (typeof actualizarResumenCotizacionCompacto === 'function') {
        actualizarResumenCotizacionCompacto();
      }
      if (typeof actualizarBotonConfirmarViaje === 'function') {
        actualizarBotonConfirmarViaje();
      }
      if (typeof actualizarBotonReiniciarRuta === 'function') {
        actualizarBotonReiniciarRuta();
      }

      if (typeof actualizarEstadoSolicitudUI === 'function') {
        const textoEstado = construirMensajeEstadoViaje(viaje, estado, notifData.texto);
        actualizarEstadoSolicitudUI({
          estado,
          texto: textoEstado,
          viaje
        });
      }

      suscribirseEstadoViajeRealtime(viaje.id);
      return;
    }

    // ============================
    // CASO 2: VIAJE EN STORAGE
    // ============================
if (viajeLocal?.viajeId && viajeLocal?.estadoViaje) {
  const estadoStorage = normalizarEstadoUpper(viajeLocal.estadoViaje);

  const tsMs = Number(viajeLocal?.ts || 0);
  const updatedAtMs = viajeLocal?.updatedAt
    ? new Date(viajeLocal.updatedAt).getTime()
    : 0;

  const referenciaMs = updatedAtMs || tsMs || 0;

  const storageExpirado =
    !referenciaMs ||
    Number.isNaN(referenciaMs) ||
    (Date.now() - referenciaMs > 1000 * 60 * 60 * 6);

  if (!estadosActivos.has(estadoStorage) || storageExpirado) {
    limpiarViajeActivoEnStorage();
    desactivarModoViajeLive?.();
    if (notifStatusCard) notifStatusCard.hidden = true;
    renderizarCentroNotificaciones();
    return;
  }

  state.viajeId = viajeLocal.viajeId;
  state.viajeEstado = estadoStorage;
  state.estadoViaje = estadoStorage;
  state.origen = viajeLocal.origen || null;
  state.destino = viajeLocal.destino || null;
  state.waypoints = Array.isArray(viajeLocal.waypoints) ? viajeLocal.waypoints : [];
  state.routeData = viajeLocal.routeData || null;
  state.cotizacion = viajeLocal.cotizacion || null;
  state.choferId = viajeLocal?.choferId || null;
  state.choferLocation = viajeLocal?.choferLocation || null;
  state.driverETA = Number.isFinite(Number(viajeLocal?.driverETA))
    ? Number(viajeLocal.driverETA)
    : null;
  state.driverHeading = Number.isFinite(Number(viajeLocal?.driverHeading))
    ? Number(viajeLocal.driverHeading)
    : null;
  state.lastTrackingUpdate = viajeLocal?.lastTrackingUpdate || null;

  await restaurarMapaYCotizacionDesdeStorage(viajeLocal);
  await hidratarTrackingDesdeStorage(viajeLocal);
  await reconectarRealtimeViajeTrasRefresh(state.viajeId);

  if (typeof actualizarStatusCardNotificaciones === 'function') {
    actualizarStatusCardNotificaciones(estadoStorage);
  }

  if (typeof actualizarBotonCancelarViaje === 'function') {
    actualizarBotonCancelarViaje();
  }
  if (typeof actualizarBotonCotizar === 'function') {
    actualizarBotonCotizar();
  }
  if (typeof actualizarPanelPlanificacionViaje === 'function') {
    actualizarPanelPlanificacionViaje();
  }
  if (typeof actualizarResumenCotizacionCompacto === 'function') {
    actualizarResumenCotizacionCompacto();
  }
  if (typeof actualizarBotonConfirmarViaje === 'function') {
    actualizarBotonConfirmarViaje();
  }
  if (typeof actualizarBotonReiniciarRuta === 'function') {
    actualizarBotonReiniciarRuta();
  }

  if (typeof actualizarEstadoSolicitudUI === 'function') {
    const textosEstado = {
      PENDIENTE: 'Tu viaje sigue pendiente de confirmación.',
      BUSCANDO_CHOFER: 'Estamos buscando un chofer para tu viaje.',
      OFERTANDO: 'Estamos notificando choferes cercanos.',
      OFERTADO: 'Tu solicitud fue enviada a choferes cercanos.',
      SIN_CHOFER: 'Todavía no encontramos chofer disponible.',
      ASIGNADO: 'Tu viaje ya tiene chofer asignado.',
      ACEPTADO: 'Tu chofer aceptó el viaje.',
      EN_CAMINO: 'Tu chofer va en camino.',
      INICIADO: 'Tu viaje está en curso.',
      EN_CURSO: 'Tu viaje está en curso.'
    };

    actualizarEstadoSolicitudUI({
      estado: estadoStorage,
      texto: textosEstado[estadoStorage] || 'Recuperamos tu viaje activo.',
      viaje: viajeLocal
    });
  }

  renderizarCentroNotificaciones();
  return;
}
    // ============================
    // CASO 3: SIN VIAJE
    // ============================
    limpiarViajeActivoEnStorage();
    desactivarModoViajeLive?.();
    if (notifStatusCard) notifStatusCard.hidden = true;
    renderizarCentroNotificaciones();

  } catch (err) {
    console.warn('[restore-trip] no se pudo restaurar viaje activo:', err);
    if (notifStatusCard) notifStatusCard.hidden = true;
    renderizarCentroNotificaciones();
  }
}  
// ==========================================
// UX MEJORADA PANEL NOTIFICACIONES
// ==========================================

// Cerrar al hacer scroll (UX tipo app nativa)
window.addEventListener('scroll', () => {
  if (panelNotificacionesAbierto()) {
    cerrarPanelNotificaciones();
  }
}, { passive: true });

// Evitar que se acumule el efecto pulse al tocar
notifBtn?.addEventListener('click', () => {
  notifBtn.classList.remove('pulse');
});

// Click fuera más robusto en mobile
document.addEventListener('touchstart', (e) => {
  if (!notifPanel || !notifBtn) return;

  const insidePanel = notifPanel.contains(e.target);
  const insideBtn = notifBtn.contains(e.target);

  if (!insidePanel && !insideBtn) {
    cerrarPanelNotificaciones();
  }
}, { passive: true });

notifMarkReadBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  marcarNotificacionesComoLeidas();
});

notifClearBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  vaciarNotificaciones();
});
if (notifList && notifList.dataset.bound !== '1') {
  notifList.dataset.bound = '1';

  notifList.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('[data-action="delete"]');

if (deleteBtn) {
  event.preventDefault();
  event.stopPropagation();

  const id = deleteBtn.dataset.id;
  if (!id) return;

  const isConfirming = deleteBtn.dataset.confirming === '1';

  if (isConfirming) {
    eliminarNotificacionPorId(id);
    return;
  }

  deleteBtn.dataset.confirming = '1';
  deleteBtn.dataset.original = deleteBtn.innerHTML;
  deleteBtn.innerHTML = '¿Borrar?';
  deleteBtn.classList.add('confirm-delete');

  setTimeout(() => {
    if (deleteBtn.dataset.confirming === '1') {
      deleteBtn.dataset.confirming = '0';
      deleteBtn.innerHTML = deleteBtn.dataset.original || '✕';
      deleteBtn.classList.remove('confirm-delete');
    }
  }, 2200);

  return;
}
    const item = event.target.closest('.trip-notification-item');
    if (!item) return;

    const id = item.dataset.id;
    if (id) marcarNotificacionComoLeidaPorId(id);
  });
}

const processedSupportMessageIds = new Set();
  function markSupportMessageProcessed(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;

  if (processedSupportMessageIds.has(id)) {
    return true;
  }

  processedSupportMessageIds.add(id);

  if (processedSupportMessageIds.size > 300) {
    const first = processedSupportMessageIds.values().next().value;
    if (first) processedSupportMessageIds.delete(first);
  }

  return false;
}

window.handleSupportPushForeground = function ({
  messageId,
  title,
  body,
  senderName,
  unreadCount: incomingUnreadCount,
  notificationKind
}) {
  if (messageId && markSupportMessageProcessed(messageId)) {
    return;
  }

  const finalTitle = title || `Soporte MIMICAR · ${senderName || "Soporte"}`;
  const finalBody = body || "Tenés una nueva respuesta de soporte.";

  notif.show(finalTitle, finalBody, "success", 4000);

  historial = [
    {
      id: `support_push_${messageId || Date.now()}`,
      estado: "SOPORTE",
      texto: finalBody,
      fecha: new Date().toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit"
      }),
      read: false
    },
    ...historial
  ].slice(0, MAX_NOTIFICATIONS);

unreadCount = Math.max(
  unreadCount + 1,
  Number(incomingUnreadCount || 0) || unreadCount + 1
);
  renderizarCentroNotificaciones();
  guardarNotificacionesEnStorage();
  actualizarBadgeNotificaciones();

  if (notificationKind === "support" && typeof reproducirSonidoSoporte === "function") {
    reproducirSonidoSoporte();
  }
};
  
let currentSupportTicketId = null;
let currentSupportChannel = null;
let currentSupportMessagesLoaded = false;
let supportRealtimeRetryTimer = null;
let supportRealtimeManuallyClosing = false;
let supportRealtimeActiveUserId = null;
document.addEventListener('DOMContentLoaded', async () => {
// ==========================================
// SOPORTE CHAT SHEET
// ==========================================
const supportBtn = document.getElementById("supportBtn");
const supportSheet = document.getElementById("supportSheet");
const supportSheetOverlay = document.getElementById("supportSheetOverlay");
const supportSheetClose = document.getElementById("supportSheetClose");
const supportMessageInput = document.getElementById("supportMessageInput");
const supportSendBtn = document.getElementById("supportSendBtn");
const supportChatBody = document.getElementById("supportChatBody");
function openSupportSheet() {
  if (!supportSheet || !supportSheetOverlay) return;

  supportSheet.hidden = false;
  supportSheetOverlay.hidden = false;

  requestAnimationFrame(() => {
    supportSheet.classList.add("is-open");
    supportSheetOverlay.classList.add("is-open");
    supportSheet.setAttribute("aria-hidden", "false");
  });

  setTimeout(() => {
    supportMessageInput?.focus();
  }, 220);

  document.body.style.overflow = "hidden";
}

function closeSupportSheet() {
  if (!supportSheet || !supportSheetOverlay) return;

  supportSheet.classList.remove("is-open");
  supportSheetOverlay.classList.remove("is-open");
  supportSheet.setAttribute("aria-hidden", "true");

  setTimeout(() => {
    if (!supportSheet.classList.contains("is-open")) {
      supportSheet.hidden = true;
      supportSheetOverlay.hidden = true;
    }
  }, 280);

  document.body.style.overflow = "";
}
  
function appendSupportMessage(text, type = "user", messageId = null) {
  if (!supportChatBody || !text) return;
  if (messageId && supportChatBody.querySelector(`[data-support-message-id="${messageId}"]`)) {
    return;
  }

  const row = document.createElement("div");
  row.className = `support-msg support-msg-${type}`;
  if (messageId) {
    row.setAttribute("data-support-message-id", messageId);
  }

  const bubble = document.createElement("div");
  bubble.className = "support-bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  supportChatBody.appendChild(row);
  supportChatBody.scrollTop = supportChatBody.scrollHeight;
}

function renderSupportMessages(messages = []) {
  if (!supportChatBody) return;

  supportChatBody.innerHTML = `
    <div class="support-msg support-msg-agent">
      <div class="support-bubble">
        Hola. Soy soporte de MIMICAR. Escribinos tu consulta y la recibimos con los datos de tu cuenta.
      </div>
    </div>
  `;

  messages.forEach((msg) => {
    const senderRole = String(msg?.sender_role || "").toLowerCase();
    const type = senderRole === "admin" ? "agent" : "user";
    appendSupportMessage(msg?.body || "", type, msg?.id || null);
  });
}

async function loadOrCreateSupportTicketContext() {
  const session = await obtenerSesionCliente(true);

  if (!session?.access_token || !session?.user) {
    throw new Error("No hay sesión activa");
  }

  const userId = session.user.id;

  // Usar sbRealtime (cliente con auth) en lugar de supabase (cliente anónimo)
  const { data: existingTickets, error: ticketLookupError } = await window.sbRealtime
    .from("svc_conversations")
    .select("id, status, last_message_at, client_user_id, created_at")
    .eq("client_user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (ticketLookupError) {
    throw new Error(ticketLookupError.message || "No se pudo consultar soporte_tickets");
  }

  const existingTicket = Array.isArray(existingTickets) ? existingTickets[0] : null;
  currentSupportTicketId = existingTicket?.id || null;

  if (!currentSupportTicketId) {
    renderSupportMessages([]);
    currentSupportMessagesLoaded = true;
    return { session, ticketId: null };
  }

  // También usar sbRealtime aquí
  const { data: messages, error: messagesError } = await window.sbRealtime
    .from("svc_messages")
    .select("id, sender_role, body, created_at")
    .eq("conversation_id", currentSupportTicketId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    throw new Error(messagesError.message || "No se pudieron cargar los mensajes");
  }

  renderSupportMessages(Array.isArray(messages) ? messages : []);
  currentSupportMessagesLoaded = true;

  return { session, ticketId: currentSupportTicketId };
}
  
function cleanupSupportRealtime() {
  try {
    if (supportRealtimeRetryTimer) {
      clearTimeout(supportRealtimeRetryTimer);
      supportRealtimeRetryTimer = null;
    }

    if (currentSupportChannel && window.sbRealtime) {
      supportRealtimeManuallyClosing = true;
      window.sbRealtime.removeChannel(currentSupportChannel);
    }
  } catch (err) {
    console.warn("[support] no se pudo remover canal anterior", err);
  } finally {
    currentSupportChannel = null;
    supportRealtimeActiveUserId = null;

    setTimeout(() => {
      supportRealtimeManuallyClosing = false;
    }, 300);
  }
}
  
async function handleIncomingSupportMessage(payload) {
  try {
    console.log("[support realtime payload]", payload);

    const msg = payload?.new;
if (!msg?.conversation_id) {
  console.warn("[support realtime] mensaje sin conversation_id", msg);
  return;
}
    if (msg.id && markSupportMessageProcessed(msg.id)) {
      console.log("[support realtime] mensaje duplicado ignorado", msg.id);
      return;
    }

    const session = await obtenerSesionCliente(true);
    const userId = session?.user?.id;

    if (!userId) {
      console.warn("[support realtime] sin sesión de cliente activa");
      return;
    }

    await new Promise((r) => setTimeout(r, 300));

    let ticket = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (!ticket && attempts < maxAttempts) {
      attempts++;

      const { data, error } = await window.sbRealtime
        .from("svc_conversations")
        .select("id, client_user_id, provider_user_id, status, subject, updated_at")
        .eq("id", msg.conversation_id)
        .maybeSingle();

      if (error) {
        console.warn(`[support realtime] intento ${attempts} - error:`, error);
        await new Promise((r) => setTimeout(r, 200 * attempts));
        continue;
      }

      ticket = data || null;

      if (!ticket) {
        console.warn(
          `[support realtime] intento ${attempts} - ticket no encontrado:`,
          msg.ticket_id
        );
        await new Promise((r) => setTimeout(r, 200 * attempts));
      }
    }

    if (!ticket) {
      console.warn("[support realtime] ticket no recuperado después de reintentos", {
        ticketId: msg.ticket_id,
        userId
      });
      return;
    }

    const ownerId = ticket.client_user_id || ticket.provider_user_id || null;
    const belongsToUser = !!ownerId && String(ownerId) === String(userId);

    if (!belongsToUser) {
      console.warn("[support realtime] mensaje ignorado: ticket no pertenece al usuario", {
        ticketId: msg.ticket_id,
        currentUserId: userId,
        ticketUserId: ticket.user_id || null
      });
      return;
    }

    const senderRole = String(msg.sender_role || "").toLowerCase();

    if (senderRole === "admin") {
      appendSupportMessage(msg.body || "", "agent", msg.id);

      if (!supportSheet?.classList.contains("is-open")) {
        notif.show("Soporte", "Tenés una nueva respuesta", "success", 4000);

        agregarNotificacionViaje({
          estado: "SOPORTE",
          texto: "Soporte respondió tu consulta",
          read: false
        });
      }
    }
  } catch (err) {
    console.error("[support realtime] error:", err);
  }
}

  let supportRealtimeRetryCount = 0;
const MAX_SUPPORT_RETRIES = 5;

async function subscribeSupportRealtimeForUser(force = false) {
  if (!window.sbRealtime) return null;

  const session = await obtenerSesionCliente(true);
  if (!session?.user?.id) {
    cleanupSupportRealtime();
    return null;
  }

  const userId = session.user.id;

  if (!force && currentSupportChannel && supportRealtimeActiveUserId === userId) {
    return currentSupportChannel;
  }

  cleanupSupportRealtime();

  if (
    window._lastSupportSubscribeSuccess &&
    (Date.now() - window._lastSupportSubscribeSuccess > 30000)
  ) {
    supportRealtimeRetryCount = 0;
  }

  if (supportRealtimeRetryCount >= MAX_SUPPORT_RETRIES) {
    console.error("[support realtime] máximo de reintentos alcanzado");
    notif.show("Error de conexión", "No se pudo conectar al soporte en tiempo real", "error");
    return null;
  }

  supportRealtimeActiveUserId = userId;
  supportRealtimeManuallyClosing = false;
  supportRealtimeRetryCount++;

  currentSupportChannel = window.sbRealtime
    .channel(`support-user-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "svc_messages",
      },
      handleIncomingSupportMessage
    )
    .subscribe((status) => {
      console.log("[support realtime status]", status);

      if (status === "SUBSCRIBED") {
        supportRealtimeRetryCount = 0;
        window._lastSupportSubscribeSuccess = Date.now();
        return;
      }

      if (status === "CLOSED" && supportRealtimeManuallyClosing) {
        console.log("[support realtime] cierre manual ignorado");
        return;
      }

      if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
        supportRealtimeRetryCount < MAX_SUPPORT_RETRIES
      ) {
        const delay = Math.min(2000 * supportRealtimeRetryCount, 10000);

        console.warn(`[support realtime] reintentando en ${delay}ms... (intento ${supportRealtimeRetryCount})`);

        if (supportRealtimeRetryTimer) {
          clearTimeout(supportRealtimeRetryTimer);
        }

        supportRealtimeRetryTimer = setTimeout(async () => {
          try {
            const activeSession = await obtenerSesionCliente(false);
            if (!activeSession?.user?.id) return;
            await subscribeSupportRealtimeForUser(true);
          } catch (err) {
            console.warn("[support realtime] error reintentando:", err);
          }
        }, delay);
      }
    });

  window._supportChannel = currentSupportChannel;
  return currentSupportChannel;
}

// exponer API de soporte para código fuera de este DOMContentLoaded
window.subscribeSupportRealtimeForUser = subscribeSupportRealtimeForUser;
window.cleanupSupportRealtime = cleanupSupportRealtime;
window.loadOrCreateSupportTicketContext = loadOrCreateSupportTicketContext;
window.handleIncomingSupportMessage = handleIncomingSupportMessage;  
supportBtn?.addEventListener("click", async () => {
  try {
    const session = await obtenerSesionCliente(true);

    if (!session?.access_token || !session?.user) {
      notif.show(
        "Ingresá primero",
        "Necesitás iniciar sesión para contactar soporte.",
        "warning"
      );
      return;
    }

    await manejarPermisoNotificacionesEnSoporte(session);
    openSupportSheet();
    await loadOrCreateSupportTicketContext();
    await subscribeSupportRealtimeForUser();
  } catch (err) {
    console.error("[supportBtn] error:", err);
    notif.show("Error", err?.message || "No se pudo abrir soporte", "error");
  }
});

supportSheetClose?.addEventListener("click", closeSupportSheet);
supportSheetOverlay?.addEventListener("click", closeSupportSheet);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && supportSheet?.classList.contains("is-open")) {
    closeSupportSheet();
  }
});

supportSendBtn?.addEventListener("click", async () => {
  try {
    const mensaje = supportMessageInput?.value?.trim();

    if (!mensaje) {
      notif.show("Mensaje vacío", "Escribí tu consulta antes de enviar.", "warning");
      return;
    }

    const session = await obtenerSesionCliente(true);

    if (!session?.access_token || !session?.user) {
      notif.show("Sesión requerida", "Volvé a iniciar sesión para enviar soporte.", "warning");
      return;
    }

    supportSendBtn.disabled = true;

    const userId = session.user.id;
    const email = session.user.email || null;
    const viajeId = state?.viajeId || null;
    const estadoViaje = state?.estadoViaje || state?.viajeEstado || null;
    const origen = state?.origen?.direccionCorta || state?.origen?.direccion || null;
    const destino = state?.destino?.direccionCorta || state?.destino?.direccion || null;

    const metadata = {
      viaje_id: viajeId,
      estado_viaje: estadoViaje,
      email,
      origen,
      destino,
      ts: new Date().toISOString()
    };

    const asunto = viajeId
      ? `Consulta sobre viaje ${viajeId}`
      : "Consulta general desde app cliente";

if (!currentSupportTicketId) {
  const { data: ticket, error: ticketError } = await window.supabaseInsert(
    "svc_conversations",
    {
      request_id: null,
      client_user_id: userId,
      provider_user_id: null,
      status: "OPEN",
      last_message_at: new Date().toISOString(),
      last_message_preview: mensaje,
      app_context: "transport",
      subject: asunto,
      participant_role: "client",
      admin_status: "abierto",
      unread_admin_count: 1,
      metadata_json: metadata
    },
    session.access_token
  );

  if (ticketError || !ticket?.id) {
    console.error("[supportSendBtn] ticketError:", ticketError);
    notif.show(
      "Error",
      ticketError?.message || "No se pudo crear la conversación de soporte",
      "error"
    );
    return;
  }

  currentSupportTicketId = ticket.id;
  await subscribeSupportRealtimeForUser(false);
} else {
  const { error: ticketUpdateError } = await window.supabaseUpdate(
    "svc_conversations",
    "id",
    currentSupportTicketId,
    {
      last_message_preview: mensaje,
      last_message_at: new Date().toISOString(),
      status: "OPEN",
      admin_status: "abierto",
      unread_admin_count: 1
    },
    session.access_token
  );

  if (ticketUpdateError) {
    console.warn("[supportSendBtn] ticketUpdateError:", ticketUpdateError);
  }
}

const { data: soporteMensaje, error: mensajeError } = await window.supabaseInsert(
  "svc_messages",
  {
    conversation_id: currentSupportTicketId,
    sender_user_id: userId,
    sender_role: "client",
    message_type: "TEXT",
    body: mensaje,
    metadata_json: metadata,
    delivery_status: "sent",
    attachments_json: []
  },
  session.access_token
);

if (mensajeError || !soporteMensaje?.id) {
  console.error("[supportSendBtn] mensajeError:", mensajeError);
  notif.show(
    "Error",
    mensajeError?.message || "No se pudo guardar el mensaje",
    "error"
  );
  return;
}
    appendSupportMessage(mensaje, "user", soporteMensaje.id);
    supportMessageInput.value = "";

    notif.show("Enviado", "Tu mensaje fue enviado a soporte.", "success");
  } catch (err) {
    console.error("[supportSendBtn] error:", err);
    notif.show("Error", "No se pudo enviar el mensaje de soporte", "error");
  } finally {
    supportSendBtn.disabled = false;
  }
});

try {
  cargarNotificacionesDesdeStorage();
  renderizarCentroNotificaciones();
  await restaurarViajeActivoCliente();
  await subscribeSupportRealtimeForUser();

if (window.initSupportPushFCM) {
    await asegurarPushCliente({
      promptIfNeeded: false,
      source: 'bootstrap'
    });
  }
} catch (err) {
  console.error("[DOMContentLoaded bootstrap] error:", err);
}
  }); // ← CIERRA DOMContentLoaded

// ==========================================
