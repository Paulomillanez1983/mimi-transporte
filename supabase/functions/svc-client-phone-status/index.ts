import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders,
  getCorrelationId,
  json,
  phoneLog,
  requiredEnv,
  requireUser,
} from "../_shared/client-phone.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (!["GET", "POST"].includes(req.method)) return json({ ok: false, error: "method_not_allowed" }, 405);
  const correlationId = getCorrelationId(req);

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = requiredEnv();
    const user = await requireUser(req, supabaseUrl, anonKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const smsConfigured = Boolean(
      Deno.env.get("TWILIO_ACCOUNT_SID") &&
      Deno.env.get("TWILIO_AUTH_TOKEN") &&
      Deno.env.get("TWILIO_VERIFY_SERVICE_SID")
    );

    const profilePayload = {
      user_id: user.id,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || null,
      email: user.email || null,
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      metadata_json: {
        source: "google_oauth",
        last_status_sync_at: new Date().toISOString(),
      },
    };

    const { data: profile, error } = await admin
      .from("svc_client_profiles")
      .upsert(profilePayload, {
        onConflict: "user_id",
        ignoreDuplicates: false,
      })
      .select("id,user_id,full_name,email,avatar_url,phone_number,country_code,phone_verified,phone_verified_at,phone_updated_at,created_at,updated_at")
      .single();

    if (error) throw error;

    phoneLog("phone_status_loaded", {
      correlation_id: correlationId,
      user_id: user.id,
      phone_verified: profile?.phone_verified === true,
    });

    return json({ ok: true, profile, sms_configured: smsConfigured, correlation_id: correlationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    phoneLog("phone_status_failed", { correlation_id: correlationId, error: message });
    const status = message === "AUTH_REQUIRED" ? 401 : 400;
    return json({ ok: false, error: message, correlation_id: correlationId }, status);
  }
});
