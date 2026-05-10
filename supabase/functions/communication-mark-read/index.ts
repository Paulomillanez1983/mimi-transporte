import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  return data.user;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const conversationId = assertUuid(body?.conversation_id || body?.conversationId, "conversation_id");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: conversation, error: conversationError } = await adminClient
      .from("svc_conversations")
      .select("id,client_user_id,provider_user_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) return json({ ok: false, error: "conversation_not_found" }, 404);

    const allowed =
      conversation.client_user_id === user.id ||
      conversation.provider_user_id === user.id ||
      await isAdmin(adminClient, user.id);

    if (!allowed) return json({ ok: false, error: "conversation_forbidden" }, 403);

    const now = new Date().toISOString();
    const { data, error } = await adminClient
      .from("svc_messages")
      .update({ read_at: now, delivery_status: "READ" })
      .eq("conversation_id", conversationId)
      .neq("sender_user_id", user.id)
      .is("read_at", null)
      .select("id");

    if (error) throw error;

    return json({ ok: true, marked: Array.isArray(data) ? data.length : 0 });
  } catch (error) {
    console.error("communication-mark-read error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message.includes("_forbidden") ? 403 :
      message.includes("_not_found") ? 404 :
      400;
    return json({ ok: false, error: message }, status);
  }
});
