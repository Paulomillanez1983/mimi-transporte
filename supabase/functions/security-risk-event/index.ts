import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const CRITICAL_EVENT_TYPES = new Set([
  "client_register",
  "client_login",
  "account_recovery",
  "add_payment_method",
  "confirm_payment",
  "provider_onboarding",
  "provider_kyc",
  "provider_login",
  "provider_change_bank_account",
  "provider_payout_request",
  "provider_financial_change"
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function fail(error: string, status = 400, details: unknown = null) {
  return json({ ok: false, error, details }, status);
}

function correlationId(req: Request) {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.visitorId;
  delete copy.visitor_id;
  delete copy.rawVisitorId;
  delete copy.ip;
  delete copy.userAgent;
  delete copy.user_agent;
  return copy;
}

function boolFlag(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function riskBand(score: number) {
  if (score >= 80) return { risk_level: "critical", recommendation: "manual_review_hold" };
  if (score >= 55) return { risk_level: "high", recommendation: "additional_verification" };
  if (score >= 25) return { risk_level: "medium", recommendation: "log" };
  return { risk_level: "low", recommendation: "allow" };
}

async function requestHashes(req: Request, salt: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = req.headers.get("user-agent") || "";
  return {
    ip_hash: ip ? await sha256Hex(`${ip}:${salt}`) : null,
    user_agent_hash: userAgent ? await sha256Hex(`${userAgent}:${salt}`) : null
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const traceId = crypto.randomUUID();
  const corrId = correlationId(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return fail("SUPABASE_ENV_MISSING", 500);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("AUTH_REQUIRED", 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user?.id) return fail("AUTH_REQUIRED", 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const eventType = String(body.event_type ?? body.eventType ?? "").trim();
    if (!CRITICAL_EVENT_TYPES.has(eventType)) {
      return fail("RISK_EVENT_SCOPE_NOT_ALLOWED", 400, {
        reason: "Fingerprint/risk events are accepted only for critical auth, payment, KYC and financial actions."
      });
    }

    const providerId = body.provider_id ? String(body.provider_id).trim() : null;
    if (providerId) {
      const { data: provider } = await admin
        .from("svc_providers")
        .select("id,user_id,approved,blocked")
        .eq("id", providerId)
        .maybeSingle();
      const { data: isAdmin } = await admin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .eq("active", true)
        .in("role", ["ADMIN", "SUPERADMIN", "FINANCE", "FINANCE_ADMIN", "AUDITOR"])
        .maybeSingle();
      if (!provider || (provider.user_id !== userData.user.id && !isAdmin)) {
        return fail("PROVIDER_SCOPE_FORBIDDEN", 403);
      }
    }

    const visitorId = String(body.visitor_id ?? body.visitorId ?? "").trim();
    const salt = Deno.env.get("MIMI_RISK_HASH_SALT") || serviceRoleKey;
    const visitorIdHash = visitorId ? await sha256Hex(`${visitorId}:${salt}`) : null;
    const fingerprintConfidence = Number(body.confidence ?? body.fingerprint_confidence ?? 0);
    const requestId = String(body.request_id ?? body.requestId ?? "").slice(0, 180) || null;
    const isTest = boolFlag(body.is_test);
    const fiscalVisibility = isTest ? "excluded_from_accounting" : "fiscal_reportable";
    const { ip_hash, user_agent_hash } = await requestHashes(req, salt);

    let score = 0;
    const reasons: string[] = [];

    const metadata = safeMetadata(body.metadata);
    const intentionalFingerprintSkip =
      metadata?.fingerprint_skipped === true &&
      metadata?.risk_signal_missing === false &&
      metadata?.risk_signal_source === "internal_precheck";

    if (!visitorIdHash && !intentionalFingerprintSkip) {
      score += 15;
      reasons.push("fingerprint_absent");
    }
    if (visitorIdHash && Number.isFinite(fingerprintConfidence) && fingerprintConfidence > 0 && fingerprintConfidence < 0.6) {
      score += 10;
      reasons.push("low_fingerprint_confidence");
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentActorEvents } = await admin
      .from("fraud_events")
      .select("id")
      .eq("actor_user_id", userData.user.id)
      .gte("created_at", tenMinutesAgo)
      .limit(20);
    if ((recentActorEvents?.length ?? 0) >= 5) {
      score += 20;
      reasons.push("rapid_attempts");
    }

    if (visitorIdHash) {
      const { data: visitorEvents } = await admin
        .from("fraud_events")
        .select("actor_user_id,provider_id,event_type,created_at")
        .eq("visitor_id_hash", visitorIdHash)
        .order("created_at", { ascending: false })
        .limit(120);
      const actors = new Set((visitorEvents ?? []).map((event) => event.actor_user_id).filter(Boolean));
      if (actors.size >= 4) {
        score += 30;
        reasons.push("visitor_seen_on_many_accounts");
      } else if (actors.size >= 2) {
        score += 20;
        reasons.push("visitor_seen_on_multiple_accounts");
      }

      const sameActorSeen = (visitorEvents ?? []).some((event) => event.actor_user_id === userData.user.id);
      if (!sameActorSeen && ["provider_payout_request", "provider_change_bank_account", "provider_financial_change"].includes(eventType)) {
        score += 25;
        reasons.push("financial_action_from_new_device");
      }
    }

    if (providerId) {
      const { data: profile } = await admin
        .from("svc_provider_profiles")
        .select("kyc_status,review_status")
        .eq("provider_id", providerId)
        .maybeSingle();
      if (
        String(profile?.review_status ?? "").toLowerCase() === "approved" &&
        ["APPROVED", "READY_FOR_APPROVAL"].includes(String(profile?.kyc_status ?? "").toUpperCase())
      ) {
        score = Math.max(score - 15, 0);
        reasons.push("provider_kyc_reduces_score");
      }
    }

    const band = riskBand(score);
    const eventKey = String(body.event_key ?? `${eventType}:${userData.user.id}:${requestId ?? corrId}`).slice(0, 280);
    const eventPayload = {
      event_key: eventKey,
      event_type: eventType,
      actor_user_id: userData.user.id,
      provider_id: providerId,
      visitor_id_hash: visitorIdHash,
      request_id: requestId,
      ip_hash,
      user_agent_hash,
      fingerprint_confidence: Number.isFinite(fingerprintConfidence) ? fingerprintConfidence : null,
      risk_score: score,
      risk_level: band.risk_level,
      recommendation: band.recommendation,
      decision_applied: false,
      reasons,
      trace_id: traceId,
      correlation_id: corrId,
      environment: isTest ? "qa" : "production",
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      metadata: {
        ...metadata,
        foundation_only: true,
        automatic_blocking_enabled: false
      }
    };

    const { data: insertedEvent, error: eventError } = await admin
      .from("fraud_events")
      .insert(eventPayload)
      .select("id")
      .single();
    if (eventError && eventError.code !== "23505") {
      return fail("RISK_EVENT_INSERT_FAILED", 500, eventError.message);
    }

    const event = insertedEvent ?? (await admin
      .from("fraud_events")
      .select("id")
      .eq("event_key", eventKey)
      .maybeSingle()).data;
    if (!event?.id) return fail("RISK_EVENT_IDEMPOTENCY_LOOKUP_FAILED", 500);

    if (visitorIdHash) {
      const { data: allDeviceEvents } = await admin
        .from("fraud_events")
        .select("actor_user_id,provider_id,event_type,created_at")
        .eq("visitor_id_hash", visitorIdHash)
        .order("created_at", { ascending: false })
        .limit(200);
      const actorCount = new Set((allDeviceEvents ?? []).map((item) => item.actor_user_id).filter(Boolean)).size;
      const providerCount = new Set((allDeviceEvents ?? []).map((item) => item.provider_id).filter(Boolean)).size;
      const payoutChangeCount = (allDeviceEvents ?? []).filter((item) => item.event_type === "provider_payout_request").length;
      const financialChangeCount = (allDeviceEvents ?? []).filter((item) => String(item.event_type).includes("financial") || String(item.event_type).includes("bank")).length;

      await admin.from("device_reputation").upsert({
        visitor_id_hash: visitorIdHash,
        last_seen_at: new Date().toISOString(),
        actor_count: actorCount,
        provider_count: providerCount,
        event_count: allDeviceEvents?.length ?? 1,
        recent_event_count: recentActorEvents?.length ?? 0,
        payout_change_count: payoutChangeCount,
        financial_change_count: financialChangeCount,
        risk_score: score,
        risk_level: band.risk_level,
        reputation_status: band.risk_level === "critical" ? "review" : band.risk_level === "high" ? "watch" : "observed",
        last_event_id: event.id,
        environment: isTest ? "qa" : "production",
        is_test: isTest,
        fiscal_visibility: fiscalVisibility,
        metadata: { foundation_only: true }
      }, { onConflict: "visitor_id_hash" });
    }

    const subjectType = providerId ? "provider" : "user";
    const subjectKey = providerId ?? userData.user.id;
    await admin.from("risk_scores").upsert({
      actor_user_id: userData.user.id,
      provider_id: providerId,
      subject_type: subjectType,
      subject_key: subjectKey,
      current_score: score,
      risk_level: band.risk_level,
      recommendation: band.recommendation,
      last_event_id: event.id,
      factors: { reasons, event_type: eventType },
      environment: isTest ? "qa" : "production",
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      metadata: { foundation_only: true, automatic_blocking_enabled: false }
    }, { onConflict: "subject_type,subject_key,environment,is_test" });

    return json({
      ok: true,
      event_id: event.id,
      risk_score: score,
      risk_level: band.risk_level,
      recommendation: band.recommendation,
      decision_applied: false,
      reasons,
      trace_id: traceId,
      correlation_id: corrId
    });
  } catch (error) {
    console.error(JSON.stringify({
      area: "security_risk_event",
      event: "risk_event_failed",
      trace_id: traceId,
      correlation_id: corrId,
      error: error instanceof Error ? error.message : String(error)
    }));
    return fail("UNEXPECTED_RISK_EVENT_ERROR", 500, { trace_id: traceId, correlation_id: corrId });
  }
});
