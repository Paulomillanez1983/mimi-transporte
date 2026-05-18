import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPPORTED_PROVIDERS = ["mock", "mercadopago", "mobbex", "stripe", "manual"] as const;
const SUPPORTED_ENVIRONMENTS = ["test", "production"] as const;
const PAYMENT_PROVIDER_DEFAULT = "mock";
const PAYMENT_ENVIRONMENT_DEFAULT = "test";

const REQUIRED_SECRETS: Record<string, string[]> = {
  mock: [],
  manual: [],
  mercadopago: ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"],
  mobbex: ["MOBBEX_API_KEY", "MOBBEX_ACCESS_TOKEN", "MOBBEX_ENTITY_ID", "MOBBEX_WEBHOOK_SECRET"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function fail(error: string, status = 400, details: Record<string, unknown> = {}) {
  return json({ ok: false, error, ...details }, status);
}

function normalizeProvider(value: unknown) {
  const provider = String(value ?? PAYMENT_PROVIDER_DEFAULT).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (provider === "mercado_pago") return "mercadopago";
  return SUPPORTED_PROVIDERS.includes(provider as typeof SUPPORTED_PROVIDERS[number])
    ? provider
    : null;
}

function normalizeEnvironment(value: unknown) {
  const environment = String(value ?? PAYMENT_ENVIRONMENT_DEFAULT).trim().toLowerCase();
  return SUPPORTED_ENVIRONMENTS.includes(environment as typeof SUPPORTED_ENVIRONMENTS[number])
    ? environment
    : null;
}

function realPaymentsEnabled() {
  return ["true", "1", "yes"].includes(String(Deno.env.get("PAYMENTS_REAL_ENABLED") ?? "false").toLowerCase());
}

function secretStatus(provider: string) {
  const required = REQUIRED_SECRETS[provider] ?? [];
  const present = required.filter((name) => Boolean(Deno.env.get(name)));
  const missing = required.filter((name) => !Deno.env.get(name));
  return {
    required,
    present,
    missing,
    all_present: missing.length === 0
  };
}

function publicWebhookUrl(req: Request, provider: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const projectUrl = supabaseUrl.replace(/\/rest\/v1\/?$/, "");
  if (!projectUrl) return null;
  return `${projectUrl}/functions/v1/payment-webhook?provider=${encodeURIComponent(provider)}`;
}

function safePublicMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    if (/secret|token|key|password|credential|signature|access/i.test(key)) delete copy[key];
  }
  return copy;
}

function correlationId(req: Request) {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function requireProviderManager(supabase: ReturnType<typeof createClient>, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false as const, response: fail("AUTH_REQUIRED", 401) };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { ok: false as const, response: fail("AUTH_INVALID", 401) };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id,email,active,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  const role = String(adminUser?.role ?? "").toUpperCase();
  const managerRoles = new Set(["SUPERADMIN", "SUPER_ADMIN", "FINANCE_ADMIN"]);
  if (adminError || !managerRoles.has(role)) {
    return { ok: false as const, response: fail("PAYMENT_PROVIDER_CONFIG_FORBIDDEN", 403) };
  }

  return { ok: true as const, user, role };
}

