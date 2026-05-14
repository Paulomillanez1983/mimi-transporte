import { appConfig } from "../config.js";
import {
  callRpc,
  clearAuthRedirectIntent,
  forceCleanSession,
  getSupabaseClient,
  recoverSessionSafely,
  signOut as signOutFromSupabase
} from "./supabase.js?v=2026.05.14.9";
import { buildMockProviders } from "./mock-data.js";
import { MIMI_NEARBY_REFRESH_INTERVAL_MS } from "./runtime-config.js";

const SERVICE_PROVIDER_DOCUMENTS_BUCKET = "service-provider-documents";
const PROVIDER_DOCUMENT_SELECT = "id,provider_id,document_type,storage_bucket,storage_path,mime_type,file_size_bytes,review_status,review_notes,reviewed_at,metadata_json,created_at,updated_at";
const SERVICE_REQUEST_SAFE_SELECT = `
  id,
  client_user_id,
  category_id,
  selected_provider_id,
  accepted_provider_id,
  request_type,
  status,
  address_text,
  service_lat,
  service_lng,
  scheduled_for,
  requested_hours,
  notes,
  provider_price_snapshot,
  platform_fee_snapshot,
  total_price_snapshot,
  currency,
  provider_response_deadline_at,
  metadata_json,
  accepted_at,
  en_route_at,
  arrived_at,
  started_at,
  completed_at,
  cancelled_at,
  cancelled_by,
  created_at,
  updated_at,
  svc_categories(id,name,code,description)
`;
const providerSnapshotCache = new Map();
const PROVIDER_LEGAL_REQUIREMENT_FALLBACKS = [
  {
    code: "terms_providers",
    document_code: "terms_providers",
    actor_type: "provider",
    accept_actor_type: "provider",
    title: "Términos y Condiciones para Prestadores Independientes",
    version: "2026.1.0",
    version_label: "Versión 2026.1.0",
    is_mandatory: true,
    accepted: false,
    accepted_at: null
  },
  {
    code: "privacy_policy",
    document_code: "privacy_policy",
    actor_type: "all",
    accept_actor_type: "provider",
    title: "Política de Privacidad y Protección de Datos Personales",
    version: "2026.1.0",
    version_label: "Versión 2026.1.0",
    is_mandatory: true,
    accepted: false,
    accepted_at: null
  }
];

function hasBackend() {
  return Boolean(getSupabaseClient());
}

async function requireSession() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const session = await recoverSessionSafely();

  if (!session?.access_token) {
    const authError = new Error("AUTH_REQUIRED");
    authError.code = "AUTH_REQUIRED";
    throw authError;
  }

  return session;
}

function getAuthDeviceContext(actorRole = "client") {
  let deviceId = "";

  try {
    deviceId = localStorage.getItem("mimi_services_device_id") || "";
    if (!deviceId) {
      deviceId =
        crypto.randomUUID?.() ||
        `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem("mimi_services_device_id", deviceId);
    }
  } catch (_) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  const uaPlatform =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    "web";

  return {
    actor_role: actorRole === "provider" ? "provider" : "client",
    device_id: deviceId,
    platform: String(uaPlatform || "web").slice(0, 80),
    app_version: String(
      window.MIMI_PROVIDER_BUILD ||
      window.MIMI_CLIENT_BUILD ||
      window.MIMI_SERVICES_ENV?.APP_VERSION ||
      "web"
    ).slice(0, 80)
  };
}

function isOtpQaEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("otp_qa");

    if (flag === "1") {
      localStorage.setItem("mimi_otp_qa", "1");
      return true;
    }

    if (flag === "0") {
      localStorage.removeItem("mimi_otp_qa");
      return false;
    }

    return localStorage.getItem("mimi_otp_qa") === "1";
  } catch (_) {
    return false;
  }
}

function buildSafeOtpQaPayload(payload = {}) {
  const details = payload?.details || {};
  const status =
    payload?.status ||
    details.status ||
    (payload?.ok === true ? "ok" : payload?.code || payload?.error || details.code || details.error || "unknown");

  return {
    debug_id:
      payload?.debug_id ||
      payload?.attempt_id ||
      payload?.attemptId ||
      details.debug_id ||
      details.attempt_id ||
      null,
    channel: payload?.channel || details.channel || null,
    fallback: payload?.fallback === true || details.fallback === true,
    maskedPhone: payload?.masked_phone || payload?.maskedPhone || details.masked_phone || null,
    status
  };
}

function logOtpQaEvent(eventName, payload = {}) {
  if (!isOtpQaEnabled()) return;
  console.info(`[MIMI OTP QA] ${eventName}`, buildSafeOtpQaPayload(payload));
}

function normalizePricingMode(value) {
  const mode = String(value ?? "").trim().toUpperCase();

  if (mode === "POR_HORA" || mode === "HOURLY") return "HOURLY";
  if (
    [
      "BASE_VISIT",
      "QUOTE",
      "FIXED",
      "UNIT",
      "SQUARE_METER",
      "LINEAR_METER"
    ].includes(mode)
  ) {
    return mode;
  }

  return "HOURLY";
}

export async function invokeFunction(functionName, body = {}) {
  const supabase = getSupabaseClient();

  if (!supabase || !functionName) {
    return null;
  }

  const correlationId =
    crypto.randomUUID?.() ||
    `mimi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (error) {
    let payload = null;
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        payload = await response.clone().json();
      }
    } catch (_) {
      payload = null;
    }

    if (payload?.error || payload?.code) {
      const code = String(payload.code || payload.error);
      const normalized = new Error(code);
      normalized.code = code;
      normalized.details = payload;
      normalized.correlationId = payload.correlation_id || correlationId;
      normalized.originalError = error;
      throw normalized;
    }

    error.correlationId = correlationId;
    throw error;
  }

  return data;
}

export async function loadClientPhoneStatus() {
  if (!hasBackend()) {
    return { ok: false, profile: null };
  }

  try {
    return await invokeFunction(appConfig.functions.clientPhoneStatus, {});
  } catch (error) {
    console.warn("[service-api] client phone status fallback", error);
    return { ok: false, profile: null, error: error?.code || error?.message || "phone_status_unavailable" };
  }
}

export async function evaluateAuthRisk(input = {}) {
  if (!hasBackend()) {
    return {
      ok: false,
      requires_otp: false,
      trusted_device: false,
      phone_verified: false,
      sms_configured: false,
      error: "backend_unavailable"
    };
  }

  try {
    return await invokeFunction(appConfig.functions.authRiskEvaluation, {
      ...getAuthDeviceContext(input.actorRole || input.actor_role || "client"),
      purpose: input.purpose || "login_new_device"
    });
  } catch (error) {
    console.warn("[service-api] auth risk fallback", error);
    return {
      ok: false,
      requires_otp: false,
      trusted_device: false,
      phone_verified: false,
      error: error?.code || error?.message || "auth_risk_unavailable"
    };
  }
}

