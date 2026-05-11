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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizePin(value: unknown) {
  const pin = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (!/^\d{4}$/.test(pin)) throw new Error("pin_invalid");
  return pin;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pinHash(pin: string, requestId: string, secret: string) {
  const input = new TextEncoder().encode(`${requestId}:${pin}:${secret}`);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
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
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const pinSecret = Deno.env.get("SERVICE_PIN_SECRET") || serviceRoleKey;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    const pin = normalizePin(body.pin || body.service_pin);
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: provider, error: providerError } = await admin
      .from("svc_providers")
      .select("id,user_id,approved,blocked,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider) return json({ ok: false, error: "provider_not_found" }, 404);
    if (provider.approved !== true || provider.blocked === true) return json({ ok: false, error: "provider_not_allowed" }, 403);

    const { data: request, error: requestError } = await admin
      .from("svc_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) return json({ ok: false, error: "request_not_found" }, 404);
    if (request.accepted_provider_id !== provider.id) return json({ ok: false, error: "request_forbidden" }, 403);

    if (request.status === "IN_PROGRESS") {
      return json({ ok: true, already_processed: true, request, service: request });
    }

    if (!["PROVIDER_ARRIVED", "PROVIDER_EN_ROUTE", "ACCEPTED", "SCHEDULED"].includes(String(request.status))) {
      return json({ ok: false, error: "invalid_request_status", status: request.status }, 409);
    }

    if (!request.service_pin_hash) return json({ ok: false, error: "pin_not_ready" }, 409);
    if (request.service_pin_verified_at) return json({ ok: false, error: "pin_already_used" }, 409);
    if (request.service_pin_expires_at && new Date(request.service_pin_expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "pin_expired" }, 409);
    }
    if (request.service_pin_locked_until && new Date(request.service_pin_locked_until).getTime() > Date.now()) {
      return json({ ok: false, error: "pin_temporarily_locked" }, 429);
    }

    const submittedHash = await pinHash(pin, requestId, pinSecret);
    if (submittedHash !== request.service_pin_hash) {
      const attempts = Number(request.service_pin_attempts || 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null;
      await admin
        .from("svc_requests")
        .update({
          service_pin_attempts: attempts,
          service_pin_locked_until: lockedUntil,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      await admin.rpc("svc_log_request_event", {
        p_request_id: requestId,
        p_event_type: "service_pin_failed",
        p_actor_user_id: user.id,
        p_provider_id: provider.id,
        p_metadata: { attempts, locked_until: lockedUntil },
      });

      return json({ ok: false, error: lockedUntil ? "pin_temporarily_locked" : "pin_incorrect", attempts }, lockedUntil ? 429 : 409);
    }

    const now = new Date().toISOString();
    const { data: updatedRequest, error: updateError } = await admin
      .from("svc_requests")
      .update({
        status: "IN_PROGRESS",
        started_at: now,
        service_pin_verified_at: now,
        service_pin_attempts: 0,
        service_pin_locked_until: null,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("accepted_provider_id", provider.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await admin
      .from("svc_providers")
      .update({ status: "IN_SERVICE", last_seen_at: now })
      .eq("id", provider.id);

    await admin.rpc("svc_log_request_event", {
      p_request_id: requestId,
      p_event_type: "service_pin_verified",
      p_actor_user_id: user.id,
      p_provider_id: provider.id,
      p_metadata: { status: "IN_PROGRESS" },
    });

    await createUserNotificationWithPush(admin, {
      userId: request.client_user_id,
      type: "REQUEST_STARTED",
      title: "Servicio iniciado",
      body: "El codigo fue validado y el servicio ya esta en curso.",
      fallbackTag: `svc-request-${requestId}-IN_PROGRESS`,
      data: {
        request_id: requestId,
        status: "IN_PROGRESS",
        url: "/mimi-servicios/cliente.html",
      },
    });

    return json({ ok: true, request: updatedRequest, service: updatedRequest });
  } catch (error) {
    console.error("svc-start-service error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "pin_invalid" ? 400 : 400;
    return json({ ok: false, error: message }, status);
  }
});
