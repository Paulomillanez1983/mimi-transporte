import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type JsonRecord = Record<string, unknown>;

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

function safeReason(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 220);
}

function maskName(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.split(" ").filter(Boolean).map((part) => {
    if (part.length <= 2) return `${part[0] ?? ""}*`;
    return `${part.slice(0, 1)}${"*".repeat(Math.min(part.length - 2, 8))}${part.slice(-1)}`;
  }).join(" ");
}

function publicAccount(row: JsonRecord) {
  const provider = (row.svc_providers ?? {}) as JsonRecord;
  const metadata = (row.metadata_json ?? {}) as JsonRecord;
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider_user_id: row.provider_user_id,
    account_type: row.account_type,
    cbu_masked: row.cbu_masked,
    cvu_masked: row.cvu_masked,
    alias_masked: row.alias_masked,
    account_last4: row.account_last4,
    encrypted_payload_required: row.encrypted_payload_required,
    encrypted_payload_status: row.encrypted_payload_status,
    bank_name: row.bank_name,
    holder_name_masked: maskName(row.holder_name),
    holder_tax_id_masked: row.holder_tax_id_masked,
    status: row.status,
    verification_status: row.verification_status,
    ownership_verification_status: row.ownership_verification_status,
    ownership_match: row.ownership_match,
    ownership_match_reason: row.ownership_match_reason,
    ownership_verified_at: row.ownership_verified_at,
    risk_status: row.risk_status,
    environment: row.environment,
    is_test: Boolean(row.is_test),
    fiscal_visibility: row.fiscal_visibility,
    submitted_at: row.submitted_at,
    changed_at: row.changed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    provider_name: provider.full_name ?? null,
    provider_email: provider.email ?? null,
    provider_kyc_tax_id_status: provider.kyc_tax_id_status ?? "missing",
    provider_kyc_tax_id_masked: provider.kyc_tax_id_masked ?? null,
    provider_kyc_tax_id_last4: provider.kyc_tax_id_last4 ?? null,
    payout_proof_present: Boolean(
      metadata.proof_attachment_id ||
      metadata.proof_path ||
      metadata.proof_url
    )
  };
}

function accountEventContext(row: JsonRecord) {
  return {
    environment: String(row.environment || "production"),
    isTest: Boolean(row.is_test),
    testRunId: row.test_run_id ? String(row.test_run_id) : null,
    fiscalVisibility: String(row.fiscal_visibility || "excluded_from_accounting")
  };
}

async function requireFinanceAdmin(supabase: ReturnType<typeof createClient>, req: Request) {
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

  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("user_id,email,active,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  const role = String(adminUser?.role ?? "").toUpperCase();
  const roles = new Set(["SUPERADMIN", "SUPER_ADMIN", "FINANCE_ADMIN"]);
  if (error || !roles.has(role)) {
    return { ok: false as const, response: fail("PAYOUT_ACCOUNT_REVIEW_FORBIDDEN", 403) };
  }

  return { ok: true as const, user, role };
}

async function auditEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    action: string;
    accountId?: string | null;
    providerId?: string | null;
    actorUserId: string;
    traceId: string;
    correlationId: string;
    environment?: string | null;
    isTest?: boolean | null;
    testRunId?: string | null;
    fiscalVisibility?: string | null;
    metadata?: JsonRecord;
  }
) {
  await admin.from("audit_financial_events").insert({
    event_key: `admin.provider_payout_account.${input.action}.${input.accountId || "list"}.${input.traceId}`,
    event_type: `admin.provider_payout_account.${input.action}`,
    actor_user_id: input.actorUserId,
    actor_type: "admin",
    source: "admin-provider-payout-accounts",
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.environment || "production",
    is_test: Boolean(input.isTest),
    test_run_id: input.testRunId || null,
    fiscal_visibility: input.fiscalVisibility || "excluded_from_accounting",
    metadata: {
      account_id: input.accountId,
      provider_id: input.providerId,
      payout_real_enabled: false,
      ledger_touched: false,
      raw_account_values_exposed: false,
      ...(input.metadata ?? {})
    }
  });
}

