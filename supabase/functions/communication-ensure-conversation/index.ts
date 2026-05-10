import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_TRIP_STATES = new Set(["ASIGNADO", "ACEPTADO", "EN_CAMINO", "INICIADO", "EN_CURSO"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 160) {
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
  return data.user;
}

async function resolveDriver(adminClient: any, trip: Record<string, unknown>) {
  const directUserId = String(trip.chofer_user_id || "").trim();
  const driverUuid = String(trip.assigned_driver_id || trip.chofer_id_uuid || "").trim();

  if (directUserId && UUID_RE.test(directUserId)) {
    return {
      driverUserId: directUserId,
      driverUuid,
      driverName: cleanText(trip.chofer_nombre || "Chofer", 80),
    };
  }

  if (!UUID_RE.test(driverUuid)) return null;

  const { data, error } = await adminClient
    .from("choferes")
    .select("id_uuid,user_id,nombre,email")
    .eq("id_uuid", driverUuid)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) return null;

  return {
    driverUserId: String(data.user_id),
    driverUuid,
    driverName: cleanText(data.nombre || data.email || trip.chofer_nombre || "Chofer", 80),
  };
}

async function ensureTripConversation(adminClient: any, user: any, tripId: string) {
  const { data: trip, error } = await adminClient
    .from("viajes")
    .select(`
      id,
      estado,
      cliente_auth_id,
      cliente_email,
      cliente,
      assigned_driver_id,
      chofer_id_uuid,
      chofer_user_id,
      chofer_nombre
    `)
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw error;
  if (!trip) throw new Error("trip_not_found");

  const state = String(trip.estado || "").trim().toUpperCase();
  if (!ACTIVE_TRIP_STATES.has(state)) throw new Error("trip_not_active_for_chat");

  const driver = await resolveDriver(adminClient, trip);
  if (!driver?.driverUserId) throw new Error("driver_user_not_found");

  const clientUserId = String(trip.cliente_auth_id || "").trim();
  const emailMatches =
    !clientUserId &&
    String(trip.cliente_email || "").trim().toLowerCase() === String(user.email || "").trim().toLowerCase();
  const isClient = clientUserId === user.id || emailMatches;
  const isDriver = driver.driverUserId === user.id;

  if (!isClient && !isDriver) throw new Error("trip_conversation_forbidden");
  const resolvedClientUserId = clientUserId || (emailMatches ? user.id : "");
  if (!resolvedClientUserId) throw new Error("client_user_not_found");

  const metadata = {
    thread_kind: "client_driver_trip",
    context_type: "trip",
    viaje_id: tripId,
    trip_state: state,
    client_user_id: resolvedClientUserId,
    driver_user_id: driver.driverUserId,
    driver_id_uuid: driver.driverUuid || "",
    client_name: cleanText(trip.cliente || "Cliente", 80),
    driver_name: driver.driverName,
  };

  const { data: existing, error: existingError } = await adminClient
    .from("svc_conversations")
    .select("*")
    .eq("app_context", "transport")
    .contains("metadata_json", { thread_kind: "client_driver_trip", viaje_id: tripId })
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) throw existingError;
  if (Array.isArray(existing) && existing[0]?.id) {
    return existing[0];
  }

  const { data: conversation, error: createError } = await adminClient
    .from("svc_conversations")
    .insert({
      request_id: null,
      client_user_id: resolvedClientUserId,
      provider_user_id: driver.driverUserId,
      status: "OPEN",
      app_context: "transport",
      subject: `Chat viaje ${tripId}`,
      participant_role: isDriver ? "driver" : "client",
      admin_status: "abierto",
      metadata_json: metadata,
    })
    .select("*")
    .single();

  if (createError) throw createError;
  return conversation;
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
    const contextType = String(body?.context_type || body?.contextType || "").trim().toLowerCase();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (contextType !== "trip") {
      return json({ ok: false, error: "context_type_not_supported" }, 400);
    }

    const tripId = assertUuid(body?.trip_id || body?.tripId || body?.viaje_id || body?.viajeId, "trip_id");
    const conversation = await ensureTripConversation(adminClient, user, tripId);

    return json({ ok: true, conversation });
  } catch (error) {
    console.error("communication-ensure-conversation error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message.includes("_forbidden") ? 403 :
      message.includes("_not_found") ? 404 :
      message.includes("_not_active") || message.includes("_closed") ? 409 :
      400;
    return json({ ok: false, error: message }, status);
  }
});
