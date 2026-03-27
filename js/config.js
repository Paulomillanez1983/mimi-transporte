/**
 * MIMI Transporte - Configuración de Producción
 * Variables de entorno y constantes globales
 */

const CONFIG = {
  // Supabase
  SUPABASE_URL: "https://xrphpqmutvadjrucqicn.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM", // <-- PEGÁ ACÁ LA KEY REAL

  // Tablas
  TABLES: {
    VIAJES: "viajes",
    CHOFERES: "choferes"
  },

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
    LOGIN: "/mimi-transporte/login-chofer.html",
    PANEL: "/mimi-transporte/chofer-panel.html"
  }
};

// Prevenir modificaciones
Object.freeze(CONFIG);
Object.freeze(CONFIG.TABLES);
Object.freeze(CONFIG.ESTADOS);
Object.freeze(CONFIG.GEO_OPTIONS);
Object.freeze(CONFIG.REDIRECTS);

export default CONFIG;
