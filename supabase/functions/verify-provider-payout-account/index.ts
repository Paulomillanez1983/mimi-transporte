import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAccountWithProvider } from "../_shared/account-verification-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id, x-mimigo-service-flow",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  const payload = JSON.stringify(body, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  return new Response(payload, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function fail(error: string, status = 400, details: JsonRecord = {}) {
  return json({ ok: false, error, ...details }, status);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function correlationId(req: Request) {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
}

function safeText(value: unknown, max = 220) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function booleanFlag(value: unknown) {
  if (value === true) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "si", "sí", "on"].includes(text);
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function resolveOptionalSmokeContext(body: JsonRecord, subject: JsonRecord | null) {
  const wantsTest = body.is_test === true ||
    body.isTest === true ||
    String(body.environment || "").toLowerCase() === "internal_testing";

  if (!wantsTest) {
    return {
      ok: true as const,
      context: {
        environment: "production",
        isTest: false,
        testRunId: null as string | null,
        fiscalVisibility: "excluded_from_accounting"
      }
    };
  }

  const email = String(subject?.email ?? "").trim().toLowerCase();
  const notes = String(subject?.notes_internal ?? "").trim().toLowerCase();
  const isSmokeSubject = email.endsWith("@mimigo.test") && notes.includes("smoke");
  if (!isSmokeSubject) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    context: {
      environment: "internal_testing",
      isTest: true,
      testRunId: isUuid(body.test_run_id || body.testRunId) ? String(body.test_run_id || body.testRunId) : null,
      fiscalVisibility: "excluded_from_accounting"
    }
  };
}

function maskDigits(value: string | null | undefined) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  return `${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

function maskName(value: string | null | undefined) {
  const text = safeText(value, 120);
  if (!text) return null;
  const parts = text.split(" ").filter(Boolean);
  return parts.map((part) => {
    if (part.length <= 2) return `${part[0] ?? ""}*`;
    return `${part.slice(0, 1)}${"*".repeat(Math.min(part.length - 2, 8))}${part.slice(-1)}`;
  }).join(" ");
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
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

async function importEncryptionKey(usages: KeyUsage[]) {
  const secret = Deno.env.get("PAYOUT_ACCOUNT_ENCRYPTION_KEY") || "";
  if (!secret) return null;
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, usages);
}

async function decryptPayload(encrypted: JsonRecord | null | undefined) {
  if (!encrypted?.ciphertext || !encrypted?.iv) return null;
  const key = await importEncryptionKey(["decrypt"]);
  if (!key) return null;
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(String(encrypted.iv)) },
    key,
    base64ToBytes(String(encrypted.ciphertext))
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as JsonRecord;
}

async function encryptRawResponse(payload: JsonRecord) {
  const key = await importEncryptionKey(["encrypt"]);
  const keyId = Deno.env.get("PAYOUT_ACCOUNT_ENCRYPTION_KEY_ID") || null;
  if (!key) {
    return {
      storage: "masked_hash_only",
      encrypted_payload_required: true,
      reason: "PAYOUT_ACCOUNT_ENCRYPTION_KEY_MISSING"
    };
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    alg: "A256GCM",
    key_id: keyId,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

function publicAccount(row: JsonRecord | null) {
  if (!row) return null;
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider_user_id: row.provider_user_id,
    account_type: row.account_type,
    cbu_masked: row.cbu_masked,
    cvu_masked: row.cvu_masked,
    alias_masked: row.alias_masked,
    account_last4: row.account_last4,
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
    verified_at: row.verified_at,
    ownership_verified_at: row.ownership_verified_at,
    metadata_json: row.metadata_json
  };
}

function publicVerification(row: JsonRecord | null) {
  if (!row) return null;
  return {
    id: row.id,
    payout_account_id: row.payout_account_id,
    verification_provider: row.verification_provider,
    verification_status: row.verification_status,
    account_active: row.account_active,
    account_type: row.account_type,
    bank_name: row.bank_name,
    holder_name_masked: row.holder_name_masked,
    holder_tax_id_last4: row.holder_tax_id_last4,
    ownership_match: row.ownership_match,
    ownership_match_reason: row.ownership_match_reason,
    reviewed_at: row.reviewed_at,
    verified_at: row.verified_at,
    raw_values_returned: false,
    created_at: row.created_at,
    metadata_json: row.metadata_json
  };
}

async function requireFinanceActor(
  admin: ReturnType<typeof createClient>,
  req: Request,
  serviceRoleKey: string
) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false as const, response: fail("AUTH_REQUIRED", 401) };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceFlow = req.headers.get("x-mimigo-service-flow") === "payout-account-verification";
  if (serviceFlow && token === serviceRoleKey) {
    return { ok: true as const, user: { id: null as string | null }, role: "SERVICE_FLOW" };
  }

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return { ok: false as const, response: fail("AUTH_INVALID", 401) };

  const { data: adminUser, error } = await admin
    .from("admin_users")
    .select("user_id,email,active,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  const role = String(adminUser?.role ?? "").toUpperCase();
  const roles = new Set(["SUPERADMIN", "SUPER_ADMIN", "FINANCE_ADMIN"]);
  if (error || !roles.has(role)) {
    return { ok: false as const, response: fail("PAYOUT_ACCOUNT_VERIFICATION_FORBIDDEN", 403) };
  }

  return { ok: true as const, user, role };
}

async function latestRiskLevel(admin: ReturnType<typeof createClient>, providerId: string | null) {
  if (!providerId) return "low";
  const { data } = await admin
    .from("risk_scores")
    .select("risk_level,current_score,recommendation")
    .eq("subject_type", "provider")
    .eq("subject_key", providerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String(data?.risk_level || "low").toLowerCase();
}

function isKycApproved(provider: JsonRecord, profile: JsonRecord | null) {
  const providerApproved = provider.approved === true && provider.blocked !== true;
  const kyc = String(profile?.kyc_status ?? "").toUpperCase();
  const review = String(profile?.review_status ?? "").toLowerCase();
  return providerApproved && (
    review === "approved" ||
    ["APPROVED", "AUTO_VALIDATED", "MANUAL_APPROVED", "READY_FOR_APPROVAL"].includes(kyc)
  );
}

async function insertAudit(
  admin: ReturnType<typeof createClient>,
  input: {
    eventType: string;
    eventKey: string;
    actorUserId: string | null;
    providerId: string | null;
    accountId: string | null;
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
    event_key: input.eventKey,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_type: input.actorUserId ? "admin" : "system",
    source: "verify-provider-payout-account",
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
      raw_tax_values_exposed: false,
      ...(input.metadata ?? {})
    }
  });
}

async function insertRiskEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    actorUserId: string | null;
    providerUserId: string;
    providerId: string | null;
    accountId: string;
    status: string;
    ownershipMatch: boolean;
    traceId: string;
    correlationId: string;
    environment?: string | null;
    isTest?: boolean | null;
    testRunId?: string | null;
    fiscalVisibility?: string | null;
  }
) {
  const riskScore = input.status === "ownership_mismatch" ? 75 : input.status === "ownership_verified" ? 5 : 25;
  const riskLevel = riskScore >= 70 ? "high" : riskScore >= 25 ? "medium" : "low";
  const recommendation = riskLevel === "high" ? "additional_verification" : riskLevel === "medium" ? "log" : "allow";

  const { data: event } = await admin
    .from("fraud_events")
    .upsert({
      event_key: `provider_payout_account_ownership:${input.accountId}:${input.traceId}`,
      event_type: "provider_payout_account_ownership_verification",
      actor_user_id: input.actorUserId ?? input.providerUserId,
      provider_id: input.providerId,
      risk_score: riskScore,
      risk_level: riskLevel,
      recommendation,
      decision_applied: false,
      reasons: [input.status],
      trace_id: input.traceId,
      correlation_id: input.correlationId,
      environment: input.environment || "production",
      is_test: Boolean(input.isTest),
      test_run_id: input.testRunId || null,
      fiscal_visibility: input.fiscalVisibility || "excluded_from_accounting",
      metadata: {
        payout_account_id: input.accountId,
        ownership_match: input.ownershipMatch,
        payout_real_enabled: false,
        automatic_blocking_enabled: false
      }
    }, { onConflict: "event_key" })
    .select("id")
    .maybeSingle();

  if (event?.id && input.providerId) {
    await admin.from("risk_scores").upsert({
      actor_user_id: input.actorUserId ?? input.providerUserId,
      provider_id: input.providerId,
      subject_type: "provider",
      subject_key: input.providerId,
      current_score: riskScore,
      risk_level: riskLevel,
      recommendation,
      last_event_id: event.id,
      factors: { event_type: "provider_payout_account_ownership_verification", status: input.status },
      environment: input.environment || "production",
      is_test: Boolean(input.isTest),
      test_run_id: input.testRunId || null,
      fiscal_visibility: input.fiscalVisibility || "excluded_from_accounting",
      metadata: {
        payout_account_id: input.accountId,
        decision_applied: false,
        payout_real_enabled: false
      }
    }, { onConflict: "subject_type,subject_key,environment,is_test" });
  }
}

async function insertPayoutAccountEvent(
  admin: ReturnType<typeof createClient>,
  input: {
    account: JsonRecord;
    eventType: "verification_requested" | "verified" | "rejected";
    actorUserId: string | null;
    reason: string;
    traceId: string;
    correlationId: string;
    verificationId: string;
  }
) {
  await admin.from("provider_payout_account_events").insert({
    payout_account_id: input.account.id,
    provider_user_id: input.account.provider_user_id,
    provider_id: input.account.provider_id,
    event_key: `provider_payout_account.ownership.${input.eventType}.${input.account.id}.${input.traceId}`,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_type: input.actorUserId ? "admin" : "system",
    after_snapshot: publicAccount(input.account),
    reason: input.reason,
    trace_id: input.traceId,
    correlation_id: input.correlationId,
    environment: input.account.environment ?? "production",
    is_test: Boolean(input.account.is_test),
    test_run_id: input.account.test_run_id ?? null,
    fiscal_visibility: input.account.fiscal_visibility ?? "excluded_from_accounting",
    metadata_json: {
      payout_real_enabled: false,
      ownership_verification_id: input.verificationId,
      raw_account_values_exposed: false,
      raw_tax_values_exposed: false
    }
  });
}

async function handleSetKycTaxId(
  admin: ReturnType<typeof createClient>,
  body: JsonRecord,
  actorUserId: string | null,
  traceId: string,
  corrId: string
) {
  const providerId = safeText(body.provider_id || body.providerId, 80);
  const providerUserId = safeText(body.provider_user_id || body.providerUserId, 80);
  const taxId = digitsOnly(body.tax_id || body.cuit || body.cuil);
  const reason = safeText(body.reason || body.review_reason, 220);
  if (!providerId && !providerUserId) return fail("PROVIDER_REQUIRED", 400, { trace_id: traceId });
  if (taxId.length !== 11) return fail("KYC_TAX_ID_INVALID", 400, { trace_id: traceId });
  if (reason.length < 10) return fail("REVIEW_REASON_REQUIRED", 400, { trace_id: traceId });

  const taxHash = await stableTaxHash(taxId);
  const { data: provider, error } = await admin
    .rpc("provider_kyc_tax_id_admin_update", {
      p_provider_id: providerId || null,
      p_provider_user_id: providerUserId || null,
      p_tax_hash: taxHash,
      p_tax_last4: taxId.slice(-4),
      p_tax_masked: maskDigits(taxId),
      p_source: safeText(body.source || "finance_admin_verified_kyc", 80),
      p_metadata: {
        raw_tax_id_plaintext_stored: false,
        reviewed_by: actorUserId,
        review_reason: reason,
        trace_id: traceId
      }
    })
    .maybeSingle();
  if (error) throw error;
  if (!provider) return fail("PROVIDER_NOT_FOUND", 404, { trace_id: traceId });
  const auditContext = resolveOptionalSmokeContext(body, provider as JsonRecord);
  if (!auditContext.ok) {
    return fail("TEST_KYC_TAX_CONTEXT_NOT_ALLOWED", 403, {
      trace_id: traceId,
      reason: "Only authorized smoke providers can mark KYC tax verification audit as internal_testing."
    });
  }

  await insertAudit(admin, {
    eventType: "provider.kyc_tax_id.verified",
    eventKey: `provider.kyc_tax_id.verified.${provider.id}.${traceId}`,
    actorUserId,
    providerId: provider.id,
    accountId: null,
    traceId,
    correlationId: corrId,
    environment: auditContext.context.environment,
    isTest: auditContext.context.isTest,
    testRunId: auditContext.context.testRunId,
    fiscalVisibility: auditContext.context.fiscalVisibility,
    metadata: {
      kyc_tax_id_last4: provider.kyc_tax_id_last4,
      raw_tax_id_plaintext_stored: false,
      reason
    }
  });

  return json({
    ok: true,
    provider: {
      id: provider.id,
      user_id: provider.user_id,
      kyc_tax_id_masked: provider.kyc_tax_id_masked,
      kyc_tax_id_last4: provider.kyc_tax_id_last4,
      kyc_tax_id_status: provider.kyc_tax_id_status
    },
    raw_tax_id_returned: false,
    trace_id: traceId
  });
}

async function handleManualBankReview(
  admin: ReturnType<typeof createClient>,
  body: JsonRecord,
  actorUserId: string | null,
  traceId: string,
  corrId: string
) {
  const accountId = safeText(body.payout_account_id || body.account_id || body.accountId, 80);
  const observedTaxId = digitsOnly(
    body.observed_tax_id ||
    body.observed_holder_tax_id ||
    body.observed_cuit_cuil ||
    body.holder_tax_id
  );
  const observedHolderName = safeText(body.observed_holder_name || body.holder_name, 120);
  const observedBankName = safeText(body.observed_bank_name || body.bank_name, 120);
  const reason = safeText(body.reason || body.review_reason, 220);
  const confirmed = booleanFlag(body.confirm_ownership_match || body.ownership_confirmation || body.confirmed);

  if (!accountId) return fail("PAYOUT_ACCOUNT_ID_REQUIRED", 400, { trace_id: traceId });
  if (observedTaxId.length !== 11) return fail("OBSERVED_TAX_ID_REQUIRED", 400, { trace_id: traceId });
  if (!observedHolderName) return fail("OBSERVED_HOLDER_NAME_REQUIRED", 400, { trace_id: traceId });
  if (!observedBankName) return fail("OBSERVED_BANK_NAME_REQUIRED", 400, { trace_id: traceId });
  if (reason.length < 10) return fail("REVIEW_REASON_REQUIRED", 400, { trace_id: traceId });
  if (!confirmed) {
    return fail("OWNERSHIP_CONFIRMATION_REQUIRED", 400, {
      trace_id: traceId,
      reason: "Debe confirmarse explicitamente que se comparo CUIT/CUIL completo contra KYC, no solo nombre o ultimos 4."
    });
  }

  const { data: account, error: accountError } = await admin
    .from("provider_payout_accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) return fail("PAYOUT_ACCOUNT_NOT_FOUND", 404, { trace_id: traceId });

  if (account.encrypted_payload_required === true || account.encrypted_payload_status !== "server_encrypted") {
    return fail("PAYOUT_ACCOUNT_ENCRYPTION_REQUIRED", 409, {
      trace_id: traceId,
      reason: "La cuenta no puede verificarse manualmente si el CBU/CVU completo no quedo cifrado server-side."
    });
  }

  const decrypted = await decryptPayload(account.encrypted_payload as JsonRecord);
  if (!decrypted) {
    return fail("PAYOUT_ACCOUNT_DECRYPT_FAILED", 409, {
      trace_id: traceId,
      reason: "No se pudo descifrar el payload bancario server-side para sostener auditoria de titularidad."
    });
  }

  const { data: provider, error: providerError } = await admin
    .from("svc_providers")
    .select("id,user_id,approved,blocked,full_name,email,kyc_tax_id_hash,kyc_tax_id_last4,kyc_tax_id_masked,kyc_tax_id_status")
    .eq("id", account.provider_id)
    .maybeSingle();
  if (providerError) throw providerError;
  if (!provider) return fail("PROVIDER_NOT_FOUND", 404, { trace_id: traceId });

  const { data: profile } = await admin
    .from("svc_provider_profiles")
    .select("kyc_status,review_status")
    .eq("provider_id", provider.id)
    .maybeSingle();

  const providerKycTaxHash = provider.kyc_tax_id_hash as string | null;
  const providerKycTaxStatus = String(provider.kyc_tax_id_status || "missing");
  const kycApproved = isKycApproved(provider, profile ?? null);
  const riskLevel = await latestRiskLevel(admin, provider.id);
  const observedTaxHash = await stableTaxHash(observedTaxId);
  const observedTaxLast4 = observedTaxId.slice(-4);

  let status: string = "manual_review";
  let ownershipMatch = false;
  let reasonCode = "manual_bank_review_pending";

  if (!providerKycTaxHash || providerKycTaxStatus !== "verified") {
    status = "pending_missing_tax_id";
    reasonCode = "provider_kyc_tax_id_missing";
  } else if (!kycApproved) {
    status = "manual_review";
    reasonCode = "provider_kyc_not_approved";
  } else if (riskLevel === "critical") {
    status = "manual_review";
    reasonCode = "provider_risk_critical";
  } else if (observedTaxHash === providerKycTaxHash) {
    status = "ownership_verified";
    reasonCode = "manual_observed_tax_id_matches_kyc";
    ownershipMatch = true;
  } else {
    status = "ownership_mismatch";
    reasonCode = "manual_observed_tax_id_does_not_match_kyc";
  }

  const now = new Date().toISOString();
  const rawResponseEncrypted = await encryptRawResponse({
    provider: "manual_bank_review",
    status,
    observed_holder_name_masked: maskName(observedHolderName),
    observed_bank_name: observedBankName,
    observed_tax_id_masked: maskDigits(observedTaxId),
    observed_tax_id_last4: observedTaxLast4,
    manual_ownership_checkbox_confirmed: true,
    compared_full_hash_not_last4: true,
    name_only_match_accepted: false,
    last4_only_match_accepted: false,
    raw_tax_values_exposed: false,
    raw_account_values_exposed: false
  });

  const { data: verification, error: verificationError } = await admin
    .from("provider_payout_account_verifications")
    .insert({
      payout_account_id: account.id,
      provider_user_id: account.provider_user_id,
      provider_id: account.provider_id,
      verification_provider: "manual_bank_review",
      verification_status: status,
      account_active: status === "ownership_verified" ? true : null,
      account_type: account.account_type,
      bank_name: observedBankName,
      holder_name_masked: maskName(observedHolderName),
      holder_tax_id_hash: observedTaxHash,
      holder_tax_id_last4: observedTaxLast4,
      ownership_match: ownershipMatch,
      ownership_match_reason: reasonCode,
      matched_kyc_tax_id_hash: ownershipMatch ? providerKycTaxHash : null,
      raw_response_encrypted: rawResponseEncrypted,
      metadata_json: {
        verification_mode: "manual_bank_review",
        manual_ownership_checkbox_confirmed: true,
        compared_full_hash_not_last4: true,
        name_only_match_accepted: false,
        last4_only_match_accepted: false,
        observed_tax_id_plaintext_stored: false,
        observed_tax_id_returned: false,
        kyc_approved: kycApproved,
        kyc_tax_id_status: providerKycTaxStatus,
        provider_risk_level: riskLevel,
        payout_real_enabled: false,
        raw_account_values_exposed: false,
        raw_tax_values_exposed: false
      },
      verified_at: status === "ownership_verified" ? now : null,
      reviewed_at: now,
      reviewed_by: actorUserId,
      review_reason: reason,
      environment: account.environment,
      is_test: account.is_test,
      test_run_id: account.test_run_id,
      fiscal_visibility: account.fiscal_visibility
    })
    .select("*")
    .single();
  if (verificationError) throw verificationError;

  const verified = status === "ownership_verified";
  const rejected = status === "ownership_mismatch";
  if (verified) {
    await admin
      .from("provider_payout_accounts")
      .update({ is_active: false })
      .eq("provider_user_id", account.provider_user_id)
      .neq("id", account.id);
  }

  const patch = {
    holder_tax_id_hash: observedTaxHash,
    holder_tax_id_last4: observedTaxLast4,
    ownership_verification_status: status,
    ownership_match: ownershipMatch,
    ownership_match_reason: reasonCode,
    ownership_verified_at: verified ? now : account.ownership_verified_at,
    latest_ownership_verification_id: verification.id,
    status: verified ? "verified" : rejected ? "rejected" : "pending_review",
    verification_status: verified ? "verified" : rejected ? "rejected" : "pending_review",
    risk_status: verified ? "low" : rejected ? "high" : "manual_review",
    is_active: verified,
    verified_at: verified ? now : account.verified_at,
    verified_by: verified ? actorUserId : account.verified_by,
    metadata_json: {
      ...(account.metadata_json ?? {}),
      manual_ownership_verification_id: verification.id,
      ownership_verification_status: status,
      ownership_match: ownershipMatch,
      ownership_match_reason: reasonCode,
      manual_observed_tax_id_plaintext_stored: false,
      manual_observed_tax_id_compares_full_hash: true,
      payout_real_enabled: false,
      payout_eligible_for_real_money: verified
    }
  };

  const { data: updatedAccount, error: updateError } = await admin
    .from("provider_payout_accounts")
    .update(patch)
    .eq("id", account.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertPayoutAccountEvent(admin, {
    account: updatedAccount,
    eventType: verified ? "verified" : rejected ? "rejected" : "verification_requested",
    actorUserId,
    reason: reasonCode,
    traceId,
    correlationId: corrId,
    verificationId: verification.id
  });

  await insertAudit(admin, {
    eventType: "provider.payout_account.manual_ownership_verification",
    eventKey: `provider.payout_account.manual_ownership_verification.${account.id}.${traceId}`,
    actorUserId,
    providerId: account.provider_id,
    accountId: account.id,
    traceId,
    correlationId: corrId,
    environment: account.environment as string,
    isTest: Boolean(account.is_test),
    testRunId: account.test_run_id as string | null,
    fiscalVisibility: account.fiscal_visibility as string,
    metadata: {
      verification_id: verification.id,
      verification_provider: "manual_bank_review",
      verification_status: status,
      ownership_match: ownershipMatch,
      ownership_match_reason: reasonCode,
      observed_holder_name_masked: maskName(observedHolderName),
      observed_tax_id_last4: observedTaxLast4,
      kyc_tax_id_last4: provider.kyc_tax_id_last4 ?? null,
      compared_full_hash_not_last4: true,
      name_only_match_accepted: false,
      last4_only_match_accepted: false,
      observed_tax_id_plaintext_stored: false,
      raw_response_encrypted: true
    }
  });

  await insertRiskEvent(admin, {
    actorUserId,
    providerUserId: account.provider_user_id,
    providerId: account.provider_id,
    accountId: account.id,
    status,
    ownershipMatch,
    traceId,
    correlationId: corrId,
    environment: account.environment as string,
    isTest: Boolean(account.is_test),
    testRunId: account.test_run_id as string | null,
    fiscalVisibility: account.fiscal_visibility as string
  });

  return json({
    ok: true,
    account: publicAccount(updatedAccount),
    verification: publicVerification(verification),
    payout_real_enabled: false,
    raw_values_returned: false,
    manual_tax_id_plaintext_stored: false,
    trace_id: traceId,
    correlation_id: corrId
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
    const actor = await requireFinanceActor(admin, req, serviceRoleKey);
    if (!actor.ok) return actor.response;

    const body = await req.json().catch(() => ({}));
    const action = safeText(body.action || "verify", 80);
    const actorUserId = actor.user.id;

    if (action === "set_kyc_tax_id") {
      return await handleSetKycTaxId(admin, body, actorUserId, traceId, corrId);
    }
    if (action === "manual_verify") {
      return await handleManualBankReview(admin, body, actorUserId, traceId, corrId);
    }
    if (action !== "verify") return fail("UNKNOWN_VERIFICATION_ACTION", 400, { trace_id: traceId });

    const accountId = safeText(body.payout_account_id || body.account_id || body.accountId, 80);
    if (!accountId) return fail("PAYOUT_ACCOUNT_ID_REQUIRED", 400, { trace_id: traceId });

    const { data: account, error: accountError } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) return fail("PAYOUT_ACCOUNT_NOT_FOUND", 404, { trace_id: traceId });

    const { data: provider, error: providerError } = await admin
      .from("svc_providers")
      .select("id,user_id,approved,blocked,full_name,email,kyc_tax_id_hash,kyc_tax_id_last4,kyc_tax_id_masked,kyc_tax_id_status")
      .eq("id", account.provider_id)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!provider) return fail("PROVIDER_NOT_FOUND", 404, { trace_id: traceId });

    const { data: profile } = await admin
      .from("svc_provider_profiles")
      .select("kyc_status,review_status")
      .eq("provider_id", provider.id)
      .maybeSingle();

    const decrypted = await decryptPayload(account.encrypted_payload as JsonRecord);
    if (!decrypted) {
      const status = "pending_external_verification";
      const rawResponse = await encryptRawResponse({
        status,
        reason: "encrypted_payload_missing_or_key_unavailable",
        raw_account_values_exposed: false
      });
      const { data: verification, error: verificationError } = await admin
        .from("provider_payout_account_verifications")
        .insert({
          payout_account_id: account.id,
          provider_user_id: account.provider_user_id,
          provider_id: account.provider_id,
          verification_provider: "local",
          verification_status: status,
          account_active: null,
          account_type: account.account_type,
          bank_name: account.bank_name,
          ownership_match: false,
          ownership_match_reason: "encrypted_payload_required",
          raw_response_encrypted: rawResponse,
          reviewed_at: new Date().toISOString(),
          reviewed_by: actorUserId,
          review_reason: "No se pudo descifrar el CBU/CVU para verificar titularidad.",
          environment: account.environment,
          is_test: account.is_test,
          test_run_id: account.test_run_id,
          fiscal_visibility: account.fiscal_visibility,
          metadata_json: { raw_account_values_exposed: false, payout_real_enabled: false }
        })
        .select("*")
        .single();
      if (verificationError) throw verificationError;

      await admin.from("provider_payout_accounts").update({
        ownership_verification_status: status,
        ownership_match: false,
        ownership_match_reason: "encrypted_payload_required",
        latest_ownership_verification_id: verification.id,
        is_active: false,
        metadata_json: {
          ...(account.metadata_json ?? {}),
          ownership_verification_required: true
        }
      }).eq("id", account.id);

      return json({ ok: true, account: publicAccount(account), verification: publicVerification(verification), raw_values_returned: false, trace_id: traceId });
    }

    const providerKycTaxHash = provider.kyc_tax_id_hash as string | null;
    const providerKycTaxStatus = String(provider.kyc_tax_id_status || "missing");
    const kycApproved = isKycApproved(provider, profile ?? null);
    const riskLevel = await latestRiskLevel(admin, provider.id);

    const rawAccount = {
      accountType: String(decrypted.account_type || account.account_type),
      cbu: typeof decrypted.cbu === "string" ? decrypted.cbu : null,
      cvu: typeof decrypted.cvu === "string" ? decrypted.cvu : null,
      alias: typeof decrypted.alias === "string" ? decrypted.alias : null,
      declaredHolderName: typeof account.holder_name === "string" ? account.holder_name : null,
      declaredHolderTaxId: typeof decrypted.holder_tax_id === "string" ? decrypted.holder_tax_id : null
    };

    let providerResult = await verifyAccountWithProvider({
      ...rawAccount,
      isTest: Boolean(account.is_test),
      environment: String(account.environment || "production"),
      metadata: { bank_name: account.bank_name }
    });

    const holderHashes = [];
    const holdersPublic = [];
    for (const holder of providerResult.holders) {
      const rawTax = digitsOnly(holder.taxId);
      const taxHash = holder.taxIdHash || (rawTax ? await stableTaxHash(rawTax) : null);
      const last4 = holder.taxIdLast4 || (rawTax ? rawTax.slice(-4) : null);
      if (taxHash) holderHashes.push(taxHash);
      holdersPublic.push({
        name_masked: maskName(holder.name),
        tax_id_hash: taxHash,
        tax_id_last4: last4,
        raw_tax_id_exposed: false
      });
    }

    let status: string = "pending_external_verification";
    let reason = "provider_not_configured";
    let ownershipMatch = false;
    let accountActive = providerResult.accountActive;

    if (!providerKycTaxHash || providerKycTaxStatus !== "verified") {
      status = "pending_missing_tax_id";
      reason = "provider_kyc_tax_id_missing";
      providerResult = { ...providerResult, status: "pending_external_verification" };
    } else if (!kycApproved) {
      status = "manual_review";
      reason = "provider_kyc_not_approved";
    } else if (riskLevel === "critical") {
      status = "manual_review";
      reason = "provider_risk_critical";
    } else if (providerResult.status === "pending_external_verification") {
      status = "pending_external_verification";
      reason = providerResult.errorCode || "verification_provider_not_configured";
    } else if (providerResult.status === "verification_failed") {
      status = "verification_failed";
      reason = providerResult.errorCode || "verification_provider_failed";
    } else if (accountActive === false) {
      status = "account_inactive";
      reason = "account_inactive";
    } else if (!holderHashes.length) {
      status = "verification_failed";
      reason = "verification_response_missing_holder_tax_id";
    } else if (holderHashes.includes(providerKycTaxHash)) {
      status = "ownership_verified";
      reason = holderHashes.length > 1 ? "co_holder_tax_id_matches_kyc" : "holder_tax_id_matches_kyc";
      ownershipMatch = true;
    } else {
      status = "ownership_mismatch";
      reason = "holder_tax_id_does_not_match_kyc";
    }

    const firstHolder = holdersPublic[0] ?? null;
    const rawResponseEncrypted = await encryptRawResponse({
      provider: providerResult.provider,
      configured: providerResult.configured,
      status: providerResult.status,
      account_active: providerResult.accountActive,
      account_type: providerResult.accountType,
      bank_name: providerResult.bankName,
      holders: providerResult.rawResponse?.holders ?? providerResult.rawResponse,
      raw_account_values_exposed: false
    });

    const now = new Date().toISOString();
    const { data: verification, error: verificationError } = await admin
      .from("provider_payout_account_verifications")
      .insert({
        payout_account_id: account.id,
        provider_user_id: account.provider_user_id,
        provider_id: account.provider_id,
        verification_provider: providerResult.provider,
        verification_status: status,
        account_active: accountActive,
        account_type: providerResult.accountType || account.account_type,
        bank_name: providerResult.bankName || account.bank_name,
        holder_name_masked: firstHolder?.name_masked ?? null,
        holder_tax_id_hash: firstHolder?.tax_id_hash ?? null,
        holder_tax_id_last4: firstHolder?.tax_id_last4 ?? null,
        ownership_match: ownershipMatch,
        ownership_match_reason: reason,
        matched_kyc_tax_id_hash: ownershipMatch ? providerKycTaxHash : null,
        raw_response_encrypted: rawResponseEncrypted,
        metadata_json: {
          holder_count: holdersPublic.length,
          holder_tax_hashes_present: holderHashes.length,
          co_holder_match_allowed: true,
          kyc_approved: kycApproved,
          kyc_tax_id_status: providerKycTaxStatus,
          provider_risk_level: riskLevel,
          payout_real_enabled: false,
          raw_account_values_exposed: false,
          raw_tax_values_exposed: false,
          provider_error_code: providerResult.errorCode ?? null
        },
        verified_at: status === "ownership_verified" ? now : null,
        reviewed_at: now,
        reviewed_by: actorUserId,
        review_reason: safeText(body.reason || reason, 220),
        environment: account.environment,
        is_test: account.is_test,
        test_run_id: account.test_run_id,
        fiscal_visibility: account.fiscal_visibility
      })
      .select("*")
      .single();
    if (verificationError) throw verificationError;

    const verified = status === "ownership_verified";
    const rejected = ["ownership_mismatch", "account_inactive"].includes(status);
    if (verified) {
      await admin
        .from("provider_payout_accounts")
        .update({ is_active: false })
        .eq("provider_user_id", account.provider_user_id)
        .neq("id", account.id);
    }

    const patch = {
      holder_tax_id_hash: firstHolder?.tax_id_hash ?? account.holder_tax_id_hash,
      holder_tax_id_last4: firstHolder?.tax_id_last4 ?? account.holder_tax_id_last4,
      ownership_verification_status: status,
      ownership_match: ownershipMatch,
      ownership_match_reason: reason,
      ownership_verified_at: verified ? now : account.ownership_verified_at,
      latest_ownership_verification_id: verification.id,
      status: verified ? "verified" : rejected ? "rejected" : "pending_review",
      verification_status: verified ? "verified" : rejected ? "rejected" : "pending_review",
      risk_status: verified ? "low" : rejected ? "high" : "manual_review",
      is_active: verified,
      verified_at: verified ? now : account.verified_at,
      verified_by: verified ? actorUserId : account.verified_by,
      metadata_json: {
        ...(account.metadata_json ?? {}),
        ownership_verification_id: verification.id,
        ownership_verification_status: status,
        ownership_match: ownershipMatch,
        ownership_match_reason: reason,
        payout_real_enabled: false,
        payout_eligible_for_real_money: verified
      }
    };

    const { data: updatedAccount, error: updateError } = await admin
      .from("provider_payout_accounts")
      .update(patch)
      .eq("id", account.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await insertPayoutAccountEvent(admin, {
      account: updatedAccount,
      eventType: verified ? "verified" : rejected ? "rejected" : "verification_requested",
      actorUserId,
      reason,
      traceId,
      correlationId: corrId,
      verificationId: verification.id
    });

    await insertAudit(admin, {
      eventType: "provider.payout_account.ownership_verification",
      eventKey: `provider.payout_account.ownership_verification.${account.id}.${traceId}`,
      actorUserId,
      providerId: account.provider_id,
      accountId: account.id,
      traceId,
      correlationId: corrId,
      environment: account.environment as string,
      isTest: Boolean(account.is_test),
      testRunId: account.test_run_id as string | null,
      fiscalVisibility: account.fiscal_visibility as string,
      metadata: {
        verification_id: verification.id,
        verification_provider: providerResult.provider,
        verification_status: status,
        ownership_match: ownershipMatch,
        ownership_match_reason: reason,
        holder_tax_id_last4: firstHolder?.tax_id_last4 ?? null,
        kyc_tax_id_last4: provider.kyc_tax_id_last4 ?? null,
        kyc_approved: kycApproved,
        provider_risk_level: riskLevel,
        raw_response_encrypted: true
      }
    });

    await insertRiskEvent(admin, {
      actorUserId,
      providerUserId: account.provider_user_id,
      providerId: account.provider_id,
      accountId: account.id,
      status,
      ownershipMatch,
      traceId,
      correlationId: corrId,
      environment: account.environment as string,
      isTest: Boolean(account.is_test),
      testRunId: account.test_run_id as string | null,
      fiscalVisibility: account.fiscal_visibility as string
    });

    return json({
      ok: true,
      account: publicAccount(updatedAccount),
      verification: publicVerification(verification),
      payout_real_enabled: false,
      raw_values_returned: false,
      trace_id: traceId,
      correlation_id: corrId
    });
  } catch (error) {
    console.error(JSON.stringify({
      area: "verify_provider_payout_account",
      trace_id: traceId,
      correlation_id: corrId,
      error: errorMessage(error)
    }));
    return fail("VERIFY_PROVIDER_PAYOUT_ACCOUNT_FAILED", 500, {
      trace_id: traceId,
      correlation_id: corrId
    });
  }
});
