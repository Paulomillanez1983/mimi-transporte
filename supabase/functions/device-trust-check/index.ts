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
  evaluateAuthRisk,
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
    const device = await deviceContextFromBody(req, body, user.id);
    const context = await resolveActorContext(admin, user, actorRole);
    const risk = await evaluateAuthRisk(admin, context, device, "login_new_device");

    return json({
      ok: true,
      actor_role: actorRole,
      sms_configured: smsConfigured(),
      trusted_device: risk.trusted_device,
      trusted_until: risk.trusted_until,
      requires_otp: risk.requires_otp,
      phone_verified: risk.phone_verified,
      risk_level: risk.risk_level,
      reasons: risk.reasons,
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("device_trust_check_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "provider_profile_not_found" ? 404 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