export async function checkDeviceTrust(input = {}) {
  if (!hasBackend()) {
    return { ok: false, trusted_device: false, requires_otp: false };
  }

  try {
    return await invokeFunction(appConfig.functions.deviceTrustCheck, {
      ...getAuthDeviceContext(input.actorRole || input.actor_role || "client")
    });
  } catch (error) {
    console.warn("[service-api] device trust fallback", error);
    return {
      ok: false,
      trusted_device: false,
      requires_otp: false,
      error: error?.code || error?.message || "device_trust_unavailable"
    };
  }
}

export async function requestOtp(input = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  const actorRole = input.actorRole || input.actor_role || "client";
  try {
    const result = await invokeFunction(appConfig.functions.otpRequest, {
      ...getAuthDeviceContext(actorRole),
      purpose: input.purpose || "phone_verification",
      phone_number: input.phoneNumber || input.phone_number,
      country_code: input.countryCode || input.country_code,
      country_iso: input.countryIso || input.country_iso,
      channel: input.channel || "whatsapp"
    });
    logOtpQaEvent("request", result);
    return result;
  } catch (error) {
    logOtpQaEvent("request_error", {
      code: error?.code,
      error: error?.message,
      details: error?.details
    });
    throw error;
  }
}

export async function verifyOtp(input = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  const actorRole = input.actorRole || input.actor_role || "client";
  const attemptId = input.attemptId || input.attempt_id;
  try {
    const result = await invokeFunction(appConfig.functions.otpVerify, {
      ...getAuthDeviceContext(actorRole),
      attempt_id: attemptId,
      phone_number: input.phoneNumber || input.phone_number,
      code: input.code || input.otp
    });
    logOtpQaEvent("verify", result);
    return result;
  } catch (error) {
    logOtpQaEvent("verify_error", {
      debug_id: attemptId,
      code: error?.code,
      error: error?.message,
      details: error?.details
    });
    throw error;
  }
}

export async function startClientPhoneVerification(input = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return requestOtp({
    actorRole: "client",
    purpose: input.purpose || "phone_verification",
    phone_number: input.phoneNumber || input.phone_number,
    country_code: input.countryCode || input.country_code,
    country_iso: input.countryIso || input.country_iso,
    channel: input.channel || input.preferredChannel || input.preferred_channel || "whatsapp"
  });
}

export async function verifyClientPhoneCode(input = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return verifyOtp({
    actorRole: "client",
    attempt_id: input.attemptId || input.attempt_id,
    phone_number: input.phoneNumber || input.phone_number,
    code: input.code || input.otp
  });
}

async function fetchTable(tableName, buildQuery) {
  const supabase = getSupabaseClient();

  if (!supabase) return [];

  const query = buildQuery(supabase.from(tableName));

  const { data, error } = await query;

  if (error) throw error;

  return data ?? [];
}

function normalizeProviderLegalRequirement(doc = {}) {
  const code = doc.code || doc.document_code;

  if (!code || !doc.version) {
    return null;
  }

  return {
    code,
    document_code: code,
    actor_type: doc.actor_type || "provider",
    accept_actor_type: doc.actor_type === "all" ? "provider" : (doc.actor_type || "provider"),
    title: doc.title || code,
    version: doc.version,
    version_label: doc.version_label || doc.version,
    effective_at: doc.effective_at || null,
    hash_sha256: doc.hash_sha256 || null,
    is_mandatory: doc.is_mandatory !== false,
    accepted: Boolean(doc.accepted),
    accepted_at: doc.accepted_at || null
  };
}

function mergeProviderLegalFallbacks(documents = []) {
  const byCode = new Map(
    (documents ?? [])
      .map(normalizeProviderLegalRequirement)
      .filter(Boolean)
      .map((doc) => [doc.document_code, doc])
  );

  return PROVIDER_LEGAL_REQUIREMENT_FALLBACKS.map((fallback) => {
    const current = byCode.get(fallback.document_code);
    return current ? { ...fallback, ...current } : { ...fallback };
  });
}

async function loadProviderLegalRequirements() {
  try {
    const result = await invokeFunction("get-legal-center", {
      actor_type: "provider"
    });

    if (!result?.ok || !Array.isArray(result.documents)) {
      return mergeProviderLegalFallbacks();
    }

    return mergeProviderLegalFallbacks(
      result.documents.filter((doc) =>
        ["terms_providers", "privacy_policy"].includes(doc?.code)
      )
    );
  } catch (error) {
    console.warn("[MIMI] no se pudo cargar centro legal de prestador:", error?.message || error);
    return mergeProviderLegalFallbacks();
  }
}

function normalizeProviderDocuments(rows = []) {
  const supabase = getSupabaseClient();

  return (rows ?? []).map((item) => {
    const bucket = item.storage_bucket ?? "service-provider-documents";
    const path = item.storage_path ?? null;
    const publicUrl =
      supabase && bucket && path
        ? supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
        : null;

    return {
      ...item,
      file_url: item.file_url ?? publicUrl
    };
  });
}

function isProviderPage() {
  const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
  return page === "prestador.html" || page === "prestador";
}

function inferFileExtension(file) {
  const name = String(file?.name ?? "");
  const parts = name.split(".");
  const fromName = parts.length > 1 ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const mime = String(file?.type ?? "").toLowerCase();
  const expectedByMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  };

  if (fromName && fromName.length <= 8 && ["jpg", "jpeg", "png", "webp", "pdf"].includes(fromName)) {
    return fromName;
  }

  if (expectedByMime[mime]) return expectedByMime[mime];
  if (mime.includes("jpeg") || mime.includes("jpg")) return expectedByMime["image/jpeg"];
  if (mime.includes("png")) return expectedByMime["image/png"];
  if (mime.includes("webp")) return expectedByMime["image/webp"];
  if (mime.includes("pdf")) return expectedByMime["application/pdf"];

  return "bin";
}

function normalizeDocumentType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildProviderDocumentPath(userId, documentType, file) {
  const safeType = normalizeDocumentType(documentType) || "documento";
  const extension = inferFileExtension(file);
  const unique = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);

  return userId + "/" + safeType + "/" + Date.now() + "-" + unique + "." + extension;
}
export async function bootstrapSession() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      isAuthenticated: false,
      userId: null,
      providerId: appConfig.demoProviderUserId ?? null,
      role: null,
      userEmail: null,
      userName: null
    };
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const session = data?.session ?? null;
  const user = session?.user ?? null;

  if (!user) {
    return {
      isAuthenticated: false,
      userId: null,
      providerId: null,
      role: null,
      userEmail: null,
      userName: null
    };
  }

  let providerId = null;
  let role = "client";

  const providerSelect =
    "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at";

  const { data: providerRows, error: providerLookupError } = await supabase
    .from("svc_providers")
    .select(providerSelect)
    .eq("user_id", user.id)
    .limit(1);

  if (providerLookupError) throw providerLookupError;

  if (providerRows?.[0]?.id) {
    providerId = providerRows[0].id;
    role = "provider";
  } else if (isProviderPage()) {
    const { data: createdProvider, error: createProviderError } = await supabase
      .from("svc_providers")
      .insert({
        user_id: user.id,
        full_name:
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email ??
          null,
        email: user.email ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        status: "OFFLINE",
        approved: false,
        blocked: false
      })
      .select(providerSelect)
      .single();

    if (createProviderError) throw createProviderError;

    providerId = createdProvider?.id ?? null;
    role = providerId ? "provider" : "client";
  }

  let clientProfile = null;
  try {
    const { data: profileRows, error: profileError } = await supabase
      .from("svc_client_profiles")
      .select("id,user_id,phone_number,country_code,phone_verified,phone_verified_at")
      .eq("user_id", user.id)
      .limit(1);

    if (!profileError) {
      clientProfile = profileRows?.[0] ?? null;
    }
  } catch (error) {
    console.warn("[service-api] client profile unavailable", error);
  }

  return {
    isAuthenticated: true,
    userId: user.id,
    providerId,
    role,
    userEmail: user.email ?? null,
    userName:
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email ??
      null,
    userAvatar:
      user.user_metadata?.avatar_url ??
      user.user_metadata?.picture ??
      null,
    userPhone: clientProfile?.phone_number ?? null,
    userPhoneCountryCode: clientProfile?.country_code ?? null,
    userPhoneVerified: clientProfile?.phone_verified === true,
    clientProfileId: clientProfile?.id ?? null
  };
}

