import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Missing Supabase environment variables" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Invalid JWT", details: authError }, 401);
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id,active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return json({
        error: "Forbidden",
        details: adminError
      }, 403);
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

    if (error) {
      return json({
        error: "No se pudieron listar prestadores.",
        details: error
      }, 500);
    }

    return json({
      ok: true,
      providers: data ?? []
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Unexpected error"
    }, 500);
  }
});