import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type JsonRecord = Record<string, unknown>;
type PayoutAccountContext = {
  environment: "production" | "internal_testing";
  isTest: boolean;
  testRunId: string | null;
  fiscalVisibility: "excluded_from_accounting";
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function fail(error: string, status = 400, details: JsonRecord = {}) {
  return json({ ok: false, error, ...details }, status);
}

function correlationId(req: Request) {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function payoutAccountHashSalt() {
  const salt = Deno.env.get("PAYOUT_ACCOUNT_HASH_SALT");
  if (!salt) throw new Error("PAYOUT_ACCOUNT_HASH_SALT_MISSING");
  return salt;
}

async function stableTaxHash(value: string) {
  return sha256Hex(`tax-id:${digitsOnly(value)}:${payoutAccountHashSalt()}`);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function safeText(value: unknown, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function normalizeAlias(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 80);
}

function maskDigits(value: string) {
  if (!value) return null;
  const last4 = value.slice(-4);
  return `${"*".repeat(Math.max(value.length - 4, 0))}${last4}`;
}

function maskAlias(value: string) {
  if (!value) return null;
  if (value.length <= 6) return `${value.slice(0, 2)}***${value.slice(-1)}`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function normalizeAccountInput(body: JsonRecord) {
  const accountType = safeText(body.account_type || body.accountType || "cbu", 32).toLowerCase();
  if (!["cbu", "cvu", "alias", "bank_account"].includes(accountType)) {
    return { ok: false as const, error: "PAYOUT_ACCOUNT_TYPE_INVALID" };
  }

  const cbu = digitsOnly(body.cbu);
  const cvu = digitsOnly(body.cvu);
  const alias = normalizeAlias(body.alias);

  if ((accountType === "cbu" || accountType === "bank_account") && cbu && cbu.length !== 22) {
    return { ok: false as const, error: "CBU_INVALID_LENGTH" };
  }
  if ((accountType === "cvu" || accountType === "bank_account") && cvu && cvu.length !== 22) {
    return { ok: false as const, error: "CVU_INVALID_LENGTH" };
  }
  if (accountType === "cbu" && !cbu) return { ok: false as const, error: "CBU_REQUIRED" };
  if (accountType === "cvu" && !cvu) return { ok: false as const, error: "CVU_REQUIRED" };
  if (accountType === "alias" && alias.length < 6) return { ok: false as const, error: "ALIAS_REQUIRED" };
  if (accountType === "bank_account" && !cbu && !cvu && alias.length < 6) {
    return { ok: false as const, error: "BANK_ACCOUNT_IDENTIFIER_REQUIRED" };
  }

  return {
    ok: true as const,
    accountType,
    cbu,
    cvu,
    alias,
    bankName: safeText(body.bank_name || body.bankName, 100),
    holderName: safeText(body.holder_name || body.holderName, 120),
    holderTaxId: digitsOnly(body.holder_tax_id || body.holderTaxId).slice(0, 20),
    changeReason: safeText(body.change_reason || body.changeReason || "Alta de datos de cobro", 220)
  };
}

function publicAccount(row: JsonRecord | null) {
  if (!row) return null;
  return {
    id: row.id,
    provider_id: row.provider_id,
    account_type: row.account_type,
    cbu_masked: row.cbu_masked,
    cvu_masked: row.cvu_masked,
    alias_masked: row.alias_masked,
    account_last4: row.account_last4,
    encrypted_payload_required: row.encrypted_payload_required,
    encrypted_payload_status: row.encrypted_payload_status,
    bank_name: row.bank_name,
    holder_name: row.holder_name,
    holder_tax_id_masked: row.holder_tax_id_masked,
    status: row.status,
    verification_status: row.verification_status,
    ownership_verification_status: row.ownership_verification_status,
    ownership_match: row.ownership_match,
    ownership_match_reason: row.ownership_match_reason,
    risk_status: row.risk_status,
    is_active: row.is_active,
    submitted_at: row.submitted_at,
    changed_at: row.changed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata_json: row.metadata_json
  };
}

async function encryptPayload(payload: JsonRecord) {
  const secret = Deno.env.get("PAYOUT_ACCOUNT_ENCRYPTION_KEY") || "";
  const keyId = Deno.env.get("PAYOUT_ACCOUNT_ENCRYPTION_KEY_ID") || null;
  if (!secret) {
    return {
      encrypted_payload: {
        storage: "masked_hash_only",
        encrypted_payload_required: true,
        reason: "PAYOUT_ACCOUNT_ENCRYPTION_KEY_MISSING",
        requires_reentry_before_real_payouts: true
      },
      encrypted_payload_required: true,
      encrypted_payload_status: "required_missing_secret",
      encryption_key_id: null
    };
  }

  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    encrypted_payload: {
      alg: "A256GCM",
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted))
    },
    encrypted_payload_required: false,
    encrypted_payload_status: "server_encrypted",
    encryption_key_id: keyId
  };
}

async function auditFinancialEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    eventType: string;
    eventKey: string;
    actorUserId: string;
    providerId: string | null;
    traceId: string;
    correlationId: string;
    context: PayoutAccountContext;
    metadata?: JsonRecord;
  }
) {
  await admin.from("audit_financial_events").insert({
    event_key: input.eventKey,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_type: "provider",
    source: "provider-payout-account",
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.context.environment,
    is_test: input.context.isTest,
    test_run_id: input.context.testRunId,
    fiscal_visibility: input.context.fiscalVisibility,
    metadata: {
      provider_id: input.providerId,
      payout_real_enabled: false,
      ledger_touched: false,
      raw_account_values_exposed: false,
      ...(input.metadata ?? {})
    }
  });
}

