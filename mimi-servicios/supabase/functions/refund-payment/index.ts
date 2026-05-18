import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";
import { calculateRefundAccountingImpact, postRefundLedger } from "../_shared/payments/financial-ledger.ts";
import { markOperationFailed, markOperationSucceeded, reserveOperationLock, sha256Hex } from "../_shared/payments/operation-locks.ts";

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function isRefundCompleted(status: unknown) {
  return ["REFUNDED", "APPROVED", "COMPLETED", "SUCCEEDED"].includes(String(status ?? "").toUpperCase());
}

function boolFlag(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function providerIsTestLike(providerName: unknown) {
  const provider = String(providerName ?? "").toLowerCase();
  return provider === "mock" || provider === "test";
}

function paymentMarkedTest(payment: Record<string, unknown>) {
  const metadata = payment.metadata_json as Record<string, unknown> | null;
  return boolFlag(payment.is_test) || boolFlag(metadata?.is_test);
}

function resolveRefundTestContext(body: Record<string, unknown>, payment: Record<string, unknown>) {
  const requestedTest = boolFlag(body.is_test);
  const originalPaymentIsTest = paymentMarkedTest(payment);
  const providerAllowsTest = providerIsTestLike(payment.provider_name) || String(payment.payment_method ?? "").toLowerCase() === "mock";

  if (requestedTest && !originalPaymentIsTest && !providerAllowsTest) {
    return {
      ok: false as const,
      error: "TEST_REFUND_NOT_ALLOWED",
      details: {
        reason: "Refund test mode requires an original test payment or an explicit mock/test payment provider."
      }
    };
  }

  const isTest = originalPaymentIsTest || (requestedTest && providerAllowsTest);
  return {
    ok: true as const,
    isTest,
    fiscalVisibility: isTest ? "excluded_from_accounting" : "fiscal_reportable"
  };
}

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

  const testContext = resolveRefundTestContext(body, payment);
  if (!testContext.ok) return fail(testContext.error, 403, testContext.details);
  const { isTest, fiscalVisibility } = testContext;
  const refundEnvironment = isTest ? "sandbox" : "production";

  const { data: existingRefunds } = await supabase
    .from("refunds")
    .select("amount,status")
    .eq("payment_id", payment.id)
    .in("status", ["REFUNDED", "REFUND_PENDING", "PARTIALLY_REFUNDED"]);

  const alreadyRefunded = money((existingRefunds || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const remaining = Math.max(money(Number(payment.total_amount) - alreadyRefunded), 0);
  const requestedAmount = body.amount == null ? remaining : money(body.amount);
  const amount = Math.min(requestedAmount, remaining);
  if (amount <= 0) return fail("Invalid refund amount", 400);
  if (requestedAmount > remaining) {
    return fail("REFUND_AMOUNT_EXCEEDS_REMAINING", 409, { requested_amount: requestedAmount, remaining_amount: remaining });
  }

  const { data: settlementItem } = await supabase
    .from("settlement_items")
    .select("settlement_id, provider_settlements!inner(id,status,batch_id,refund_amount,net_amount)")
    .eq("payment_id", payment.id)
    .maybeSingle();

  const settlementStatus = String(settlementItem?.provider_settlements?.status ?? "");
  const { data: payout } = settlementItem?.settlement_id
    ? await supabase
      .from("payouts")
      .select("id,status,amount")
      .eq("provider_settlement_id", settlementItem.settlement_id)
      .maybeSingle()
    : { data: null };
  const payoutStatus = String(payout?.status ?? "");
  const { data: closedPaymentPeriod } = await supabase
    .from("accounting_periods")
    .select("id,status,period_key")
    .lte("period_start", payment.created_at)
    .gte("period_end", payment.created_at)
    .in("status", ["closed", "locked"])
    .maybeSingle();
  const requiresCarryForward = ["paid", "locked", "payout_pending"].includes(settlementStatus) || ["paid", "sent", "processing"].includes(payoutStatus) || Boolean(closedPaymentPeriod);
  const allowCompensatingAdjustment = Boolean(body.allow_compensating_adjustment);
  if (requiresCarryForward && !allowCompensatingAdjustment) {
    return fail("FINANCIAL_CLOSED_IMPACT_REQUIRES_COMPENSATING_ADJUSTMENT", 409, {
      settlement_status: settlementStatus || "none",
      payout_status: payoutStatus || "none",
      accounting_period_status: closedPaymentPeriod?.status ?? "open"
    });
  }

  const traceId = crypto.randomUUID();
  const idempotencyKey = String(
    req.headers.get("x-idempotency-key") ??
      body.idempotency_key ??
      `refund:${payment.id}:${amount}:${await sha256Hex(reason)}`
  ).slice(0, 220);
  const correlationId = idempotencyKey;
  const provider = getPaymentProvider(payment.provider_name);
  const operation = await reserveOperationLock(supabase, {
    operationType: "payment_refund",
    operationKey: idempotencyKey,
    idempotencyKey,
    providerName: provider.name,
    paymentId: payment.id,
    providerPaymentId: payment.provider_payment_id ?? payment.id,
    requestBody: { payment_id: payment.id, amount, reason_hash: await sha256Hex(reason), allow_compensating_adjustment: allowCompensatingAdjustment },
    actorUserId: userId,
    traceId,
    correlationId,
    isTest,
    fiscalVisibility,
    metadata: {
      requested_test: boolFlag(body.is_test),
      payment_marked_test: paymentMarkedTest(payment),
      provider_allows_test: providerIsTestLike(payment.provider_name)
    }
  });

  if (operation.replay && operation.lock?.response_json) {
    return json({ ok: true, replayed: true, ...operation.lock.response_json });
  }

  if (operation.conflict) {
    return fail("REFUND_ALREADY_PROCESSING", 409, { trace_id: operation.lock?.trace_id, correlation_id: operation.lock?.correlation_id });
  }

  if (!operation.lock) {
    return fail("REFUND_IDEMPOTENCY_RESERVATION_FAILED", 500);
  }

  const accountingImpact = calculateRefundAccountingImpact(payment, amount, alreadyRefunded);

  const { data: ledger } = await supabase
    .from("financial_ledgers")
    .select("id")
    .eq("code", "operational_financial_ledger")
    .maybeSingle();

  const { data: existingRefund } = await supabase
    .from("refunds")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingRefund) {
    await markOperationSucceeded(supabase, operation.lock.id, { refund: existingRefund });
    return json({ ok: true, duplicated: true, refund: existingRefund });
  }

  let providerResult;
  try {
    providerResult = await provider.refundPayment(payment.provider_payment_id ?? payment.id, amount, reason, idempotencyKey);
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : String(providerError);
    await markOperationFailed(supabase, operation.lock.id, "PROVIDER_REFUND_FAILED", message, true);
    return fail("PROVIDER_REFUND_FAILED", 502, { trace_id: traceId, message });
  }

  const providerRefundId = String(providerResult.providerPaymentId ?? "").trim();
  const refundKey = `refund:${payment.id}:${providerRefundId || "local"}:${idempotencyKey}`;

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
      financial_operation_lock_id: operation.lock.id,
      actor_user_id: userId,
      provider_settlement_id: settlementItem?.settlement_id ?? null,
      evidence_url: typeof body.evidence_url === "string" ? body.evidence_url.slice(0, 500) : null,
      refund_lifecycle_status: isRefundCompleted(providerResult.status) ? "processing" : "provider_pending",
      refund_type: amount >= Number(payment.total_amount) ? "full" : "partial",
      locked_at: new Date().toISOString(),
      processing_at: isRefundCompleted(providerResult.status) ? new Date().toISOString() : null,
      provider_pending_at: isRefundCompleted(providerResult.status) ? null : new Date().toISOString(),
      refund_sequence: (existingRefunds?.length ?? 0) + 1,
      refunded_before_amount: accountingImpact.refundedBeforeAmount,
      refunded_after_amount: accountingImpact.refundedAfterAmount,
      refund_ratio: accountingImpact.refundRatio,
      platform_revenue_reversal_amount: accountingImpact.platformRevenueReversalAmount,
      provider_payable_reversal_amount: accountingImpact.providerPayableReversalAmount,
      escrow_reversal_amount: accountingImpact.escrowReversalAmount,
      cash_refund_amount: accountingImpact.cashRefundAmount,
      settlement_impact_status: settlementStatus || "not_settled",
      payout_impact_status: payoutStatus || "not_paid",
      accounting_period_impact_status: closedPaymentPeriod?.status ?? "open_period",
      requires_carry_forward: requiresCarryForward,
      adjustment_metadata: {
        settlement_id: settlementItem?.settlement_id ?? null,
        payout_id: payout?.id ?? null,
        closed_accounting_period_id: closedPaymentPeriod?.id ?? null,
        allow_compensating_adjustment: allowCompensatingAdjustment
      },
      environment: refundEnvironment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      trace_id: traceId,
      correlation_id: correlationId
    })
    .select("*")
    .single();

  if (refundError) {
    await markOperationFailed(supabase, operation.lock.id, "REFUND_INSERT_FAILED", JSON.stringify(refundError), false);
    return fail("Refund insert failed", 500, refundError);
  }

  if (!isRefundCompleted(providerResult.status)) {
    await supabase.from("refund_events").insert({
      refund_id: refund.id,
      event_type: "refund.provider_pending",
      status: providerResult.status,
      payload: { reason, amount, provider: providerResult.rawResponse, accounting_impact: accountingImpact },
      trace_id: traceId,
      correlation_id: correlationId,
      environment: refundEnvironment,
      is_test: isTest
    });

    await markOperationSucceeded(supabase, operation.lock.id, { refund, provider_pending: true });
    return json({ ok: true, provider_pending: true, refund });
  }

  let postedImpact;
  try {
    postedImpact = await postRefundLedger(supabase, payment, refund, {
      source: "refund_payment",
      actor_user_id: userId,
      payment_id: payment.id,
      refund_id: refund.id,
      settlement_id: settlementItem?.settlement_id ?? null,
      payout_id: payout?.id ?? null,
      provider_id: payment.provider_id ?? null,
      service_request_id: payment.service_request_id ?? null,
      trace_id: traceId,
      correlation_id: correlationId,
      environment: refundEnvironment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      reversal_reason: reason,
      reversal_type: "refund",
      metadata: {
        reason,
        prior_refunded_amount: alreadyRefunded,
        requires_carry_forward: requiresCarryForward,
        settlement_status: settlementStatus || "not_settled",
        payout_status: payoutStatus || "not_paid",
        accounting_period_status: closedPaymentPeriod?.status ?? "open_period"
      }
    });
  } catch (ledgerError) {
    console.error("[refund-payment] financial ledger post failed", {
      paymentId: payment.id,
      refundId: refund.id
    });

    await markOperationFailed(supabase, operation.lock.id, "FINANCIAL_LEDGER_POST_FAILED", ledgerError instanceof Error ? ledgerError.message : String(ledgerError), false);
    return fail("FINANCIAL_LEDGER_POST_FAILED", 500, ledgerError);
  }

  await supabase.from("financial_refund_adjustments").upsert({
    refund_id: refund.id,
    payment_id: payment.id,
    provider_id: payment.provider_id ?? null,
    settlement_id: settlementItem?.settlement_id ?? null,
    payout_id: payout?.id ?? null,
    operation_lock_id: operation.lock.id,
    adjustment_key: `refund.adjustment:${refund.id}`,
    adjustment_type: requiresCarryForward ? "refund_carry_forward_compensation" : "refund_proportional_reversal",
    status: "posted",
    refund_amount: postedImpact.refundAmount,
    refunded_before_amount: postedImpact.refundedBeforeAmount,
    refunded_after_amount: postedImpact.refundedAfterAmount,
    refund_ratio: postedImpact.refundRatio,
    platform_revenue_reversal_amount: postedImpact.platformRevenueReversalAmount,
    provider_payable_reversal_amount: postedImpact.providerPayableReversalAmount,
    escrow_reversal_amount: postedImpact.escrowReversalAmount,
    cash_refund_amount: postedImpact.cashRefundAmount,
    settlement_status: settlementStatus || "not_settled",
    payout_status: payoutStatus || "not_paid",
    accounting_period_status: closedPaymentPeriod?.status ?? "open_period",
    requires_carry_forward: requiresCarryForward,
    ledger_transaction_ids: postedImpact.ledgerTransactionIds,
    trace_id: traceId,
    correlation_id: correlationId,
    environment: refundEnvironment,
    is_test: isTest,
    fiscal_visibility: fiscalVisibility,
    metadata: {
      reason,
      payment_total_amount: payment.total_amount,
      payment_platform_fee: payment.platform_fee,
      payment_provider_amount: payment.provider_amount
    }
  }, { onConflict: "refund_id" });

  if (postedImpact.platformRevenueReversalAmount > 0) {
    await supabase.from("platform_revenue").insert({
      ledger_id: ledger?.id ?? null,
      payment_id: payment.id,
      service_request_id: payment.service_request_id ?? null,
      financial_transaction_id: postedImpact.ledgerTransactionIds[0] ?? null,
      revenue_key: `platform.revenue.refund:${refund.id}`,
      revenue_type: "commission_refund_reversal",
      gross_amount: 0,
      revenue_amount: -postedImpact.platformRevenueReversalAmount,
      net_amount: -postedImpact.platformRevenueReversalAmount,
      currency: payment.currency ?? "ARS",
      recognized_at: new Date().toISOString(),
      environment: refundEnvironment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      trace_id: traceId,
      correlation_id: correlationId,
      metadata: { refund_id: refund.id, reason }
    });
  }

  if (postedImpact.providerPayableReversalAmount > 0 && payment.provider_id) {
    await supabase.from("provider_earnings").insert({
      ledger_id: ledger?.id ?? null,
      provider_id: payment.provider_id,
      payment_id: payment.id,
      service_request_id: payment.service_request_id ?? null,
      financial_transaction_id: postedImpact.ledgerTransactionIds[1] ?? postedImpact.ledgerTransactionIds[0] ?? null,
      earning_key: `provider.earning.refund:${refund.id}`,
      gross_amount: 0,
      commission_amount: 0,
      psp_fee_amount: 0,
      adjustment_amount: -postedImpact.providerPayableReversalAmount,
      net_amount: -postedImpact.providerPayableReversalAmount,
      currency: payment.currency ?? "ARS",
      status: requiresCarryForward ? "adjusted" : "refunded",
      environment: refundEnvironment,
      is_test: isTest,
      fiscal_visibility: fiscalVisibility,
      trace_id: traceId,
      correlation_id: correlationId,
      metadata: { refund_id: refund.id, reason, requires_carry_forward: requiresCarryForward }
    });
  }

  await supabase
    .from("refunds")
    .update({
      refund_lifecycle_status: requiresCarryForward ? "compensated" : "completed",
      completed_at: new Date().toISOString(),
      compensated_at: requiresCarryForward ? new Date().toISOString() : null,
      financial_transaction_id: postedImpact.ledgerTransactionIds[postedImpact.ledgerTransactionIds.length - 1] ?? null
    })
    .eq("id", refund.id);

  const nextStatus = postedImpact.refundedAfterAmount >= Number(payment.total_amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ status: nextStatus, refunded_at: new Date().toISOString(), raw_response: providerResult.rawResponse })
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) {
    await markOperationFailed(supabase, operation.lock.id, "PAYMENT_REFUND_UPDATE_FAILED", JSON.stringify(updateError), true);
    return fail("Payment refund update failed", 500, updateError);
  }

  if (settlementItem?.settlement_id && !["paid", "locked", "payout_pending"].includes(settlementStatus)) {
    await supabase
      .from("provider_settlements")
      .update({
        refund_amount: money((settlementItem.provider_settlements?.refund_amount ?? 0) + postedImpact.providerPayableReversalAmount),
        net_amount: money((settlementItem.provider_settlements?.net_amount ?? 0) - postedImpact.providerPayableReversalAmount),
        status: "pending_review",
        updated_at: new Date().toISOString()
      })
      .eq("id", settlementItem.settlement_id);
  } else if (requiresCarryForward) {
    await supabase.from("financial_integrity_issues").upsert({
      issue_key: `refund.carry_forward:${refund.id}`,
      issue_type: "refund.carry_forward_compensation",
      severity: "medium",
      status: "open",
      payment_id: payment.id,
      refund_id: refund.id,
      settlement_id: settlementItem?.settlement_id ?? null,
      payout_id: payout?.id ?? null,
      expected_amount: postedImpact.providerPayableReversalAmount,
      actual_amount: postedImpact.providerPayableReversalAmount,
      difference_amount: 0,
      environment: refundEnvironment,
      is_test: isTest,
      fiscal_visibility: "excluded_from_accounting",
      trace_id: traceId,
      correlation_id: correlationId,
      metadata: {
        suggested_resolution: "Refund compensado contra settlement/payout/periodo cerrado; revisar carry-forward en proxima liquidacion.",
        settlement_status: settlementStatus,
        payout_status: payoutStatus,
        accounting_period_status: closedPaymentPeriod?.status ?? "open_period"
      }
    }, { onConflict: "issue_key" }).then(() => undefined);
  }

  await supabase.rpc("financial_rebuild_provider_wallet", { p_provider_id: payment.provider_id }).then(() => undefined);
  await supabase.rpc("financial_detect_refund_integrity_issues", { p_payment_id: payment.id }).then(() => undefined);

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "payment.refunded",
    payload: { refund, provider: providerResult.rawResponse, accounting_impact: postedImpact },
    environment: refundEnvironment,
    is_test: isTest,
    fiscal_visibility: fiscalVisibility
  });

  await supabase.from("refund_events").insert({
    refund_id: refund.id,
    event_type: requiresCarryForward ? "refund.compensated" : "refund.completed",
    status: providerResult.status,
    payload: { reason, amount, provider: providerResult.rawResponse, accounting_impact: postedImpact },
    trace_id: traceId,
    correlation_id: correlationId,
    environment: refundEnvironment,
    is_test: isTest
  });

  await markOperationSucceeded(supabase, operation.lock.id, { payment: updated, refund });

  return json({ ok: true, payment: updated, refund });
});
