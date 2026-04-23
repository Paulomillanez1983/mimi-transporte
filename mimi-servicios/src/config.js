const DEFAULT_ENDPOINTS = {
  providerDashboard: "svc-provider-dashboard",
  updateAvailability: "svc-provider-availability",
  respondOffer: "svc-provider-respond-offer",
  markEnRoute: "svc-provider-en-route",
  markArrived: "svc-provider-arrived",
  startService: "svc-start-service",
  completeService: "svc-complete-service",
  cancelRequest: "svc-cancel-request",
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
  demoClientUserId: window.MIMI_SERVICES_ENV?.DEMO_CLIENT_USER_ID ?? null,
  demoProviderUserId: window.MIMI_SERVICES_ENV?.DEMO_PROVIDER_USER_ID ?? null,
  mapInitialCenter: [-64.1888, -31.4201],
  mapInitialZoom: 12,
  rpc: {
    prepareRequestPricing: "svc_prepare_request_pricing"
  },
  functions: {
    searchProviders: "svc-search-providers",
    createRequest: "svc-create-request",
    providerRespondOffer: "svc-provider-respond-offer",
    providerEnRoute: "svc-provider-en-route",
    providerArrived: "svc-provider-arrived",
    startService: "svc-start-service",
    completeService: "svc-complete-service",
    cancelRequest: "svc-cancel-request",
    sendMessage: "svc-send-message",
    trackLocation: "svc-track-location",
    registerDevice: "svc-register-device"
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
    {
      id: "cleaning",
      code: "cleaning",
      name: "Limpieza",
      description: "Hogar, oficinas y express."
    }
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
