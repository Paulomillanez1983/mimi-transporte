import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  auditPhoneEvent,
  corsHeaders,
  getCorrelationId,
  json,
  maskPhone,
  normalizeCountryCode,
  normalizeE164,
  phoneLog,
  requestFingerprint,
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
    const phoneNumber = normalizeE164(body.phone_number || body.phoneNumber);
    const countryCode = normalizeCountryCode(body.country_code || body.countryCode, phoneNumber);
    const countryIso = String(body.country_iso || body.countryIso || "").trim().toUpperCase().slice(0, 2) || null;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();
    const fingerprint = await requestFingerprint(req);

    const { data: duplicate, error: duplicateError } = await admin
      .from("svc_client_profiles")
      .select("user_id")
      .eq("phone_number", phoneNumber)
      .eq("phone_verified", true)
      .neq("user_id", user.id)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return json({ ok: false, error: "phone_already_used", correlation_id: correlationId }, 409);
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();

    const { count: recentMinuteCount, error: minuteError } = await admin
      .from("svc_phone_verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneMinuteAgo);
    if (minuteError) throw minuteError;
    if ((recentMinuteCount || 0) >= 1) {
      return json({ ok: false, error: "otp_recently_sent", retry_after_seconds: 60, correlation_id: correlationId }, 429);
    }

    const { count: recentWindowCount, error: windowError } = await admin
      .from("svc_phone_verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", tenMinutesAgo);
    if (windowError) throw windowError;
    if ((recentWindowCount || 0) >= 5) {
      return json({ ok: false, error: "otp_rate_limited", retry_after_seconds: 600, correlation_id: correlationId }, 429);
    }

    const { data: profile, error: profileError } = await admin
      .from("svc_client_profiles")
      .upsert({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
        email: user.email || null,
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        metadata_json: {
          source: "phone_verification_start",
          country_iso: countryIso,
        },
      }, { onConflict: "user_id", ignoreDuplicates: false })
      .select("id,user_id,phone_number,phone_verified")
      .single();
    if (profileError) throw profileError;

    if (profile?.phone_verified === true && profile?.phone_number === phoneNumber) {
      return json({ ok: true, already_verified: true, masked_phone: maskPhone(phoneNumber), correlation_id: correlationId });
    }

    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { data: attempt, error: insertError } = await admin
      .from("svc_phone_verification_attempts")
      .insert({
        user_id: user.id,
        phone_number: phoneNumber,
        country_code: countryCode,
        channel: "sms",
        provider: "twilio_verify",
        status: "pending",
        expires_at: expiresAt,
        ...fingerprint,
        metadata_json: {
          country_iso: countryIso,
          source: "mimi_servicios_client",
        },
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    let verificationSid: string | null = null;
    try {
      const verification = await twilioVerifyRequest("/Verifications", {
        To: phoneNumber,
        Channel: "sms",
        Locale: "es",
      });
      verificationSid = String(verification.sid || "");
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message : "sms_provider_error";
      await admin
        .from("svc_phone_verification_attempts")
        .update({ status: "failed", reason })
        .eq("id", attempt.id);
      throw sendError;
    }

    const { error: updateError } = await admin
      .from("svc_phone_verification_attempts")
      .update({
        status: "sent",
        provider_verification_sid: verificationSid,
        sent_at: nowIso,
      })
      .eq("id", attempt.id);
    if (updateError) throw updateError;

    await auditPhoneEvent(admin, {
      userId: user.id,
      eventType: "client_phone_otp_sent",
      entityId: attempt.id,
      req,
      metadata: {
        provider: "twilio_verify",
        channel: "sms",
        country_code: countryCode,
        country_iso: countryIso,
      },
    });

    phoneLog("phone_otp_sent", {
      correlation_id: correlationId,
      user_id: user.id,
      attempt_id: attempt.id,
      country_code: countryCode,
    });

    return json({
      ok: true,
      attempt_id: attempt.id,
      masked_phone: maskPhone(phoneNumber),
      expires_at: expiresAt,
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("phone_otp_send_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "sms_provider_not_configured" ? 503 :
      message.startsWith("sms_provider_error") ? 502 :
      message === "phone_invalid" ? 400 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
