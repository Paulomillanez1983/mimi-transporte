/**
 * MIMI Transporte - Configuración Producción
 */

const CONFIG = {
  SUPABASE_URL: 'https://xrphpqmutvadjrucqicn.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM',

  TABLES: {
    VIAJES: 'viajes',
    CHOFERES: 'choferes',
    VIAJE_OFERTAS: 'viaje_ofertas'
  },

  // Routing - Valhalla (mejor soporte CORS)
  ROUTING_PROVIDER: 'valhalla',
  VALHALLA_URL: 'https://valhalla.openstreetmap.de/route',

  // Mapas
  MAP_STYLE: 'https://tiles.openfreemap.org/styles/liberty',
  DEFAULT_CENTER: [-64.1888, -31.4201],
  DEFAULT_ZOOM: 14,

  // Timings
  LOCATION_UPDATE_INTERVAL: 3000,
  TRIP_REFRESH_INTERVAL: 8000,
  INCOMING_MODAL_TIMEOUT: 45000,
  ROUTE_REFRESH_INTERVAL: 15000,

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

  COLORS: {
    primary: '#276EF1',
    success: '#05944F',
    danger: '#E11900',
    routeLine: '#000000',
    routeBorder: '#FFFFFF',
    bgPrimary: '#000000',
    bgCard: '#1C1C1E',
    textPrimary: '#FFFFFF'
  },

  REDIRECTS: {
    LOGIN: '/mimi-transporte/login-chofer.html',
    PANEL: '/mimi-transporte/chofer-panel.html'
  }
};

Object.freeze(CONFIG);
export default CONFIG;
