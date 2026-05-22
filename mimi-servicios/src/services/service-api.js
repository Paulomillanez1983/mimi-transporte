import { appConfig } from "../config.js";
import {
  callRpc,
  clearAuthRedirectIntent,
  clearProviderRegistrationIntent,
  forceCleanSession,
  getSupabaseClient,
  hasFreshProviderRegistrationIntent,
  recoverSessionSafely,
  signOut as signOutFromSupabase
} from "./supabase.js?v=2026.05.17.2";
import { buildMockProviders } from "./mock-data.js";
import {
  MIMI_NEARBY_REFRESH_INTERVAL_MS,
  MIMI_REMOTE_BOOTSTRAP_ENABLED
} from "./runtime-config.js";

const SERVICE_PROVIDER_DOCUMENTS_BUCKET = "service-provider-documents";
const PROVIDER_DOCUMENT_SELECT = "id,provider_id,document_type,storage_bucket,storage_path,mime_type,file_size_bytes,review_status,review_notes,reviewed_at,metadata_json,created_at,updated_at";
const NOTIFICATION_SAFE_SELECT = "id,user_id,type,notification_type,title,body,message,icon,data_json,read_at,received_at,delivered_at,delivery_status,created_at,updated_at";
const CONVERSATION_SAFE_SELECT = "id,request_id,client_user_id,provider_user_id,status,metadata_json,last_message_at,created_at,updated_at";
const MESSAGE_SAFE_SELECT = "id,conversation_id,sender_user_id,sender_role,message_type,body,read_at,metadata_json,delivery_status,attachments_json,created_at";
const PROVIDER_WALLET_SAFE_SELECT = "id,provider_id,currency,available_balance,pending_balance,negative_balance,cash_debt_balance,risk_hold_balance,payout_hold_balance,lifetime_earnings,wallet_status,risk_level,cash_enabled,recovery_enabled,last_activity_at,last_recomputed_at,metadata,updated_at";
const PROVIDER_PROFILE_SAFE_SELECT = "id,provider_id,first_name,bio,address_text,city,province,country_code,pricing_mode,accepts_immediate,accepts_scheduled,max_hours_per_service,onboarding_completed,years_experience,kyc_status,review_status,ai_score,ai_score_label,review_required,risk_flags,reviewed_at,service_modes,public_headline,professional_summary,video_intro_url,phone_number,phone_country_code,phone_verified,phone_verified_at,trusted_device,trusted_until,metadata_json,avatar_public_url,created_at,updated_at";
const REQUEST_OFFER_SAFE_SELECT = "id,request_id,provider_id,status,sent_at,expires_at,responded_at,created_at,updated_at";
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
const PROVIDER_ACTIVE_REQUEST_STATUSES = [
  "ACCEPTED",
  "SCHEDULED",
  "PROVIDER_EN_ROUTE",
  "PROVIDER_ARRIVED",
  "IN_PROGRESS"
];
const PROVIDER_GUIDED_SERVICE_FLAG = "MIMI_PROVIDER_GUIDED_SERVICE_ENABLED";
const PROVIDER_SERVICE_ADDONS_FLAG = "MIMI_PROVIDER_SERVICE_ADDONS_ENABLED";
const PROVIDER_WORKSPACE_READ_TIMEOUT_MS = 6500;
const PROVIDER_LEGAL_CENTER_TIMEOUT_MS = 2200;
const PROVIDER_STORAGE_SIGNED_URL_TIMEOUT_MS = 1200;
const ACTIVE_REQUEST_READ_TIMEOUT_MS = 4500;
const CLIENT_PROFILE_BOOT_TIMEOUT_MS = 2500;

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") return false;

  const host = String(window.location?.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function readRuntimeBooleanFlag(key) {
  if (typeof window === "undefined") return null;

  const candidates = [
    window.MIMI_SERVICES_ENV?.[key],
    window.MIMI_SERVICES_CONFIG?.[key],
    window[key]
  ];

  for (const value of candidates) {
    if (value === true || value === "true" || value === "1" || value === 1) return true;
    if (value === false || value === "false" || value === "0" || value === 0) return false;
  }

  return null;
}

function readLocalGuidedServiceOverride() {
  if (!isLocalDevelopmentHost()) return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("provider_guided_service_beta");

    if (flag === "1") {
      localStorage.setItem("mimi_provider_guided_service_beta", "1");
      return true;
    }

    if (flag === "0") {
      localStorage.removeItem("mimi_provider_guided_service_beta");
      return false;
    }

    const stored = localStorage.getItem("mimi_provider_guided_service_beta");
    if (stored === "1") return true;
    if (stored === "0") return false;
    return null;
  } catch (_) {
    return null;
  }
}

function readLocalProviderServiceAddonsOverride() {
  if (!isLocalDevelopmentHost()) return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("provider_service_addons_beta");

    if (flag === "1") {
      localStorage.setItem("mimi_provider_service_addons_beta", "1");
      return true;
    }

    if (flag === "0") {
      localStorage.removeItem("mimi_provider_service_addons_beta");
      return false;
    }

    const stored = localStorage.getItem("mimi_provider_service_addons_beta");
    if (stored === "1") return true;
    if (stored === "0") return false;
    return null;
  } catch (_) {
    return null;
  }
}

function normalizeFeatureFlagProviderId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function featureFlagMetadata(flag = {}) {
  const metadata = flag?.metadata_json ?? flag?.metadata ?? {};

  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata;
  }

  if (typeof metadata === "string" && metadata.trim()) {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  return {};
}

function providerIdsFromFlagMetadata(metadata = {}) {
  const official = metadata.enabled_provider_ids;
  const compatibility = metadata.allowed_provider_ids ?? metadata.providers;
  const values = Array.isArray(official) ? official : Array.isArray(compatibility) ? compatibility : [];

  return values
    .map((item) => normalizeFeatureFlagProviderId(item?.id ?? item?.provider_id ?? item))
    .filter(Boolean);
}

