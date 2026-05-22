const CACHE_KEY = "mimigo:fingerprint:v2";
const SCRIPT_ID = "mimigo-fingerprintjs";
const FP_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js";

const ACTION_TTL_MS = {
  client_login: 7 * 24 * 60 * 60 * 1000,
  provider_login: 7 * 24 * 60 * 60 * 1000,
  client_register: 24 * 60 * 60 * 1000,
  client_identity_verification_requested: 24 * 60 * 60 * 1000,
  client_identity_verification_submitted: 24 * 60 * 60 * 1000,
  service_request_created: 6 * 60 * 60 * 1000,
  service_request_cancelled: 6 * 60 * 60 * 1000,
  provider_offer_accepted: 6 * 60 * 60 * 1000,
  provider_offer_rejected: 6 * 60 * 60 * 1000,
  support_message_sent: 60 * 60 * 1000,
  client_phone_otp_requested: 60 * 60 * 1000,
  client_phone_otp_verified: 60 * 60 * 1000,
  provider_phone_otp_requested: 60 * 60 * 1000,
  provider_phone_otp_verified: 60 * 60 * 1000,
  auth_otp_requested: 60 * 60 * 1000,
  auth_otp_verified: 60 * 60 * 1000,
  provider_kyc: 24 * 60 * 60 * 1000,
  provider_onboarding: 24 * 60 * 60 * 1000,
  add_payment_method: 24 * 60 * 60 * 1000,
  confirm_payment: 24 * 60 * 60 * 1000,
  provider_payout_request: 6 * 60 * 60 * 1000,
  provider_change_bank_account: 6 * 60 * 60 * 1000,
  provider_financial_change: 6 * 60 * 60 * 1000,
  account_recovery: 24 * 60 * 60 * 1000
};

const STEP_UP_ACTIONS = new Set([
  "provider_kyc",
  "provider_onboarding",
  "client_identity_verification_requested",
  "client_identity_verification_submitted",
  "provider_payout_request",
  "provider_change_bank_account",
  "add_payment_method"
]);

const CRITICAL_ACTIONS = new Set([
  ...Object.keys(ACTION_TTL_MS)
]);

let agentPromise = null;
let visitorPromise = null;

export function getFingerprintMode() {
  const raw = String(
    window.MIMI_SERVICES_ENV?.VITE_FINGERPRINT_MODE ||
      window.MIMI_SERVICES_CONFIG?.VITE_FINGERPRINT_MODE ||
      window.MIMI_SERVICES_CONFIG?.fingerprintMode ||
      "step_up"
  ).trim().toLowerCase();

  return ["off", "audit", "step_up", "strict"].includes(raw) ? raw : "step_up";
}

export function isFingerprintEnabled() {
  const enabled = String(
    window.MIMI_SERVICES_ENV?.VITE_FINGERPRINT_ENABLED ??
      window.MIMI_SERVICES_CONFIG?.VITE_FINGERPRINT_ENABLED ??
      window.MIMI_SERVICES_CONFIG?.fingerprintEnabled ??
      "true"
  ).trim().toLowerCase();

  return enabled !== "false" && enabled !== "0" && enabled !== "off" && getFingerprintMode() !== "off";
}

export function shouldUseFingerprintForAction(action) {
  return CRITICAL_ACTIONS.has(String(action || "").trim());
}

export function actionFingerprintTtl(action) {
  return ACTION_TTL_MS[String(action || "").trim()] || 24 * 60 * 60 * 1000;
}

export function getCachedFingerprint(action = null, now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const ttl = actionFingerprintTtl(action || cached.action);
    const collectedAt = Number(cached.timestamp || cached.createdAt || 0);
    if (!cached?.visitorId || !collectedAt || collectedAt + ttl <= now) {
      window.localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return {
      ...cached,
      cacheHit: true,
      action: cached.action || action || null,
      expiresAt: collectedAt + ttl
    };
  } catch {
    return null;
  }
}

export function hasValidFingerprintCache(action) {
  return Boolean(getCachedFingerprint(action));
}

export function clearFingerprintCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage can be unavailable in hardened webviews. Fallback is no cache.
  }
}

