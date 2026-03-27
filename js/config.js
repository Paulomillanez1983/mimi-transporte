/**
 * MIMI Transporte - Configuración de Producción
 * Rutas reales con OSRM, experiencia Uber Driver
 */

const CONFIG = {
  // Supabase (sin cambios)
  SUPABASE_URL: 'https://xrphpqmutvadjrucqicn.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM',

  TABLES: {
    VIAJES: 'viajes',
    CHOFERES: 'choferes',
    VIAJE_OFERTAS: 'viaje_ofertas'
  },

  // =========================
  // ROUTING - OSRM (Producción)
  // =========================
  // Servidor público de OSRM (gratuito, límites aplican)
  // Para producción alta escala, hostear propio: https://github.com/Project-OSRM/osrm-backend
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  
  // Alternativa: servidor de OpenStreetMap Alemania (más estable para Latinoamérica)
  // OSRM_BASE_URL: 'https://routing.openstreetmap.de/routed-car',
  
  OSRM_PROFILE: 'driving',
  
  // Valhalla alternativa (si OSRM falla)
  VALHALLA_URL: 'https://valhalla.openstreetmap.de',

  // Mapas
  MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty',
  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba, Argentina
  DEFAULT_ZOOM: 14,

  // Timings
  LOCATION_UPDATE_INTERVAL: 3000,
  TRIP_REFRESH_INTERVAL: 8000,
  INCOMING_MODAL_TIMEOUT: 45000,
  ROUTE_REFRESH_INTERVAL: 10000, // Recalcular ruta cada 10s si es necesario

  // Estados
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

  // Colores
  COLORS: {
    primary: '#276EF1',
    success: '#05944F',
    danger: '#E11900',
    warning: '#FF9500',
    gold: '#FFD700',
    
    // Navegación
    routeLine: '#000000', // Línea de ruta negra estilo Uber
    routeLineBorder: '#FFFFFF',
    routeLineWidth: 6,
    
    bgPrimary: '#000000',
    bgSecondary: '#121212',
    bgCard: '#1C1C1E',
    
    textPrimary: '#FFFFFF',
    textSecondary: '#A0A0A0',
  },

  REDIRECTS: {
    LOGIN: '/mimi-transporte/login-chofer.html',
    PANEL: '/mimi-transporte/chofer-panel.html',
    LANDING: '/mimi-transporte/chofer.html'
  },

  FEATURES: {
    enableHaptics: true,
    enableVoiceSynthesis: true,
    enableTurnByTurn: true, // Navegación paso a paso
    enableRouteRecalculation: true,
    enableTraffic: false // OSRM no tiene tráfico real-time gratis
  }
};

Object.freeze(CONFIG);
export default CONFIG;
