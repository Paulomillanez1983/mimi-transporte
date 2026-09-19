window.MIMI_SERVICES_ENV = {
  SUPABASE_URL: "https://xrphpqmutvadjrucqicn.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM",
  VITE_POCKETBASE_URL: "https://cms.mimigo.com.ar",
  // El CMS esta caido: cms.mimigo.com.ar responde 522 de Cloudflare (no llega al origen).
  // Estaba habilitado por defecto en runtime-config.js, asi que cada carga del panel y de la
  // app del cliente disparaba cuatro pedidos (service_categories, feature_flags, banners y
  // home_sections) que no terminaban nunca, competian por la conexion y hacian que la app
  // mostrara "Failed to fetch" en un cartel rojo al prestador.
  //
  // Los cuatro tienen respaldo en la base y en el catalogo local, que es lo que ya estaba
  // contestando (Categories loaded: 38 items, DB: 38, fallback: 0). Con esto la app deja de
  // llamar al CMS muerto. El dia que el CMS vuelva, alcanza con poner true de nuevo.
  MIMI_POCKETBASE_ENABLED: false,
  VITE_FINGERPRINT_ENABLED: true,
  VITE_FINGERPRINT_MODE: "audit",
  MIMI_DEFAULT_PHONE_COUNTRY: "AR",
  MIMI_POCKETBASE_TIMEOUT_MS: 2500,
  MIMI_REALTIME_ENABLED: true,
  MIMI_REMOTE_BOOTSTRAP_ENABLED: false,
  MIMI_BOOT_PUSH_REGISTRATION: true,
  SECURITY_FLAGS: {
    ENABLE_SECURITY_ANALYTICS: true
  },
  DEMO_CLIENT_USER_ID: null,
  DEMO_PROVIDER_USER_ID: null,
};
