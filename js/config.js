/**
 * MIMI Driver - Configuration (PRODUCTION FINAL)
 * Centralized config with environment detection
 */

const CONFIG = {
  // =========================================================
  // SUPABASE
  // =========================================================
SUPABASE_URL: 'https://xrphpqmutvadjrucqicn.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM',

  // =========================================================
  // MAP (MAPLIBRE)
  // =========================================================
  // IMPORTANTE: Tiene que ser un style.json real
MAP_STYLE: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',

  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba, Argentina
  DEFAULT_ZOOM: 14,

  // =========================================================
  // ROUTING
  // =========================================================
  ROUTING_PROVIDER: 'valhalla',
VALHALLA_URL: 'https://valhalla.openstreetmap.de/route',

  // =========================================================
  // INTERVALS (ms)
  // =========================================================
  LOCATION_UPDATE_INTERVAL: 3000,
  TRIP_REFRESH_INTERVAL: 5000,
  PRESENCE_INTERVAL: 30000,

  // =========================================================
  // TIMEOUTS
  // =========================================================
  INCOMING_OFFER_TIMEOUT: 15, // seconds
  COUNTDOWN_WARNING: 5, // seconds

  // =========================================================
  // STATES
  // =========================================================
  DRIVER_STATES: {
    OFFLINE: 'OFFLINE',
    ONLINE: 'ONLINE',
    RECEIVING_OFFER: 'RECEIVING_OFFER',
    GOING_TO_PICKUP: 'GOING_TO_PICKUP',
    PASSENGER_ONBOARD: 'PASSENGER_ONBOARD',
    IN_PROGRESS: 'IN_PROGRESS',
    ARRIVED: 'ARRIVED'
  },

  TRIP_STATES: {
    DISPONIBLE: 'DISPONIBLE',
    OFERTADO: 'OFERTADO',
    ACEPTADO: 'ACEPTADO',
    EN_CURSO: 'EN_CURSO',
    COMPLETADO: 'COMPLETADO',
    CANCELADO: 'CANCELADO'
  },

  // =========================================================
  // UI
  // =========================================================
  ANIMATION_DURATION: 300,
  TOAST_DURATION: 4000,
  BOTTOM_SHEET_SNAP_POINTS: [80, 400, '85vh'],

  // =========================================================
  // FEATURES
  // =========================================================
  FEATURES: {
    enableSounds: true,
    enableHaptics: true,
    enableVoice: false,
    enableBackgroundLocation: true
  },

  // =========================================================
  // REDIRECTS
  // =========================================================
  REDIRECTS: {
    LOGIN: '/mimi-transporte/login-chofer.html',
    PANEL: '/mimi-transporte/chofer-panel.html'
  }
};

// Prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.DRIVER_STATES);
Object.freeze(CONFIG.TRIP_STATES);
Object.freeze(CONFIG.FEATURES);
Object.freeze(CONFIG.REDIRECTS);

export default CONFIG;
