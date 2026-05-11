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

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptPin(ciphertext: string, secret: string) {
  const payload = JSON.parse(ciphertext);
  if (payload?.v !== 1 || !payload?.iv || !payload?.data) throw new Error("pin_payload_invalid");

  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt"]);
  const decoded = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  return JSON.parse(new TextDecoder().decode(decoded));
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
    const pinSecret = Deno.env.get("SERVICE_PIN_SECRET") || serviceRoleKey;
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: request, error } = await admin
      .from("svc_requests")
      .select("id,client_user_id,status,service_pin_ciphertext,service_pin_expires_at,service_pin_verified_at")
      .eq("id", requestId)
      .maybeSingle();

    if (error) throw error;
    if (!request) return json({ ok: false, error: "request_not_found" }, 404);
    if (request.client_user_id !== user.id) return json({ ok: false, error: "request_forbidden" }, 403);
    if (!request.service_pin_ciphertext) return json({ ok: false, error: "pin_not_ready" }, 409);
    if (request.service_pin_verified_at) return json({ ok: false, error: "pin_already_used" }, 409);
    if (request.service_pin_expires_at && new Date(request.service_pin_expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "pin_expired" }, 409);
    }

    const decrypted = await decryptPin(request.service_pin_ciphertext, pinSecret);
    if (String(decrypted.request_id) !== request.id || !/^\d{4}$/.test(String(decrypted.pin || ""))) {
      return json({ ok: false, error: "pin_payload_invalid" }, 500);
    }

    return json({
      ok: true,
      request_id: request.id,
      pin: decrypted.pin,
      expires_at: request.service_pin_expires_at,
    });
  } catch (error) {
    console.error("svc-get-service-pin error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    return json({ ok: false, error: message }, message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
