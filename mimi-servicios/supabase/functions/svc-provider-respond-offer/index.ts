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
    const offerId = String(body.offer_id || body.offerId || "").trim();
    const accepted = body.accepted === true || String(body.action || "").toLowerCase() === "accept";
    if (!assertUuid(offerId)) return json({ ok: false, error: "offer_id_invalid" }, 400);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    if (!accepted) {
      const { data: provider, error: providerError } = await admin.from("svc_providers").select("id,user_id").eq("user_id", user.id).single();
      if (providerError) throw providerError;
      const { data: offer, error: offerError } = await admin
        .from("svc_request_offers")
        .update({ status: "REJECTED", responded_at: new Date().toISOString() })
        .eq("id", offerId)
        .eq("provider_id", provider.id)
        .eq("status", "PENDING")
        .select("*")
        .maybeSingle();
      if (offerError) throw offerError;
      if (!offer) {
        return json({ ok: false, rejected: false, error: "offer_not_pending_or_forbidden" }, 409);
      }
      const { data: requestRow } = await admin
        .from("svc_requests")
        .select("id,client_user_id,status")
        .eq("id", offer.request_id)
        .maybeSingle();
      if (requestRow?.client_user_id) {
        await createUserNotificationWithPush(admin, {
          userId: requestRow.client_user_id,
          type: "OFFER_REJECTED",
          title: "El prestador no tomó la solicitud",
          body: "Podés elegir otro prestador disponible o volver a buscar.",
          fallbackTag: `svc-request-${requestRow.id}-REJECTED`,
          data: {
            request_id: requestRow.id,
            offer_id: offer.id,
            status: requestRow.status || "PENDING_PROVIDER_RESPONSE",
            url: "/mimi-servicios/cliente.html",
          },
        });
      }
      return json({ ok: true, rejected: true, offer });
    }
    const { data: result, error } = await admin.rpc("svc_accept_offer_atomic", {
      p_offer_id: offerId,
      p_provider_user_id: user.id,
    });
    if (error) throw error;
    if (result?.ok === false) {
      return json({
        ok: false,
        accepted: false,
        error: String(result.error || result.reason || "offer_not_available"),
        result,
      }, 409);
    }
    const requestId = String(result?.request_id || "");
    let request = null;
    if (assertUuid(requestId)) {
      const { data: requestRow, error: requestError } = await admin.from("svc_requests").select("*").eq("id", requestId).single();
      if (requestError) throw requestError;
      request = requestRow;
      await createUserNotificationWithPush(admin, {
        userId: request.client_user_id,
        type: "OFFER_ACCEPTED",
        title: "Solicitud aceptada",
        body: "El prestador aceptó tu solicitud. Ya podés seguir el avance.",
        fallbackTag: `svc-request-${requestId}-ACCEPTED`,
        data: {
          request_id: requestId,
          offer_id: offerId,
          status: request.status || "ACCEPTED",
          url: "/mimi-servicios/cliente.html",
        },
      });
    }
    return json({ ok: true, accepted: true, result, request, service: request });
  } catch (error) {
    console.error("svc-provider-respond-offer error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "unexpected_error" }, error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