export function providerServiceAddonsFlagAllowsProvider(flag = null, providerId = null) {
  if (!flag || flag.enabled !== true) return false;

  const scope = String(flag.scope ?? "").trim().toLowerCase();
  if (scope !== "provider") return false;

  const normalizedProviderId = normalizeFeatureFlagProviderId(providerId);
  if (!normalizedProviderId) return false;

  const allowedProviderIds = providerIdsFromFlagMetadata(featureFlagMetadata(flag));
  return allowedProviderIds.includes(normalizedProviderId);
}

function emptyProviderGuidedServiceCatalog(extra = {}) {
  return {
    enabled: false,
    flagKey: PROVIDER_GUIDED_SERVICE_FLAG,
    templates: [],
    loadedAt: new Date().toISOString(),
    ...extra
  };
}

function emptyProviderServiceAddonsConfig(extra = {}) {
  return {
    enabled: false,
    flagKey: PROVIDER_SERVICE_ADDONS_FLAG,
    source: "default_false",
    flag: null,
    ...extra
  };
}

function isExpiredProviderResponseRequest(request = {}) {
  const status = String(request?.status || "").toUpperCase();
  if (!["SEARCHING", "PENDING_PROVIDER_RESPONSE"].includes(status)) return false;
  const deadlineMs = Date.parse(request?.provider_response_deadline_at || "");
  return Number.isFinite(deadlineMs) && deadlineMs <= Date.now();
}
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