export async function loadCategories() {
  if (!hasBackend()) {
    return appConfig.categories ?? [];
  }

  return fetchTable("svc_categories", (query) =>
    query
      .select("id,code,name,description,active,aliases,search_keywords,default_pricing_model,requires_provider_quote,allowed_service_modes,requires_professional_license,requires_background_check,parent_category_id,source,discovery_status,auto_created,created_from_query,usage_count,last_matched_at")
      .eq("active", true)
      .order("name", { ascending: true })
  );
}

export async function resolveServiceIntent(query, { limit = 5 } = {}) {
  const text = String(query ?? "").trim();

  if (!hasBackend() || text.length < 3) {
    return null;
  }

  try {
    return await invokeFunction(appConfig.functions.resolveServiceIntent, {
      query: text,
      limit
    });
  } catch (error) {
    console.warn("[service-api] resolveServiceIntent fallback", error);
    return null;
  }
}

export async function registerDevice(input = null) {
  const options =
    input && typeof input === "object" && !Array.isArray(input)
      ? input
      : { pushToken: input };

  const deviceId =
    options.deviceId ||
    options.device_id ||
    localStorage.getItem("mimi_services_device_id") ||
    crypto.randomUUID();

  localStorage.setItem("mimi_services_device_id", deviceId);

  const pushToken = options.pushToken ?? options.push_token ?? null;
  const platform =
    options.platform ||
    (/Android/i.test(navigator.userAgent)
      ? "android"
      : /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "ios"
        : "web");
  const notificationsEnabled =
    options.notificationsEnabled ?? options.notifications_enabled ?? Boolean(pushToken);

  const payload = {
    role: options.role || options.actorRole || options.actor_role || "client",
    device_id: deviceId,
    device_label: options.deviceLabel || options.device_label || navigator.userAgentData?.platform || navigator.platform || "Web",
    push_token: pushToken,
    platform,
    notifications_enabled: notificationsEnabled,
    notification_permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    marketing_opt_in: Boolean(options.marketingOptIn ?? options.marketing_opt_in ?? false),
    app_version: window.MIMI_PROVIDER_BUILD || window.MIMI_CLIENT_BUILD || "web"
  };

  try {
    return await invokeFunction(appConfig.functions.authRegisterDevice || "auth-register-device", payload);
  } catch (error) {
    console.warn("[service-api] auth-register-device fallback", error);
    return invokeFunction(appConfig.functions.registerDevice || "svc-register-device", payload);
  }
}

export async function startSecurityVerification(input = {}) {
  return invokeFunction(appConfig.functions.authStartVerification || "auth-start-verification", {
    ...getAuthDeviceContext(input.actorRole || input.actor_role || input.role || "client"),
    role: input.role || input.actorRole || input.actor_role || "client",
    purpose: input.purpose || "login_new_device",
    preferred_channel: input.preferredChannel || input.preferred_channel || null
  });
}

export async function approveSecurityChallenge(input = {}) {
  const role = input.role || input.actorRole || input.actor_role || "client";
  return invokeFunction(appConfig.functions.authApproveChallenge || "auth-approve-challenge", {
    ...getAuthDeviceContext(role),
    challenge_id: input.challengeId || input.challenge_id,
    action: input.action,
    role
  });
}

export async function checkSecurityChallenge(input = {}) {
  return invokeFunction(appConfig.functions.authCheckChallenge || "auth-check-challenge", {
    challenge_id: input.challengeId || input.challenge_id
  });
}
function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export async function searchProviders(categoryId, draft = {}) {
  if (!hasBackend()) {
    return buildMockProviders(categoryId, draft);
  }

  try {
    await requireSession();
  } catch (error) {
    if (error?.code === "AUTH_REQUIRED" || error?.message === "AUTH_REQUIRED") {
      return buildMockProviders(categoryId, draft);
    }

    throw error;
  }

  const payload = {
    category_id: categoryId,
    address: draft.address ?? "",
    service_lat: draft.lat ?? null,
    service_lng: draft.lng ?? null,
    request_type: draft.requestType ?? "IMMEDIATE",
    scheduled_for: draft.scheduledFor || null,
    requested_hours: Number(draft.requestedHours ?? 2),
    sort_by: draft.sortMode || draft.sort_by || "recommended",
    radius_km: Number(draft.radiusKm || draft.radius_km || 25),
    max_results: Number(draft.maxResults || draft.max_results || 20)
  };
  const cacheKey = providerSnapshotCacheKey(payload);
  const cachedSnapshot = readProviderSnapshotCache(cacheKey);

  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  // Si la categoría es del catálogo local (id string, no UUID), la edge function la rechaza con 400.
  // Saltamos directo al fallback de tablas (que tampoco va a encontrar providers reales,
  // pero al menos no genera ruido en consola ni network).
  if (isUuidLike(categoryId)) {
    try {
      const data = await invokeFunction(appConfig.functions.searchProviders, payload);
      const providers = data?.providers ?? data?.data ?? data ?? [];

      if (Array.isArray(providers) && providers.length) {
        writeProviderSnapshotCache(cacheKey, providers);
        return providers;
      }
    } catch (error) {
      console.warn("[MIMI servicios] svc-search-providers no devolvio resultados usables; probando fallback directo.", error);
    }
  }

  const fallbackProviders = await searchProvidersFromTables(categoryId, draft);
  writeProviderSnapshotCache(cacheKey, fallbackProviders);
  return fallbackProviders;
}

function providerSnapshotCacheKey(payload = {}) {
  const lat = Number(payload.service_lat);
  const lng = Number(payload.service_lng);
  return [
    payload.category_id,
    Number.isFinite(lat) ? lat.toFixed(3) : "no-lat",
    Number.isFinite(lng) ? lng.toFixed(3) : "no-lng",
    payload.request_type || "IMMEDIATE",
    payload.scheduled_for || "now",
    payload.requested_hours || 1
  ].join(":");
}

function readProviderSnapshotCache(key) {
  const hit = providerSnapshotCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.savedAt > MIMI_NEARBY_REFRESH_INTERVAL_MS) {
    providerSnapshotCache.delete(key);
    return null;
  }
  return hit.providers;
}

