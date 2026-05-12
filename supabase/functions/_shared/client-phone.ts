import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getCorrelationId(req: Request) {
  return (
    req.headers.get("x-correlation-id") ||
    req.headers.get("x-request-id") ||
    crypto.randomUUID()
  );
}

export function phoneLog(event: string, metadata: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    area: "mimi_client_phone_verification",
    event,
    at: new Date().toISOString(),
    ...metadata,
  }));
}

export async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return data.user;
}

export function requiredEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");
  return { supabaseUrl, serviceRoleKey, anonKey };
}

export function normalizeE164(value: unknown) {
  const cleaned = String(value || "").replace(/[^\d+]/g, "");
  const normalized = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) throw new Error("phone_invalid");
  return normalized;
}

export function normalizeCountryCode(value: unknown, phoneNumber: string) {
  const explicit = String(value || "").replace(/[^\d+]/g, "");
  if (/^\+[1-9][0-9]{0,3}$/.test(explicit)) return explicit;
  return phoneNumber.startsWith("+1") ? "+1" : "+54";
}

export function maskPhone(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${phoneNumber.slice(0, 4)} **** ${digits.slice(-4)}`;
}

export function normalizeOtp(value: unknown) {
  const code = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (!/^\d{4,8}$/.test(code)) throw new Error("otp_invalid");
  return code;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function requestFingerprint(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = req.headers.get("user-agent") || "";
  const secret = Deno.env.get("PHONE_VERIFICATION_AUDIT_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return {
    ip_hash: ip ? await sha256Hex(`${ip}:${secret}`) : null,
    user_agent_hash: userAgent ? await sha256Hex(`${userAgent}:${secret}`) : null,
  };
}

export function twilioConfig() {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID") || "";
  if (!accountSid || !authToken || !serviceSid) throw new Error("sms_provider_not_configured");
  return { accountSid, authToken, serviceSid };
}

export async function twilioVerifyRequest(path: string, params: Record<string, string>) {
  const { accountSid, authToken, serviceSid } = twilioConfig();
  const form = new URLSearchParams(params);
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.code || payload?.message || "sms_provider_error");
    throw new Error(`sms_provider_error:${message}`);
  }
  return payload as Record<string, unknown>;
}

export async function auditPhoneEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    userId: string;
    eventType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    req?: Request;
  },
) {
  const { error } = await admin.from("audit_logs").insert({
    user_id: input.userId,
    actor_type: "user",
    event_type: input.eventType,
    entity_type: "svc_client_phone",
    entity_id: input.entityId || input.userId,
    metadata: input.metadata || {},
    ip_address: input.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: input.req?.headers.get("user-agent") || null,
  });
  if (error) {
    phoneLog("phone_audit_log_failed", {
      event_type: input.eventType,
      entity_id: input.entityId || input.userId,
      error: error.message,
    });
  }
}