function withTimeout(promise, ms, label = "operation_timeout") {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function timeoutLabel(prefix, label) {
  const safe = String(label || "resource")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}_${safe || "RESOURCE"}_TIMEOUT`;
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

function categoryLookupKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function mergeLocalCategoriesWithRemoteIds(localCategories = [], remoteCategories = []) {
  const remoteByCode = new Map();
  const remoteByName = new Map();

  for (const category of remoteCategories ?? []) {
    if (!category?.id) continue;

    const codeKey = categoryLookupKey(category.code);
    const nameKey = categoryLookupKey(category.name);

    if (codeKey && !remoteByCode.has(codeKey)) {
      remoteByCode.set(codeKey, category);
    }

    if (nameKey && !remoteByName.has(nameKey)) {
      remoteByName.set(nameKey, category);
    }
  }

  return (localCategories ?? []).map((category) => {
    const remote =
      remoteByCode.get(categoryLookupKey(category.code)) ||
      remoteByName.get(categoryLookupKey(category.name));

    if (!remote?.id) return category;

    return {
      ...category,
      id: remote.id,
      local_id: category.id,
      code: remote.code ?? category.code,
      default_pricing_model: remote.default_pricing_model ?? category.default_pricing_model,
      requires_provider_quote: remote.requires_provider_quote ?? category.requires_provider_quote,
      allowed_service_modes: remote.allowed_service_modes ?? category.allowed_service_modes,
      requires_professional_license: remote.requires_professional_license ?? category.requires_professional_license,
      requires_background_check: remote.requires_background_check ?? category.requires_background_check,
      source: remote.source ?? category.source ?? "supabase"
    };
  });
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
    const result = await withTimeout(
      invokeFunction("get-legal-center", {
        actor_type: "provider"
      }),
      PROVIDER_LEGAL_CENTER_TIMEOUT_MS,
      "PROVIDER_LEGAL_CENTER_TIMEOUT"
    );

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

function firstImageUrlCandidate(...values) {
  const pending = [...values];
  while (pending.length) {
    const value = pending.shift();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }

    const raw = String(value ?? "").trim();
    if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  }

  return null;
}

async function resolveStorageObjectUrl(bucket, path) {
  const supabase = getSupabaseClient();
  if (!supabase?.storage || !bucket || !path) return null;

  try {
    const { data, error } = await withTimeout(
      supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60),
      PROVIDER_STORAGE_SIGNED_URL_TIMEOUT_MS,
      "PROVIDER_DOCUMENT_SIGNED_URL_TIMEOUT"
    );
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (error) {
    console.warn("[service-api] provider document signed url unavailable", error?.message || error);
  }

  try {
    return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
  } catch {
    return null;
  }
}

async function normalizeProviderDocuments(rows = []) {
  const supabase = getSupabaseClient();
  const normalized = await Promise.all((rows ?? []).map(async (item) => {
    const metadata = item?.metadata_json && typeof item.metadata_json === "object"
      ? item.metadata_json
      : {};
    const bucket = item.storage_bucket ?? "service-provider-documents";
    const path = item.storage_path ?? null;
    const metadataUrl = firstImageUrlCandidate(
      metadata.avatar_public_url,
      metadata.profile_photo_url,
      metadata.public_url,
      metadata.file_url,
      metadata.signed_url,
      metadata.preview_url,
      metadata.image_url
    );
    const signedOrPublicUrl = metadataUrl || await resolveStorageObjectUrl(bucket, path);
    const publicUrl =
      supabase && bucket && path
        ? supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
        : null;

    return {
      ...item,
      public_url: item.public_url ?? metadataUrl ?? publicUrl,
      signed_url: item.signed_url ?? signedOrPublicUrl,
      file_url: item.file_url ?? signedOrPublicUrl ?? metadataUrl ?? publicUrl
    };
  }));

  return normalized;
}

function parseStorageReference(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return null;
  const match = raw.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return {
    bucket: match[1],
    path: match[2]
  };
}

async function resolveProviderAvatarUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw || null;

  const parsed = parseStorageReference(raw);
  const supabase = getSupabaseClient();
  if (!parsed || !supabase?.storage) return raw;

  try {
    const { data, error } = await withTimeout(
      supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 60 * 60),
      PROVIDER_STORAGE_SIGNED_URL_TIMEOUT_MS,
      "PROVIDER_AVATAR_SIGNED_URL_TIMEOUT"
    );
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch (error) {
    console.warn("[service-api] provider avatar signed url unavailable", error?.message || error);
  }

  try {
    return supabase.storage.from(parsed.bucket).getPublicUrl(parsed.path).data?.publicUrl || raw;
  } catch {
    return raw;
  }
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

  let sessionResult = null;

  try {
    sessionResult = await withTimeout(
      supabase.auth.getSession(),
      4500,
      "AUTH_SESSION_TIMEOUT"
    );
  } catch (error) {
    console.warn("[service-api] auth session unavailable; showing login gate", error?.message || error);
    forceCleanSession();
    return {
      isAuthenticated: false,
      userId: null,
      providerId: null,
      role: null,
      userEmail: null,
      userName: null
    };
  }

  const { data, error } = sessionResult;

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

  const { data: providerRows, error: providerLookupError } = await withTimeout(
    supabase
      .from("svc_providers")
      .select(providerSelect)
      .eq("user_id", user.id)
      .limit(1),
    8000,
    "PROVIDER_LOOKUP_TIMEOUT"
  );

  if (providerLookupError) throw providerLookupError;

  if (providerRows?.[0]?.id) {
    providerId = providerRows[0].id;
    role = "provider";
  } else if (isProviderPage() && hasFreshProviderRegistrationIntent()) {
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
    if (providerId) clearProviderRegistrationIntent();
  }

  let clientProfile = null;
  try {
    const { data: profileRows, error: profileError } = await withTimeout(
      supabase
        .from("svc_client_profiles")
        .select("id,user_id,phone_number,country_code,phone_verified,phone_verified_at")
        .eq("user_id", user.id)
        .limit(1),
      CLIENT_PROFILE_BOOT_TIMEOUT_MS,
      "CLIENT_PROFILE_BOOT_TIMEOUT"
    );

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

  try {
    const remoteCategories = await withTimeout(
      fetchTable("svc_categories", (query) =>
        query
          .select("id,code,name,description,active,aliases,search_keywords,default_pricing_model,requires_provider_quote,allowed_service_modes,requires_professional_license,requires_background_check,parent_category_id,source,discovery_status,auto_created,created_from_query,usage_count,last_matched_at")
          .eq("active", true)
          .order("name", { ascending: true })
      ),
      3500,
      "CATEGORIES_TIMEOUT"
    );

    if (!MIMI_REMOTE_BOOTSTRAP_ENABLED) {
      return mergeLocalCategoriesWithRemoteIds(appConfig.categories ?? [], remoteCategories);
    }

    return remoteCategories;
  } catch (error) {
    console.warn("[service-api] categories fallback", error?.message || error);
    return appConfig.categories ?? [];
  }
}

export async function loadProviderGuidedServiceCatalog({ limit = 80 } = {}) {
  const runtimeFlag = readRuntimeBooleanFlag(PROVIDER_GUIDED_SERVICE_FLAG);
  const localOverride = readLocalGuidedServiceOverride();
  let flagRows = [];

  if (!hasBackend()) {
    const enabled = localOverride ?? runtimeFlag ?? false;
    return emptyProviderGuidedServiceCatalog({
      enabled,
      source: enabled ? "local_runtime_without_backend" : "disabled_without_backend"
    });
  }

  try {
    flagRows = await withTimeout(
      fetchTable("svc_feature_flags", (query) =>
        query
          .select("key,enabled,scope,description,metadata_json,updated_at")
          .eq("key", PROVIDER_GUIDED_SERVICE_FLAG)
          .limit(1)
      ),
      2500,
      "GUIDED_SERVICE_FLAG_TIMEOUT"
    );
  } catch (error) {
    console.warn("[service-api] provider guided service flag fallback", error?.message || error);
  }

  const remoteFlag = flagRows.find((row) => row?.key === PROVIDER_GUIDED_SERVICE_FLAG);
  const enabled = localOverride ?? runtimeFlag ?? remoteFlag?.enabled === true;

  if (!enabled) {
    return emptyProviderGuidedServiceCatalog({
      enabled: false,
      source: remoteFlag ? "svc_feature_flags" : "default_false",
      flag: remoteFlag ?? null
    });
  }

  try {
    const templateLimit = Math.max(1, Math.min(Number(limit) || 80, 120));
    const templates = await withTimeout(
      fetchTable("svc_service_templates", (query) =>
        query
          .select("id,category_id,slug,name,description,macro_vertical,service_family,default_pricing_model,default_quote_required,regulated_level,sensitive_level,requires_admin_approval,requires_credentials,default_question_strategy,is_active,created_at,updated_at")
          .eq("is_active", true)
          .order("macro_vertical", { ascending: true })
          .order("service_family", { ascending: true })
          .order("name", { ascending: true })
          .limit(templateLimit)
      ),
      4500,
      "GUIDED_SERVICE_TEMPLATES_TIMEOUT"
    );

    const templateIds = templates.map((item) => item.id).filter(Boolean);
    const categoryIds = [...new Set(templates.map((item) => item?.category_id).filter(Boolean))];
    let categoryById = new Map();

    if (categoryIds.length) {
      try {
        const categoryRows = await fetchTable("svc_categories", (query) =>
          query
            .select("id,code,name,description,default_pricing_model,requires_provider_quote,requires_professional_license,requires_background_check")
            .in("id", categoryIds)
        );
        categoryById = new Map((categoryRows ?? []).map((category) => [category.id, category]));
      } catch (error) {
        console.warn("[service-api] provider guided service categories fallback", error?.message || error);
      }
    }

    if (!templateIds.length) {
      return {
        enabled: true,
        flagKey: PROVIDER_GUIDED_SERVICE_FLAG,
        source: localOverride === true ? "local_override" : runtimeFlag === true ? "runtime" : "svc_feature_flags",
        flag: remoteFlag ?? null,
        templates: [],
        loadedAt: new Date().toISOString()
      };
    }

    const versions = await fetchTable("svc_service_template_versions", (query) =>
      query
        .select("id,service_template_id,version_number,status,title,description,pricing_model,quote_required_default,question_strategy_default,metadata_json,published_at,created_at,updated_at")
        .in("service_template_id", templateIds)
        .eq("status", "active")
        .order("version_number", { ascending: false })
    );
    const activeVersionByTemplate = new Map();

    for (const version of versions) {
      if (!version?.service_template_id || activeVersionByTemplate.has(version.service_template_id)) continue;
      activeVersionByTemplate.set(version.service_template_id, version);
    }

    const versionIds = versions.map((item) => item.id).filter(Boolean);
    const [attributes, questions, pricingRules, requirementsByTemplate, requirementsByVersion] = await Promise.all([
      versionIds.length
        ? fetchTable("svc_service_attributes", (query) =>
            query
              .select("id,template_version_id,code,label,description,data_type,unit,required,affects_price,affects_matching,can_be_extracted_from_text,ask_only_if_missing,enum_options,validation_json,sort_order,created_at")
              .in("template_version_id", versionIds)
              .order("sort_order", { ascending: true })
          )
        : Promise.resolve([]),
      versionIds.length
        ? fetchTable("svc_service_questions", (query) =>
            query
              .select("id,template_version_id,attribute_id,question_text,helper_text,answer_type,required,question_strategy,show_if_json,risk_check_json,sort_order,created_at")
              .in("template_version_id", versionIds)
              .order("sort_order", { ascending: true })
          )
        : Promise.resolve([]),
      versionIds.length
        ? fetchTable("svc_pricing_rules", (query) =>
            query
              .select("id,template_version_id,pricing_model,rule_type,condition_json,formula_json,min_price,max_price,currency,quote_if_missing_attributes,quote_if_low_confidence,allow_search_without_full_price,is_active,created_at,updated_at")
              .in("template_version_id", versionIds)
              .eq("is_active", true)
          )
        : Promise.resolve([]),
      fetchTable("svc_regulated_service_requirements", (query) =>
        query
          .select("id,service_template_id,template_version_id,requirement_type,requirement_label,required_document_type,jurisdiction_required,admin_approval_required,emergency_disclaimer_required,blocks_auto_pricing,blocks_results_without_disclaimer,metadata_json,created_at")
          .in("service_template_id", templateIds)
      ),
      versionIds.length
        ? fetchTable("svc_regulated_service_requirements", (query) =>
            query
              .select("id,service_template_id,template_version_id,requirement_type,requirement_label,required_document_type,jurisdiction_required,admin_approval_required,emergency_disclaimer_required,blocks_auto_pricing,blocks_results_without_disclaimer,metadata_json,created_at")
              .in("template_version_id", versionIds)
          )
        : Promise.resolve([])
    ]);

    const groupBy = (items, key) => {
      const grouped = new Map();
      for (const item of items ?? []) {
        const value = item?.[key];
        if (!value) continue;
        if (!grouped.has(value)) grouped.set(value, []);
        grouped.get(value).push(item);
      }
      return grouped;
    };
    const attributesByVersion = groupBy(attributes, "template_version_id");
    const questionsByVersion = groupBy(questions, "template_version_id");
    const pricingByVersion = groupBy(pricingRules, "template_version_id");
    const requirementsByTemplateId = groupBy(requirementsByTemplate, "service_template_id");
    const requirementsByVersionId = groupBy(requirementsByVersion, "template_version_id");

    return {
      enabled: true,
      flagKey: PROVIDER_GUIDED_SERVICE_FLAG,
      source: localOverride === true ? "local_override" : runtimeFlag === true ? "runtime" : "svc_feature_flags",
      flag: remoteFlag ?? null,
      templates: templates.map((template) => {
        const activeVersion = activeVersionByTemplate.get(template.id) ?? null;
        const activeVersionId = activeVersion?.id ?? null;
        const regulatedRequirements = [
          ...(requirementsByTemplateId.get(template.id) ?? []),
          ...(activeVersionId ? requirementsByVersionId.get(activeVersionId) ?? [] : [])
        ];

        return {
          ...template,
          category: categoryById.get(template.category_id) ?? null,
          active_version: activeVersion,
          attributes: activeVersionId ? attributesByVersion.get(activeVersionId) ?? [] : [],
          questions: activeVersionId ? questionsByVersion.get(activeVersionId) ?? [] : [],
          pricing_rules: activeVersionId ? pricingByVersion.get(activeVersionId) ?? [] : [],
          regulated_requirements: regulatedRequirements
        };
      }),
      loadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("[service-api] provider guided service catalog fallback", error?.message || error);
    return emptyProviderGuidedServiceCatalog({
      enabled,
      source: "catalog_unavailable",
      flag: remoteFlag ?? null,
      error: error?.message || String(error)
    });
  }
}

export async function loadProviderServiceAddonsConfig({ providerId = null } = {}) {
  const runtimeFlag = readRuntimeBooleanFlag(PROVIDER_SERVICE_ADDONS_FLAG);
  const localOverride = readLocalProviderServiceAddonsOverride();
  let flagRows = [];

  if (!hasBackend()) {
    const localRuntimeEnabled = isLocalDevelopmentHost() && runtimeFlag === true;
    const enabled = localOverride ?? localRuntimeEnabled;
    return emptyProviderServiceAddonsConfig({
      enabled,
      source: enabled ? "local_runtime_without_backend" : "disabled_without_backend"
    });
  }

  try {
    flagRows = await withTimeout(
      fetchTable("svc_feature_flags", (query) =>
        query
          .select("key,enabled,scope,description,metadata_json,updated_at")
          .eq("key", PROVIDER_SERVICE_ADDONS_FLAG)
          .limit(1)
      ),
      2500,
      "PROVIDER_SERVICE_ADDONS_FLAG_TIMEOUT"
    );
  } catch (error) {
    console.warn("[service-api] provider service addons flag fallback", error?.message || error);
  }

  const remoteFlag = flagRows.find((row) => row?.key === PROVIDER_SERVICE_ADDONS_FLAG);
  const localRuntimeEnabled = isLocalDevelopmentHost() && runtimeFlag === true;
  const providerAllowed = providerServiceAddonsFlagAllowsProvider(remoteFlag, providerId);
  const enabled = localOverride ?? (localRuntimeEnabled || providerAllowed);
  const source = localOverride === true
    ? "local_override"
    : localOverride === false
      ? "local_override_disabled"
      : localRuntimeEnabled
        ? "local_runtime"
        : providerAllowed
          ? "provider_scope_allowlist"
          : remoteFlag
            ? "provider_scope_denied"
            : "default_false";

  return emptyProviderServiceAddonsConfig({
    enabled,
    source,
    flag: remoteFlag ?? null,
    providerId: providerId ?? null,
    loadedAt: new Date().toISOString()
  });
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
      throw error;
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
        // Etiqueta visible solo si quote_required y no hay ningún precio cargado.
        price_label:
          offering.quote_required &&
          !offering.unit_price &&
          !offering.price_per_hour &&
          !offering.fixed_price &&
          !offering.base_visit_fee
            ? "Pendiente de cotización"
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
    location_accuracy_m: payload.locationAccuracyM ?? null,
    location_source: payload.locationSource ?? null,
    geocode_source: payload.geocodeSource ?? null,
    location_quality: payload.locationQuality ?? null,
    location_confirmed_at: payload.locationConfirmedAt ?? null,
    location_needs_review: Boolean(payload.locationNeedsReview),
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
    ).in("status", PROVIDER_ACTIVE_REQUEST_STATUSES);
  } else if (userId) {
    query = query.eq("client_user_id", userId);
  } else {
    return null;
  }

  const { data, error } = await withTimeout(
    query,
    ACTIVE_REQUEST_READ_TIMEOUT_MS,
    "ACTIVE_REQUEST_TIMEOUT"
  );

  if (error) throw error;

  const request = data?.[0] ?? null;
  if (isExpiredProviderResponseRequest(request)) return null;

  return request;
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
      .select(CONVERSATION_SAFE_SELECT)
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
      .select(MESSAGE_SAFE_SELECT)
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

export async function loadNotifications(userId, options = {}) {
  if (!hasBackend() || !userId) return [];

  await requireSession();

  const limit = Math.min(
    Math.max(Number(options.limit ?? 40) || 40, 10),
    80
  );

  return fetchTable("svc_notifications", (query) =>
    query
      .select(NOTIFICATION_SAFE_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
}

export async function markRemoteNotificationsRead({ notificationIds = [], markAll = false } = {}) {
  const ids = Array.isArray(notificationIds)
    ? notificationIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 100)
    : [];

  if (!markAll && ids.length === 0) {
    return { ok: true, updated_count: 0 };
  }

  if (!hasBackend()) {
    return { ok: true, updated_count: ids.length };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.markNotificationRead || "mark-notification-read", {
    notification_ids: ids,
    mark_all: Boolean(markAll),
    mark_read: true,
    mark_delivered: true
  });
}

export async function markRemoteNotificationsDelivered({ notificationIds = [], markAll = false } = {}) {
  const ids = Array.isArray(notificationIds)
    ? notificationIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 100)
    : [];

  if (!markAll && ids.length === 0) {
    return { ok: true, updated_count: 0 };
  }

  if (!hasBackend()) {
    return { ok: true, updated_count: ids.length };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.markNotificationRead || "mark-notification-read", {
    notification_ids: ids,
    mark_all: Boolean(markAll),
    mark_read: false,
    mark_delivered: true
  });
}

export async function loadOffers(providerId) {
  if (!hasBackend() || !providerId) return [];

  await requireSession();
  const nowIso = new Date().toISOString();

  const rows = await fetchTable("svc_request_offers", (query) =>
    query
      .select(`
        ${REQUEST_OFFER_SAFE_SELECT},
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

  return attachPaymentStatusToOffers(rows);
}

