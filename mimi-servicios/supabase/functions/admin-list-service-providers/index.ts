import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("id,email,active,is_super_admin")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data, error } = await supabase
      .from("svc_providers")
      .select(`
        id,
        user_id,
        full_name,
        email,
        phone,
        avatar_url,
        approved,
        blocked,
        status,
        created_at,
        updated_at,
        svc_provider_profiles (
          bio,
          years_experience,
          kyc_status,
          review_status,
          ai_score,
          ai_score_label,
          review_required,
          risk_flags,
          reviewed_at
        ),
        svc_provider_documents (
          id,
          document_type,
          storage_path,
          storage_bucket,
          review_status,
          review_notes,
          reviewed_at,
          metadata_json,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, providers: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unexpected error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});