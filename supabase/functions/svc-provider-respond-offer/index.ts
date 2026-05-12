import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createUserNotificationWithPush } from "../_shared/push-notifications.ts";
import {
  getCorrelationId,
  lifecycleLog,
  sanitizeLifecycleRequest,
} from "../_shared/service-lifecycle.ts";

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

function randomPin() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return value.toString().padStart(4, "0");
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

async function pinHash(pin: string, requestId: string, secret: string) {
  const input = new TextEncoder().encode(`${requestId}:${pin}:${secret}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

async function encryptPin(pin: string, requestId: string, secret: string) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify({ pin, request_id: requestId }));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));

  return JSON.stringify({
    v: 1,
    alg: "AES-GCM-SHA256",
    iv: bytesToBase64(iv),
    data: bytesToBase64(cipher),
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  const correlationId = getCorrelationId(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const pinSecret = Deno.env.get("SERVICE_PIN_SECRET") || serviceRoleKey;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const offerId = String(body.offer_id || body.offerId || "").trim();
    const accepted = body.accepted === true || String(body.action || "").toLowerCase() === "accept";
    if (!assertUuid(offerId)) return json({ ok: false, error: "offer_id_invalid", correlation_id: correlationId }, 400);
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
        return json({ ok: false, rejected: false, error: "offer_not_pending_or_forbidden", correlation_id: correlationId }, 409);
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
      lifecycleLog("offer_rejected", {
        correlation_id: correlationId,
        offer_id: offer.id,
        request_id: offer.request_id,
        provider_id: provider.id,
      });

      return json({ ok: true, rejected: true, offer, correlation_id: correlationId });
    }
    const { data: offerForPin, error: pinOfferError } = await admin
      .from("svc_request_offers")
      .select("request_id")
      .eq("id", offerId)
      .maybeSingle();

    if (pinOfferError) throw pinOfferError;
    if (!offerForPin?.request_id) return json({ ok: false, error: "offer_not_found", correlation_id: correlationId }, 404);

    const pin = randomPin();
    const pinExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const [servicePinHash, servicePinCiphertext] = await Promise.all([
      pinHash(pin, offerForPin.request_id, pinSecret),
      encryptPin(pin, offerForPin.request_id, pinSecret),
    ]);

    const { data: result, error } = await admin.rpc("svc_accept_offer_atomic", {
      p_offer_id: offerId,
      p_provider_user_id: user.id,
      p_pin_hash: servicePinHash,
      p_pin_ciphertext: servicePinCiphertext,
      p_pin_expires_at: pinExpiresAt,
    });
    if (error) throw error;
    if (result?.ok === false) {
      return json({
        ok: false,
        accepted: false,
        error: String(result.error || result.reason || "offer_not_available"),
        result,
        correlation_id: correlationId,
      }, 409);
    }
    const requestId = String(result?.request_id || "");
    let request: Record<string, unknown> | null = null;
    if (assertUuid(requestId)) {
      const { data: requestRow, error: requestError } = await admin.from("svc_requests").select("*").eq("id", requestId).single();
      if (requestError) throw requestError;
      request = sanitizeLifecycleRequest(requestRow);
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
          pin_ready: "true",
          url: "/mimi-servicios/cliente.html",
        },
      });
    }
    lifecycleLog("offer_accepted", {
      correlation_id: correlationId,
      offer_id: offerId,
      request_id: requestId,
      request_status: request?.status ?? result?.request_status,
      pin_generated: true,
    });

    return json({ ok: true, accepted: true, result, request, service: request, correlation_id: correlationId });
  } catch (error) {
    console.error("svc-provider-respond-offer error:", { correlation_id: correlationId, error });
    return json({ ok: false, error: error instanceof Error ? error.message : "unexpected_error", correlation_id: correlationId }, error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
