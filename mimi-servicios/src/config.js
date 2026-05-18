const DEFAULT_ENDPOINTS = {
  providerDashboard: "svc-provider-dashboard",
  updateAvailability: "svc-provider-availability",
  respondOffer: "svc-provider-respond-offer",
  markEnRoute: "svc-provider-en-route",
  markArrived: "svc-provider-arrived",
  startService: "svc-start-service",
  getServicePin: "svc-get-service-pin",
  completeService: "svc-complete-service",
  cancelRequest: "svc-cancel-request",
  submitReview: "svc-submit-review",
  trackLocation: "svc-track-location"
};

export const appConfig = {
  supabaseUrl:
    window.MIMI_SERVICES_ENV?.SUPABASE_URL ??
    window.MIMI_SERVICES_CONFIG?.supabaseUrl ??
    "",

  supabaseAnonKey:
    window.MIMI_SERVICES_ENV?.SUPABASE_ANON_KEY ??
    window.MIMI_SERVICES_CONFIG?.supabaseAnonKey ??
    "",

  // Produccion real: las categorias remotas se mezclan con este catalogo base.
  mapInitialCenter: [-64.1888, -31.4201],
  mapInitialZoom: 12,

  rpc: {
    prepareRequestPricing: "svc_prepare_request_pricing"
  },

  functions: {
    searchProviders: "svc-search-providers",
    createRequest: "svc-create-request",
    providerDashboard: "svc-provider-dashboard",
    updateAvailability: "svc-provider-availability",
    providerRespondOffer: "svc-provider-respond-offer",
    providerEnRoute: "svc-provider-en-route",
    providerArrived: "svc-provider-arrived",
    startService: "svc-start-service",
    getServicePin: "svc-get-service-pin",
    completeService: "svc-complete-service",
    cancelRequest: "svc-cancel-request",
    sendMessage: "svc-send-message",
    submitReview: "svc-submit-review",
    trackLocation: "svc-track-location",
    registerDevice: "svc-register-device",
    resolveServiceIntent: "svc-resolve-service-intent",
    clientPhoneStatus: "svc-client-phone-status",
    clientPhoneStart: "svc-client-phone-start",
    clientPhoneVerify: "svc-client-phone-verify",
    otpRequest: "otp-request",
    otpVerify: "otp-verify",
    deviceTrustCheck: "device-trust-check",
    authRiskEvaluation: "auth-risk-evaluation",
    createPaymentIntent: "create-payment-intent",
    getPaymentStatus: "get-payment-status",
    cancelPayment: "cancel-payment",
    refundPayment: "refund-payment",
    providerPayoutAccount: "provider-payout-account",
    securityRiskEvent: "security-risk-event"
  },

  serviceStates: [
    "SEARCHING",
    "PENDING_PROVIDER_RESPONSE",
    "ACCEPTED",
    "SCHEDULED",
    "PROVIDER_EN_ROUTE",
    "PROVIDER_ARRIVED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED"
  ],

  categories: [
    { id: "servicio-domestico", code: "SERVICIO_DOMESTICO", name: "Servicio domestico", description: "Ayuda general para el hogar.", aliases: ["domestico", "hogar", "casa"] },
    { id: "limpieza", code: "LIMPIEZA", name: "Limpieza", description: "Hogar, departamento, oficina y mantenimiento general.", aliases: ["limpieza hogar", "empleada domestica", "mucama"] },
    { id: "limpieza-oficinas", code: "LIMPIEZA_OFICINAS", name: "Limpieza de oficinas", description: "Limpieza y mantenimiento de espacios comerciales u oficinas.", aliases: ["oficina", "oficinas", "limpieza oficinas", "comercial"] },
    { id: "plomeria", code: "PLOMERIA", name: "Plomeria", description: "Canerias, perdidas, griferia, banos y urgencias simples.", aliases: ["plomero", "canos", "fuga", "perdida de agua"] },
    { id: "electricidad", code: "ELECTRICIDAD", name: "Electricidad", description: "Instalaciones, reparaciones y revisiones electricas.", aliases: ["electricista", "luz", "enchufe", "cortocircuito"] },
    { id: "gasista", code: "GASISTA", name: "Gasista", description: "Instalaciones y revisiones de gas por prestadores habilitados.", aliases: ["gas", "matriculado", "calefon", "cocina"] },
    { id: "instalacion-aire", code: "INSTALACION_AIRE", name: "Instalacion de aire", description: "Instalacion, mantenimiento y revision de aires acondicionados.", aliases: ["aire acondicionado", "split", "refrigeracion", "ac"] },
    { id: "refrigeracion", code: "REFRIGERACION", name: "Refrigeracion", description: "Heladeras, freezers, camaras y equipos de frio.", aliases: ["heladera", "freezer", "frio"] },
    { id: "pintura", code: "PINTURA", name: "Pintura", description: "Pintura interior, exterior y retoques.", aliases: ["pintor", "pared", "humedad"] },
    { id: "reparaciones-hogar", code: "REPARACIONES_HOGAR", name: "Reparaciones del hogar", description: "Arreglos generales, mantenimiento y soluciones simples del hogar.", aliases: ["arreglos", "mantenimiento", "reparaciones", "arreglo paredes"] },
    { id: "colocacion-ceramicos", code: "COLOCACION_CERAMICOS", name: "Colocacion de ceramicos", description: "Colocacion, reparacion y terminaciones con ceramicos.", aliases: ["ceramicos", "azulejos", "colocar ceramicos"] },
    { id: "cerrajeria", code: "CERRAJERIA", name: "Cerrajeria", description: "Cerraduras, llaves, aperturas y cambios.", aliases: ["cerrajero", "llave", "cerradura"] },
    { id: "carpinteria", code: "CARPINTERIA", name: "Carpinteria", description: "Muebles, puertas, arreglos y trabajos en madera.", aliases: ["carpintero", "madera", "mueble"] },
    { id: "albanileria", code: "ALBANILERIA", name: "Albanileria", description: "Arreglos, pequenas obras y mantenimiento.", aliases: ["albanil", "obra", "pared"] },
    { id: "jardineria", code: "JARDINERIA", name: "Jardineria", description: "Corte, poda, limpieza y mantenimiento de espacios verdes.", aliases: ["jardinero", "poda", "pasto"] },
    { id: "mudanzas", code: "MUDANZAS", name: "Mudanzas", description: "Ayuda para mover, cargar, ordenar y trasladar objetos.", aliases: ["flete", "traslado", "carga"] },
    { id: "peluqueria", code: "PELUQUERIA", name: "Peluqueria", description: "Corte, peinado, color y servicios personales.", aliases: ["peluquero", "corte", "peinado"] },
    { id: "manicuria", code: "MANICURIA", name: "Manicuria", description: "Manos, unas, esmaltado y belleza personal.", aliases: ["unas", "esmaltado", "nails"] },
    { id: "pestanas", code: "PESTANAS", name: "Pestanas", description: "Pestanas, lifting, extensiones y servicios relacionados.", aliases: ["pestanas", "pestañas", "lifting", "extensiones"] },
    { id: "maquillaje", code: "MAQUILLAJE", name: "Maquillaje", description: "Maquillaje social, eventos y servicios de belleza.", aliases: ["maquillaje", "makeup", "maquilladora"] },
    { id: "masajista", code: "MASAJISTA", name: "Masajista", description: "Masajes y bienestar a domicilio.", aliases: ["masaje", "relajante", "descontracturante"] },
    { id: "cuidado-adultos", code: "CUIDADO_ADULTOS", name: "Cuidado de adultos", description: "Acompanamiento y cuidado de personas mayores.", aliases: ["cuidador", "ancianos", "adultos mayores", "cuy", "cui"] },
    { id: "cuidado-ninos", code: "CUIDADO_NINOS", name: "Cuidado de ninos", description: "Cuidado y acompanamiento infantil.", aliases: ["ninera", "ninos", "chicos", "cuy", "cui"] },
    { id: "acompanamiento-domiciliario", code: "ACOMPANAMIENTO_DOMICILIARIO", name: "Acompanamiento domiciliario", description: "Acompanamiento no medico y asistencia cotidiana a coordinar.", aliases: ["acompanante", "acompanamiento", "domiciliario", "adultos mayores"] },
    { id: "enfermeria", code: "ENFERMERIA", name: "Enfermeria", description: "Asistencia basica de salud y cuidados indicados.", aliases: ["enfermero", "curaciones", "inyeccion"] },
    { id: "psicologia", code: "PSICOLOGIA", name: "Psicologia", description: "Orientacion y acompanamiento psicologico con profesionales independientes.", aliases: ["psicologo", "psicologa", "terapia", "ansiedad", "emocional", "salud mental"] },
    { id: "nutricion", code: "NUTRICION", name: "Nutricion", description: "Consultas y orientacion nutricional con profesionales independientes.", aliases: ["nutricionista", "alimentacion", "dieta", "plan alimentario"] },
    { id: "kinesiologia", code: "KINESIOLOGIA", name: "Kinesiologia", description: "Rehabilitacion, movilidad y sesiones de kinesiologia.", aliases: ["kinesiologo", "fisio", "rehabilitacion", "dolor muscular"] },
    { id: "abogacia", code: "ABOGACIA", name: "Abogacia", description: "Consultas legales y orientacion profesional independiente.", aliases: ["abogado", "abogada", "legal", "contrato", "laboral", "familia"] },
    { id: "contabilidad", code: "CONTABILIDAD", name: "Contabilidad", description: "Asistencia contable, impositiva y administrativa.", aliases: ["contador", "contadora", "monotributo", "afip", "impuestos"] },
    { id: "clases-particulares", code: "CLASES_PARTICULARES", name: "Clases particulares", description: "Apoyo escolar, idiomas y capacitaciones particulares.", aliases: ["profesor", "profesora", "clases", "matematica", "ingles", "apoyo escolar"] },
    { id: "tecnico-pc", code: "TECNICO_PC", name: "Tecnico PC", description: "Soporte tecnico, computadoras, redes e impresoras.", aliases: ["computadora", "pc", "notebook", "impresora"] },
    { id: "tecnologia", code: "TECNOLOGIA", name: "Tecnologia", description: "Instalaciones, soporte tecnico y configuracion de equipos.", aliases: ["wifi", "router", "camaras", "smart tv"] },
    { id: "mascotas", code: "MASCOTAS", name: "Mascotas", description: "Paseos, cuidado, acompanamiento y asistencia basica.", aliases: ["perros", "gatos", "paseador"] },
    { id: "gomeria-movil", code: "GOMERIA_MOVIL", name: "Gomeria movil", description: "Auxilio por pinchadura, cambio de rueda y reparaciones simples.", aliases: ["gomero", "pinchadura", "rueda", "cubierta"] },
    { id: "mecanica-movil", code: "MECANICA_MOVIL", name: "Mecanica movil", description: "Diagnostico, auxilio mecanico y reparaciones simples en sitio.", aliases: ["mecanico", "auto no arranca", "bateria", "motor"] },
    { id: "herreria", code: "HERRERIA", name: "Herreria", description: "Rejas, portones, soldaduras, estructuras y presupuestos.", aliases: ["herrero", "reja", "porton", "soldadura"] },
    { id: "belleza", code: "BELLEZA", name: "Belleza", description: "Servicios personales, estetica y cuidado a domicilio.", aliases: ["estetica", "maquillaje", "belleza"] }
  ]
};

