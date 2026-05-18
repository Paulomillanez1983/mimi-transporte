import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";
import { postPaymentCaptureLedger } from "../_shared/payments/financial-ledger.ts";
import { markOperationFailed, markOperationSucceeded, reserveOperationLock, sha256Hex } from "../_shared/payments/operation-locks.ts";

function normalizeStatus(status = "PENDING") {
  const value = String(status).toUpperCase();
  if (["APPROVED", "PAID", "CAPTURED"].includes(value)) return "APPROVED";
  if (["REJECTED", "FAILED"].includes(value)) return "REJECTED";
  if (["CANCELLED", "CANCELED", "VOIDED"].includes(value)) return "CANCELLED";
  if (["REFUNDED"].includes(value)) return "REFUNDED";
  return "PENDING";
}

function statusRank(status = "PENDING") {
  const value = normalizeStatus(status);
  if (value === "PENDING") return 1;
  if (value === "REJECTED" || value === "CANCELLED") return 3;
  if (value === "APPROVED") return 4;
  if (value === "REFUNDED") return 5;
  return 0;
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolFlag(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function paymentMarkedTest(payment: Record<string, unknown>) {
  const metadata = payment.metadata_json as Record<string, unknown> | null;
  return boolFlag(payment.is_test) || boolFlag(metadata?.is_test);
}

function envFlag(name: string, fallback = false) {
  const raw = Deno.env.get(name);
  if (raw == null) return fallback;
  return ["true", "1", "yes", "on"].includes(raw.toLowerCase());
}

function providerIsMercadoPago(providerName: unknown) {
  const provider = String(providerName ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  return provider === "mercadopago" || provider === "mercado_pago";
}

function webhookProviderName(req: Request) {
  try {
    return new URL(req.url).searchParams.get("provider") ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  } catch {
    return Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function paymentEnvironmentIsSandbox() {
  const env = String(Deno.env.get("PAYMENT_ENVIRONMENT") ?? "test").toLowerCase();
  return env !== "production" || !envFlag("PAYMENTS_REAL_ENABLED", false);
}

function mercadoPagoLocalPaymentId(raw: Record<string, unknown>) {
  const metadata = asRecord(raw.metadata);
  return String(raw.external_reference ?? metadata.payment_id ?? "").trim();
}

function mercadoPagoPayloadIsTest(raw: Record<string, unknown>) {
  const metadata = asRecord(raw.metadata);
  return raw.live_mode === false ||
    raw.livemode === false ||
    raw.sandbox === true ||
    metadata.is_test === true ||
    metadata.is_test === "true";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mercadoPagoApiStatus(error: unknown) {
  const match = errorMessage(error).match(/MERCADOPAGO_API_ERROR_(\d{3})/);
  return match ? Number(match[1]) : 0;
}

function mercadoPagoLog(level: "log" | "warn" | "error", message: string, details: Record<string, unknown> = {}) {
  console[level]("[payment-webhook][mercado_pago]", message, details);
}

serve(async (req) => {
  try {
    return await handlePaymentWebhook(req);
  } catch (error) {
    const providerName = webhookProviderName(req);
    const message = errorMessage(error);
    if (providerIsMercadoPago(providerName)) {
      mercadoPagoLog("error", "unhandled_error", { message });
    } else {
      console.error("[payment-webhook] unhandled error", { message });
    }
    return fail("PAYMENT_WEBHOOK_UNHANDLED", 500, { message });
  }
});

async function handlePaymentWebhook(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const rawBody = await req.text();
  const providerName = webhookProviderName(req);
  const provider = getPaymentProvider(providerName);
  const traceId = crypto.randomUUID();
  const eventHash = await sha256Hex(`${providerName}:${rawBody}`);
  const event = await provider.verifyWebhook(req, rawBody);
  const eventId = String(
    event.providerEventId ??
      event.payload?.id ??
      event.payload?.event_id ??
      `${event.eventType}:${event.providerPaymentId}:${event.status}:${eventHash}`
  );
  const correlationId = eventId;
  let nextStatus = normalizeStatus(event.status);
  let isTestEvent = Boolean(event.isTest || provider.name === "mock" || (providerIsMercadoPago(provider.name) && paymentEnvironmentIsSandbox()));
  const environment = isTestEvent ? "sandbox" : "production";
  const fiscalVisibility = isTestEvent ? "sandbox_only" : "fiscal_reportable";
  let providerPayload = event.payload;
  let providerFeeAmount = numeric(event.payload?.fee_amount ?? event.payload?.fee);
  let localPaymentIdFromProvider = "";

  if (providerIsMercadoPago(provider.name)) {
    mercadoPagoLog("log", "event_received", {
      trace_id: traceId,
      provider_event_id: eventId,
      provider_payment_id: event.providerPaymentId ?? null,
      event_type: event.eventType ?? null,
      valid: event.valid,
      is_test: isTestEvent
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  if (!event.valid) {
    if (providerIsMercadoPago(provider.name)) {
      mercadoPagoLog("warn", "invalid_signature_or_webhook", {
        trace_id: traceId,
        provider_event_id: eventId,
        provider_payment_id: event.providerPaymentId ?? null,
        error_code: event.errorCode ?? "invalid_signature"
      });
    }

    await supabase.from("payment_processor_events").upsert({
      provider_name: provider.name,
      provider_event_id: eventId,
      provider_payment_id: event.providerPaymentId ?? null,
      normalized_event_type: event.eventType ?? "payment.webhook.invalid",
      normalized_status: "INVALID_SIGNATURE",
      amount: numeric(event.payload?.amount),
      payload: providerPayload,
      signature_valid: false,
      processed: false,
      dead_letter: true,
      dead_letter_reason: event.errorCode ?? "invalid_signature",
      event_hash: eventHash,
      trace_id: traceId,
      correlation_id: correlationId,
      environment,
      is_test: isTestEvent,
      fiscal_visibility: "excluded_from_accounting"
    }, { onConflict: "provider_name,provider_event_id" });

    return fail("Invalid webhook signature", 401);
  }

  const operation = await reserveOperationLock(supabase, {
    operationType: "payment_webhook",
    operationKey: `${provider.name}:${eventId}`,
    idempotencyKey: `webhook:${provider.name}:${eventId}`,
    providerName: provider.name,
    providerPaymentId: event.providerPaymentId ?? null,
    providerEventId: eventId,
    requestBody: { event_id: eventId, event_hash: eventHash, status: nextStatus },
    rawEvent: event.payload,
    traceId,
    correlationId,
    environment,
    isTest: isTestEvent,
    fiscalVisibility,
    metadata: { replay_protection_key: event.replayProtectionKey ?? eventHash }
  });

  if (operation.replay) {
    return json({ ok: true, duplicated: true, replayed: true, trace_id: operation.lock?.trace_id, correlation_id: operation.lock?.correlation_id });
  }

  if (operation.conflict) {
    return json({ ok: true, duplicated: true, processing: true, trace_id: operation.lock?.trace_id, correlation_id: operation.lock?.correlation_id });
  }

  if (!operation.lock) {
    return fail("WEBHOOK_IDEMPOTENCY_RESERVATION_FAILED", 500);
  }

  if (!event.providerPaymentId) {
    if (providerIsMercadoPago(provider.name)) {
      mercadoPagoLog("warn", "missing_provider_payment_id", {
        trace_id: traceId,
        provider_event_id: eventId
      });
    }

    await supabase.from("financial_dead_letters").upsert({
      source: "payment_webhook",
      event_key: `${providerName}:${eventId}`,
      reason: "provider_payment_id_required",
      payload: event.payload,
      trace_id: traceId,
      correlation_id: correlationId
    }, { onConflict: "source,event_key" });

    await markOperationFailed(supabase, operation.lock.id, "PROVIDER_PAYMENT_ID_REQUIRED", "Webhook did not include provider payment id.", false);
    return fail("provider payment id required", 400);
  }

  if (providerIsMercadoPago(provider.name)) {
    try {
      const providerStatus = await provider.getPaymentStatus(event.providerPaymentId);
      nextStatus = normalizeStatus(providerStatus.status);
      providerPayload = {
        ...event.payload,
        mercado_pago_payment: providerStatus.rawResponse
      };
      providerFeeAmount = numeric(providerStatus.rawResponse?.fee_amount ?? event.payload?.fee_amount ?? event.payload?.fee);
      isTestEvent = isTestEvent || mercadoPagoPayloadIsTest(providerStatus.rawResponse);
      localPaymentIdFromProvider = mercadoPagoLocalPaymentId(providerStatus.rawResponse);
    } catch (statusError) {
      const statusCode = mercadoPagoApiStatus(statusError);
      const sandboxSimulatorEvent =
        (statusCode === 400 || statusCode === 404) &&
        (mercadoPagoPayloadIsTest(event.payload) || paymentEnvironmentIsSandbox());
      const authError = statusCode === 401 || statusCode === 403;

      if (sandboxSimulatorEvent) {
        mercadoPagoLog("warn", "sandbox_payment_not_found_or_simulator_event", {
          trace_id: traceId,
          provider_event_id: eventId,
          provider_payment_id: event.providerPaymentId,
          status_code: statusCode
        });

        await supabase.from("payment_processor_events").upsert({
          provider_name: provider.name,
          provider_event_id: eventId,
          provider_payment_id: event.providerPaymentId,
          normalized_event_type: event.eventType ?? "payment.webhook.sandbox_simulator",
          normalized_status: "SANDBOX_SIMULATOR_EVENT",
          amount: numeric(event.payload?.amount),
          payload: {
            ...event.payload,
            status_lookup_status: statusCode,
            reason: "sandbox_payment_not_found_or_simulator_event"
          },
          signature_valid: true,
          processed: true,
          processed_at: new Date().toISOString(),
          dead_letter: false,
          event_hash: eventHash,
          trace_id: traceId,
          correlation_id: correlationId,
          environment,
          is_test: true,
          fiscal_visibility: "excluded_from_accounting",
          financial_operation_lock_id: operation.lock.id
        }, { onConflict: "provider_name,provider_event_id" });

        await markOperationSucceeded(supabase, operation.lock.id, {
          accepted: true,
          reason: "sandbox_payment_not_found_or_simulator_event",
          provider_payment_id: event.providerPaymentId
        });

        return json({
          ok: true,
          accepted: true,
          provider: "mercado_pago",
          reason: "sandbox_payment_not_found_or_simulator_event",
          payment_id: event.providerPaymentId
        }, 202);
      }

      if (authError) {
        mercadoPagoLog("error", "mercado_pago_auth_error", {
          trace_id: traceId,
          provider_event_id: eventId,
          provider_payment_id: event.providerPaymentId,
          status_code: statusCode
        });

        await supabase.from("payment_processor_events").upsert({
          provider_name: provider.name,
          provider_event_id: eventId,
          provider_payment_id: event.providerPaymentId,
          normalized_event_type: event.eventType ?? "payment.webhook.status_lookup_failed",
          normalized_status: "STATUS_LOOKUP_AUTH_ERROR",
          amount: numeric(event.payload?.amount),
          payload: { ...event.payload, error_code: "mercado_pago_auth_error", status_code: statusCode },
          signature_valid: true,
          processed: false,
          dead_letter: true,
          dead_letter_reason: "mercado_pago_auth_error",
          event_hash: eventHash,
          trace_id: traceId,
          correlation_id: correlationId,
          environment,
          is_test: isTestEvent,
          fiscal_visibility: fiscalVisibility,
          financial_operation_lock_id: operation.lock.id
        }, { onConflict: "provider_name,provider_event_id" });

        await markOperationFailed(supabase, operation.lock.id, "MERCADO_PAGO_AUTH_ERROR", "Mercado Pago rejected the access token or permissions.", true);
        return fail("mercado_pago_auth_error", 502, {
          provider: "mercado_pago",
          status_code: statusCode,
          trace_id: traceId
        });
      }

      mercadoPagoLog("error", "status_lookup_failed", {
        trace_id: traceId,
        provider_event_id: eventId,
        provider_payment_id: event.providerPaymentId,
        status_code: statusCode || null,
        message: errorMessage(statusError)
      });

      await supabase.from("payment_processor_events").upsert({
        provider_name: provider.name,
        provider_event_id: eventId,
        provider_payment_id: event.providerPaymentId,
        normalized_event_type: event.eventType ?? "payment.webhook.status_lookup_failed",
        normalized_status: "STATUS_LOOKUP_FAILED",
        amount: numeric(event.payload?.amount),
        payload: { ...event.payload, error: statusError instanceof Error ? statusError.message : String(statusError) },
        signature_valid: true,
        processed: false,
        dead_letter: true,
        dead_letter_reason: "provider_status_lookup_failed",
        event_hash: eventHash,
        trace_id: traceId,
        correlation_id: correlationId,
        environment,
        is_test: isTestEvent,
        fiscal_visibility: fiscalVisibility,
        financial_operation_lock_id: operation.lock.id
      }, { onConflict: "provider_name,provider_event_id" });

      await markOperationFailed(supabase, operation.lock.id, "PROVIDER_STATUS_LOOKUP_FAILED", errorMessage(statusError), true);
      return fail("mercado_pago_status_lookup_failed", 502, {
        provider: "mercado_pago",
        status_code: statusCode || null,
        trace_id: traceId
      });
    }
  }

  let { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_payment_id", event.providerPaymentId)
    .maybeSingle();

  if (error) return fail("Payment lookup failed", 500, error);

  if (!payment && localPaymentIdFromProvider) {
    const lookup = await supabase
      .from("payments")
      .select("*")
      .eq("id", localPaymentIdFromProvider)
      .maybeSingle();
    if (lookup.error) return fail("Payment lookup failed", 500, lookup.error);
    payment = lookup.data;

    if (payment) {
      await supabase
        .from("payments")
        .update({
          provider_payment_id: event.providerPaymentId,
          raw_response: {
            ...asRecord(payment.raw_response),
            mercado_pago_payment_id: event.providerPaymentId,
            provider_preference_id: payment.provider_payment_id ?? null
          }
        })
        .eq("id", payment.id);
    }
  }

  if (!payment) {
    await supabase.from("payment_processor_events").upsert({
      provider_name: provider.name,
      provider_event_id: eventId,
      provider_payment_id: event.providerPaymentId,
      normalized_event_type: event.eventType ?? "payment.webhook.orphan",
      normalized_status: nextStatus,
      amount: numeric(event.payload?.amount),
      payload: providerPayload,
      signature_valid: true,
      processed: false,
      dead_letter: true,
      dead_letter_reason: "payment_not_found",
      event_hash: eventHash,
      trace_id: traceId,
      correlation_id: correlationId,
      environment,
      is_test: isTestEvent,
      fiscal_visibility: fiscalVisibility,
      financial_operation_lock_id: operation.lock.id
    }, { onConflict: "provider_name,provider_event_id" });

    await markOperationFailed(supabase, operation.lock.id, "PAYMENT_NOT_FOUND", "Webhook payment not found.", false);
    return fail("Payment not found", 404);
  }

  const effectiveIsTest = isTestEvent || paymentMarkedTest(payment);
  const effectiveEnvironment = effectiveIsTest ? "sandbox" : "production";
  const effectiveFiscalVisibility = effectiveIsTest ? "excluded_from_accounting" : "fiscal_reportable";

  const operationLockContext = operation.lock as Record<string, unknown>;
  if (Boolean(operationLockContext.is_test) !== effectiveIsTest || operationLockContext.environment !== effectiveEnvironment) {
    await supabase
      .from("financial_operation_locks")
      .update({
        is_test: effectiveIsTest,
        environment: effectiveEnvironment,
        fiscal_visibility: effectiveFiscalVisibility
      })
      .eq("id", operation.lock.id);
  }

  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingEvent) {
    await markOperationSucceeded(supabase, operation.lock.id, { duplicated: true, payment_id: payment.id });
    return json({ ok: true, duplicated: true });
  }

  const outOfOrder = statusRank(nextStatus) < statusRank(payment.status);
  const patch: Record<string, unknown> = {
    status: outOfOrder ? payment.status : nextStatus,
    raw_response: providerPayload,
    is_test: effectiveIsTest,
    environment: effectiveEnvironment,
    fiscal_visibility: effectiveFiscalVisibility
  };

  if (!outOfOrder && nextStatus === "APPROVED") patch.approved_at = new Date().toISOString();
  if (!outOfOrder && nextStatus === "CANCELLED") patch.cancelled_at = new Date().toISOString();
  if (!outOfOrder && nextStatus === "REFUNDED") patch.refunded_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update(patch)
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) {
    await markOperationFailed(supabase, operation.lock.id, "PAYMENT_UPDATE_FAILED", JSON.stringify(updateError), true);
    return fail("Payment update failed", 500, updateError);
  }

  await supabase.from("payment_processor_events").upsert({
    provider_name: provider.name,
    provider_event_id: eventId,
    provider_payment_id: event.providerPaymentId,
    normalized_event_type: event.eventType ?? "payment.webhook",
    normalized_status: nextStatus,
    payment_id: payment.id,
    amount: numeric(payment.total_amount),
    currency: payment.currency ?? "ARS",
    payload: providerPayload,
    signature_valid: true,
    processed: false,
    dead_letter: false,
    out_of_order: outOfOrder,
    provider_fee_amount: providerFeeAmount,
    event_hash: eventHash,
    trace_id: traceId,
    correlation_id: correlationId,
    environment: effectiveEnvironment,
    is_test: effectiveIsTest,
    fiscal_visibility: effectiveFiscalVisibility,
    financial_operation_lock_id: operation.lock.id
  }, { onConflict: "provider_name,provider_event_id" });

  if (!outOfOrder && nextStatus === "APPROVED") {
    try {
      if (!await paymentCaptureLedgerAlreadyPosted(supabase, String(payment.id))) {
        await postPaymentCaptureLedger(supabase, updated, eventId, {
          source: "payment_webhook",
          provider_name: provider.name,
          provider_event_id: eventId,
          trace_id: traceId,
          correlation_id: correlationId,
          payment_id: payment.id,
          service_request_id: payment.service_request_id ?? null,
          provider_id: payment.provider_id ?? null,
          environment: effectiveEnvironment as "production" | "sandbox",
          is_test: effectiveIsTest,
          fiscal_visibility: effectiveFiscalVisibility as "fiscal_reportable" | "sandbox_only" | "excluded_from_accounting",
          metadata: {
            webhook_type: event.eventType ?? "payment.webhook",
            provider_fee_amount: providerFeeAmount
          }
        });
      }
    } catch (ledgerError) {
      console.error("[payment-webhook] financial ledger post failed", {
        paymentId: payment.id,
        eventId,
        status: nextStatus
      });

      await markOperationFailed(supabase, operation.lock.id, "FINANCIAL_LEDGER_POST_FAILED", ledgerError instanceof Error ? ledgerError.message : String(ledgerError), false);
      return fail("FINANCIAL_LEDGER_POST_FAILED", 500, ledgerError);
    }
  }

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    provider_event_id: eventId,
    event_type: event.eventType ?? "payment.webhook",
    payload: { ...providerPayload, trace_id: traceId, correlation_id: correlationId, operation_lock_id: operation.lock.id },
    environment: effectiveEnvironment,
    is_test: effectiveIsTest,
    fiscal_visibility: effectiveFiscalVisibility
  });

  if (!effectiveIsTest && !outOfOrder && nextStatus === "APPROVED") {
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

    if (payment.provider_id && ledger?.id) {
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
        environment: effectiveEnvironment,
        is_test: effectiveIsTest,
        fiscal_visibility: effectiveFiscalVisibility,
        trace_id: traceId,
        correlation_id: correlationId
      }, { onConflict: "earning_key", ignoreDuplicates: true });
    }

    if (ledger?.id) {
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
        environment: effectiveEnvironment,
        is_test: effectiveIsTest,
        fiscal_visibility: effectiveFiscalVisibility,
        trace_id: traceId,
        correlation_id: correlationId
      }, { onConflict: "revenue_key", ignoreDuplicates: true });
    }

    if (payment.provider_id) {
      await supabase.rpc("financial_recompute_provider_wallet_foundation", {
        p_provider_id: payment.provider_id,
        p_environment: effectiveEnvironment,
        p_is_test: effectiveIsTest
      });
    }
  }

  await supabase
    .from("payment_processor_events")
    .update({ processed: !outOfOrder, processed_at: new Date().toISOString() })
    .eq("provider_name", provider.name)
    .eq("provider_event_id", eventId);

  await markOperationSucceeded(supabase, operation.lock.id, { payment: updated, out_of_order: outOfOrder });

  return json({ ok: true, payment: updated, out_of_order: outOfOrder });
}