function writeProviderSnapshotCache(key, providers) {
  if (!Array.isArray(providers)) return;
  providerSnapshotCache.set(key, {
    savedAt: Date.now(),
    providers
  });
}

function distanceKmBetween(latA, lngA, latB, lngB) {
  const aLat = Number(latA);
  const aLng = Number(lngA);
  const bLat = Number(latB);
  const bLng = Number(lngB);

  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;

  const toRad = (value) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const deltaLat = toRad(bLat - aLat);
  const deltaLng = toRad(bLng - aLng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLng * sinLng;

  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstByProviderId(rows = []) {
  const map = new Map();

  for (const row of rows ?? []) {
    if (row?.provider_id && !map.has(row.provider_id)) {
      map.set(row.provider_id, row);
    }
  }

  return map;
}

function firstNameFromText(value) {
  const text = String(value ?? "")
    .replace(/@.*/, "")
    .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const first = text.split(" ").find(Boolean);
  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function providerPublicName(provider, identity = null, profile = null) {
  // Prioridad: nombre cargado por el prestador → identidad verificada → OAuth → email → fallback
  return (
    firstNameFromText(profile?.first_name) ||
    firstNameFromText(identity?.full_name_detected) ||
    firstNameFromText(provider?.full_name) ||
    firstNameFromText(provider?.name) ||
    firstNameFromText(provider?.email) ||
    "Prestador"
  );
}

function referencePriceFromRows(pricing, offering) {
  const pricingModel = String(offering?.pricing_model ?? "").toUpperCase();
  const candidates = [
    pricingModel === "FIXED" ? offering?.fixed_price : null,
    pricingModel === "BASE_VISIT" ? offering?.base_visit_fee : null,
    pricingModel === "UNIT" || pricingModel === "SQUARE_METER" || pricingModel === "LINEAR_METER"
      ? offering?.unit_price
      : null,
    offering?.price_per_hour,
    pricing?.price_per_hour,
    offering?.fixed_price,
    offering?.base_visit_fee,
    offering?.unit_price
  ];

  return Number(candidates.find((value) => Number(value) > 0) ?? 0);
}

function serviceClientPricing(providerAmount, currency = "ARS") {
  const safeProviderAmount = Math.max(0, Number(providerAmount || 0));
  const providerPrice = String(currency).toUpperCase() === "ARS"
    ? Math.round(safeProviderAmount)
    : Math.round(safeProviderAmount * 100) / 100;
  const platformFee = providerPrice > 0 ? Math.round(providerPrice * 0.3) : 0;
  return {
    provider_price: providerPrice,
    platform_fee_percent: 30,
    platform_fee: platformFee,
    total_price: providerPrice + platformFee
  };
}

async function searchProvidersFromTables(categoryId, draft = {}) {
  const supabase = getSupabaseClient();

  if (!supabase || !categoryId) return [];

  const { data: categoryLinks, error: categoryError } = await supabase
    .from("svc_provider_categories")
    .select("provider_id,category_id,active,svc_categories(name,code,description)")
    .eq("category_id", categoryId)
    .eq("active", true)
    .limit(80);

  if (categoryError) {
    console.warn("[MIMI servicios] fallback providers: categorias no disponibles", categoryError);
    return [];
  }

  const providerIds = [...new Set((categoryLinks ?? []).map((row) => row.provider_id).filter(Boolean))];
  if (!providerIds.length) return [];

  // Nota: la tabla svc_provider_identity_checks no tiene columna reviewed_at en este schema.
  // Ordenamos por created_at desc como aproximación (el último check creado suele ser el más reciente).
  const identityPromise = supabase
    .from("svc_provider_identity_checks")
    .select("provider_id,full_name_detected,status,created_at")
    .in("provider_id", providerIds)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(120);

  const [providersResult, profilesResult, pricingResult, offeringsResult, identityResult] = await Promise.all([
    supabase
      .from("svc_providers")
      .select("id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_seen_at")
      .in("id", providerIds)
      .eq("approved", true)
      .eq("blocked", false)
      .in("status", ["ONLINE_IDLE", "BOOKED_UPCOMING"])
      .limit(80),
    supabase
      .from("svc_provider_profiles")
      .select("provider_id,first_name,avatar_public_url,bio,public_headline,professional_summary,city,province,pricing_mode,accepts_immediate,accepts_scheduled,max_hours_per_service,address_text")
      .in("provider_id", providerIds)
      .limit(80),
    supabase
      .from("svc_provider_pricing")
      .select("provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active")
      .in("provider_id", providerIds)
      .eq("category_id", categoryId)
      .eq("active", true)
      .limit(80),
    supabase
      .from("svc_provider_service_offerings")
      .select("id,provider_id,category_id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,minimum_charge,minimum_hours,maximum_hours,quote_required,service_mode,duration_minutes,location_policy,public_summary,active")
      .in("provider_id", providerIds)
      .eq("category_id", categoryId)
      .eq("active", true)
      .limit(80),
    identityPromise
  ]);

  for (const result of [providersResult, profilesResult, pricingResult, offeringsResult]) {
    if (result.error) {
      console.warn("[MIMI servicios] fallback providers: tabla no disponible", result.error);
      return [];
    }
  }
  if (identityResult.error) {
    console.warn("[MIMI servicios] fallback providers: identidad no disponible por RLS; se usa nombre publico del provider.", identityResult.error);
  }

  const profilesByProvider = firstByProviderId(profilesResult.data);
  const pricingByProvider = firstByProviderId(pricingResult.data);
  const offeringsByProvider = firstByProviderId(offeringsResult.data);
  const categoryByProvider = firstByProviderId(categoryLinks);
  const identityByProvider = firstByProviderId(identityResult.data || []);
  const serviceLat = Number(draft.lat ?? draft.service_lat);
  const serviceLng = Number(draft.lng ?? draft.service_lng);

  return (providersResult.data ?? [])
    .map((provider, index) => {
      const profile = profilesByProvider.get(provider.id) ?? {};
      const pricing = pricingByProvider.get(provider.id) ?? {};
      const offering = offeringsByProvider.get(provider.id) ?? {};
      const category = categoryByProvider.get(provider.id)?.svc_categories ?? {};
      const identity = identityByProvider.get(provider.id) ?? {};
      const publicName = providerPublicName(provider, identity, profile);
      const distanceKm = distanceKmBetween(serviceLat, serviceLng, provider.last_lat, provider.last_lng);
      const price = referencePriceFromRows(pricing, offering);
      const currency = offering.currency || pricing.currency || "ARS";
      const pricingBreakdown = serviceClientPricing(price, currency);

      return {
        provider_id: provider.id,
        full_name: publicName,
        name: publicName,
        public_name: publicName,
        verified_first_name: firstNameFromText(identity.full_name_detected),
        // Priorizar avatar pública (subida por el prestador) sobre OAuth/Google
        avatar_url: profile.avatar_public_url || provider.avatar_url,
        status: provider.status,
        category_id: categoryId,
        category_name: category.name,
        specialty: offering.title || category.name || profile.public_headline || "Prestador MIMI",
        provider_price: pricingBreakdown.provider_price,
        platform_fee_percent: pricingBreakdown.platform_fee_percent,
        platform_fee: pricingBreakdown.platform_fee,
        total_price: pricingBreakdown.total_price,
        currency,
        distance_km: distanceKm ?? 1 + index * 0.8,
        estimated_eta_min: distanceKm ? Math.max(5, Math.round(distanceKm * 4)) : 10 + index * 3,
        score: Math.max(70, 96 - index * 3),
        rating: provider.rating_avg ?? 5,
        rating_count: provider.rating_count ?? 0,
        accepts_immediate: profile.accepts_immediate !== false && provider.status === "ONLINE_IDLE",
        accepts_scheduled: profile.accepts_scheduled !== false,
        bio: profile.bio ?? profile.professional_summary ?? offering.description ?? null,
        city: profile.city ?? null,
        province: profile.province ?? null,
        pricing_mode: profile.pricing_mode ?? offering.pricing_model ?? pricing.pricing_model ?? null,
        offering_id: offering.id ?? null,
        service_mode: offering.service_mode ?? null,
        pricing_model: offering.pricing_model ?? null,
        unit_name: offering.unit_name ?? null,
        session_duration_minutes: offering.duration_minutes ?? null,
        // price_label = "A coordinar" SOLO si quote_required Y no hay ningún precio cargado
        price_label:
          offering.quote_required &&
          !offering.unit_price &&
          !offering.price_per_hour &&
          !offering.fixed_price &&
          !offering.base_visit_fee
            ? "A coordinar"
            : null,
        source: "table_fallback"
      };
    })
    .filter((provider) => provider.accepts_immediate !== false)
    .sort((a, b) => Number(a.distance_km ?? 999) - Number(b.distance_km ?? 999))
    .slice(0, 20);
}

export async function prepareRequestPricing({
  clientUserId,
  categoryId,
  providerId,
  draft = {}
}) {
  if (!hasBackend()) {
    return {
      eligible: true,
      provider_price: 0,
      platform_fee: 0,
      total_price: 0,
      currency: "ARS"
    };
  }

  await requireSession();

  return callRpc(appConfig.rpc.prepareRequestPricing, {
    p_client_user_id: clientUserId,
    p_category_id: categoryId,
    p_provider_id: providerId,
    p_service_lat: Number(draft.lat ?? 0),
    p_service_lng: Number(draft.lng ?? 0),
    p_request_type: draft.requestType ?? "IMMEDIATE",
    p_scheduled_for: draft.scheduledFor || null,
    p_requested_hours: Number(draft.requestedHours ?? 2)
  });
}

export async function createRequest(payload = {}) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      status: "PENDING",
      ...payload
    };
  }

  await requireSession();

  const data = await invokeFunction(appConfig.functions.createRequest, {
    category_id: payload.categoryId,
    selected_provider_id: payload.selectedProviderId,
    address_text: payload.address,
    service_lat: payload.serviceLat,
    service_lng: payload.serviceLng,
    request_type: payload.requestType,
    scheduled_for: payload.scheduledFor,
    requested_hours: payload.requestedHours,
    notes: payload.notes ?? null,
    provider_price: payload.providerPrice,
    platform_fee: payload.platformFee,
    total_price: payload.totalPrice,
    currency: payload.currency ?? "ARS",
    offering_id: payload.offeringId ?? null,
    service_mode: payload.serviceMode ?? null,
    pricing_model: payload.pricingModel ?? null,
    unit_name: payload.unitName ?? null,
    unit_quantity: payload.unitQuantity ?? null,
    session_duration_minutes: payload.sessionDurationMinutes ?? null,
    price_label: payload.priceLabel ?? null
  });

  return data?.request ?? data;
}