async function insertServerRiskEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    actorUserId: string;
    providerId: string | null;
    accountId: string;
    traceId: string;
    correlationId: string;
    context: PayoutAccountContext;
  }
) {
  const eventKey = `provider_change_bank_account:${input.actorUserId}:${input.accountId}:server`;
  const payload = {
    event_key: eventKey,
    event_type: "provider_change_bank_account",
    actor_user_id: input.actorUserId,
    provider_id: input.providerId,
    risk_score: 10,
    risk_level: "low",
    recommendation: "allow",
    decision_applied: false,
    reasons: ["server_authoritative_payout_account_change"],
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.context.environment,
    is_test: input.context.isTest,
    test_run_id: input.context.testRunId,
    fiscal_visibility: input.context.fiscalVisibility,
    metadata: {
      source: "provider-payout-account",
      payout_account_id: input.accountId,
      risk_signal_source: "server_payout_account_submit",
      risk_signal_missing: false,
      fingerprint_skipped: true,
      foundation_only: true,
      automatic_blocking_enabled: false
    }
  };

  const { data: event } = await admin
    .from("fraud_events")
    .upsert(payload, { onConflict: "event_key" })
    .select("id")
    .maybeSingle();

  if (event?.id) {
    await admin.from("risk_scores").upsert({
      actor_user_id: input.actorUserId,
      provider_id: input.providerId,
      subject_type: input.providerId ? "provider" : "user",
      subject_key: input.providerId ?? input.actorUserId,
      current_score: 10,
      risk_level: "low",
      recommendation: "allow",
      last_event_id: event.id,
      factors: { reasons: payload.reasons, event_type: "provider_change_bank_account" },
      environment: input.context.environment,
      is_test: input.context.isTest,
      test_run_id: input.context.testRunId,
      fiscal_visibility: input.context.fiscalVisibility,
      metadata: {
        source: "provider-payout-account",
        foundation_only: true,
        automatic_blocking_enabled: false
      }
    }, { onConflict: "subject_type,subject_key,environment,is_test" });
  }
}

async function insertPayoutAccountEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    accountId: string;
    providerUserId: string;
    providerId: string | null;
    actorUserId: string;
    eventType: string;
    reason: string | null;
    traceId: string;
    correlationId: string;
    context: PayoutAccountContext;
    afterSnapshot: JsonRecord;
  }
) {
  await admin.from("provider_payout_account_events").insert({
    payout_account_id: input.accountId,
    provider_user_id: input.providerUserId,
    provider_id: input.providerId,
    event_key: `provider_payout_account.${input.eventType}.${input.accountId}.${input.traceId}`,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_type: "provider",
    after_snapshot: input.afterSnapshot,
    reason: input.reason,
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.context.environment,
    is_test: input.context.isTest,
    test_run_id: input.context.testRunId,
    fiscal_visibility: input.context.fiscalVisibility,
    metadata_json: {
      payout_real_enabled: false,
      risk_event_required: true,
      risk_event_type: "provider_change_bank_account"
    }
  });
}

