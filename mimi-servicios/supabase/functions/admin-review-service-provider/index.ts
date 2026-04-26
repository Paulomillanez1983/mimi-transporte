import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization");

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) throw new Error("Invalid JWT");

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id,active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!adminUser) throw new Error("Forbidden");

    const {
      provider_id,
      action,
      notes = null
    } = await req.json();

    if (!provider_id) throw new Error("provider_id required");

    const validActions = ["approve", "reject", "needs_resubmission", "block"];
    if (!validActions.includes(action)) throw new Error("Invalid action");

    let providerPatch: Record<string, unknown> = {};
    let profilePatch: Record<string, unknown> = {};
    let docsPatch: Record<string, unknown> = {};

    switch (action) {
      case "approve":
        providerPatch = { approved: true, blocked: false };
        profilePatch = {
          kyc_status: "approved",
          review_status: "approved",
          reviewed_at: new Date().toISOString(),
          review_required: false
        };
        docsPatch = {
          review_status: "approved",
          review_notes: notes,
          reviewed_at: new Date().toISOString()
        };
        break;

      case "reject":
        providerPatch = { approved: false };
        profilePatch = {
          kyc_status: "rejected",
          review_status: "rejected",
          reviewed_at: new Date().toISOString(),
          review_required: true
        };
        docsPatch = {
          review_status: "rejected",
          review_notes: notes,
          reviewed_at: new Date().toISOString()
        };
        break;

      case "needs_resubmission":
        providerPatch = { approved: false };
        profilePatch = {
          kyc_status: "needs_resubmission",
          review_status: "needs_resubmission",
          reviewed_at: new Date().toISOString(),
          review_required: true
        };
        docsPatch = {
          review_status: "needs_resubmission",
          review_notes: notes,
          reviewed_at: new Date().toISOString()
        };
        break;

      case "block":
        providerPatch = { approved: false, blocked: true, status: "BLOCKED" };
        profilePatch = {
          kyc_status: "blocked",
          review_status: "blocked",
          reviewed_at: new Date().toISOString(),
          review_required: true
        };
        docsPatch = {
          review_status: "blocked",
          review_notes: notes,
          reviewed_at: new Date().toISOString()
        };
        break;
    }

    const { error: providerError } = await supabase
      .from("svc_providers")
      .update(providerPatch)
      .eq("id", provider_id);

    if (providerError) throw providerError;

    const { error: profileError } = await supabase
      .from("svc_provider_profiles")
      .update(profilePatch)
      .eq("provider_id", provider_id);

    if (profileError) throw profileError;

    const { error: docsError } = await supabase
      .from("svc_provider_documents")
      .update(docsPatch)
      .eq("provider_id", provider_id);

    if (docsError) throw docsError;

    return new Response(JSON.stringify({ ok: true }), {
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