async function auditEvent(
  supabase: ReturnType<typeof createClient>,
  input: {
    action: string;
    actorUserId: string;
    provider?: string | null;
    environment?: string | null;
    traceId: string;
    correlationId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const eventKey = `admin.payment_provider.${input.action}.${input.actorUserId}.${input.traceId}`;
  await supabase.from("audit_financial_events").insert({
    event_key: eventKey,
    event_type: `admin.payment_provider.${input.action}`,
    actor_user_id: input.actorUserId,
    actor_type: "admin",
    source: "admin-payment-provider-config",
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.environment === "production" ? "production" : "qa",
    is_test: input.environment !== "production",
    fiscal_visibility: input.environment === "production" ? "fiscal_reportable" : "excluded_from_accounting",
    metadata: {
      provider: input.provider,
      environment: input.environment,
      secrets_exposed: false,
      payments_real_enabled: realPaymentsEnabled(),
      ...(input.metadata ?? {})
    }
  });
}

async function enforceRateLimit(supabase: ReturnType<typeof createClient>, actorUserId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("audit_financial_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", actorUserId)
    .like("event_type", "admin.payment_provider.%")
    .gte("created_at", since);

  return Number(count ?? 0) < 24;
}

async function getConfigs(supabase: ReturnType<typeof createClient>, req: Request) {
  const { data, error } = await supabase
    .from("payment_provider_config")
    .select("id,provider,environment,is_active,status,last_validated_at,last_validation_error,webhook_url,metadata_public,created_by,updated_by,created_at,updated_at")
    .order("environment", { ascending: true })
    .order("is_active", { ascending: false })
    .order("provider", { ascending: true });

  if (error) throw error;

  const { data: auditEvents } = await supabase
    .from("audit_financial_events")
    .select("event_type,actor_user_id,environment,is_test,metadata,created_at,trace_id")
    .like("event_type", "admin.payment_provider.%")
    .order("created_at", { ascending: false })
    .limit(8);

  const configuredProvider = normalizeProvider(Deno.env.get("PAYMENT_PROVIDER")) ?? PAYMENT_PROVIDER_DEFAULT;
  const configuredEnvironment = normalizeEnvironment(Deno.env.get("PAYMENT_ENVIRONMENT")) ?? PAYMENT_ENVIRONMENT_DEFAULT;
  const realEnabled = realPaymentsEnabled();
  const current = (data ?? []).find((row) => row.is_active && row.environment === configuredEnvironment)
    ?? (data ?? []).find((row) => row.is_active)
    ?? null;

  return {
    configs: data ?? [],
    current,
    supported_providers: SUPPORTED_PROVIDERS.map((provider) => ({
      provider,
      required_secrets: REQUIRED_SECRETS[provider] ?? [],
      webhook_url: publicWebhookUrl(req, provider),
      secret_status: {
        required_secret_names: secretStatus(provider).required,
        present_secret_names: secretStatus(provider).present,
        missing_secret_names: secretStatus(provider).missing,
        missing_secret_count: secretStatus(provider).missing.length,
        all_present: secretStatus(provider).all_present,
        secrets_exposed: false
      }
    })),
    runtime_flags: {
      PAYMENTS_REAL_ENABLED: realEnabled,
      PAYMENT_PROVIDER: configuredProvider,
      PAYMENT_ENVIRONMENT: configuredEnvironment,
      effective_provider_for_money: realEnabled ? (current?.provider ?? configuredProvider) : "mock",
      real_money_blocked: !realEnabled
    },
    audit_events: auditEvents ?? []
  };
}

async function validateProvider(supabase: ReturnType<typeof createClient>, req: Request, body: Record<string, unknown>, actorUserId: string, traceId: string, corrId: string) {
  const provider = normalizeProvider(body.provider);
  const environment = normalizeEnvironment(body.environment);
  if (!provider || !environment) return fail("PAYMENT_PROVIDER_INVALID", 400);

  const secrets = secretStatus(provider);
  const realEnabled = realPaymentsEnabled();
  const status = secrets.all_present
    ? environment === "production" && !realEnabled
      ? "disabled_real_payments"
      : "validated"
    : "missing_secrets";
  const validationError = secrets.all_present ? null : `Missing required secrets: ${secrets.missing.join(", ")}`;

  const { error } = await supabase
    .from("payment_provider_config")
    .upsert({
      provider,
      environment,
      is_active: Boolean(body.make_active) && (provider === "mock" || environment === "test" || realEnabled),
      status,
      last_validated_at: new Date().toISOString(),
      last_validation_error: validationError,
      webhook_url: publicWebhookUrl(req, provider),
      metadata_public: {
        ...(safePublicMetadata(body.metadata_public) as Record<string, unknown>),
        required_secrets: secrets.required,
        missing_secrets: secrets.missing,
        present_secret_names: secrets.present,
        missing_secret_count: secrets.missing.length,
        secrets_exposed: false,
        payments_real_enabled: realEnabled
      },
      updated_by: actorUserId
    }, { onConflict: "provider,environment" });

  if (error) throw error;

  await auditEvent(supabase, {
    action: "validate",
    actorUserId,
    provider,
    environment,
    traceId,
    correlationId: corrId,
    metadata: { status, missing_secret_names: secrets.missing, make_active_requested: Boolean(body.make_active) }
  });

  return json({
    ok: true,
    action: "validate_provider_config",
    provider,
    environment,
    status,
    required_secrets: secrets.required,
    missing_secrets: secrets.missing,
    present_secrets: secrets.present,
    secrets_exposed: false,
    webhook_url: publicWebhookUrl(req, provider),
    payments_real_enabled: realEnabled,
    trace_id: traceId
  });
}

async function setActiveProvider(supabase: ReturnType<typeof createClient>, req: Request, body: Record<string, unknown>, actorUserId: string, traceId: string, corrId: string) {
  const provider = normalizeProvider(body.provider);
  const environment = normalizeEnvironment(body.environment);
  const reason = String(body.reason ?? "").trim();
  if (!provider || !environment) return fail("PAYMENT_PROVIDER_INVALID", 400);
  if (reason.length < 10) return fail("CHANGE_REASON_REQUIRED", 400);

  const secrets = secretStatus(provider);
  const realEnabled = realPaymentsEnabled();
  if (!secrets.all_present) {
    return fail("PAYMENT_PROVIDER_SECRETS_MISSING", 409, {
      provider,
      environment,
      required_secrets: secrets.required,
      missing_secrets: secrets.missing,
      secrets_exposed: false,
      trace_id: traceId
    });
  }

  const status = environment === "production" && !realEnabled ? "disabled_real_payments" : "active";

  const { error: deactivateError } = await supabase
    .from("payment_provider_config")
    .update({ is_active: false, status: "inactive", updated_by: actorUserId })
    .eq("environment", environment)
    .neq("provider", provider);
  if (deactivateError) throw deactivateError;

  const { data, error } = await supabase
    .from("payment_provider_config")
    .upsert({
      provider,
      environment,
      is_active: true,
      status,
      last_validated_at: new Date().toISOString(),
      last_validation_error: null,
      webhook_url: publicWebhookUrl(req, provider),
      metadata_public: {
        ...safePublicMetadata(body.metadata_public),
        required_secrets: secrets.required,
        missing_secrets: [],
        present_secret_names: secrets.present,
        secrets_exposed: false,
        payments_real_enabled: realEnabled,
        applies_to: "new_payments_only"
      },
      created_by: actorUserId,
      updated_by: actorUserId
    }, { onConflict: "provider,environment" })
    .select("id,provider,environment,is_active,status,last_validated_at,webhook_url,metadata_public,created_at,updated_at")
    .single();

  if (error) throw error;

  await auditEvent(supabase, {
    action: "set_active",
    actorUserId,
    provider,
    environment,
    traceId,
    correlationId: corrId,
    metadata: { reason, status, applies_to: "new_payments_only" }
  });

  return json({
    ok: true,
    action: "set_active_provider",
    config: data,
    payments_real_enabled: realEnabled,
    real_money_blocked: !realEnabled,
    applies_to: "new_payments_only",
    secrets_exposed: false,
    trace_id: traceId
  });
}

function testConnectionResponse(req: Request, body: Record<string, unknown>, traceId: string) {
  const provider = normalizeProvider(body.provider);
  const environment = normalizeEnvironment(body.environment);
  if (!provider || !environment) return fail("PAYMENT_PROVIDER_INVALID", 400);

  const secrets = secretStatus(provider);
  const realEnabled = realPaymentsEnabled();
  const isPlaceholderProvider = provider === "mock" || provider === "manual";
  const blockedByFlag = environment === "production" && !realEnabled;
  const ok = secrets.all_present && (isPlaceholderProvider || !blockedByFlag);

  return json({
    ok,
    action: "test_connection",
    provider,
    environment,
    connection_status: ok
      ? "ready"
      : !secrets.all_present
        ? "missing_secrets"
        : "real_payments_disabled",
    required_secrets: secrets.required,
    missing_secrets: secrets.missing,
    present_secrets: secrets.present,
    webhook_url: publicWebhookUrl(req, provider),
    payments_real_enabled: realEnabled,
    secrets_exposed: false,
    network_call_performed: false,
    message: ok
      ? "Provider configuration is internally consistent. No real money was activated."
      : "Provider is not usable for real money yet.",
    trace_id: traceId
  }, ok ? 200 : 409);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const traceId = crypto.randomUUID();
  const corrId = correlationId(req);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const admin = await requireProviderManager(supabase, req);
  if (!admin.ok) return admin.response;

  const allowedByRate = await enforceRateLimit(supabase, admin.user.id);
  if (!allowedByRate) return fail("RATE_LIMITED", 429, { trace_id: traceId });

  const body = await readJson(req);
  const action = String(body.action ?? "get_current_config").trim();

  try {
    if (action === "get_current_config") {
      await auditEvent(supabase, {
        action: "read",
        actorUserId: admin.user.id,
        traceId,
        correlationId: corrId,
        metadata: { role: admin.role }
      });
      return json({ ok: true, action, ...(await getConfigs(supabase, req)), trace_id: traceId });
    }

    if (action === "check_required_secrets" || action === "rotate_check_required_secrets") {
      const provider = normalizeProvider(body.provider);
      if (!provider) return fail("PAYMENT_PROVIDER_INVALID", 400);
      const secrets = secretStatus(provider);
      await auditEvent(supabase, {
        action: "check_secrets",
        actorUserId: admin.user.id,
        provider,
        environment: normalizeEnvironment(body.environment),
        traceId,
        correlationId: corrId,
        metadata: { missing_secret_names: secrets.missing, rotation_supported_from_admin: false }
      });
      return json({
        ok: true,
        action,
        provider,
        required_secrets: secrets.required,
        present_secrets: secrets.present,
        missing_secrets: secrets.missing,
        secrets_exposed: false,
        rotation_supported_from_admin: false,
        rotation_instruction: "Rotate secrets in Supabase Edge Function Secrets or Vault, then redeploy/revalidate.",
        trace_id: traceId
      });
    }

    if (action === "validate_provider_config") {
      return await validateProvider(supabase, req, body, admin.user.id, traceId, corrId);
    }

    if (action === "set_active_provider") {
      return await setActiveProvider(supabase, req, body, admin.user.id, traceId, corrId);
    }

    if (action === "test_connection") {
      const provider = normalizeProvider(body.provider);
      const environment = normalizeEnvironment(body.environment);
      await auditEvent(supabase, {
        action: "test_connection",
        actorUserId: admin.user.id,
        provider,
        environment,
        traceId,
        correlationId: corrId,
        metadata: { network_call_performed: false }
      });
      return testConnectionResponse(req, body, traceId);
    }

    return fail("UNKNOWN_PAYMENT_PROVIDER_ACTION", 400, { trace_id: traceId });
  } catch (error) {
    console.error(JSON.stringify({
      area: "admin_payment_provider_config",
      action,
      trace_id: traceId,
      correlation_id: corrId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return fail("PAYMENT_PROVIDER_CONFIG_FAILED", 500, { trace_id: traceId });
  }
});
