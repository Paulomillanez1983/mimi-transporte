import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";
import { postPaymentCaptureLedger } from "../_shared/payments/financial-ledger.ts";

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

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const rawBody = await req.text();
  const providerName = new URL(req.url).searchParams.get("provider") ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  const provider = getPaymentProvider(providerName);
  const traceId = crypto.randomUUID();
  const eventHash = await sha256Hex(`${providerName}:${rawBody}`);
  const event = await provider.parseWebhook(req, rawBody);
  const eventId = String(
    event.payload?.id ??
      event.payload?.event_id ??
      `${event.eventType}:${event.providerPaymentId}:${event.status}:${eventHash}`
  );
  const correlationId = eventId;
  const nextStatus = normalizeStatus(event.status);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  if (!event.valid) {
    await supabase.from("payment_processor_events").upsert({
      provider_name: providerName,
      provider_event_id: eventId,
      provider_payment_id: event.providerPaymentId ?? null,
      normalized_event_type: event.eventType ?? "payment.webhook.invalid",
      normalized_status: "INVALID_SIGNATURE",
      amount: numeric(event.payload?.amount),
      payload: event.payload,
      signature_valid: false,
      processed: false,
      dead_letter: true,
      dead_letter_reason: "invalid_signature",
      event_hash: eventHash,
      trace_id: traceId,
      correlation_id: correlationId,
      environment: "production",
      is_test: false,
      fiscal_visibility: "excluded_from_accounting"
    }, { onConflict: "provider_name,provider_event_id" });

    return fail("Invalid webhook signature", 401);
  }

  if (!event.providerPaymentId) {
    await supabase.from("financial_dead_letters").upsert({
      source: "payment_webhook",
      event_key: `${providerName}:${eventId}`,
      reason: "provider_payment_id_required",
      payload: event.payload,
      trace_id: traceId,
      correlation_id: correlationId
    }, { onConflict: "source,event_key" });

    return fail("provider payment id required", 400);
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_payment_id", event.providerPaymentId)
    .maybeSingle();

  if (error) return fail("Payment lookup failed", 500, error);

  if (!payment) {
    await supabase.from("payment_processor_events").upsert({
      provider_name: providerName,
      provider_event_id: eventId,
      provider_payment_id: event.providerPaymentId,
      normalized_event_type: event.eventType ?? "payment.webhook.orphan",
      normalized_status: nextStatus,
      amount: numeric(event.payload?.amount),
      payload: event.payload,
      signature_valid: true,
      processed: false,
      dead_letter: true,
      dead_letter_reason: "payment_not_found",
      event_hash: eventHash,
      trace_id: traceId,
      correlation_id: correlationId,
      environment: "production",
      is_test: false,
      fiscal_visibility: "fiscal_reportable"
    }, { onConflict: "provider_name,provider_event_id" });

    return fail("Payment not found", 404);
  }

  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingEvent) return json({ ok: true, duplicated: true });

  const outOfOrder = statusRank(nextStatus) < statusRank(payment.status);
  const patch: Record<string, unknown> = {
    status: outOfOrder ? payment.status : nextStatus,
    raw_response: event.payload
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

  if (updateError) return fail("Payment update failed", 500, updateError);

  await supabase.from("payment_processor_events").upsert({
    provider_name: providerName,
    provider_event_id: eventId,
    provider_payment_id: event.providerPaymentId,
    normalized_event_type: event.eventType ?? "payment.webhook",
    normalized_status: nextStatus,
    payment_id: payment.id,
    amount: numeric(payment.total_amount),
    currency: payment.currency ?? "ARS",
    payload: event.payload,
    signature_valid: true,
    processed: false,
    dead_letter: false,
    out_of_order: outOfOrder,
    provider_fee_amount: numeric(event.payload?.fee_amount ?? event.payload?.fee),
    event_hash: eventHash,
    trace_id: traceId,
    correlation_id: correlationId,
    environment: "production",
    is_test: false,
    fiscal_visibility: "fiscal_reportable"
  }, { onConflict: "provider_name,provider_event_id" });

  if (!outOfOrder && nextStatus === "APPROVED") {
    try {
      await postPaymentCaptureLedger(supabase, updated, eventId, {
        source: "payment_webhook",
        provider_name: providerName,
        provider_event_id: eventId,
        trace_id: traceId,
        correlation_id: correlationId,
        payment_id: payment.id,
        service_request_id: payment.service_request_id ?? null,
        provider_id: payment.provider_id ?? null,
        environment: "production",
        is_test: false,
        fiscal_visibility: "fiscal_reportable",
        metadata: {
          webhook_type: event.eventType ?? "payment.webhook",
          provider_fee_amount: numeric(event.payload?.fee_amount ?? event.payload?.fee)
        }
      });
    } catch (ledgerError) {
      console.error("[payment-webhook] financial ledger post failed", {
        paymentId: payment.id,
        eventId,
        status: nextStatus
      });

      return fail("FINANCIAL_LEDGER_POST_FAILED", 500, ledgerError);
    }
  }

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    provider_event_id: eventId,
    event_type: event.eventType ?? "payment.webhook",
    payload: event.payload
  });

  if (!outOfOrder && nextStatus === "APPROVED") {
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
        psp_fee_amount: numeric(event.payload?.fee_amount ?? event.payload?.fee),
        net_amount: numeric(payment.provider_amount),
        currency: payment.currency ?? "ARS",
        status: "available",
        environment: "production",
        is_test: false,
        fiscal_visibility: "fiscal_reportable",
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
        environment: "production",
        is_test: false,
        fiscal_visibility: "fiscal_reportable",
        trace_id: traceId,
        correlation_id: correlationId
      }, { onConflict: "revenue_key", ignoreDuplicates: true });
    }

    await supabase
      .from("payment_processor_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("provider_name", providerName)
      .eq("provider_event_id", eventId);
  }

  return json({ ok: true, payment: updated, out_of_order: outOfOrder });
});
