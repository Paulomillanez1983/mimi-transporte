/**
 * MIMI Transporte - Configuración de Producción
 * Variables de entorno y constantes globales
 */

const CONFIG = {
  // Supabase
  SUPABASE_URL: "https://xrphpqmutvadjrucqicn.supabase.co",
  SUPABASE_KEY: "TU_ANON_KEY_REAL_AQUI",

  // Mapas
  MAP_STYLE: "https://demotiles.maplibre.org/style.json",
  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba, Argentina
  DEFAULT_ZOOM: 14,

  // Timings
  LOCATION_UPDATE_INTERVAL: 5000,
  TRIP_REFRESH_INTERVAL: 10000,
  INCOMING_MODAL_TIMEOUT: 30000,
  COUNTDOWN_REFRESH: 1000,

  // Geolocalización
  GEO_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  },

  // Estados de viaje
  ESTADOS: {
    DISPONIBLE: "DISPONIBLE",
    ASIGNADO: "ASIGNADO",
    ACEPTADO: "ACEPTADO",
    EN_CURSO: "EN_CURSO",
    COMPLETADO: "COMPLETADO",
    CANCELADO: "CANCELADO",
    RECHAZADO: "RECHAZADO",
    TIMEOUT: "TIMEOUT"
  },

  // URLs
  REDIRECTS: {
    LOGIN: "login-chofer.html",
    PANEL: "chofer-panel.html"
  }
};

// Prevenir modificaciones
Object.freeze(CONFIG);
Object.freeze(CONFIG.ESTADOS);
Object.freeze(CONFIG.GEO_OPTIONS);
Object.freeze(CONFIG.REDIRECTS);

export default CONFIG;
