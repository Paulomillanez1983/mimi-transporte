import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeRating(value: unknown) {
  const rating = Math.round(Number(value));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("rating_invalid");
  }
  return rating;
}

function normalizeComment(value: unknown) {
  const comment = String(value ?? "").trim().slice(0, 800);
  return comment.length ? comment : null;
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
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    const rating = normalizeRating(body.rating);
    const comment = normalizeComment(body.comment);

    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: request, error: requestError } = await admin
      .from("svc_requests")
      .select("id,client_user_id,selected_provider_id,accepted_provider_id,status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) return json({ ok: false, error: "request_not_found" }, 404);
    if (request.client_user_id !== user.id) return json({ ok: false, error: "request_forbidden" }, 403);
    if (String(request.status || "").toUpperCase() !== "COMPLETED") {
      return json({ ok: false, error: "request_not_completed" }, 409);
    }

    const providerId = request.accepted_provider_id || request.selected_provider_id;
    if (!providerId) return json({ ok: false, error: "provider_missing" }, 409);

    const { data: review, error: reviewError } = await admin
      .from("svc_reviews")
      .upsert(
        {
          request_id: request.id,
          client_user_id: user.id,
          provider_id: providerId,
          rating,
          comment,
        },
        { onConflict: "request_id" },
      )
      .select("*")
      .single();

    if (reviewError) throw reviewError;

    const { data: stats, error: statsError } = await admin
      .from("svc_reviews")
      .select("rating")
      .eq("provider_id", providerId);

    if (statsError) throw statsError;

    const count = stats?.length ?? 0;
    const average = count
      ? Number((stats.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count).toFixed(2))
      : 5;

    const { error: providerError } = await admin
      .from("svc_providers")
      .update({ rating_avg: average, rating_count: count })
      .eq("id", providerId);

    if (providerError) throw providerError;

    await admin.rpc("svc_log_request_event", {
      p_request_id: request.id,
      p_event_type: "request_reviewed",
      p_actor_user_id: user.id,
      p_provider_id: providerId,
      p_metadata: { rating },
    }).catch((error) => {
      console.warn("request_reviewed audit skipped:", error?.message ?? error);
    });

    return json({
      ok: true,
      review,
      provider: {
        id: providerId,
        rating_avg: average,
        rating_count: count,
      },
    });
  } catch (error) {
    console.error("svc-submit-review error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "rating_invalid" ? 400 : 500;
    return json({ ok: false, error: message }, status);
  }
});
