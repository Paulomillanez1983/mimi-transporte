import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { postPaymentCaptureLedger } from "../_shared/payments/financial-ledger.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";

const FINAL_PAYMENT_STATUSES = new Set([
  "APPROVED",
  "CAPTURED",
  "CANCELLED",
  "REJECTED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "SETTLED"
]);

const SYNCABLE_PAYMENT_STATUSES = new Set(["PENDING", "CHECKOUT_CREATED"]);

function normalizeProviderName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function isMercadoPagoProvider(value: unknown) {
  const provider = normalizeProviderName(value);
  return provider === "mercadopago" || provider === "mercado_pago";
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProviderStatus(status: unknown, currentStatus: string) {
  const next = String(status ?? "").trim().toUpperCase();
  if (!next) return currentStatus;
  if (next === "PENDING" && currentStatus === "CHECKOUT_CREATED") return currentStatus;
  if (["PENDING", "CHECKOUT_CREATED", "APPROVED", "CAPTURED", "REJECTED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "SETTLED"].includes(next)) {
    return next;
  }
  return currentStatus;
}

async function paymentCaptureLedgerAlreadyPosted(supabase: ReturnType<typeof createClient>, paymentId: string) {
  const { data } = await supabase
    .from("financial_transactions")
    .select("id")
    .eq("transaction_key", `payment.capture:${paymentId}`)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function postApprovedPaymentAccounting(
  supabase: ReturnType<typeof createClient>,
  payment: Record<string, unknown>,
  providerRaw: Record<string, unknown>,
  eventId: string,
  environment: string,
  isTest: boolean,
  fiscalVisibility: string,
) {
  if (isTest || !payment.provider_id) return;

  const paymentId = String(payment.id ?? "");
  if (!paymentId || await paymentCaptureLedgerAlreadyPosted(supabase, paymentId)) return;

  const traceId = `payment-status-sync:${paymentId}`;
  const correlationId = eventId;
  const providerFeeAmount = numeric(providerRaw.fee_amount ?? providerRaw.fee);

  await postPaymentCaptureLedger(supabase, payment, eventId, {
    source: "payment_status_sync",
    provider_name: String(payment.provider_name ?? "mercadopago"),
    provider_event_id: eventId,
    trace_id: traceId,
    correlation_id: correlationId,
    payment_id: paymentId,
    service_request_id: String(payment.service_request_id ?? "") || null,
    provider_id: String(payment.provider_id ?? "") || null,
    environment: environment as "production" | "sandbox",
    is_test: isTest,
    fiscal_visibility: fiscalVisibility as "fiscal_reportable" | "sandbox_only" | "excluded_from_accounting",
    metadata: {
      provider_status_sync: true,
      provider_fee_amount: providerFeeAmount
    }
  });

  await supabase.from("settlements").upsert({
    payment_id: payment.id,
    provider_id: payment.provider_id,
    gross_amount: payment.total_amount,
    platform_fee: payment.platform_fee,
    net_amount: payment.provider_amount,
    currency: payment.currency,
    status: "PENDING"
  }, { onConflict: "payment_id" });

  const { data: ledger } = await supabase
    .from("financial_ledgers")
    .select("id")
    .eq("code", "operational_financial_ledger")
    .maybeSingle();

  if (ledger?.id) {
    await supabase.from("provider_earnings").upsert({
      ledger_id: ledger.id,
      provider_id: payment.provider_id,
      payment_id: payment.id,
      service_request_id: payment.service_request_id ?? null,
      earning_key: `provider.earning:${payment.id}`,
      gross_amount: numeric(payment.total_amount),
      commission_amount: numeric(payment.platform_fee),
      psp_fee_amount: providerFeeAmount,
      net_amount: numeric(payment.provider_amount),
      currency: payment.currency ?? "ARS",
      status: "available",
      environment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      trace_id: traceId,
      correlation_id: correlationId
    }, { onConflict: "earning_key", ignoreDuplicates: true });

    await supabase.from("platform_revenue").upsert({
      ledger_id: ledger.id,
      payment_id: payment.id,
      service_request_id: payment.service_request_id ?? null,
      revenue_key: `platform.revenue:${payment.id}`,
      revenue_type: "commission",
      gross_amount: numeric(payment.total_amount),
      revenue_amount: numeric(payment.platform_fee),
      net_amount: numeric(payment.platform_fee),
      currency: payment.currency ?? "ARS",
      recognized_at: new Date().toISOString(),
      environment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      trace_id: traceId,
      correlation_id: correlationId
    }, { onConflict: "revenue_key", ignoreDuplicates: true });
  }

  await supabase.rpc("financial_recompute_provider_wallet_foundation", {
    p_provider_id: payment.provider_id,
    p_environment: environment,
    p_is_test: isTest
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return fail("Missing Supabase env", 500);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return fail("AUTH_REQUIRED", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return fail("Invalid JWT", 401);

  const body = await readJson(req);
  const paymentId = String(body.payment_id ?? "").trim();
  if (!paymentId) return fail("payment_id required", 400);
  const requestedProviderPaymentId = String(body.provider_payment_id ?? body.mercadopago_payment_id ?? body.collection_id ?? "").trim();

  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);

  const isParticipant =
    payment.customer_id === userId ||
    Boolean(payment.provider_id) &&
      Boolean((await supabase.from("svc_providers").select("id").eq("id", payment.provider_id).eq("user_id", userId).maybeSingle()).data);

  const isAdmin = Boolean((await supabase.from("admin_users").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle()).data);
  if (!isParticipant && !isAdmin) return fail("Forbidden", 403);

  const currentStatus = String(payment.status ?? "PENDING").toUpperCase();
  if (
    !isMercadoPagoProvider(payment.provider_name) ||
    FINAL_PAYMENT_STATUSES.has(currentStatus) ||
    !SYNCABLE_PAYMENT_STATUSES.has(currentStatus)
  ) {
    return json({ ok: true, payment, synced: false });
  }

  const providerPaymentId = requestedProviderPaymentId || String(payment.provider_payment_id ?? "").trim();
  if (!providerPaymentId) {
    return json({
      ok: true,
      payment,
      synced: false,
      sync_warning: "provider_payment_id_missing"
    });
  }

  try {
    const provider = getPaymentProvider(payment.provider_name);
    const providerResult = await provider.getPaymentStatus(providerPaymentId);
    const providerRaw = rawRecord(providerResult.rawResponse);
    const nextStatus = normalizeProviderStatus(providerResult.status, currentStatus);
    const effectiveIsTest = boolValue(payment.is_test) || boolValue(providerRaw.is_test);
    const effectiveFiscalVisibility = effectiveIsTest
      ? "excluded_from_accounting"
      : String(payment.fiscal_visibility ?? providerRaw.fiscal_visibility ?? "fiscal_reportable");
    const effectiveEnvironment = effectiveIsTest ? "sandbox" : String(payment.environment ?? "production");

    const existingRaw = rawRecord(payment.raw_response);
    const patch: Record<string, unknown> = {
      status: nextStatus,
      provider_name: providerResult.providerName,
      provider_payment_id: providerResult.providerPaymentId || providerPaymentId,
      raw_response: {
        ...existingRaw,
        ...providerRaw,
        provider_status_sync: true,
        previous_local_status: currentStatus
      },
      payment_method_status: nextStatus === "APPROVED" ? "approved" : "provider_status_synced",
      environment: effectiveEnvironment,
      is_test: effectiveIsTest,
      fiscal_visibility: effectiveFiscalVisibility,
      updated_at: new Date().toISOString()
    };

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update(patch)
      .eq("id", payment.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    const statusSyncEventId = `status-sync:${providerResult.providerName}:${providerResult.providerPaymentId || providerPaymentId}:${nextStatus}`;

    if (nextStatus !== currentStatus) {
      await supabase.from("payment_events").insert({
        payment_id: payment.id,
        event_type: "payment_status.synced",
        provider_event_id: statusSyncEventId,
        payload: providerRaw,
        environment: effectiveEnvironment,
        is_test: effectiveIsTest,
        fiscal_visibility: effectiveFiscalVisibility
      });

      if (nextStatus === "APPROVED" && !["APPROVED", "CAPTURED", "SETTLED"].includes(currentStatus)) {
        await postApprovedPaymentAccounting(
          supabase,
          updatedPayment,
          providerRaw,
          statusSyncEventId,
          effectiveEnvironment,
          effectiveIsTest,
          effectiveFiscalVisibility,
        );
      }
    }

    return json({
      ok: true,
      payment: updatedPayment,
      synced: true,
      provider_status: providerResult.status
    });
  } catch (syncError) {
    console.warn("[get-payment-status] provider sync failed", {
      payment_id: payment.id,
      provider_name: payment.provider_name,
      provider_payment_id: providerPaymentId,
      error: syncError instanceof Error ? syncError.message : String(syncError)
    });

    return json({
      ok: true,
      payment,
      synced: false,
      sync_warning: "provider_sync_failed",
      provider_warning: syncError instanceof Error ? syncError.message : String(syncError)
    });
  }
});
