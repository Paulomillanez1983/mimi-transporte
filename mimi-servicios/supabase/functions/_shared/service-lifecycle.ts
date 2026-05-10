import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createUserNotificationWithPush } from "./push-notifications.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function assertUuid(value: unknown) {
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

function env() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("SUPABASE_ENV_MISSING");
  }

  return { supabaseUrl, serviceRoleKey, anonKey };
}

async function providerForUser(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin
    .from("svc_providers")
    .select("id,user_id,approved,blocked,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("provider_not_found");
  if (data.approved !== true || data.blocked === true) throw new Error("provider_not_allowed");

  return data;
}

async function requestForProvider(admin: ReturnType<typeof createClient>, requestId: string, providerId: string) {
  const { data, error } = await admin
    .from("svc_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("request_not_found");
  if (data.accepted_provider_id !== providerId) throw new Error("request_forbidden");

  return data;
}

function statusCodeForError(error: unknown) {
  const message = messageForError(error);
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "request_forbidden" || message === "provider_not_allowed") return 403;
  if (message.endsWith("_invalid")) return 400;
  if (message.endsWith("_not_found")) return 404;
  if (message === "invalid_request_status") return 409;
  return 400;
}

function messageForError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (message) return String(message);
  }
  const fallback = String(error || "").trim();
  return fallback && fallback !== "[object Object]" ? fallback : "unexpected_error";
}

type TransitionConfig = {
  functionName: string;
  allowedStatuses: string[];
  targetStatus: string;
  timestampColumn: "en_route_at" | "arrived_at" | "started_at";
  providerStatus: string;
  notificationType: string;
  notificationTitle: string;
  notificationBody: string;
};

export async function handleProviderTransition(req: Request, config: TransitionConfig) {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = env();
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const provider = await providerForUser(admin, user.id);
    const request = await requestForProvider(admin, requestId, provider.id);

    if (request.status === config.targetStatus) {
      return json({ ok: true, already_processed: true, request, service: request });
    }

    if (!config.allowedStatuses.includes(String(request.status))) {
      return json({
        ok: false,
        error: "invalid_request_status",
        status: request.status,
        expected: config.allowedStatuses,
      }, 409);
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: config.targetStatus,
      updated_at: now,
      [config.timestampColumn]: now,
    };

    const { data: updatedRequest, error: updateError } = await admin
      .from("svc_requests")
      .update(patch)
      .eq("id", requestId)
      .eq("accepted_provider_id", provider.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await admin
      .from("svc_providers")
      .update({ status: config.providerStatus, last_seen_at: now })
      .eq("id", provider.id);

    await createUserNotificationWithPush(admin, {
      userId: request.client_user_id,
      type: config.notificationType,
      title: config.notificationTitle,
      body: config.notificationBody,
      fallbackTag: `svc-request-${requestId}-${config.targetStatus}`,
      data: {
        request_id: requestId,
        status: config.targetStatus,
        url: "/mimi-servicios/cliente.html",
      },
    });

    return json({ ok: true, request: updatedRequest, service: updatedRequest });
  } catch (error) {
    console.error(`${config.functionName} error:`, error);
    return json(
      { ok: false, error: messageForError(error) },
      statusCodeForError(error),
    );
  }
}

export async function handleProviderComplete(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const { supabaseUrl, serviceRoleKey, anonKey } = env();
    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const provider = await providerForUser(admin, user.id);
    const request = await requestForProvider(admin, requestId, provider.id);

    if (request.status === "COMPLETED") {
      return json({ ok: true, already_processed: true, request, service: request });
    }

    if (request.status !== "IN_PROGRESS") {
      return json({
        ok: false,
        error: "invalid_request_status",
        status: request.status,
        expected: ["IN_PROGRESS"],
      }, 409);
    }

    const { data: result, error: rpcError } = await admin.rpc("svc_complete_service_atomic", {
      p_request_id: requestId,
      p_provider_user_id: user.id,
    });

    if (rpcError) throw rpcError;

    const now = new Date().toISOString();
    await admin
      .from("svc_assignments")
      .update({ status: "COMPLETED", completed_at: now, updated_at: now })
      .eq("request_id", requestId)
      .eq("provider_id", provider.id)
      .eq("status", "ACTIVE");

    await admin
      .from("svc_providers")
      .update({ status: "ONLINE_IDLE", last_seen_at: now })
      .eq("id", provider.id);

    const { data: updatedRequest, error: requestError } = await admin
      .from("svc_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError) throw requestError;

    await createUserNotificationWithPush(admin, {
      userId: request.client_user_id,
      type: "REQUEST_COMPLETED",
      title: "Servicio completado",
      body: "El prestador marcó el servicio como completado.",
      fallbackTag: `svc-request-${requestId}-COMPLETED`,
      data: {
        request_id: requestId,
        status: "COMPLETED",
        url: "/mimi-servicios/cliente.html",
      },
    });

    return json({ ok: true, result, request: updatedRequest, service: updatedRequest });
  } catch (error) {
    console.error("svc-complete-service error:", error);
    return json(
      { ok: false, error: messageForError(error) },
      statusCodeForError(error),
    );
  }
}
