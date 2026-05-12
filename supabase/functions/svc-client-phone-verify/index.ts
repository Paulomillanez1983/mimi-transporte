import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  auditPhoneEvent,
  corsHeaders,
  getCorrelationId,
  json,
  maskPhone,
  normalizeE164,
  normalizeOtp,
  phoneLog,
  requiredEnv,
  requireUser,
  twilioVerifyRequest,
} from "../_shared/client-phone.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const correlationId = getCorrelationId(req);

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = requiredEnv();
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const attemptId = String(body.attempt_id || body.attemptId || "").trim();
    const phoneNumber = normalizeE164(body.phone_number || body.phoneNumber);
    const code = normalizeOtp(body.code || body.otp);
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let query = admin
      .from("svc_phone_verification_attempts")
      .select("*")
      .eq("user_id", user.id)
      .eq("phone_number", phoneNumber)
      .in("status", ["pending", "sent"])
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (attemptId) {
      query = admin
        .from("svc_phone_verification_attempts")
        .select("*")
        .eq("id", attemptId)
        .eq("user_id", user.id)
        .eq("phone_number", phoneNumber)
        .in("status", ["pending", "sent"])
        .gt("expires_at", new Date().toISOString())
        .limit(1);
    }

    const { data: attempts, error: attemptError } = await query;
    if (attemptError) throw attemptError;
    const attempt = attempts?.[0] ?? null;
    if (!attempt) return json({ ok: false, error: "otp_not_found_or_expired", correlation_id: correlationId }, 404);

    const nextAttempts = Number(attempt.attempts || 0) + 1;
    if (nextAttempts > Number(attempt.max_attempts || 5)) {
      await admin
        .from("svc_phone_verification_attempts")
        .update({ status: "failed", reason: "max_attempts_exceeded", attempts: nextAttempts })
        .eq("id", attempt.id);
      return json({ ok: false, error: "otp_attempts_exceeded", correlation_id: correlationId }, 429);
    }

    const verification = await twilioVerifyRequest("/VerificationCheck", {
      To: phoneNumber,
      Code: code,
    });

    const approved = String(verification.status || "").toLowerCase() === "approved";

    if (!approved) {
      await admin
        .from("svc_phone_verification_attempts")
        .update({
          attempts: nextAttempts,
          status: nextAttempts >= Number(attempt.max_attempts || 5) ? "failed" : "sent",
          reason: nextAttempts >= Number(attempt.max_attempts || 5) ? "max_attempts_exceeded" : "code_invalid",
        })
        .eq("id", attempt.id);

      await auditPhoneEvent(admin, {
        userId: user.id,
        eventType: "client_phone_otp_failed",
        entityId: attempt.id,
        req,
        metadata: {
          attempts: nextAttempts,
          reason: "code_invalid",
        },
      });

      return json({
        ok: false,
        error: nextAttempts >= Number(attempt.max_attempts || 5) ? "otp_attempts_exceeded" : "otp_invalid",
        attempts: nextAttempts,
        remaining_attempts: Math.max(0, Number(attempt.max_attempts || 5) - nextAttempts),
        correlation_id: correlationId,
      }, nextAttempts >= Number(attempt.max_attempts || 5) ? 429 : 400);
    }

    const nowIso = new Date().toISOString();
    const { error: updateAttemptError } = await admin
      .from("svc_phone_verification_attempts")
      .update({
        status: "approved",
        attempts: nextAttempts,
        verified_at: nowIso,
        reason: null,
      })
      .eq("id", attempt.id);
    if (updateAttemptError) throw updateAttemptError;

    const { data: profile, error: profileError } = await admin
      .from("svc_client_profiles")
      .upsert({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
        email: user.email || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        phone_number: phoneNumber,
        country_code: attempt.country_code,
        phone_verified: true,
        phone_verified_at: nowIso,
        phone_updated_at: nowIso,
        phone_last_change_at: nowIso,
        metadata_json: {
          source: "phone_verification_approved",
          last_phone_attempt_id: attempt.id,
          country_iso: attempt.metadata_json?.country_iso || null,
        },
      }, { onConflict: "user_id", ignoreDuplicates: false })
      .select("id,user_id,full_name,email,avatar_url,phone_number,country_code,phone_verified,phone_verified_at,phone_updated_at")
      .single();
    if (profileError) throw profileError;

    await auditPhoneEvent(admin, {
      userId: user.id,
      eventType: "client_phone_verified",
      entityId: profile.id,
      req,
      metadata: {
        attempt_id: attempt.id,
        provider: "twilio_verify",
        country_code: attempt.country_code,
      },
    });

    phoneLog("phone_verified", {
      correlation_id: correlationId,
      user_id: user.id,
      profile_id: profile.id,
    });

    return json({
      ok: true,
      profile,
      masked_phone: maskPhone(phoneNumber),
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("phone_verify_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "sms_provider_not_configured" ? 503 :
      message.startsWith("sms_provider_error") ? 502 :
      message === "phone_invalid" || message === "otp_invalid" ? 400 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
