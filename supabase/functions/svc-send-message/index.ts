import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSED_SERVICE_STATES = new Set(["COMPLETED", "CANCELLED", "EXPIRED"]);
const CLOSED_TRIP_STATES = new Set(["COMPLETADO", "CANCELADO", "CANCELADA", "SIN_CHOFER"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 2000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function assertUuid(value: unknown, label: string) {
  const text = String(value || "").trim();
  if (!UUID_RE.test(text)) throw new Error(`${label}_invalid`);
  return text;
}

async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");

  return { user: data.user, userClient: client };
}

async function isAdmin(adminClient: any, userId: string) {
  const { data } = await adminClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  return Boolean(data?.user_id);
}

function roleForConversation(conversation: Record<string, unknown>, userId: string, admin: boolean) {
  if (admin) return "admin";
  if (String(conversation.client_user_id || "") === userId) {
    const participantRole = String(conversation.participant_role || "").toLowerCase();
    if (participantRole === "driver" || participantRole === "chofer") return "driver";
    if (participantRole === "provider" || participantRole === "prestador") return "provider";
    return "client";
  }
  if (String(conversation.provider_user_id || "") === userId) {
    return String(conversation.app_context || "").toLowerCase() === "transport" ? "driver" : "provider";
  }
  return null;
}

async function assertConversationOpen(adminClient: any, conversation: Record<string, unknown>) {
  if (String(conversation.status || "").toUpperCase() !== "OPEN") {
    throw new Error("conversation_closed");
  }

  const requestId = conversation.request_id ? String(conversation.request_id) : "";
  if (requestId && UUID_RE.test(requestId)) {
    const { data: request, error } = await adminClient
      .from("svc_requests")
      .select("id,status")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw error;
    if (!request) throw new Error("request_not_found");
    if (CLOSED_SERVICE_STATES.has(String(request.status || "").toUpperCase())) {
      throw new Error("service_context_closed");
    }
  }

  const metadata = conversation.metadata_json && typeof conversation.metadata_json === "object"
    ? conversation.metadata_json as Record<string, unknown>
    : {};
  const tripId = metadata.viaje_id ? String(metadata.viaje_id) : "";
  if (tripId && UUID_RE.test(tripId)) {
    const { data: trip, error } = await adminClient
      .from("viajes")
      .select("id,estado")
      .eq("id", tripId)
      .maybeSingle();
    if (error) throw error;
    if (!trip) throw new Error("trip_not_found");
    if (CLOSED_TRIP_STATES.has(String(trip.estado || "").toUpperCase())) {
      throw new Error("trip_context_closed");
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const { user } = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const conversationId = assertUuid(body?.conversation_id || body?.conversationId, "conversation_id");
    const messageBody = cleanText(body?.body || body?.message, 2000);
    const attachments = Array.isArray(body?.attachments_json)
      ? body.attachments_json.slice(0, 8)
      : Array.isArray(body?.attachments)
        ? body.attachments.slice(0, 8)
        : [];
    const metadata = body?.metadata_json && typeof body.metadata_json === "object"
      ? body.metadata_json
      : body?.metadata && typeof body.metadata === "object"
        ? body.metadata
        : {};

    if (!messageBody && !attachments.length) return json({ ok: false, error: "body_required" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: conversation, error: conversationError } = await adminClient
      .from("svc_conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return json({ ok: false, error: "conversation_not_found" }, 404);

    const admin = await isAdmin(adminClient, user.id);
    const senderRole = roleForConversation(conversation, user.id, admin);
    if (!senderRole) return json({ ok: false, error: "conversation_forbidden" }, 403);

    await assertConversationOpen(adminClient, conversation);

    const { data: message, error: messageError } = await adminClient
      .from("svc_messages")
      .insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        sender_role: senderRole,
        message_type: attachments.length ? "MIXED" : "TEXT",
        body: messageBody || "Adjunto enviado",
        metadata_json: metadata,
        delivery_status: "SENT",
        attachments_json: attachments,
      })
      .select("*")
      .single();

    if (messageError) throw messageError;

    const now = new Date().toISOString();
    const conversationPatch: Record<string, unknown> = {
      last_message_at: now,
      last_message_preview: (messageBody || "Adjunto enviado").slice(0, 220),
      updated_at: now,
    };

    if (senderRole === "admin") {
      conversationPatch.admin_status = "esperando_usuario";
    } else if (!conversation.provider_user_id || admin) {
      conversationPatch.admin_status = "abierto";
      conversationPatch.unread_admin_count = Number(conversation.unread_admin_count || 0) + 1;
    }

    await adminClient
      .from("svc_conversations")
      .update(conversationPatch)
      .eq("id", conversationId);

    const recipientId = senderRole === "client"
      ? conversation.provider_user_id
      : senderRole === "provider" || senderRole === "driver"
        ? conversation.client_user_id
        : conversation.client_user_id || conversation.provider_user_id;

    if (recipientId && recipientId !== user.id) {
      await adminClient.from("svc_notifications").insert({
        user_id: recipientId,
        type: "NEW_MESSAGE",
        title: "Nuevo mensaje",
        body: (messageBody || "Adjunto enviado").slice(0, 120),
        data_json: {
          conversation_id: conversationId,
          message_id: message.id,
          app_context: conversation.app_context || null,
          request_id: conversation.request_id || null,
          metadata_json: conversation.metadata_json || {},
        },
        delivery_status: "PENDING",
      });
    }

    return json({ ok: true, message });
  } catch (error) {
    console.error("svc-send-message error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message.includes("_forbidden") ? 403 :
      message.includes("_not_found") ? 404 :
      message.includes("_closed") ? 409 :
      400;
    return json({ ok: false, error: message }, status);
  }
});
