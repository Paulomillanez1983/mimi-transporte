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

export function loadConfig() {
  const raw = window.MIMI_SERVICES_CONFIG ?? {};

  const supabaseUrl = sanitizeUrl(
    raw.supabaseUrl ??
    raw.SUPABASE_URL ??
    window.SUPABASE_URL ??
    ""
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
      ...(isPlainObject(raw.endpoints) ? raw.endpoints : {})
    },
    getAccessToken: createAccessTokenGetter(raw),
    providerUserId: normalizeNullableString(raw.providerUserId ?? raw.PROVIDER_USER_ID),
    clientUserId: normalizeNullableString(raw.clientUserId ?? raw.CLIENT_USER_ID),
    role: normalizeNullableString(raw.role ?? raw.ROLE) ?? "provider"
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
      if (!value) {
        continue;
      }

      const parsed = tryParseToken(value);
      if (parsed) {
        return parsed;
      }

      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return "";
  };
}

function tryParseToken(value) {
  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "string" && parsed.trim()) {
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
