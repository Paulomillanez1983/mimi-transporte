export const appConfig = {
  supabaseUrl: window.MIMI_SERVICES_ENV?.SUPABASE_URL ?? "",
  supabaseAnonKey: window.MIMI_SERVICES_ENV?.SUPABASE_ANON_KEY ?? "",
  mapInitialCenter: [-64.1888, -31.4201],
  mapInitialZoom: 12,
  functions: {
    createRequest: "svc-create-request",
    providerRespondOffer: "svc-provider-respond-offer",
    providerEnRoute: "svc-provider-en-route",
    providerArrived: "svc-provider-arrived",
    startService: "svc-start-service",
    completeService: "svc-complete-service",
    cancelRequest: "svc-cancel-request",
    sendMessage: "svc-send-message"
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
    { id: "cleaning", code: "cleaning", name: "Limpieza", description: "Hogar, oficinas y express." },
    { id: "plumbing", code: "plumbing", name: "Plomeria", description: "Urgencias y mantenimientos." },
    { id: "electricity", code: "electricity", name: "Electricidad", description: "Instalaciones y reparaciones." },
    { id: "care", code: "care", name: "Cuidados", description: "Acompanamiento y asistencia." },
    { id: "gardening", code: "gardening", name: "Jardineria", description: "Mantenimiento y poda." },
    { id: "tech", code: "tech", name: "Soporte tech", description: "WiFi, PC y hogar inteligente." }
  ]
};
