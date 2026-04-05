/**
 * MIMI Driver - Configuration (PRODUCTION FINAL)
 * Centralized config with environment detection
 */

const CONFIG = {
  // =========================================================
  // SUPABASE
  // =========================================================
  SUPABASE_URL: 'https://xrphpqmutvadjrucqicn.supabase.co',
  SUPABASE_KEY: 'TU_ANON_KEY',

  // =========================================================
  // MAP (MAPLIBRE)
  // =========================================================
  MAP_STYLE: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba
  DEFAULT_ZOOM: 14,

  // =========================================================
  // ROUTING
  // =========================================================
  ROUTING_PROVIDER: 'osrm',
  OSRM_URL: 'https://router.project-osrm.org',

  // =========================================================
  // INTERVALS (ms)
  // =========================================================
  LOCATION_UPDATE_INTERVAL: 5000,
  TRIP_REFRESH_INTERVAL: 10000,
  PRESENCE_INTERVAL: 30000,

  // =========================================================
  // TIMEOUTS
  // =========================================================
  INCOMING_OFFER_TIMEOUT: 15,
  COUNTDOWN_WARNING: 5,

  // =========================================================
  // DRIVER FLOW STATES
  // =========================================================
  DRIVER_STATES: {
    OFFLINE: 'OFFLINE',
    ONLINE_IDLE: 'ONLINE_IDLE',
    RECEIVING_OFFER: 'RECEIVING_OFFER',
    GOING_TO_PICKUP: 'GOING_TO_PICKUP',
    ARRIVED_PICKUP: 'ARRIVED_PICKUP',
    TRIP_STARTED: 'TRIP_STARTED',
    ARRIVED_DESTINATION: 'ARRIVED_DESTINATION',
    TRIP_COMPLETED: 'TRIP_COMPLETED'
  },

  // =========================================================
  // TRIP STATES
  // =========================================================
  TRIP_STATES: {
    DISPONIBLE: 'DISPONIBLE',
    OFERTADO: 'OFERTADO',
    ASIGNADO: 'ASIGNADO',
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
  },

  // =========================================================
  // SOUNDS
  // =========================================================
  SOUNDS: {
    newTrip: {
      freq: [880, 1100, 880, 1100, 880],
      duration: [0.1, 0.1, 0.1, 0.1, 0.3],
      type: 'sine'
    },
    accept: {
      freq: [523.25, 659.25, 783.99, 1046.5],
      duration: [0.08, 0.08, 0.08, 0.4],
      type: 'sine'
    },
    reject: {
      freq: [400, 300],
      duration: [0.15, 0.3],
      type: 'sine'
    },
    arrival: {
      freq: [523.25, 659.25, 783.99, 1046.5],
      duration: [0.1, 0.1, 0.1, 0.6],
      type: 'sine'
    },
    tick: {
      freq: [800],
      duration: [0.05],
      type: 'sine'
    }
  },

  // =========================================================
  // HAPTICS
  // =========================================================
  HAPTICS: {
    notification: [80],
    light: [30],
    medium: [60],
    heavy: [100, 40, 100],
    arrival: [120, 60, 120]
  }
};

// Prevent modifications
Object.freeze(CONFIG.DRIVER_STATES);
Object.freeze(CONFIG.TRIP_STATES);
Object.freeze(CONFIG.FEATURES);
Object.freeze(CONFIG.REDIRECTS);

Object.values(CONFIG.SOUNDS).forEach(Object.freeze);
Object.freeze(CONFIG.SOUNDS);

Object.freeze(CONFIG.HAPTICS);
Object.freeze(CONFIG);

export default CONFIG;