export async function loadActiveRequest({ userId = null, providerId = null } = {}) {
  if (!hasBackend()) return null;

  await requireSession();

  let query = getSupabaseClient()
    .from("svc_requests")
    .select(SERVICE_REQUEST_SAFE_SELECT)
    .not("status", "in", '("COMPLETED","CANCELLED","EXPIRED")')
    .order("created_at", { ascending: false })
    .limit(1);

  if (providerId) {
    query = query.or(
      `selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`
    );
  } else if (userId) {
    query = query.eq("client_user_id", userId);
  } else {
    return null;
  }

  const { data, error } = await query;

  if (error) throw error;

  return data?.[0] ?? null;
}

export async function loadClientServiceHistory(userId, { limit = 20 } = {}) {
  const supabase = getSupabaseClient();
  if (!hasBackend() || !userId || !supabase) return [];

  await requireSession();

  const { data: requests, error } = await supabase
    .from("svc_requests")
    .select(`
      id,
      category_id,
      client_user_id,
      selected_provider_id,
      accepted_provider_id,
      status,
      address_text,
      request_type,
      total_price_snapshot,
      provider_price_snapshot,
      currency,
      completed_at,
      cancelled_at,
      updated_at,
      created_at,
      svc_categories(id,name,code,description)
    `)
    .eq("client_user_id", userId)
    .in("status", ["COMPLETED", "CANCELLED", "EXPIRED"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!requests?.length) return [];

  const requestIds = requests.map((item) => item.id).filter(Boolean);
  const providerIds = [
    ...new Set(
      requests
        .map((item) => item.accepted_provider_id || item.selected_provider_id)
        .filter(Boolean)
    )
  ];

  const [reviewsResult, providersResult] = await Promise.all([
    requestIds.length
      ? supabase
          .from("svc_reviews")
          .select("request_id,rating,stars,created_at")
          .eq("client_user_id", userId)
          .in("request_id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    providerIds.length
      ? supabase
          .from("svc_providers")
          .select("id,full_name,avatar_url,rating_avg,rating_count")
          .in("id", providerIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (reviewsResult.error) throw reviewsResult.error;

  const reviewByRequest = new Map(
    (reviewsResult.data ?? []).map((item) => [item.request_id, item])
  );
  const providerById = new Map(
    (providersResult.data ?? []).map((item) => [item.id, item])
  );

  return requests.map((request) => {
    const providerId = request.accepted_provider_id || request.selected_provider_id;
    return {
      ...request,
      provider: providerById.get(providerId) ?? null,
      review: reviewByRequest.get(request.id) ?? null
    };
  });
}

export async function getServicePin(requestId) {
  if (!hasBackend() || !requestId) return null;

  await requireSession();

  const response = await invokeFunction(appConfig.functions.getServicePin, {
    request_id: requestId
  });

  return response?.ok ? response : null;
}

export async function submitServiceReview({ requestId, rating, stars } = {}) {
  const normalizedStars = Number(stars ?? rating);
  if (!hasBackend()) {
    return {
      ok: true,
      review: {
        request_id: requestId,
        rating: normalizedStars,
        stars: normalizedStars,
        created_at: new Date().toISOString()
      }
    };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.submitReview, {
    request_id: requestId,
    stars: normalizedStars
  });
}

export async function loadConversationForRequest(requestId) {
  if (!hasBackend() || !requestId) return null;

  await requireSession();

  const rows = await fetchTable("svc_conversations", (query) =>
    query
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
  );

  return rows?.[0] ?? null;
}

export async function loadMessages(conversationId) {
  if (!hasBackend() || !conversationId) return [];

  await requireSession();

  return fetchTable("svc_messages", (query) =>
    query
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100)
  );
}

export async function sendMessage({ conversationId, body }) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      body,
      created_at: new Date().toISOString()
    };
  }

  await requireSession();

  const data = await invokeFunction(appConfig.functions.sendMessage, {
    conversation_id: conversationId,
    body
  });

  return data?.message ?? data;
}

export async function loadNotifications(userId) {
  if (!hasBackend() || !userId) return [];

  await requireSession();

  return fetchTable("svc_notifications", (query) =>
    query
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
  );
}

export async function loadOffers(providerId) {
  if (!hasBackend() || !providerId) return [];

  await requireSession();
  const nowIso = new Date().toISOString();

  return fetchTable("svc_request_offers", (query) =>
    query
      .select(`
        *,
        svc_requests(
          id,
          client_user_id,
          category_id,
          selected_provider_id,
          accepted_provider_id,
          request_type,
          status,
          address_text,
          service_lat,
          service_lng,
          scheduled_for,
          requested_hours,
          notes,
          provider_price_snapshot,
          platform_fee_snapshot,
          total_price_snapshot,
          currency,
          provider_response_deadline_at,
          metadata_json,
          created_at,
          svc_categories(id,name,code,description)
        )
      `)
      .eq("provider_id", providerId)
      .in("status", ["PENDING"])
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(20)
  );
}

export async function loadOfferDetails(offerId) {
  if (!hasBackend() || !offerId) return null;

  await requireSession();

  const rows = await fetchTable("svc_request_offers", (query) =>
    query
      .select(`
        *,
        svc_requests(
          id,
          client_user_id,
          category_id,
          selected_provider_id,
          accepted_provider_id,
          request_type,
          status,
          address_text,
          service_lat,
          service_lng,
          scheduled_for,
          requested_hours,
          notes,
          provider_price_snapshot,
          platform_fee_snapshot,
          total_price_snapshot,
          currency,
          provider_response_deadline_at,
          metadata_json,
          created_at,
          svc_categories(id,name,code,description)
        )
      `)
      .eq("id", offerId)
      .limit(1)
  );

  return rows?.[0] ?? null;
}

export async function updateRequestStatus(functionName, payload = {}) {
  if (!hasBackend()) {
    return { ok: true };
  }

  await requireSession();

  return invokeFunction(functionName, payload);
}

export async function trackLocation(payload = {}) {
  if (!hasBackend()) {
    return { ok: true };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.trackLocation, {
    request_id: payload.requestId,
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy ?? null,
    heading: payload.heading ?? null,
    speed: payload.speed ?? null
  });
}

export async function updateProviderStatus(providerId, status) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId) return null;

  await requireSession();

  const { data, error } = await supabase
    .from("svc_providers")
    .update({
      status,
      last_seen_at: new Date().toISOString()
    })
    .eq("id", providerId)
    .select(
      "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at"
    )
    .single();

  if (error) throw error;

  if (
    typeof navigator !== "undefined" &&
    navigator.geolocation &&
    status !== "OFFLINE"
  ) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await supabase
            .from("svc_providers")
            .update({
              last_lat: position.coords.latitude,
              last_lng: position.coords.longitude,
              last_location: `POINT(${position.coords.longitude} ${position.coords.latitude})`,
              last_seen_at: new Date().toISOString()
            })
            .eq("id", providerId);
        } catch (locationError) {
          console.warn("[service-api] provider location update skipped", locationError);
        }
      },
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 2500,
        maximumAge: 30000
      }
    );
  }

  return data;
}

