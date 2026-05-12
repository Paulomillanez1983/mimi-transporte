import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders,
  getCorrelationId,
  json,
  requiredEnv,
  requireUser,
  phoneLog,
} from "../_shared/client-phone.ts";
import {
  actorRoleFromBody,
  deviceContextFromBody,
  phoneForContext,
  resolveActorContext,
  verifyOtpAndTrustDevice,
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
    const context = await resolveActorContext(admin, user, actorRole);
    const device = await deviceContextFromBody(req, body, user.id);
    const attemptId = String(body.attempt_id || body.attemptId || "").trim();
    const phoneNumber = phoneForContext(context, body.phone_number || body.phoneNumber);
    const code = body.code || body.otp;

    if (!attemptId) {
      return json({ ok: false, error: "otp_attempt_required", correlation_id: correlationId }, 400);
    }

    const result = await verifyOtpAndTrustDevice(admin, {
      context,
      device,
      req,
      attemptId,
      phoneNumber,
      code: String(code || ""),
    });

    if (!result.ok) {
      return json({ ...result, correlation_id: correlationId }, result.status || 400);
    }

    phoneLog("enterprise_otp_verified", {
      correlation_id: correlationId,
      user_id: user.id,
      actor_role: actorRole,
      trusted_until: result.device_trust?.trusted_until ?? null,
    });

    return json({
      ...result,
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("enterprise_otp_verify_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "phone_invalid" || message === "otp_invalid" ? 400 :
      message === "provider_profile_not_found" ? 404 :
      message === "sms_provider_not_configured" ? 503 :
      message.startsWith("sms_provider_error") ? 502 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
