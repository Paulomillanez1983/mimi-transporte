import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return data.user;
}

function safeText(value: unknown, max = 4000) {
  return String(value || "").trim().slice(0, max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const deviceId = safeText(body.device_id, 120);
    const pushToken = safeText(body.push_token, 4096) || null;
    const platform = safeText(body.platform, 40) || "web";
    const notificationsEnabled = body.notifications_enabled !== false && Boolean(pushToken);
    const marketingOptIn = body.marketing_opt_in === true;

    if (deviceId.length < 6) return json({ ok: false, error: "device_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: provider } = await admin
      .from("svc_providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = provider?.id ? "provider" : "client";

    const { data: device, error: deviceError } = await admin
      .from("svc_user_devices")
      .upsert({
        user_id: user.id,
        device_id: deviceId,
        push_token: pushToken,
        platform,
        notifications_enabled: notificationsEnabled,
        marketing_opt_in: marketingOptIn,
        active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id,device_id" })
      .select("id,user_id,device_id,platform,notifications_enabled,active,last_seen_at")
      .single();

    if (deviceError) throw deviceError;

    if (pushToken) {
      await admin
        .from("push_tokens")
        .upsert({
          user_id: user.id,
          email: user.email || null,
          token: pushToken,
          platform,
          active: true,
          rol: role,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "token" });
    }

    return json({ ok: true, device });
  } catch (error) {
    console.error("svc-register-device error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : "unexpected_error" },
      error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400,
    );
  }
});