export async function touchProviderPresence(providerId) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId) return null;

  await requireSession();

  const { data, error } = await supabase
    .from("svc_providers")
    .update({
      last_seen_at: new Date().toISOString()
    })
    .eq("id", providerId)
    .select("id,status,last_seen_at")
    .single();

  if (error) throw error;

  return data;
}

export async function loadProviderWorkspace(providerId) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return {
      profile: null,
      profileDetail: null,
      pricing: [],
      offerings: [],
      availability: [],
      documents: [],
      reviews: [],
      categories: [],
      completedCount: 0
    };
  }

  await requireSession();

  const legalRequirementsPromise = loadProviderLegalRequirements();

  const [
    profileRows,
    profileDetailRows,
    pricingRows,
    offeringRows,
    availabilityRows,
    documentRows,
    reviewRows,
    categoryRows,
    completedRows
  ] = await Promise.all([
    fetchTable("svc_providers", (query) =>
      query
        .select(
          "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at"
        )
        .eq("id", providerId)
        .limit(1)
    ),

    fetchTable("svc_provider_profiles", (query) =>
      query
        .select("*")
        .eq("provider_id", providerId)
        .limit(1)
    ),

    fetchTable("svc_provider_pricing", (query) =>
      query
        .select(
          "id,provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active,svc_categories(name,code,description,default_pricing_model,allowed_service_modes,requires_professional_license,requires_background_check)"
        )
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(50)
    ),

    fetchTable("svc_provider_service_offerings", (query) =>
      query
        .select(
          "id,provider_id,category_id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,minimum_charge,minimum_hours,maximum_hours,quote_required,active,metadata,service_mode,duration_minutes,location_policy,public_summary,client_instructions,created_at,updated_at,svc_categories(name,code,description,default_pricing_model,allowed_service_modes,requires_professional_license,requires_background_check)"
        )
        .eq("provider_id", providerId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(80)
    ),

    fetchTable("svc_provider_availability", (query) =>
      query
        .select("id,provider_id,day_of_week,start_time,end_time,active")
        .eq("provider_id", providerId)
        .eq("active", true)
        .order("day_of_week", { ascending: true })
    ),

    fetchTable("svc_provider_documents", (query) =>
      query
        .select(PROVIDER_DOCUMENT_SELECT)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        // Limit 200 (no 10) — algunos prestadores tienen muchos retries de selfie
        // y con limit 10 los DNI quedaban afuera del fetch, mostrándose como
        // "Pendiente" aunque estuvieran APPROVED en DB.
        .limit(200)
    ),

    fetchTable("svc_reviews", (query) =>
      query
        .select("id,provider_id,client_user_id,rating,stars,created_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(4)
    ),

    fetchTable("svc_provider_categories", (query) =>
      query
        .select("id,provider_id,category_id,active,svc_categories(name,code,description)")
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(20)
    ),

    fetchTable("svc_requests", (query) =>
      query
        .select("id")
        .eq("selected_provider_id", providerId)
        .eq("status", "COMPLETED")
        .limit(500)
    )
  ]);

  // ¿Ya aceptó los términos de la versión actual? (para no pedirlos cada vez)
  // El cliente `supabase` ya está declarado al inicio de la función.
  const legalRequirements = await legalRequirementsPromise;
  let legalAcceptances = [];
  if (supabase && profileRows?.[0]?.user_id) {
    try {
      const { data } = await supabase
        .from("legal_acceptances")
        .select("actor_type, document_code, document_version, accepted_at")
        .eq("user_id", profileRows[0].user_id)
        .eq("accepted", true)
        .in("document_code", ["terms_providers", "privacy_policy"])
        .order("accepted_at", { ascending: false })
        .limit(20);
      legalAcceptances = data ?? [];
    } catch (e) {
      console.warn("[MIMI] no se pudieron leer aceptaciones legales:", e?.message);
    }
  }

  return {
    profile: profileRows?.[0] ?? null,
    profileDetail: profileDetailRows?.[0] ?? null,
    pricing: pricingRows ?? [],
    offerings: offeringRows ?? [],
    availability: availabilityRows ?? [],
    documents: normalizeProviderDocuments(documentRows),
    reviews: reviewRows ?? [],
    categories: categoryRows ?? [],
    completedCount: completedRows?.length ?? 0,
    legalRequirements,
    legalAcceptances
  };
}

export async function saveProviderWorkspace(providerId, payload = {}) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return { ok: true };
  }

  await requireSession();

  const profileInput = {
    provider_id: providerId,
    pricing_mode: normalizePricingMode(payload.pricingMode),
    accepts_immediate: Boolean(payload.acceptsImmediate),
    accepts_scheduled: Boolean(payload.acceptsScheduled),
    max_hours_per_service: Number(payload.maxHoursPerService ?? 8),
    onboarding_completed: true
  };

  if (typeof payload.firstName === "string") {
    profileInput.first_name = payload.firstName.trim();
  }

  if (typeof payload.bio === "string") {
    profileInput.bio = payload.bio.trim();
  }

  if (typeof payload.publicHeadline === "string") {
    profileInput.public_headline = payload.publicHeadline.trim();
  }

  if (typeof payload.professionalSummary === "string") {
    profileInput.professional_summary = payload.professionalSummary.trim();
  }

  if (typeof payload.videoIntroUrl === "string") {
    profileInput.video_intro_url = payload.videoIntroUrl.trim();
  }

  if (typeof payload.addressText === "string") {
    profileInput.address_text = payload.addressText.trim();
  }

  if (typeof payload.city === "string") {
    profileInput.city = payload.city.trim();
  }

  if (typeof payload.province === "string") {
    profileInput.province = payload.province.trim();
  }

  const { error: profileError } = await supabase
    .from("svc_provider_profiles")
    .upsert(profileInput, {
      onConflict: "provider_id"
    });

  if (profileError) throw profileError;

  const categories = Array.isArray(payload.categories)
    ? payload.categories.filter((item) => item?.categoryId)
    : [];

  const pricing = Array.isArray(payload.pricing)
    ? payload.pricing.filter((item) => item?.categoryId)
    : [];

  const offerings = Array.isArray(payload.offerings)
    ? payload.offerings.filter((item) => item?.categoryId && item?.title)
    : [];

  const availability = Array.isArray(payload.availability)
    ? payload.availability
    : [];

  await supabase
    .from("svc_provider_categories")
    .update({ active: false })
    .eq("provider_id", providerId);

  await supabase
    .from("svc_provider_pricing")
    .update({ active: false })
    .eq("provider_id", providerId);

  await supabase
    .from("svc_provider_service_offerings")
    .update({ active: false })
    .eq("provider_id", providerId);

  await supabase
    .from("svc_provider_availability")
    .update({ active: false })
    .eq("provider_id", providerId);

  if (categories.length) {
    const { error: categoriesError } = await supabase
      .from("svc_provider_categories")
      .upsert(
        categories.map((item) => ({
          provider_id: providerId,
          category_id: item.categoryId,
          active: true
        })),
        { onConflict: "provider_id,category_id" }
      );

    if (categoriesError) throw categoriesError;
  }

  if (pricing.length) {
    const { error: pricingError } = await supabase
      .from("svc_provider_pricing")
      .upsert(
        pricing.map((item) => ({
          provider_id: providerId,
          category_id: item.categoryId,
          currency: item.currency ?? "ARS",
          price_per_hour: Number(item.pricePerHour ?? 0),
          minimum_hours: Number(item.minimumHours ?? 1),
          maximum_hours: Number(
            item.maximumHours ?? payload.maxHoursPerService ?? 8
          ),
          active: true
        })),
        { onConflict: "provider_id,category_id" }
      );

    if (pricingError) throw pricingError;
  }

  if (offerings.length) {
    const { error: offeringError } = await supabase
      .from("svc_provider_service_offerings")
      .upsert(
        offerings.map((item) => {
          const row = {
            provider_id: providerId,
            category_id: item.categoryId,
            title: String(item.title ?? "").trim(),
            description: String(item.description ?? "").trim() || null,
            pricing_model: String(item.pricingModel ?? "HOURLY").trim().toUpperCase(),
            currency: item.currency ?? "ARS",
            price_per_hour: item.pricePerHour === "" || item.pricePerHour == null ? null : Number(item.pricePerHour),
            base_visit_fee: item.baseVisitFee === "" || item.baseVisitFee == null ? null : Number(item.baseVisitFee),
            fixed_price: item.fixedPrice === "" || item.fixedPrice == null ? null : Number(item.fixedPrice),
            unit_name: String(item.unitName ?? "").trim() || null,
            unit_price: item.unitPrice === "" || item.unitPrice == null ? null : Number(item.unitPrice),
            minimum_charge: Number(item.minimumCharge ?? 0),
            minimum_hours: item.minimumHours === "" || item.minimumHours == null ? null : Number(item.minimumHours),
            maximum_hours: item.maximumHours === "" || item.maximumHours == null ? null : Number(item.maximumHours),
            quote_required: Boolean(item.quoteRequired),
            service_mode: String(item.serviceMode ?? "IN_PERSON").trim().toUpperCase(),
            duration_minutes: item.durationMinutes === "" || item.durationMinutes == null ? null : Number(item.durationMinutes),
            location_policy: String(item.locationPolicy ?? "CLIENT_ADDRESS").trim().toUpperCase(),
            public_summary: String(item.publicSummary ?? "").trim() || null,
            client_instructions: String(item.clientInstructions ?? "").trim() || null,
            active: true,
            metadata: item.metadata ?? {}
          };

          if (item.id) row.id = item.id;

          return row;
        }),
        { onConflict: "id" }
      );

    if (offeringError) throw offeringError;
  }

  if (availability.length) {
    const { error: availabilityError } = await supabase
      .from("svc_provider_availability")
      .upsert(
        availability
          .filter((item) => item?.active && item?.startTime && item?.endTime)
          .map((item) => ({
            provider_id: providerId,
            day_of_week: Number(item.dayOfWeek),
            start_time: item.startTime,
            end_time: item.endTime,
            active: true
          })),
        { onConflict: "provider_id,day_of_week,start_time,end_time" }
      );

    if (availabilityError) throw availabilityError;
  }

  return loadProviderWorkspace(providerId);
}


