/**
 * MIMI Transporte - Configuración de Producción Premium
 * Variables de entorno y constantes globales optimizadas
 */

const CONFIG = {
  // =========================
  // SUPABASE
  // =========================
  SUPABASE_URL: 'https://xrphpqmutvadjrucqicn.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM',

  // =========================
  // TABLAS
  // =========================
  TABLES: {
    VIAJES: 'viajes',
    CHOFERES: 'choferes',
    VIAJE_OFERTAS: 'viaje_ofertas'
  },

  // =========================
  // MAPAS (Optimizado para rendimiento)
  // =========================
  MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty',
  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba, Argentina
  DEFAULT_ZOOM: 14,
  MAP_ANIMATION_DURATION: 800,

  // =========================
  // TIMINGS (UX Optimizada)
  // =========================
  LOCATION_UPDATE_INTERVAL: 3000, // Más frecuente para precisión
  TRIP_REFRESH_INTERVAL: 8000,
  INCOMING_MODAL_TIMEOUT: 45000, // Más tiempo para decisión
  COUNTDOWN_REFRESH: 1000,
  TOAST_DURATION: 4000,
  PANEL_ANIMATION_DURATION: 300,
  BUTTON_DEBOUNCE: 800,

  // =========================
  // GEOLOCALIZACIÓN (Alta precisión)
  // =========================
  GEO_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 8000,
    maximumAge: 2000
  },

  // =========================
  // ESTADOS DE VIAJE
  // =========================
  ESTADOS: {
    DISPONIBLE: 'DISPONIBLE',
    ASIGNADO: 'ASIGNADO',
    ACEPTADO: 'ACEPTADO',
    EN_CURSO: 'EN_CURSO',
    COMPLETADO: 'COMPLETADO',
    CANCELADO: 'CANCELADO',
    RECHAZADO: 'RECHAZADO',
    TIMEOUT: 'TIMEOUT',
    PENDIENTE: 'PENDIENTE'
  },

  // =========================
  // COLORES PREMIUM (Dark Mode Optimizado)
  // =========================
  COLORS: {
    primary: '#276EF1',
    primaryLight: '#3E8AFF',
    success: '#05944F',
    successLight: '#06C167',
    danger: '#E11900',
    dangerLight: '#FF3B30',
    warning: '#FF9500',
    gold: '#FFD700',
    purple: '#AF52DE',
    
    // Dark theme
    bgPrimary: '#000000',
    bgSecondary: '#121212',
    bgCard: '#1C1C1E',
    bgElevated: '#2C2C2E',
    
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
    textTertiary: '#6C6C6C',
    
    border: '#2C2C2E',
    borderLight: '#3A3A3C',
    
    // Gradientes
    gradientPrimary: 'linear-gradient(135deg, #276EF1 0%, #3E8AFF 100%)',
    gradientSuccess: 'linear-gradient(135deg, #05944F 0%, #06C167 100%)',
    gradientDanger: 'linear-gradient(135deg, #E11900 0%, #FF3B30 100%)',
    gradientGold: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
  },

  // =========================
  // SONIDOS (Frecuencias optimizadas)
  // =========================
  SOUNDS: {
    newTrip: { freq: [880, 1100, 1320], duration: [0.1, 0.1, 0.4], type: 'triangle' },
    success: { freq: [523.25, 659.25, 783.99, 1046.5], duration: [0.08, 0.08, 0.08, 0.3], type: 'sine' },
    error: { freq: [200, 150, 100], duration: [0.15, 0.15, 0.4], type: 'sawtooth' },
    notification: { freq: [800, 1000], duration: [0.1, 0.2], type: 'sine' },
    arrival: { freq: [600, 800, 1000, 1200], duration: [0.1, 0.1, 0.1, 0.5], type: 'sine' }
  },

  // =========================
  // VIBRACIONES (Haptic Feedback)
  // =========================
  HAPTICS: {
    newTrip: [100, 50, 100, 50, 200, 100, 300, 100, 500],
    success: [50, 100, 50],
    error: [100, 50, 100, 50, 100],
    notification: [60],
    heavy: [100],
    arrival: [50, 100, 50, 100, 200]
  },

  // =========================
  // REDIRECCIONES
  // =========================
  REDIRECTS: {
    LOGIN: '/mimi-transporte/login-chofer.html',
    PANEL: '/mimi-transporte/chofer-panel.html',
    LANDING: '/mimi-transporte/chofer.html'
  },

  // =========================
  // FEATURE FLAGS (Nuevas funcionalidades)
  // =========================
  FEATURES: {
    enableHaptics: true,
    enableVoiceSynthesis: true,
    enableAutoNavigation: true,
    enableSmartNotifications: true,
    enableEarningsPreview: true,
    enableRouteOptimization: true
  }
};

// Prevenir modificaciones
Object.freeze(CONFIG.ESTADOS);
Object.freeze(CONFIG.GEO_OPTIONS);
Object.freeze(CONFIG.TABLES);
Object.freeze(CONFIG.REDIRECTS);
Object.freeze(CONFIG.COLORS);
Object.freeze(CONFIG.SOUNDS);
Object.freeze(CONFIG.HAPTICS);
Object.freeze(CONFIG.FEATURES);
Object.freeze(CONFIG);

export default CONFIG;
