/**
 * MIMI Transporte - Configuración de Producción
 * Variables de entorno y constantes globales
 */

const CONFIG = {
  // Supabase
  SUPABASE_URL: "https://xrphpqmutvadjrucqicn.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM",
  
  // Mapas
  MAP_STYLE: 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json',
  DEFAULT_CENTER: [-64.1888, -31.4201], // Córdoba, Argentina
  DEFAULT_ZOOM: 14,
  
  // Timings
  LOCATION_UPDATE_INTERVAL: 5000,      // 5 segundos
  TRIP_REFRESH_INTERVAL: 10000,        // 10 segundos
  INCOMING_MODAL_TIMEOUT: 30000,       // 30 segundos para aceptar
  COUNTDOWN_REFRESH: 1000,             // 1 segundo
  
  // Geolocalización
  GEO_OPTIONS: {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  },
  
  // Estados de viaje
  ESTADOS: {
    DISPONIBLE: 'DISPONIBLE',
    ASIGNADO: 'ASIGNADO',
    ACEPTADO: 'ACEPTADO',
    EN_CURSO: 'EN_CURSO',
    COMPLETADO: 'COMPLETADO',
    CANCELADO: 'CANCELADO'
  },
  
  // URLs
REDIRECTS: {
  LOGIN: 'login-chofer.html',
  PANEL: 'chofer-panel.html'
}
};

// Prevenir modificaciones
Object.freeze(CONFIG);
Object.freeze(CONFIG.ESTADOS);
Object.freeze(CONFIG.GEO_OPTIONS);

export default CONFIG;
