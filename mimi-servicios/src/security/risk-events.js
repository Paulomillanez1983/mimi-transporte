import { appConfig } from "../config.js";
import { getSupabaseClient, recoverSessionSafely } from "../services/supabase.js?v=2026.05.17.2";
import {
  defaultFingerprintDecision,
  getCachedFingerprint,
  getFingerprintForRiskEvent,
  getFingerprintMode,
  shouldUseFingerprintForAction
} from "./fingerprint-client.js";

const EVENT_DEDUPE_TTL_MS = 30 * 1000;
const recentEvents = new Map();

export function recordCriticalRiskEvent(action, metadata = {}) {
  if (appConfig.securityFlags?.ENABLE_SECURITY_ANALYTICS === false) {
    return;
  }

  const schedule = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

  schedule(() => {
    sendCriticalRiskEvent(action, metadata).catch((error) => {
      if (window.MIMI_SECURITY_DEBUG === true) {
        console.warn("[MIMI security] risk event skipped", error?.message || error);
      }
    });
  });
}

export function shouldCollectFingerprint(action, context = {}) {
  const safeAction = String(action || "").trim();
  const mode = getFingerprintMode();
  const cache = getCachedFingerprint(safeAction);

  if (context.forceFingerprint === true) {
    return { collect: true, reason: "forced_by_flow", mode, cache };
  }

  if (context.fingerprintCacheRequired !== false && cache) {
    return { collect: false, reason: "valid_action_cache", mode, cache };
  }

  if (context.providerVerified === true && context.kycApproved === true && ["provider_login", "client_login"].includes(safeAction)) {
    return { collect: false, reason: "trusted_login_internal_precheck", mode, cache: null };
  }

  if (context.loginDeviceRecent === true && ["provider_login", "client_login"].includes(safeAction)) {
    return { collect: false, reason: "recent_device_internal_precheck", mode, cache: null };
  }

  if (context.cashDebtRisk === true || context.rapidAttempts === true || ["high", "critical"].includes(String(context.previousRiskLevel || ""))) {
    return { collect: true, reason: "step_up_context_risk", mode, cache: null };
  }

  return defaultFingerprintDecision(safeAction, context);
}

export async function sendCriticalRiskEvent(action, metadata = {}) {
  const safeAction = String(action || "").trim();
  if (!shouldUseFingerprintForAction(safeAction)) {
    return { ok: false, skipped: true, reason: "action_not_in_critical_scope" };
  }

  const dedupeKey = `${safeAction}:${metadata.providerId || metadata.paymentId || metadata.requestId || "session"}`;
  if (isRecentlySent(dedupeKey)) {
    return { ok: false, skipped: true, reason: "deduped" };
  }
  markSent(dedupeKey);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, skipped: true, reason: "supabase_unavailable" };
  }

  const session = await recoverSessionSafely().catch(() => null);
  if (!session?.access_token) {
    return { ok: false, skipped: true, reason: "session_unavailable" };
  }

  const decision = shouldCollectFingerprint(safeAction, metadata);
  const fingerprint = decision.collect
    ? await getFingerprintForRiskEvent(safeAction)
    : fingerprintFromDecision(decision, safeAction);

  const payload = buildRiskPayload(safeAction, metadata, fingerprint, decision);
  const { data, error } = await supabase.functions.invoke(
    appConfig.functions.securityRiskEvent || "security-risk-event",
    {
      body: payload,
      headers: { "Content-Type": "application/json" }
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

function fingerprintFromDecision(decision, action) {
  if (decision.cache) {
    return {
      ok: true,
      cached: true,
      cacheHit: true,
      action,
      visitorId: decision.cache.visitorId,
      requestId: decision.cache.requestId ?? null,
      confidence: decision.cache.confidence ?? null,
      timestamp: decision.cache.timestamp
    };
  }

  return {
    ok: false,
    skipped: true,
    intentionalSkip: true,
    reason: decision.reason,
    action
  };
}

function buildRiskPayload(action, metadata, fingerprint, decision) {
  const requestId = fingerprint?.requestId || metadata.requestId || crypto.randomUUID?.() || `risk-${Date.now()}`;
  const providerId = metadata.providerId || metadata.provider_id || null;
  const isTest = metadata.isTest === true || metadata.is_test === true;
  const fingerprintSkipped = fingerprint?.ok !== true;
  const intentionalSkip = fingerprint?.intentionalSkip === true;
  const entityKey = metadata.paymentId || metadata.payment_id || providerId || metadata.serviceRequestId || metadata.service_request_id || "session";

  return {
    event_type: action,
    event_key: `${action}:${entityKey}:${requestId}`,
    provider_id: providerId,
    visitor_id: fingerprint?.ok ? fingerprint.visitorId : null,
    request_id: requestId,
    confidence: fingerprint?.ok ? fingerprint.confidence : null,
    is_test: isTest,
    metadata: {
      source: metadata.source || "mimi-servicios-web",
      actor_role: metadata.actorRole || metadata.actor_role || null,
      payment_id: metadata.paymentId || metadata.payment_id || null,
      service_request_id: metadata.serviceRequestId || metadata.service_request_id || null,
      risk_signal_source: fingerprint?.ok
        ? (fingerprint.cached ? "fingerprint_cache" : "fingerprint")
        : (intentionalSkip ? "internal_precheck" : "fingerprint_failed"),
      risk_signal_missing: fingerprintSkipped && !intentionalSkip,
      risk_signal_missing_reason: fingerprint?.ok === true ? null : fingerprint?.reason || "fingerprint_unavailable",
      fingerprint_skipped: fingerprintSkipped,
      fingerprint_skip_reason: fingerprintSkipped ? decision.reason : null,
      fingerprint_cached: fingerprint?.cached === true || fingerprint?.cacheHit === true,
      fingerprint_mode: decision.mode,
      precheck_reason: decision.reason
    }
  };
}

function isRecentlySent(key) {
  const expiresAt = recentEvents.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    recentEvents.delete(key);
    return false;
  }
  return true;
}

function markSent(key) {
  recentEvents.set(key, Date.now() + EVENT_DEDUPE_TTL_MS);
}
