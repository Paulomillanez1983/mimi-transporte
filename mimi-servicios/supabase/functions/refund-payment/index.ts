import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";
import { postRefundLedger } from "../_shared/payments/financial-ledger.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return fail("AUTH_REQUIRED", 401);

  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return fail("Invalid JWT", 401);

  const isAdmin = Boolean((await supabase
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", userId)
    .eq("active", true)
    .in("role", ["ADMIN", "SUPERADMIN", "FINANCE", "FINANCE_ADMIN"])
    .maybeSingle()).data);
  if (!isAdmin) return fail("Forbidden", 403);

  const body = await readJson(req);
  const paymentId = String(body.payment_id ?? "").trim();
  const reason = String(body.reason ?? "admin_refund").slice(0, 280);
  if (!paymentId) return fail("payment_id required", 400);

  const { data: payment, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);
  if (!["APPROVED", "CAPTURED", "SETTLED", "PARTIALLY_REFUNDED"].includes(payment.status)) return fail("Payment cannot be refunded", 409);

  const { data: existingRefunds } = await supabase
    .from("refunds")
    .select("amount,status")
    .eq("payment_id", payment.id)
    .in("status", ["REFUNDED", "REFUND_PENDING", "PARTIALLY_REFUNDED"]);

  const alreadyRefunded = (existingRefunds || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const remaining = Math.max(Number(payment.total_amount) - alreadyRefunded, 0);
  const amount = Math.min(Number(body.amount ?? remaining), remaining);
  if (amount <= 0) return fail("Invalid refund amount", 400);

  const { data: settlementItem } = await supabase
    .from("settlement_items")
    .select("settlement_id, provider_settlements!inner(id,status)")
    .eq("payment_id", payment.id)
    .maybeSingle();

  const settlementStatus = String(settlementItem?.provider_settlements?.status ?? "");
  const allowCompensatingAdjustment = Boolean(body.allow_compensating_adjustment);
  if (["paid", "locked"].includes(settlementStatus) && !allowCompensatingAdjustment) {
    return fail("SETTLEMENT_LOCKED_REQUIRES_COMPENSATING_ADJUSTMENT", 409);
  }

  const provider = getPaymentProvider(payment.provider_name);
  const providerResult = await provider.refundPayment(payment.provider_payment_id ?? payment.id, amount, reason);
  const traceId = crypto.randomUUID();
  const idempotencyKey = String(body.idempotency_key ?? `refund:${payment.id}:${amount}:${reason}`).slice(0, 220);
  const correlationId = idempotencyKey;

  const { data: ledger } = await supabase
    .from("financial_ledgers")
    .select("id")
    .eq("code", "operational_financial_ledger")
    .maybeSingle();

  const refundKey = `refund:${payment.id}:${providerResult.providerPaymentId ?? idempotencyKey}`;
  const { data: existingRefund } = await supabase
    .from("refunds")
    .select("*")
    .eq("refund_key", refundKey)
    .maybeSingle();

  if (existingRefund) {
    return json({ ok: true, duplicated: true, refund: existingRefund });
  }

  const { data: refund, error: refundError } = await supabase
    .from("refunds")
    .insert({
      ledger_id: ledger?.id ?? null,
      payment_id: payment.id,
      amount,
      reason,
      status: providerResult.status,
      provider_refund_id: providerResult.providerPaymentId,
      raw_response: providerResult.rawResponse,
      refund_key: refundKey,
      idempotency_key: idempotencyKey,
      actor_user_id: userId,
      provider_settlement_id: settlementItem?.settlement_id ?? null,
      evidence_url: typeof body.evidence_url === "string" ? body.evidence_url.slice(0, 500) : null,
      environment: "production",
      is_test: false,
      fiscal_visibility: "fiscal_reportable",
      trace_id: traceId,
      correlation_id: correlationId
    })
    .select("*")
    .single();

  if (refundError) return fail("Refund insert failed", 500, refundError);

  try {
    await postRefundLedger(supabase, payment, refund, {
      source: "refund_payment",
      actor_user_id: userId,
      payment_id: payment.id,
      provider_id: payment.provider_id ?? null,
      service_request_id: payment.service_request_id ?? null,
      trace_id: traceId,
      correlation_id: correlationId,
      environment: "production",
      is_test: false,
      fiscal_visibility: "fiscal_reportable",
      metadata: { reason }
    });
  } catch (ledgerError) {
    console.error("[refund-payment] financial ledger post failed", {
      paymentId: payment.id,
      refundId: refund.id
    });

    return fail("FINANCIAL_LEDGER_POST_FAILED", 500, ledgerError);
  }

  const nextStatus = amount >= Number(payment.total_amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ status: nextStatus, refunded_at: new Date().toISOString(), raw_response: providerResult.rawResponse })
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) return fail("Payment refund update failed", 500, updateError);

  if (settlementItem?.settlement_id && !["paid", "locked"].includes(settlementStatus)) {
    await supabase
      .from("provider_settlements")
      .update({
        refund_amount: amount,
        status: "pending_review",
        updated_at: new Date().toISOString()
      })
      .eq("id", settlementItem.settlement_id);
  }

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "payment.refunded",
    payload: { refund, provider: providerResult.rawResponse }
  });

  await supabase.from("refund_events").insert({
    refund_id: refund.id,
    event_type: "refund.created",
    status: providerResult.status,
    payload: { reason, amount, provider: providerResult.rawResponse },
    trace_id: traceId,
    correlation_id: correlationId,
    environment: "production",
    is_test: false
  });

  return json({ ok: true, payment: updated, refund });
});
