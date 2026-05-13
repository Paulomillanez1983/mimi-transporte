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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const rawBody = await req.text();
  const providerName = new URL(req.url).searchParams.get("provider") ?? Deno.env.get("PAYMENT_PROVIDER") ?? "mock";
  const provider = getPaymentProvider(providerName);
  const event = await provider.parseWebhook(req, rawBody);
  if (!event.valid) return fail("Invalid webhook signature", 401);
  if (!event.providerPaymentId) return fail("provider payment id required", 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_payment_id", event.providerPaymentId)
    .maybeSingle();

  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);

  const eventId = String(event.payload?.id ?? event.payload?.event_id ?? `${event.eventType}:${event.providerPaymentId}:${event.status}`);
  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingEvent) return json({ ok: true, duplicated: true });

  const nextStatus = normalizeStatus(event.status);
  const traceId = crypto.randomUUID();
  const correlationId = eventId;
  const patch: Record<string, unknown> = {
    status: nextStatus,
    raw_response: event.payload
  };

  if (nextStatus === "APPROVED") patch.approved_at = new Date().toISOString();
  if (nextStatus === "CANCELLED") patch.cancelled_at = new Date().toISOString();
  if (nextStatus === "REFUNDED") patch.refunded_at = new Date().toISOString();

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
    amount: Number(payment.total_amount ?? 0),
    currency: payment.currency ?? "ARS",
    payload: event.payload,
    signature_valid: true,
    processed: false,
    trace_id: traceId,
    correlation_id: correlationId,
    environment: "production",
    is_test: false,
    fiscal_visibility: "fiscal_reportable"
  }, { onConflict: "provider_name,provider_event_id" });

  if (nextStatus === "APPROVED") {
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
        metadata: { webhook_type: event.eventType ?? "payment.webhook" }
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

  if (nextStatus === "APPROVED") {
    await supabase.from("settlements").upsert({
      payment_id: payment.id,
      provider_id: payment.provider_id,
      gross_amount: payment.total_amount,
      platform_fee: payment.platform_fee,
      net_amount: payment.provider_amount,
      currency: payment.currency,
      status: "PENDING"
    }, { onConflict: "payment_id" });

    if (payment.provider_id) {
      await supabase.from("provider_earnings").upsert({
        provider_id: payment.provider_id,
        payment_id: payment.id,
        service_request_id: payment.service_request_id ?? null,
        earning_key: `provider.earning:${payment.id}`,
        gross_amount: Number(payment.total_amount ?? 0),
        commission_amount: Number(payment.platform_fee ?? 0),
        net_amount: Number(payment.provider_amount ?? 0),
        currency: payment.currency ?? "ARS",
        status: "earned",
        environment: "production",
        is_test: false,
        fiscal_visibility: "fiscal_reportable"
      }, { onConflict: "earning_key" });
    }

    await supabase.from("platform_revenue").upsert({
      payment_id: payment.id,
      service_request_id: payment.service_request_id ?? null,
      revenue_key: `platform.revenue:${payment.id}`,
      revenue_type: "commission",
      gross_amount: Number(payment.total_amount ?? 0),
      revenue_amount: Number(payment.platform_fee ?? 0),
      currency: payment.currency ?? "ARS",
      recognized_at: new Date().toISOString(),
      environment: "production",
      is_test: false,
      fiscal_visibility: "fiscal_reportable"
    }, { onConflict: "revenue_key" });

    await supabase
      .from("payment_processor_events")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("provider_name", providerName)
      .eq("provider_event_id", eventId);
  }

  return json({ ok: true, payment: updated });
});
