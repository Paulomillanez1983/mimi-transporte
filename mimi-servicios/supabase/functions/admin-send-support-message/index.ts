import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

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
    const message = String(body?.message ?? "").trim();
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

    if (!conversationId) throw new Error("conversation_id required");
    if (!message && !attachments.length) throw new Error("message or attachments required");

    const { data: conversation, error: conversationError } = await supabase
      .from("svc_conversations")
      .select("id,status")
      .eq("id", conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("conversation_not_found");
    if (String(conversation.status || "").toUpperCase() !== "OPEN") {
      throw new Error("conversation_closed");
    }

    const { data: inserted, error: insertError } = await supabase
      .from("svc_messages")
      .insert({
        conversation_id: conversationId,
        sender_user_id: user.id,
        sender_role: "admin",
        message_type: attachments.length ? "mixed" : "text",
        body: message || "Adjunto enviado",
        metadata_json: {
          source: "admin",
          admin_email: user.email ?? null,
          admin_name:
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            user.email ??
            null
        },
        attachments_json: attachments,
        delivery_status: "SENT"
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    const preview = message || "Adjunto enviado";
    const { error: updateError } = await supabase
      .from("svc_conversations")
      .update({
        admin_status: "en_proceso",
        assigned_admin_user_id: user.id,
        unread_admin_count: 0,
        last_message_preview: preview.slice(0, 220),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      ok: true,
      message: inserted
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