async function resolveProvider(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin
    .from("svc_providers")
    .select("id,user_id,full_name,email,approved,blocked,notes_internal")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

function resolvePayoutAccountContext(body: JsonRecord, provider: JsonRecord | null): PayoutAccountContext {
  const wantsTest = body.is_test === true ||
    body.isTest === true ||
    String(body.environment || "").toLowerCase() === "internal_testing";

  if (!wantsTest) {
    return {
      environment: "production",
      isTest: false,
      testRunId: null,
      fiscalVisibility: "excluded_from_accounting"
    };
  }

  const email = String(provider?.email ?? "").trim().toLowerCase();
  const notes = String(provider?.notes_internal ?? "").trim().toLowerCase();
  const isSmokeProvider = email.endsWith("@mimigo.test") && notes.includes("smoke");
  if (!isSmokeProvider) {
    throw new Error("TEST_PAYOUT_ACCOUNT_NOT_ALLOWED");
  }

  return {
    environment: "internal_testing",
    isTest: true,
    testRunId: isUuid(body.test_run_id || body.testRunId) ? String(body.test_run_id || body.testRunId) : null,
    fiscalVisibility: "excluded_from_accounting"
  };
}

async function latestAccount(admin: ReturnType<typeof createClient>, providerUserId: string) {
  const { data, error } = await admin
    .from("provider_payout_accounts")
    .select("id,provider_id,account_type,cbu_masked,cvu_masked,alias_masked,account_last4,encrypted_payload_required,encrypted_payload_status,bank_name,holder_name,holder_tax_id_masked,status,verification_status,ownership_verification_status,ownership_match,ownership_match_reason,risk_status,is_active,submitted_at,changed_at,created_at,updated_at,metadata_json")
    .eq("provider_user_id", providerUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const traceId = crypto.randomUUID();
  const corrId = correlationId(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return fail("SUPABASE_ENV_MISSING", 500);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("AUTH_REQUIRED", 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user?.id) return fail("AUTH_REQUIRED", 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "get_current").trim();
    const provider = await resolveProvider(admin, userData.user.id);
    const context = resolvePayoutAccountContext(body, provider as JsonRecord | null);

    if (action === "get_current") {
      return json({
        ok: true,
        account: publicAccount(await latestAccount(admin, userData.user.id)),
        payout_real_enabled: false,
        trace_id: traceId,
        correlation_id: corrId
      });
    }

    if (action !== "submit_for_review" && action !== "save_draft") {
      return fail("UNKNOWN_PROVIDER_PAYOUT_ACCOUNT_ACTION", 400, { trace_id: traceId });
    }

    const normalized = normalizeAccountInput(body);
    if (!normalized.ok) return fail(normalized.error, 400, { trace_id: traceId });

    const rawAccountKey = [normalized.accountType, normalized.cbu, normalized.cvu, normalized.alias]
      .filter(Boolean)
      .join(":");
    const accountHash = await sha256Hex(`${rawAccountKey}:${payoutAccountHashSalt()}`);
    const holderTaxIdHash = normalized.holderTaxId ? await stableTaxHash(normalized.holderTaxId) : null;
    const encrypted = await encryptPayload({
      account_type: normalized.accountType,
      cbu: normalized.cbu || null,
      cvu: normalized.cvu || null,
      alias: normalized.alias || null,
      holder_tax_id: normalized.holderTaxId || null
    });
    const status = action === "save_draft" ? "draft" : "pending_review";
    const now = new Date().toISOString();
    const last4 = normalized.cbu?.slice(-4) || normalized.cvu?.slice(-4) || normalized.alias?.slice(-4) || null;

    const { data: existingAccount, error: existingError } = await admin
      .from("provider_payout_accounts")
      .select("id,provider_id,account_type,cbu_masked,cvu_masked,alias_masked,account_last4,encrypted_payload_required,encrypted_payload_status,bank_name,holder_name,holder_tax_id_masked,status,verification_status,ownership_verification_status,ownership_match,ownership_match_reason,risk_status,is_active,submitted_at,changed_at,created_at,updated_at,metadata_json")
      .eq("provider_user_id", userData.user.id)
      .eq("account_hash", accountHash)
      .eq("environment", context.environment)
      .eq("is_test", context.isTest)
      .in("status", ["draft", "pending_review", "verified"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingAccount?.id) {
      return json({
        ok: true,
        duplicate: true,
        account: publicAccount(existingAccount),
        payout_real_enabled: false,
        raw_values_returned: false,
        trace_id: traceId,
        correlation_id: corrId
      });
    }

    const { data: account, error } = await admin
      .from("provider_payout_accounts")
      .insert({
        provider_user_id: userData.user.id,
        provider_id: provider?.id ?? null,
        account_type: normalized.accountType,
        cbu_masked: maskDigits(normalized.cbu),
        cvu_masked: maskDigits(normalized.cvu),
        alias_masked: maskAlias(normalized.alias),
        account_last4: last4,
        account_hash: accountHash,
        encrypted_payload: encrypted.encrypted_payload,
        encrypted_payload_required: encrypted.encrypted_payload_required,
        encrypted_payload_status: encrypted.encrypted_payload_status,
        encryption_key_id: encrypted.encryption_key_id,
        bank_name: normalized.bankName || null,
        holder_name: normalized.holderName || null,
        holder_tax_id_masked: maskDigits(normalized.holderTaxId),
        holder_tax_id_hash: holderTaxIdHash,
        holder_tax_id_last4: normalized.holderTaxId ? normalized.holderTaxId.slice(-4) : null,
        ownership_verification_status: "not_verified",
        ownership_match: false,
        ownership_match_reason: "ownership_verification_required",
        status,
        verification_status: status,
        risk_status: "pending",
        changed_at: now,
        submitted_at: status === "pending_review" ? now : null,
        change_reason: normalized.changeReason,
        environment: context.environment,
        is_test: context.isTest,
        test_run_id: context.testRunId,
        fiscal_visibility: context.fiscalVisibility,
        metadata_json: {
          payout_real_enabled: false,
          raw_values_returned_to_client: false,
          full_bank_values_plaintext_stored: false,
          encrypted_payload_required: encrypted.encrypted_payload_required,
          storage_mode: encrypted.encrypted_payload_status
        }
      })
        .select("id,provider_id,account_type,cbu_masked,cvu_masked,alias_masked,account_last4,encrypted_payload_required,encrypted_payload_status,bank_name,holder_name,holder_tax_id_masked,status,verification_status,ownership_verification_status,ownership_match,ownership_match_reason,risk_status,is_active,submitted_at,changed_at,created_at,updated_at,metadata_json")
      .single();

    if (error) throw error;

    const eventType = status === "draft" ? "created" : "submitted";
    await insertPayoutAccountEvent(admin, {
      accountId: account.id,
      providerUserId: userData.user.id,
      providerId: provider?.id ?? null,
      actorUserId: userData.user.id,
      eventType,
      reason: normalized.changeReason,
      traceId,
      correlationId: corrId,
      context,
      afterSnapshot: publicAccount(account) as JsonRecord
    });

    await auditFinancialEvent(admin, {
      eventType: `provider.payout_account.${eventType}`,
      eventKey: `provider.payout_account.${eventType}.${account.id}.${traceId}`,
      actorUserId: userData.user.id,
      providerId: provider?.id ?? null,
      traceId,
      correlationId: corrId,
      context,
      metadata: {
        account_id: account.id,
        account_type: normalized.accountType,
        status,
        risk_event_required: true,
        risk_event_type: "provider_change_bank_account"
      }
    });

    await insertServerRiskEvent(admin, {
      actorUserId: userData.user.id,
      providerId: provider?.id ?? null,
      accountId: account.id,
      traceId,
      correlationId: corrId,
      context
    });

    return json({
      ok: true,
      account: publicAccount(account),
      payout_real_enabled: false,
      raw_values_returned: false,
      trace_id: traceId,
      correlation_id: corrId
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TEST_PAYOUT_ACCOUNT_NOT_ALLOWED") {
      return fail("TEST_PAYOUT_ACCOUNT_NOT_ALLOWED", 403, {
        trace_id: traceId,
        correlation_id: corrId,
        reason: "Only authorized smoke providers can create internal_testing payout account fixtures."
      });
    }
    console.error(JSON.stringify({
      area: "provider_payout_account",
      trace_id: traceId,
      correlation_id: corrId,
      error: error instanceof Error ? error.message : String(error)
    }));
    return fail("PROVIDER_PAYOUT_ACCOUNT_FAILED", 500, { trace_id: traceId, correlation_id: corrId });
  }
});