export async function loadOfferDetails(offerId) {
  if (!hasBackend() || !offerId) return null;

  await requireSession();

  const rows = await fetchTable("svc_request_offers", (query) =>
    query
      .select(`
        ${REQUEST_OFFER_SAFE_SELECT},
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

  const withPayments = await attachPaymentStatusToOffers(rows);
  return withPayments?.[0] ?? null;
}

async function attachPaymentStatusToOffers(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const requestIds = [
    ...new Set(
      safeRows
        .map((row) => row?.svc_requests?.id ?? row?.request?.id ?? row?.request_id)
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  ];

  if (!requestIds.length) return safeRows;

  let paymentRows = [];
  try {
    paymentRows = await fetchTable("payments", (query) =>
      query
        .select("id,service_request_id,status,provider_name,environment,is_test,checkout_url,created_at,updated_at")
        .in("service_request_id", requestIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(20, requestIds.length * 2))
    );
  } catch (error) {
    console.warn("[service-api] provider offer payment status unavailable", error?.message || error);
    return safeRows;
  }

  const latestByRequest = new Map();
  for (const payment of paymentRows ?? []) {
    const requestId = String(payment?.service_request_id || "");
    if (requestId && !latestByRequest.has(requestId)) latestByRequest.set(requestId, payment);
  }

  return safeRows.map((row) => {
    const request = row?.svc_requests ?? row?.request ?? {};
    const requestId = String(request?.id ?? row?.request_id ?? "");
    const payment = latestByRequest.get(requestId) ?? null;
    if (!payment) return row;
    return {
      ...row,
      payment,
      payment_status: payment.status ?? null,
      svc_requests: row.svc_requests
        ? { ...row.svc_requests, payment, payment_status: payment.status ?? null }
        : row.svc_requests,
      request: row.request
        ? { ...row.request, payment, payment_status: payment.status ?? null }
        : row.request
    };
  });
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

  const safeProviderWorkspaceRead = async (label, loader, fallback = []) => {
    try {
      const value = await withTimeout(
        Promise.resolve().then(loader),
        PROVIDER_WORKSPACE_READ_TIMEOUT_MS,
        timeoutLabel("PROVIDER_WORKSPACE", label)
      );
      return value ?? fallback;
    } catch (error) {
      console.warn(`[service-api] provider workspace ${label} fallback`, error?.message || error);
      return typeof fallback === "function" ? fallback(error) : fallback;
    }
  };

  const legalRequirementsPromise = safeProviderWorkspaceRead(
    "legal requirements",
    () => loadProviderLegalRequirements(),
    []
  );

  const [
    profileRows,
    profileDetailRows,
    pricingRows,
    offeringRows,
    addonRows,
    availabilityRows,
    documentRows,
    reviewRows,
    categoryRows,
    completedCountResult
  ] = await Promise.all([
    safeProviderWorkspaceRead("profile", () => fetchTable("svc_providers", (query) =>
      query
        .select(
          "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at"
        )
        .eq("id", providerId)
        .limit(1)
    )),

    safeProviderWorkspaceRead("profile detail", () => fetchTable("svc_provider_profiles", (query) =>
      query
        .select(PROVIDER_PROFILE_SAFE_SELECT)
        .eq("provider_id", providerId)
        .limit(1)
    )),

    safeProviderWorkspaceRead("pricing", () => fetchTable("svc_provider_pricing", (query) =>
      query
        .select(
          "id,provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active,svc_categories(name,code,description,default_pricing_model,allowed_service_modes,requires_professional_license,requires_background_check)"
        )
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(50)
    )),

    safeProviderWorkspaceRead("offerings", () => fetchTable("svc_provider_service_offerings", (query) =>
      query
        .select(
          "id,provider_id,category_id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,minimum_charge,minimum_hours,maximum_hours,quote_required,active,metadata,service_mode,duration_minutes,location_policy,public_summary,client_instructions,created_at,updated_at,svc_categories(name,code,description,default_pricing_model,allowed_service_modes,requires_professional_license,requires_background_check)"
        )
        .eq("provider_id", providerId)
        .order("updated_at", { ascending: false })
        .limit(80)
    )),

    safeProviderWorkspaceRead("offering addons", () => fetchTable("svc_provider_offering_addons", (query) =>
      query
        .select("id,provider_id,offering_id,name,description,addon_code,price,pricing_model,unit,is_active,created_at,updated_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: true })
        .limit(160)
    )),

    safeProviderWorkspaceRead("availability", () => fetchTable("svc_provider_availability", (query) =>
      query
        .select("id,provider_id,day_of_week,start_time,end_time,active")
        .eq("provider_id", providerId)
        .eq("active", true)
        .order("day_of_week", { ascending: true })
    )),

    safeProviderWorkspaceRead("documents", () => fetchTable("svc_provider_documents", (query) =>
      query
        .select(PROVIDER_DOCUMENT_SELECT)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        // Limit 200 (no 10) — algunos prestadores tienen muchos retries de selfie
        // y con limit 10 los DNI quedaban afuera del fetch, mostrándose como
        // "Pendiente" aunque estuvieran APPROVED en DB.
        .limit(200)
    )),

    safeProviderWorkspaceRead("reviews", () => fetchTable("svc_reviews", (query) =>
      query
        .select("id,provider_id,client_user_id,rating,stars,created_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(4)
    )),

    safeProviderWorkspaceRead("categories", () => fetchTable("svc_provider_categories", (query) =>
      query
        .select("id,provider_id,category_id,active,svc_categories(name,code,description)")
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(20)
    )),

    safeProviderWorkspaceRead("completed count", () => supabase
      .from("svc_requests")
      .select("id", { count: "exact" })
      .or(`selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`)
      .eq("status", "COMPLETED")
      .limit(1), { count: 0 })
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

  const profileRow = profileRows?.[0] ?? null;
  const profileDetailRow = profileDetailRows?.[0] ?? null;
  const resolvedAvatarUrl = await resolveProviderAvatarUrl(
    profileDetailRow?.avatar_public_url || profileRow?.avatar_url
  );
  if (resolvedAvatarUrl && profileRow) profileRow.avatar_url = resolvedAvatarUrl;
  if (resolvedAvatarUrl && profileDetailRow && !profileDetailRow.avatar_public_url) {
    profileDetailRow.avatar_public_url = resolvedAvatarUrl;
  }

  const addonsByOfferingId = new Map();
  for (const addon of addonRows ?? []) {
    const offeringId = addon?.offering_id;
    if (!offeringId) continue;
    if (!addonsByOfferingId.has(offeringId)) addonsByOfferingId.set(offeringId, []);
    addonsByOfferingId.get(offeringId).push(addon);
  }

  const offeringsWithAddons = (offeringRows ?? []).map((offering) => ({
    ...offering,
    addons: addonsByOfferingId.get(offering.id) ?? []
  }));

  return {
    profile: profileRow,
    profileDetail: profileDetailRow,
    pricing: pricingRows ?? [],
    offerings: offeringsWithAddons,
    addons: addonRows ?? [],
    availability: availabilityRows ?? [],
    documents: await normalizeProviderDocuments(documentRows),
    reviews: reviewRows ?? [],
    categories: categoryRows ?? [],
    completedCount: completedCountResult?.count ?? 0,
    legalRequirements,
    legalAcceptances
  };
}

function normalizeUuidForSave(value) {
  const normalized = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function normalizeProviderIdForSave(value) {
  const candidate = typeof value === "object" && value
    ? value.id ?? value.provider_id ?? value.providerId
    : value;
  return normalizeUuidForSave(candidate);
}

async function saveProviderWorkspaceViaEdge(providerId, payload = {}) {
  const functionName = appConfig.functions.saveProviderService;
  if (!functionName) {
    const error = new Error("provider_service_save_function_missing");
    error.code = "provider_service_save_function_missing";
    throw error;
  }

  const normalizedProviderId = normalizeProviderIdForSave(providerId);
  if (!normalizedProviderId) {
    const error = new Error("provider_id_invalid");
    error.code = "provider_id_invalid";
    throw error;
  }

  const correlationId =
    crypto.randomUUID?.() ||
    `provider-save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    const error = new Error("provider_service_save_config_missing");
    error.code = "provider_service_save_config_missing";
    error.correlationId = correlationId;
    throw error;
  }

  const session = await requireSession();

  // Critical save path: use explicit fetch so the audited function receives
  // a plain JSON body and provider header while still enforcing Supabase JWT.
  const response = await fetch(
    `${appConfig.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}?provider_id=${encodeURIComponent(normalizedProviderId)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": appConfig.supabaseAnonKey,
        "Content-Type": "application/json",
        "X-MIMI-Provider-Id": normalizedProviderId,
        "X-MIMI-Correlation-Id": correlationId
      },
      body: JSON.stringify({
        providerId: normalizedProviderId,
        provider_id: normalizedProviderId,
        payload,
        correlationId,
        correlation_id: correlationId
      })
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const code = result?.code || result?.error || `provider_service_save_http_${response.status}`;
    console.warn("[MIMI Save] svc-save-provider-service rejected", {
      status: response.status,
      code,
      correlationId: result?.correlation_id || correlationId,
      providerIdLength: normalizedProviderId.length,
      providerIdTail: normalizedProviderId.slice(-8),
      functionBuild: result?.function_build ?? result?.debug?.function_build ?? null,
      debug: result?.debug ?? null
    });
    const error = new Error(code);
    error.code = code;
    error.details = result;
    error.correlationId = result?.correlation_id || correlationId;
    throw error;
  }

  if (!result?.ok) {
    const error = new Error(result?.error || "provider_service_save_failed");
    error.code = result?.error || "provider_service_save_failed";
    error.details = result;
    error.correlationId = result?.correlation_id || correlationId;
    throw error;
  }

  // Reload with the regular client path so documents, legal state and signed
  // avatar URLs keep the same shape used by the provider UI.
  return loadProviderWorkspace(normalizedProviderId);
}

async function changeProviderOfferingPublication(providerId, offeringId, mode, fallbackLabel) {
  const functionName = appConfig.functions.saveProviderService;
  if (!functionName) {
    const error = new Error("provider_service_save_function_missing");
    error.code = "provider_service_save_function_missing";
    throw error;
  }

  const normalizedProviderId = normalizeProviderIdForSave(providerId);
  if (!normalizedProviderId) {
    const error = new Error("provider_id_invalid");
    error.code = "provider_id_invalid";
    throw error;
  }

  const normalizedOfferingId = normalizeUuidForSave(offeringId);
  if (!normalizedOfferingId) {
    const error = new Error("offering_id_invalid");
    error.code = "offering_id_invalid";
    throw error;
  }

  const correlationId =
    crypto.randomUUID?.() ||
    `provider-offering-${fallbackLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    const error = new Error("provider_service_save_config_missing");
    error.code = "provider_service_save_config_missing";
    error.correlationId = correlationId;
    throw error;
  }

  const session = await requireSession();
  const response = await fetch(
    `${appConfig.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}?provider_id=${encodeURIComponent(normalizedProviderId)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": appConfig.supabaseAnonKey,
        "Content-Type": "application/json",
        "X-MIMI-Provider-Id": normalizedProviderId,
        "X-MIMI-Correlation-Id": correlationId
      },
      body: JSON.stringify({
        mode,
        providerId: normalizedProviderId,
        provider_id: normalizedProviderId,
        offeringId: normalizedOfferingId,
        offering_id: normalizedOfferingId,
        payload: { offeringId: normalizedOfferingId, offering_id: normalizedOfferingId },
        correlationId,
        correlation_id: correlationId
      })
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const code = result?.code || result?.error || `provider_service_save_http_${response.status}`;
    console.warn("[MIMI Save] svc-save-provider-service publication change rejected", {
      status: response.status,
      code,
      mode,
      correlationId: result?.correlation_id || correlationId,
      providerIdLength: normalizedProviderId.length,
      providerIdTail: normalizedProviderId.slice(-8),
      offeringIdTail: normalizedOfferingId.slice(-8),
      functionBuild: result?.function_build ?? result?.debug?.function_build ?? null,
      debug: result?.debug ?? null
    });
    const error = new Error(code);
    error.code = code;
    error.details = result;
    error.correlationId = result?.correlation_id || correlationId;
    throw error;
  }

  if (!result?.ok) {
    const error = new Error(result?.error || "provider_offering_deactivate_failed");
    error.code = result?.error || "provider_offering_deactivate_failed";
    error.details = result;
    error.correlationId = result?.correlation_id || correlationId;
    throw error;
  }

  return loadProviderWorkspace(normalizedProviderId);
}

export function deactivateProviderOffering(providerId, offeringId) {
  return changeProviderOfferingPublication(providerId, offeringId, "deactivate_offering", "delete");
}

export function reactivateProviderOffering(providerId, offeringId) {
  return changeProviderOfferingPublication(providerId, offeringId, "reactivate_offering", "reactivate");
}

export async function saveProviderOfferingAddons(providerId, offeringId, addons = []) {
  const functionName = appConfig.functions.saveProviderService;
  if (!functionName) {
    const error = new Error("provider_service_save_function_missing");
    error.code = "provider_service_save_function_missing";
    throw error;
  }

  const normalizedProviderId = normalizeProviderIdForSave(providerId);
  if (!normalizedProviderId) {
    const error = new Error("provider_id_invalid");
    error.code = "provider_id_invalid";
    throw error;
  }

  const normalizedOfferingId = normalizeUuidForSave(offeringId);
  if (!normalizedOfferingId) {
    const error = new Error("offering_id_invalid");
    error.code = "offering_id_invalid";
    throw error;
  }

  const correlationId =
    crypto.randomUUID?.() ||
    `provider-offering-addons-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    const error = new Error("provider_service_save_config_missing");
    error.code = "provider_service_save_config_missing";
    error.correlationId = correlationId;
    throw error;
  }

  const session = await requireSession();
  const response = await fetch(
    `${appConfig.supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}?provider_id=${encodeURIComponent(normalizedProviderId)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": appConfig.supabaseAnonKey,
        "Content-Type": "application/json",
        "X-MIMI-Provider-Id": normalizedProviderId,
        "X-MIMI-Correlation-Id": correlationId
      },
      body: JSON.stringify({
        mode: "save_offering_addons",
        providerId: normalizedProviderId,
        provider_id: normalizedProviderId,
        offeringId: normalizedOfferingId,
        offering_id: normalizedOfferingId,
        payload: {
          offeringId: normalizedOfferingId,
          offering_id: normalizedOfferingId,
          addons: Array.isArray(addons) ? addons : []
        },
        correlationId,
        correlation_id: correlationId
      })
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    const code = result?.code || result?.error || `provider_service_addons_http_${response.status}`;
    console.warn("[MIMI Save] svc-save-provider-service addons rejected", {
      status: response.status,
      code,
      correlationId: result?.correlation_id || correlationId,
      providerIdLength: normalizedProviderId.length,
      providerIdTail: normalizedProviderId.slice(-8),
      offeringIdTail: normalizedOfferingId.slice(-8),
      functionBuild: result?.function_build ?? result?.debug?.function_build ?? null
    });
    const error = new Error(code);
    error.code = code;
    error.details = result;
    error.correlationId = result?.correlation_id || correlationId;
    throw error;
  }

  return loadProviderWorkspace(normalizedProviderId);
}

export async function saveProviderWorkspace(providerId, payload = {}) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return { ok: true };
  }

  await requireSession();

  const edgeWorkspace = await saveProviderWorkspaceViaEdge(providerId, payload);
  return edgeWorkspace;
}


export async function uploadProviderDocument({ providerId, documentType, file, metadata = {} }) {
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

  const safeMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};

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
        ...safeMetadata,
        original_name: file.name || null,
        uploaded_from: "prestador.html",
        uploaded_at: new Date().toISOString()
      }
    })
    .select(PROVIDER_DOCUMENT_SELECT)
    .single();

if (error) throw error;

const normalized = (await normalizeProviderDocuments([data]))[0] ?? data;

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

  let wallet = null;
  try {
    const { data: walletRows, error: walletError } = await supabase
      .from("provider_wallets")
      .select(PROVIDER_WALLET_SAFE_SELECT)
      .eq("provider_id", providerId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (!walletError) {
      wallet = walletRows?.[0] ?? null;
    }
  } catch (walletError) {
    console.warn("[service-api] provider wallet snapshot unavailable", walletError?.message || walletError);
  }

  const dashboardHistoryLimit = 50;

  // 🔥 servicios completados
  const { data: completedRows, error: completedError } = await supabase
    .from("svc_requests")
    .select("id,total_price_snapshot,created_at,address_text,status")
    .or(`selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`)
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(dashboardHistoryLimit);

  if (completedError) throw completedError;

  // 🔥 servicio activo
  const { data: activeRows } = await supabase
    .from("svc_requests")
    .select(SERVICE_REQUEST_SAFE_SELECT)
    .or(`selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`)
    .not("status", "in", '("COMPLETED","CANCELLED")')
    .order("updated_at", { ascending: false })
    .limit(1);

  let activePayment = null;
  const activeRequestId = activeRows?.[0]?.id;
  if (activeRequestId) {
    try {
      const { data: activePayments, error: activePaymentError } = await supabase
        .from("payments")
        .select("id,service_request_id,status,provider_name,environment,is_test,checkout_url,created_at,updated_at")
        .eq("service_request_id", activeRequestId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!activePaymentError) {
        activePayment = activePayments?.[0] ?? null;
      }
    } catch (paymentError) {
      console.warn("[service-api] active service payment status unavailable", paymentError?.message || paymentError);
    }
  }

  const recentEarnings = (completedRows ?? []).reduce(
    (acc, item) => acc + Number(item.total_price_snapshot ?? 0),
    0
  );
  const earnings = Number(wallet?.lifetime_earnings ?? recentEarnings);
  return {
    earnings,
    available_balance: Number(wallet?.available_balance ?? earnings),
    pending_balance: Number(wallet?.pending_balance ?? 0),
    negative_balance: Number(wallet?.negative_balance ?? wallet?.cash_debt_balance ?? 0),
    cash_debt_balance: Number(wallet?.cash_debt_balance ?? 0),
    risk_hold_balance: Number(wallet?.risk_hold_balance ?? 0),
    payout_hold_balance: Number(wallet?.payout_hold_balance ?? 0),
    wallet_status: wallet?.wallet_status ?? null,
    risk_level: wallet?.risk_level ?? null,
    completed: completedRows?.length ?? 0,
    active: activeRows?.[0]
      ? {
          ...activeRows[0],
          payment: activePayment,
          payment_status: activePayment?.status ?? null,
          payment_provider_name: activePayment?.provider_name ?? null
        }
      : null,
    history: completedRows ?? [],
    history_limited: (completedRows?.length ?? 0) >= dashboardHistoryLimit,
    wallet_snapshot_at: wallet?.updated_at ?? null
  };
}

export async function getProviderPayoutAccount() {
  if (!hasBackend()) {
    return { ok: false, account: null };
  }

  try {
    return await invokeFunction(appConfig.functions.providerPayoutAccount || "provider-payout-account", {
      action: "get_current"
    });
  } catch (error) {
    console.warn("[service-api] provider payout account fallback", error);
    return { ok: false, account: null, error: error?.code || error?.message || "payout_account_unavailable" };
  }
}

export async function submitProviderPayoutAccount(payload = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return invokeFunction(appConfig.functions.providerPayoutAccount || "provider-payout-account", {
    action: "submit_for_review",
    ...payload
  });
}

export async function loadCustomerTrustProfile() {
  if (!hasBackend()) {
    return {
      ok: false,
      profile: null,
      verification_requests: [],
      identity_checks: [],
      verification_events: [],
      risk_signals: []
    };
  }

  try {
    return await invokeFunction(appConfig.functions.customerTrustProfile || "customer-trust-profile", {
      action: "get_status"
    });
  } catch (error) {
    console.warn("[service-api] customer trust profile fallback", error?.code || error?.message || error);
    return {
      ok: false,
      profile: null,
      verification_requests: [],
      identity_checks: [],
      verification_events: [],
      risk_signals: [],
      error: error?.code || error?.message || "customer_trust_unavailable"
    };
  }
}

export async function requestCustomerIdentityVerification(reason = "voluntary_trust_upgrade") {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return invokeFunction(appConfig.functions.customerTrustProfile || "customer-trust-profile", {
    action: "request_verification",
    reason
  });
}

export async function createCustomerIdentityUploadIntent(payload = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return invokeFunction(appConfig.functions.customerIdentityVerification || "customer-identity-verification", {
    action: "create_upload_intent",
    ...payload
  });
}

export async function submitCustomerIdentityEvidence(payload = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return invokeFunction(appConfig.functions.customerIdentityVerification || "customer-identity-verification", {
    action: "submit_evidence",
    ...payload
  });
}

export async function processCustomerIdentityVerification(payload = {}) {
  if (!hasBackend()) {
    throw new Error("AUTH_REQUIRED");
  }

  return invokeFunction(appConfig.functions.customerIdentityVerification || "customer-identity-verification", {
    action: "process",
    ...payload
  });
}
