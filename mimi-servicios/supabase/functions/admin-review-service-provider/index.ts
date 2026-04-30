import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing Supabase environment variables" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ ok: false, error: "Invalid JWT", details: authError }, 401);
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id,active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return json({ ok: false, error: "Forbidden", details: adminError }, 403);
    }

    const body = await req.json().catch(() => ({}));

    const provider_id = String(body?.provider_id ?? "").trim();
    const action = String(body?.action ?? "").trim();
    const notes = body?.notes ? String(body.notes).trim() : null;

    if (!provider_id) {
      return json({ ok: false, error: "provider_id required" }, 400);
    }

    const validActions = ["approve", "reject", "needs_resubmission", "block"];

    if (!validActions.includes(action)) {
      return json({ ok: false, error: "Invalid action" }, 400);
    }

    const now = new Date().toISOString();

    const { data: provider, error: providerFetchError } = await supabase
      .from("svc_providers")
      .select("id,user_id,email,full_name,approved,blocked,status")
      .eq("id", provider_id)
      .maybeSingle();

    if (providerFetchError) {
      return json({ ok: false, error: "Provider fetch failed", details: providerFetchError }, 500);
    }

    if (!provider) {
      return json({ ok: false, error: "Provider not found" }, 404);
    }

    let providerPatch: Record<string, unknown> = {};
    let profilePatch: Record<string, unknown> = {};
    let docsPatch: Record<string, unknown> = {};

    if (action === "approve") {
       providerPatch = {
         approved: true,
         blocked: false,
         status: "OFFLINE"
      };
      profilePatch = {
        provider_id,
        kyc_status: "approved",
        review_status: "approved",
        reviewed_at: now,
        review_required: false
      };

      docsPatch = {
        review_status: "APPROVED",
        review_notes: notes,
        reviewed_at: now
      };
    }

    if (action === "reject") {
      providerPatch = {
        approved: false,
        blocked: false
      };

      profilePatch = {
        provider_id,
        kyc_status: "rejected",
        review_status: "rejected",
        reviewed_at: now,
        review_required: true
      };

      docsPatch = {
        review_status: "REJECTED",
        review_notes: notes || "Documentación rechazada por administración.",
        reviewed_at: now
      };
    }

    if (action === "needs_resubmission") {
      providerPatch = {
        approved: false,
        blocked: false
      };

      profilePatch = {
        provider_id,
        kyc_status: "needs_resubmission",
        review_status: "needs_resubmission",
        reviewed_at: now,
        review_required: true
      };

      docsPatch = {
        review_status: "REJECTED",
        review_notes: notes || "Documentación observada. Requiere reenvío.",
        reviewed_at: now
      };
    }

    if (action === "block") {
      providerPatch = {
        approved: false,
        blocked: true,
        status: "BLOCKED"
      };

      profilePatch = {
        provider_id,
        kyc_status: "blocked",
        review_status: "blocked",
        reviewed_at: now,
        review_required: true
      };

      docsPatch = {
        review_status: "REJECTED",
        review_notes: notes || "Prestador bloqueado por administración.",
        reviewed_at: now
      };
    }

    const { error: providerError } = await supabase
      .from("svc_providers")
      .update(providerPatch)
      .eq("id", provider_id);

    if (providerError) {
      return json({ ok: false, error: "Provider update failed", details: providerError }, 500);
    }

    const { data: existingProfile, error: profileCheckError } = await supabase
      .from("svc_provider_profiles")
      .select("provider_id")
      .eq("provider_id", provider_id)
      .maybeSingle();

    if (profileCheckError) {
      return json({ ok: false, error: "Profile check failed", details: profileCheckError }, 500);
    }

    if (existingProfile) {
      const { error: profileUpdateError } = await supabase
        .from("svc_provider_profiles")
        .update(profilePatch)
        .eq("provider_id", provider_id);

      if (profileUpdateError) {
        return json({ ok: false, error: "Profile update failed", details: profileUpdateError }, 500);
      }
    } else {
      const { error: profileInsertError } = await supabase
        .from("svc_provider_profiles")
        .insert(profilePatch);

      if (profileInsertError) {
        return json({ ok: false, error: "Profile insert failed", details: profileInsertError }, 500);
      }
    }

    const { error: docsError } = await supabase
      .from("svc_provider_documents")
      .update(docsPatch)
      .eq("provider_id", provider_id);

    if (docsError) {
      return json({ ok: false, error: "Documents update failed", details: docsError }, 500);
    }

    return json({
      ok: true,
      provider_id,
      action,
      updated_at: now
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error"
      },
      500
    );
  }
});