export async function uploadProviderDocument({ providerId, documentType, file }) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId || !file) {
    return null;
  }

const session = await requireSession();
const userId = session?.user?.id;

if (!userId) {
  throw new Error("No hay usuario autenticado para subir documentos.");
}

const safeDocumentType = normalizeDocumentType(documentType);
  if (!safeDocumentType) {
    throw new Error("Seleccioná un tipo de documento válido.");
  }

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("El archivo supera los 8 MB. Subí una foto o PDF más liviano.");
  }

  const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ]);

  if (file.type && !allowedTypes.has(file.type)) {
    throw new Error("Formato no permitido. Usá JPG, PNG, WEBP o PDF.");
  }

  const inferredExtension = inferFileExtension(file);
  const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
  if (!allowedExtensions.has(inferredExtension)) {
    throw new Error("La extension del archivo no es valida. Usa JPG, PNG, WEBP o PDF.");
  }

  if (["dni_front", "dni_back", "selfie"].includes(safeDocumentType) && file.type === "application/pdf") {
    throw new Error("Para identidad necesitamos una foto clara, no PDF.");
  }

  const storagePath = buildProviderDocumentPath(userId, safeDocumentType, file);

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_PROVIDER_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) {
    const message = String(uploadError.message ?? uploadError.error ?? uploadError);
    if (/bucket/i.test(message) || /not found/i.test(message)) {
      throw new Error(
        "No existe o no está habilitado el bucket service-provider-documents para MIMI Servicios."
      );
    }
    throw uploadError;
  }

  const { data, error } = await supabase
    .from("svc_provider_documents")
    .insert({
      provider_id: providerId,
      document_type: safeDocumentType,
      storage_bucket: SERVICE_PROVIDER_DOCUMENTS_BUCKET,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size_bytes: file.size || null,
      review_status: "PENDING",
      metadata_json: {
        original_name: file.name || null,
        uploaded_from: "prestador.html",
        uploaded_at: new Date().toISOString()
      }
    })
    .select(PROVIDER_DOCUMENT_SELECT)
    .single();