export async function getFingerprintForRiskEvent(action, options = {}) {
  const safeAction = String(action || "").trim();
  if (!shouldUseFingerprintForAction(safeAction)) {
    return {
      ok: false,
      skipped: true,
      reason: "action_not_in_critical_scope",
      action: safeAction
    };
  }

  if (!isFingerprintEnabled()) {
    return {
      ok: false,
      skipped: true,
      reason: "fingerprint_disabled",
      mode: getFingerprintMode(),
      action: safeAction
    };
  }

  const cached = getCachedFingerprint(safeAction);
  if (cached) {
    return {
      ok: true,
      cached: true,
      cacheHit: true,
      action: safeAction,
      visitorId: cached.visitorId,
      requestId: cached.requestId ?? null,
      confidence: cached.confidence ?? null,
      timestamp: cached.timestamp,
      expiresAt: cached.expiresAt
    };
  }

  const publicKey = getPublicKey(options);
  if (!publicKey) {
    return {
      ok: false,
      skipped: true,
      reason: "fingerprint_key_missing",
      action: safeAction
    };
  }

  if (!visitorPromise) {
    visitorPromise = resolveFingerprint(publicKey, safeAction)
      .finally(() => {
        visitorPromise = null;
      });
  }

  return visitorPromise;
}

export function defaultFingerprintDecision(action, context = {}) {
  const safeAction = String(action || "").trim();
  const mode = getFingerprintMode();
  const cache = getCachedFingerprint(safeAction);

  if (!shouldUseFingerprintForAction(safeAction)) {
    return { collect: false, reason: "action_not_in_critical_scope", mode, cache };
  }

  if (!isFingerprintEnabled()) {
    return { collect: false, reason: "fingerprint_disabled", mode, cache };
  }

  if (cache) {
    return { collect: false, reason: "valid_action_cache", mode, cache };
  }

  if (mode === "strict") {
    return { collect: true, reason: "strict_mode", mode, cache: null };
  }

  if (mode === "audit") {
    return { collect: false, reason: "audit_internal_only", mode, cache: null };
  }

  if (STEP_UP_ACTIONS.has(safeAction)) {
    return { collect: true, reason: "step_up_sensitive_action", mode, cache: null };
  }

  if (safeAction === "confirm_payment" && Number(context.amount || context.totalAmount || 0) >= Number(context.highRiskPaymentAmount || 50000)) {
    return { collect: true, reason: "step_up_high_value_payment", mode, cache: null };
  }

  if (context.isNewUser || context.firstLogin || context.rapidAttempts || context.previousRiskLevel === "high" || context.previousRiskLevel === "critical") {
    return { collect: true, reason: "step_up_context_risk", mode, cache: null };
  }

  return { collect: false, reason: "internal_precheck_low_risk", mode, cache: null };
}

async function resolveFingerprint(publicKey, action) {
  try {
    const agent = await loadFingerprintAgent(publicKey);
    const result = await agent.get({ tag: { action } });
    const payload = {
      visitorId: String(result.visitorId || ""),
      requestId: result.requestId ? String(result.requestId) : null,
      action,
      confidence: typeof result.confidence?.score === "number" ? result.confidence.score : null,
      timestamp: Date.now(),
      cacheHit: false
    };

    if (!payload.visitorId) {
      return { ok: false, skipped: true, reason: "fingerprint_empty_result", action };
    }

    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // Best effort cache only. Financial/security flows must not break on storage.
    }

    return {
      ok: true,
      cached: false,
      cacheHit: false,
      action,
      visitorId: payload.visitorId,
      requestId: payload.requestId,
      confidence: payload.confidence,
      timestamp: payload.timestamp,
      expiresAt: payload.timestamp + actionFingerprintTtl(action)
    };
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: "fingerprint_unavailable",
      action,
      error: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

async function loadFingerprintAgent(publicKey) {
  if (!agentPromise) {
    agentPromise = loadFingerprintScript()
      .then(() => {
        if (!window.FingerprintJS?.load) {
          throw new Error("FingerprintJS_LOAD_UNAVAILABLE");
        }
        return window.FingerprintJS.load({ apiKey: publicKey });
      })
      .catch((error) => {
        agentPromise = null;
        throw error;
      });
  }
  return agentPromise;
}

function loadFingerprintScript() {
  if (window.FingerprintJS?.load) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("FingerprintJS_SCRIPT_FAILED")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = FP_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("FingerprintJS_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

function getPublicKey(options) {
  return String(
    options.publicKey ||
      window.MIMI_SERVICES_ENV?.VITE_FINGERPRINT_PUBLIC_KEY ||
      window.MIMI_SERVICES_CONFIG?.VITE_FINGERPRINT_PUBLIC_KEY ||
      window.MIMI_SERVICES_CONFIG?.fingerprintPublicKey ||
      ""
  ).trim();
}
