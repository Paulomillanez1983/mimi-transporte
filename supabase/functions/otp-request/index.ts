import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders,
  getCorrelationId,
  json,
  maskPhone,
  requiredEnv,
  requireUser,
  phoneLog,
} from "../_shared/client-phone.ts";
import {
  actorRoleFromBody,
  countryForPhone,
  createOtpAttemptAndSend,
  deviceContextFromBody,
  evaluateAuthRisk,
  phoneForContext,
  purposeFromBody,
  resolveActorContext,
  smsConfigured,
} from "../_shared/auth-otp.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const correlationId = getCorrelationId(req);

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = requiredEnv();
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const actorRole = actorRoleFromBody(body);
    const purpose = purposeFromBody(body);
    const context = await resolveActorContext(admin, user, actorRole);
    const device = await deviceContextFromBody(req, body, user.id);
    const phoneNumber = phoneForContext(context, body.phone_number || body.phoneNumber);
    const countryCode = countryForPhone(body.country_code || body.countryCode, phoneNumber);
    const countryIso = String(body.country_iso || body.countryIso || "").trim().toUpperCase().slice(0, 2) || null;
    const risk = await evaluateAuthRisk(admin, context, device, purpose);

    if (!smsConfigured()) {
      return json({
        ok: false,
        error: "sms_provider_not_configured",
        sms_configured: false,
        correlation_id: correlationId,
      }, 503);
    }

    if (risk.risk_level === "blocked") {
      return json({
        ok: false,
        error: "auth_risk_blocked",
        risk_level: risk.risk_level,
        reasons: risk.reasons,
        correlation_id: correlationId,
      }, 403);
    }

    if (!risk.requires_otp && context.profile?.phone_verified === true && context.profile?.phone_number === phoneNumber) {
      return json({
        ok: true,
        already_trusted: true,
        masked_phone: maskPhone(phoneNumber),
        trusted_until: risk.trusted_until,
        correlation_id: correlationId,
      });
    }

    const result = await createOtpAttemptAndSend(admin, {
      context,
      device,
      req,
      phoneNumber,
      countryCode,
      countryIso,
      purpose,
      risk,
      preferredChannel: body.channel ? String(body.channel) : null,
    });

    if (!result.ok) {
      return json({ ...result, correlation_id: correlationId }, result.status || 429);
    }

    phoneLog("enterprise_otp_requested", {
      correlation_id: correlationId,
      user_id: user.id,
      actor_role: actorRole,
      purpose,
      channel: result.channel,
      reused: result.reused === true,
      risk_level: risk.risk_level,
    });

    return json({
      ...result,
      sms_configured: true,
      risk_level: risk.risk_level,
      requires_otp: true,
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("enterprise_otp_request_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "phone_invalid" ? 400 :
      message === "provider_profile_not_found" ? 404 :
      message === "sms_provider_not_configured" ? 503 :
      message.startsWith("sms_provider_error") ? 502 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
