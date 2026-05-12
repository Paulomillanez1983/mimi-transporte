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
    const device = await deviceContextFromBody(req, body, user.id);
    const context = await resolveActorContext(admin, user, actorRole);
    const risk = await evaluateAuthRisk(admin, context, device, purpose);

    phoneLog("auth_risk_evaluated", {
      correlation_id: correlationId,
      user_id: user.id,
      actor_role: actorRole,
      purpose,
      risk_level: risk.risk_level,
      risk_score: risk.risk_score,
      requires_otp: risk.requires_otp,
    });

    return json({
      ok: true,
      actor_role: actorRole,
      purpose,
      sms_configured: smsConfigured(),
      phone_verified: risk.phone_verified,
      trusted_device: risk.trusted_device,
      trusted_until: risk.trusted_until,
      requires_otp: risk.requires_otp,
      risk_level: risk.risk_level,
      risk_score: risk.risk_score,
      reasons: risk.reasons,
      profile: {
        phone_number: context.profile?.phone_number ?? null,
        phone_verified: context.profile?.phone_verified === true,
        trusted_until: context.profile?.trusted_until ?? null,
      },
      correlation_id: correlationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("auth_risk_failed", { correlation_id: correlationId, error: message });
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "provider_profile_not_found" ? 404 :
      400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