async function payoutAccountEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    account: JsonRecord;
    eventType: "verified" | "rejected" | "disabled" | "verification_requested";
    actorUserId: string;
    reason: string;
    traceId: string;
    correlationId: string;
  }
) {
  const eventContext = accountEventContext(input.account);
  await admin.from("provider_payout_account_events").insert({
    payout_account_id: input.account.id,
    provider_user_id: input.account.provider_user_id,
    provider_id: input.account.provider_id,
    event_key: `provider_payout_account.${input.eventType}.${input.account.id}.${input.traceId}`,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_type: "admin",
    after_snapshot: publicAccount(input.account),
    reason: input.reason,
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: eventContext.environment,
    is_test: eventContext.isTest,
    test_run_id: eventContext.testRunId,
    fiscal_visibility: eventContext.fiscalVisibility,
    metadata_json: {
      payout_real_enabled: false,
      decision_applied_to_payouts: false
    }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const traceId = crypto.randomUUID();
  const corrId = correlationId(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return fail("SUPABASE_ENV_MISSING", 500);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const actor = await requireFinanceAdmin(admin, req);
    if (!actor.ok) return actor.response;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "list_pending").trim();

    if (action === "list_pending") {
      const { data, error } = await admin
        .from("provider_payout_accounts")
        .select("id,provider_user_id,provider_id,account_type,cbu_masked,cvu_masked,alias_masked,account_last4,encrypted_payload_required,encrypted_payload_status,bank_name,holder_name,holder_tax_id_masked,status,verification_status,ownership_verification_status,ownership_match,ownership_match_reason,ownership_verified_at,risk_status,environment,is_test,test_run_id,fiscal_visibility,submitted_at,changed_at,created_at,updated_at,metadata_json,svc_providers(full_name,email,kyc_tax_id_status,kyc_tax_id_masked,kyc_tax_id_last4)")
        .in("status", ["pending_review", "rejected", "verified"])
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;

      return json({
        ok: true,
        accounts: (data ?? []).map(publicAccount),
        payout_real_enabled: false,
        raw_values_returned: false,
        trace_id: traceId
      });
    }

    if (action !== "review") return fail("UNKNOWN_PROVIDER_PAYOUT_REVIEW_ACTION", 400, { trace_id: traceId });

    const accountId = String(body.account_id || body.accountId || "").trim();
    const decision = String(body.decision || "").trim().toLowerCase();
    const reason = safeReason(body.reason);
    if (!accountId) return fail("PAYOUT_ACCOUNT_ID_REQUIRED", 400, { trace_id: traceId });
    if (!["verified", "rejected", "disabled", "manual_review", "needs_more_info"].includes(decision)) {
      return fail("PAYOUT_ACCOUNT_DECISION_INVALID", 400, { trace_id: traceId });
    }
    if (reason.length < 10) return fail("REVIEW_REASON_REQUIRED", 400, { trace_id: traceId });

    const { data: current, error: currentError } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return fail("PAYOUT_ACCOUNT_NOT_FOUND", 404, { trace_id: traceId });

    if (decision === "verified" && current.encrypted_payload_required === true) {
      return fail("PAYOUT_ACCOUNT_ENCRYPTION_REQUIRED", 409, {
        trace_id: traceId,
        reason: "Full bank data was not stored encrypted. Configure PAYOUT_ACCOUNT_ENCRYPTION_KEY in Supabase Secrets/Vault and request re-entry before verification."
      });
    }

    if (decision === "verified" && (
      current.ownership_match !== true ||
      current.ownership_verification_status !== "ownership_verified"
    )) {
      return fail("PAYOUT_ACCOUNT_OWNERSHIP_VERIFICATION_REQUIRED", 409, {
        trace_id: traceId,
        reason: "La cuenta solo puede aprobarse para payouts cuando CUIT/CUIL de titularidad coincide con CUIT/CUIL KYC verificado."
      });
    }

    const normalizedDecision = ["manual_review", "needs_more_info"].includes(decision) ? "pending_review" : decision;

    const next = {
      status: normalizedDecision,
      verification_status: normalizedDecision,
      ownership_verification_status: decision === "manual_review" || decision === "needs_more_info" ? decision : current.ownership_verification_status,
      risk_status: decision === "verified" ? "low" : ["manual_review", "needs_more_info"].includes(decision) ? "manual_review" : current.risk_status,
      is_active: decision === "verified",
      verified_at: decision === "verified" ? new Date().toISOString() : current.verified_at,
      verified_by: decision === "verified" ? actor.user.id : current.verified_by,
      change_reason: reason,
      metadata_json: {
        ...(current.metadata_json ?? {}),
        last_admin_review: {
          decision,
          reviewed_by: actor.user.id,
          reviewed_at: new Date().toISOString(),
          ownership_verified: current.ownership_match === true,
          payout_real_enabled: false
        }
      }
    };

    if (decision === "verified") {
      await admin
        .from("provider_payout_accounts")
        .update({ is_active: false })
        .eq("provider_user_id", current.provider_user_id)
        .neq("id", current.id);
    }

    const { data: updated, error } = await admin
      .from("provider_payout_accounts")
      .update(next)
      .eq("id", current.id)
      .select("id,provider_user_id,provider_id,account_type,cbu_masked,cvu_masked,alias_masked,account_last4,encrypted_payload_required,encrypted_payload_status,bank_name,holder_name,holder_tax_id_masked,status,verification_status,ownership_verification_status,ownership_match,ownership_match_reason,ownership_verified_at,risk_status,environment,is_test,test_run_id,fiscal_visibility,submitted_at,changed_at,created_at,updated_at,metadata_json,svc_providers(full_name,email,kyc_tax_id_status,kyc_tax_id_masked,kyc_tax_id_last4)")
      .single();
    if (error) throw error;

    await payoutAccountEvent(admin, {
      account: updated,
      eventType: (["manual_review", "needs_more_info"].includes(decision) ? "verification_requested" : decision) as "verified" | "rejected" | "disabled",
      actorUserId: actor.user.id,
      reason,
      traceId,
      correlationId: corrId
    });

    await auditEvent(admin, {
      action: decision,
      accountId: current.id,
      providerId: current.provider_id,
      actorUserId: actor.user.id,
      traceId,
      correlationId: corrId,
      ...accountEventContext(current),
      metadata: { reason }
    });

    return json({
      ok: true,
      account: publicAccount(updated),
      payout_real_enabled: false,
      raw_values_returned: false,
      trace_id: traceId
    });
  } catch (error) {
    console.error(JSON.stringify({
      area: "admin_provider_payout_accounts",
      trace_id: traceId,
      correlation_id: corrId,
      error: error instanceof Error ? error.message : String(error)
    }));
    return fail("ADMIN_PROVIDER_PAYOUT_ACCOUNTS_FAILED", 500, { trace_id: traceId, correlation_id: corrId });
  }
});
