import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ACTORS = new Set(["user", "driver", "provider", "admin", "all"]);
const ALLOWED_METHODS = new Set(["checkbox_cta", "reaccept_modal", "forced_reaccept", "api"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeMethod(value: unknown) {
  const method = cleanText(value, "checkbox_cta").toLowerCase();
  return ALLOWED_METHODS.has(method) ? method : "checkbox_cta";
}

function normalizeActor(value: unknown) {
  const actor = cleanText(value, "user").toLowerCase();
  if (!ALLOWED_ACTORS.has(actor)) throw new Error("actor_type_invalid");
  return actor;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const actorType = normalizeActor(body.actor_type);
    const documentCode = cleanText(body.document_code).toLowerCase();
    const requestedVersion = cleanText(body.version || body.document_version);
    const acceptanceMethod = normalizeMethod(body.acceptance_method);
    const deviceId = cleanText(body.device_id).slice(0, 160) || null;

    if (!documentCode) return json({ ok: false, error: "document_code_required" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: document, error: documentError } = await admin
      .from("legal_documents")
      .select("code,actor_type,status")
      .eq("code", documentCode)
      .eq("status", "active")
      .maybeSingle();

    if (documentError) throw documentError;
    if (!document) return json({ ok: false, error: "legal_document_not_found" }, 404);
    if (![actorType, "all"].includes(String(document.actor_type))) {
      return json({ ok: false, error: "legal_document_actor_mismatch" }, 403);
    }

    let versionQuery = admin
      .from("legal_versions")
      .select("document_code,version,version_label,content_markdown,is_published,effective_at")
      .eq("document_code", documentCode)
      .eq("is_published", true)
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: false })
      .limit(1);

    if (requestedVersion) {
      versionQuery = admin
        .from("legal_versions")
        .select("document_code,version,version_label,content_markdown,is_published,effective_at")
        .eq("document_code", documentCode)
        .eq("version", requestedVersion)
        .eq("is_published", true)
        .limit(1);
    }

    const { data: versions, error: versionError } = await versionQuery;
    if (versionError) throw versionError;
    const version = versions?.[0] ?? null;
    if (!version) return json({ ok: false, error: "legal_version_not_found" }, 404);

    const documentHash = await sha256Hex(
      `${version.document_code}:${version.version}:${version.content_markdown || ""}`,
    );

    const storedActorType = actorType === "all" ? "user" : actorType;
    const { data: existing, error: existingError } = await admin
      .from("legal_acceptances")
      .select("id,user_id,actor_type,document_code,document_version,accepted_at")
      .eq("user_id", user.id)
      .eq("actor_type", storedActorType)
      .eq("document_code", documentCode)
      .eq("document_version", version.version)
      .eq("accepted", true)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return json({ ok: true, already_accepted: true, acceptance: existing });

    const { data: acceptance, error: insertError } = await admin
      .from("legal_acceptances")
      .insert({
        user_id: user.id,
        actor_type: storedActorType,
        document_code: documentCode,
        document_version: version.version,
        accepted: true,
        acceptance_method: acceptanceMethod,
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        user_agent: req.headers.get("user-agent") || null,
        device_id: deviceId,
        document_hash_sha256: documentHash,
        evidence_payload: {
          source: "mimi_servicios",
          requested_actor_type: actorType,
          version_label: version.version_label || version.version,
        },
      })
      .select("id,user_id,actor_type,document_code,document_version,accepted_at")
      .single();

    if (insertError) throw insertError;

    return json({ ok: true, acceptance });
  } catch (error) {
    console.error("accept-legal-document error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    const status = message === "AUTH_REQUIRED" ? 401 : 400;
    return json({ ok: false, error: message }, status);
  }
});
