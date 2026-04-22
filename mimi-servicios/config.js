===== config.js =====
export const appConfig = {
  supabaseUrl: window.MIMI_SERVICES_ENV?.SUPABASE_URL ?? "",
  supabaseAnonKey: window.MIMI_SERVICES_ENV?.SUPABASE_ANON_KEY ?? "",

  demoClientUserId: window.MIMI_SERVICES_ENV?.DEMO_CLIENT_USER_ID ?? null,
  demoProviderUserId: window.MIMI_SERVICES_ENV?.DEMO_PROVIDER_USER_ID ?? null,

  mapInitialCenter: [-64.1888, -31.4201],
  mapInitialZoom: 12,

  rpc: {
    searchProvidersRanked: "svc_search_providers_ranked",
    prepareRequestPricing: "svc_prepare_request_pricing",
  },

  functions: {
    searchProviders: "svc-search-providers",
    createRequest: "svc-create-request",
    sendOffer: "svc-send-offer",
    providerRespondOffer: "svc-provider-respond-offer",
    providerEnRoute: "svc-provider-en-route",
    providerArrived: "svc-provider-arrived",
    startService: "svc-start-service",
    completeService: "svc-complete-service",
    cancelRequest: "svc-cancel-request",
    sendMessage: "svc-send-message",
    trackLocation: "svc-track-location",
    registerDevice: "svc-register-device",
  },

  providerUi: {
    offerTimeoutMs: 90000,
    trackingIntervalMs: 12000,
    reconnectPollingMs: 15000,
    notificationsMaxItems: 50,
  },

  storageKeys: {
    providerMode: "mimi_services_provider_mode",
    providerStatus: "mimi_services_provider_status",
    activeService: "mimi_services_active_service",
    notifications: "mimi_services_notifications",
    chatDraft: "mimi_services_chat_draft",
    lastKnownLocation: "mimi_services_last_known_location",
    sessionSnapshot: "mimi_services_session_snapshot",
  },

  serviceStates: {
    SEARCHING: "SEARCHING",
    PENDING_PROVIDER_RESPONSE: "PENDING_PROVIDER_RESPONSE",
    ACCEPTED: "ACCEPTED",
    SCHEDULED: "SCHEDULED",
    PROVIDER_EN_ROUTE: "PROVIDER_EN_ROUTE",
    PROVIDER_ARRIVED: "PROVIDER_ARRIVED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
  },

  providerStatuses: {
    OFFLINE: "OFFLINE",
    ONLINE_IDLE: "ONLINE_IDLE",
    INVITED: "INVITED",
    BOOKED_UPCOMING: "BOOKED_UPCOMING",
    EN_ROUTE: "EN_ROUTE",
    ARRIVED: "ARRIVED",
    IN_SERVICE: "IN_SERVICE",
    PAUSED: "PAUSED",
    BLOCKED: "BLOCKED",
  },

  categories: [
    {
      id: "cleaning",
      code: "cleaning",
      name: "Limpieza",
      description: "Hogar, oficinas y express.",
    },
  ],
};

