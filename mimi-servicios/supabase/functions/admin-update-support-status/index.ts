import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const VALID_STATUS = new Set([
  "abierto",
  "en_proceso",
  "esperando_usuario",
  "resuelto"
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization");

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;

    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id,role,active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json();
    const conversationId = body?.conversation_id;
    const status = String(body?.status ?? "").trim();

    if (!conversationId) throw new Error("conversation_id required");
    if (!VALID_STATUS.has(status)) throw new Error("Invalid admin_status");

    const patch: Record<string, unknown> = {
      admin_status: status,
      assigned_admin_user_id: user.id,
      updated_at: new Date().toISOString()
    };

    if (status !== "esperando_usuario") {
      patch.unread_admin_count = 0;
    }

    const { data, error } = await supabase
      .from("svc_conversations")
      .update(patch)
      .eq("id", conversationId)
      .select("*")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      ok: true,
      conversation: data
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