if (error) throw error;

const normalized = normalizeProviderDocuments([data])[0] ?? data;

/*
if (safeDocumentType === "selfie") {
  try {
    const verifyResult = await invokeFunction("svc-verify-provider-identity", {
      provider_id: providerId,
      document_type: safeDocumentType,
      document_id: normalized?.id ?? null
    });

    console.log("[MIMI Servicios][KYC] Resultado verificación IA:", verifyResult);
  } catch (verifyError) {
    console.error("[MIMI Servicios][KYC] Falló svc-verify-provider-identity:", {
      message: verifyError?.message,
      name: verifyError?.name,
      context: verifyError?.context,
      details: verifyError?.details,
      error: verifyError
    });

    throw new Error(
      verifyError?.message ||
      "No pudimos ejecutar la verificación IA del documento."
    );
  }
}

*/
return normalized;
}

export async function uploadProviderAvatar({ providerId, file }) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId || !file) {
    return null;
  }

  const session = await requireSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("No hay usuario autenticado para subir la foto.");
  }

  const maxBytes = 4 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("La foto supera los 4 MB. Subi una imagen mas liviana.");
  }

  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (file.type && !allowedTypes.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
  }

  const extensionFromName = String(file.name || "").split(".").pop()?.toLowerCase();
  const extensionFromType = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const extension = /^[a-z0-9]{2,5}$/.test(extensionFromName || "") ? extensionFromName : extensionFromType;
  const randomId = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
  const storagePath = `${userId}/profile/avatar-${Date.now()}-${randomId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_PROVIDER_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || "image/jpeg"
    });

  if (uploadError) throw uploadError;

  const avatarReference = `storage://${SERVICE_PROVIDER_DOCUMENTS_BUCKET}/${storagePath}`;
  const { data, error } = await supabase
    .from("svc_providers")
    .update({ avatar_url: avatarReference })
    .eq("id", providerId)
    .select("id,avatar_url")
    .single();

  if (error) throw error;

  return data;
}

export async function loadClientRequestInsights(requestId, providerId = null) {
  if (!hasBackend() || !requestId) {
    return {
      paymentIntent: null,
      escrowHold: null,
      candidates: [],
      offers: [],
      providerProfile: null,
      providerPricing: [],
      providerReviews: [],
      providerCategories: []
    };
  }

  await requireSession();

  const [
    paymentIntentRows,
    escrowHoldRows,
    candidateRows,
    offerRows,
    providerProfileRows,
    providerPricingRows,
    providerReviewRows,
    providerCategoryRows
  ] = await Promise.all([
    fetchTable("payments", (query) =>
      query
        .select("*")
        .eq("context_type", "SERVICE_REQUEST")
        .eq("context_id", requestId)
        .order("created_at", { ascending: false })
        .limit(1)
    ).catch(() =>
      fetchTable("svc_payment_intents", (query) =>
        query.select("*").eq("request_id", requestId).limit(1)
      )
    ),

    fetchTable("svc_escrow_holds", (query) =>
      query.select("*").eq("request_id", requestId).limit(1)
    ),

    fetchTable("svc_request_candidates", (query) =>
      query
        .select("*")
        .eq("request_id", requestId)
        .order("rank_position", { ascending: true })
        .limit(10)
    ),

    fetchTable("svc_request_offers", (query) =>
      query
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(10)
    ),

    providerId
      ? fetchTable("svc_provider_profiles", (query) =>
          query.select("*").eq("provider_id", providerId).limit(1)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_provider_pricing", (query) =>
          query
            .select("*")
            .eq("provider_id", providerId)
            .eq("active", true)
            .limit(20)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_reviews", (query) =>
          query
            .select("*")
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false })
            .limit(5)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_provider_categories", (query) =>
          query
            .select("id,provider_id,category_id,active,svc_categories(name,code,description)")
            .eq("provider_id", providerId)
            .eq("active", true)
            .limit(10)
        )
      : Promise.resolve([])
  ]);

  return {
    paymentIntent: paymentIntentRows?.[0] ?? null,
    escrowHold: escrowHoldRows?.[0] ?? null,
    candidates: candidateRows ?? [],
    offers: offerRows ?? [],
    providerProfile: providerProfileRows?.[0] ?? null,
    providerPricing: providerPricingRows ?? [],
    providerReviews: providerReviewRows ?? [],
    providerCategories: providerCategoryRows ?? []
  };
}
export async function signOut() {
  try {
    await signOutFromSupabase();
  } finally {
    forceCleanSession();
    clearAuthRedirectIntent();
  }
  return true;
}
export async function getProviderDashboard(providerId) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return {
      earnings: 0,
      completed: 0,
      active: null,
      history: []
    };
  }

  await requireSession();

  // 🔥 servicios completados
  const { data: completedRows, error: completedError } = await supabase
    .from("svc_requests")
    .select("id,total_price_snapshot,created_at,address_text,status")
    .eq("selected_provider_id", providerId)
    .eq("status", "COMPLETED");

  if (completedError) throw completedError;

  // 🔥 servicio activo
  const { data: activeRows } = await supabase
    .from("svc_requests")
    .select("*")
    .eq("selected_provider_id", providerId)
    .not("status", "in", '("COMPLETED","CANCELLED")')
    .limit(1);

const earnings = (completedRows ?? []).reduce(
  (acc, item) => acc + Number(item.total_price_snapshot ?? 0),
  0
);
  return {
    earnings,
    completed: completedRows?.length ?? 0,
    active: activeRows?.[0] ?? null,
    history: completedRows ?? []
  };
}
