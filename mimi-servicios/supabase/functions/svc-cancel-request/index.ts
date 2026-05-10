import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createUserNotificationWithPush } from "../_shared/push-notifications.ts";

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

function assertUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    const reason = String(body.reason || "cancelled_from_ui").trim();
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: requestBefore } = await admin
      .from("svc_requests")
      .select("id,client_user_id,selected_provider_id,accepted_provider_id,status")
      .eq("id", requestId)
      .maybeSingle();
    const { data, error } = await admin.rpc("svc_cancel_request_atomic", {
      p_request_id: requestId,
      p_actor_user_id: user.id,
      p_reason: reason,
    });
    if (error) throw error;
    const providerId = requestBefore?.accepted_provider_id || requestBefore?.selected_provider_id || null;
    if (providerId && requestBefore?.client_user_id === user.id) {
      const { data: provider } = await admin
        .from("svc_providers")
        .select("user_id")
        .eq("id", providerId)
        .maybeSingle();
      if (provider?.user_id) {
        await createUserNotificationWithPush(admin, {
          userId: provider.user_id,
          type: "REQUEST_CANCELLED",
          title: "Solicitud cancelada",
          body: "El cliente canceló la solicitud de servicio.",
          fallbackTag: `svc-request-${requestId}-CANCELLED`,
          data: {
            request_id: requestId,
            status: "CANCELLED",
            url: "/mimi-servicios/prestador.html",
          },
        });
      }
    }
    return json({ ok: true, result: data, request_id: requestId });
  } catch (error) {
    console.error("svc-cancel-request error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "unexpected_error" }, error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