export function loadConfig() {
  const raw = window.MIMI_SERVICES_CONFIG ?? {};

  const supabaseUrl = sanitizeUrl(
    raw.supabaseUrl ??
      raw.SUPABASE_URL ??
      appConfig.supabaseUrl
  );

  const functionsBaseUrl = sanitizeUrl(
    raw.functionsBaseUrl ??
      raw.FUNCTIONS_BASE_URL ??
      (supabaseUrl ? `${supabaseUrl}/functions/v1` : "")
  );

  return {
    supabaseUrl,
    functionsBaseUrl,
    endpoints: {
      ...DEFAULT_ENDPOINTS,
      ...(raw.endpoints ?? {})
    },
    getAccessToken: createAccessTokenGetter(raw),
    providerUserId: raw.providerUserId ?? null
  };
}

function sanitizeUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function createAccessTokenGetter(raw) {
  if (typeof raw.getAccessToken === "function") {
    return raw.getAccessToken;
  }

  if (typeof raw.accessToken === "string" && raw.accessToken.trim()) {
    return async () => raw.accessToken.trim();
  }

  return async () => {
    const candidates = [
      "mimi_services_access_token",
      "sb-access-token",
      "supabase.auth.token"
    ];

    for (const key of candidates) {
      const value = window.localStorage.getItem(key);
      if (!value) continue;

      const parsed = tryParseToken(value);
      if (parsed) return parsed;

      return value.trim();
    }

    return "";
  };
}

function tryParseToken(value) {
  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "string") {
      return parsed.trim();
    }

    if (parsed?.currentSession?.access_token) {
      return String(parsed.currentSession.access_token).trim();
    }

    if (parsed?.access_token) {
      return String(parsed.access_token).trim();
    }
  } catch {
    return "";
  }

  return "";
}

export default appConfig;
