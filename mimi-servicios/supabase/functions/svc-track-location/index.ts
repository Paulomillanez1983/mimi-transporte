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

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    const lat = asNumber(body.lat);
    const lng = asNumber(body.lng);

    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return json({ ok: false, error: "coordinates_invalid" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: provider, error: providerError } = await admin
      .from("svc_providers")
      .select("id,user_id,approved,blocked")
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider || provider.approved !== true || provider.blocked === true) {
      return json({ ok: false, error: "provider_not_allowed" }, 403);
    }

    const { data: requestRow, error: requestError } = await admin
      .from("svc_requests")
      .select("id,accepted_provider_id,status")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestRow) return json({ ok: false, error: "request_not_found" }, 404);
    if (requestRow.accepted_provider_id !== provider.id) return json({ ok: false, error: "request_forbidden" }, 403);
    if (!["ACCEPTED", "PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(String(requestRow.status))) {
      return json({ ok: false, error: "tracking_status_not_allowed", status: requestRow.status }, 409);
    }

    const now = new Date().toISOString();
    const { data: tracking, error: trackingError } = await admin
      .from("svc_tracking")
      .insert({
        request_id: requestId,
        provider_id: provider.id,
        lat,
        lng,
        accuracy: asNumber(body.accuracy),
        heading: asNumber(body.heading),
        speed: asNumber(body.speed),
        tracked_at: now,
      })
      .select("*")
      .single();

    if (trackingError) throw trackingError;

    await admin
      .from("svc_providers")
      .update({ last_lat: lat, last_lng: lng, last_seen_at: now })
      .eq("id", provider.id);

    return json({ ok: true, tracking });
  } catch (error) {
    console.error("svc-track-location error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    return json({ ok: false, error: message }, message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
