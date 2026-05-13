type SupabaseClientLike = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

type LedgerEntry = {
  account_code: string;
  entry_side: "debit" | "credit";
  amount: number;
  description?: string;
  service_request_id?: string | null;
  payment_id?: string | null;
  provider_id?: string | null;
  actor_user_id?: string | null;
  metadata?: Record<string, unknown>;
};

type LedgerContext = {
  source?: string;
  service_request_id?: string | null;
  payment_id?: string | null;
  payment_intent_id?: string | null;
  provider_id?: string | null;
  actor_user_id?: string | null;
  provider_name?: string | null;
  provider_event_id?: string | null;
  trace_id?: string | null;
  correlation_id?: string | null;
  environment?: "production" | "staging" | "development" | "sandbox" | "qa" | "internal_testing";
  is_test?: boolean;
  test_run_id?: string | null;
  fiscal_visibility?: "fiscal_reportable" | "internal_test_only" | "sandbox_only" | "qa_only" | "excluded_from_accounting" | "reversed" | "voided";
  metadata?: Record<string, unknown>;
};

function toMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function ledgerCodeFor(context: LedgerContext) {
  if (context.is_test || context.environment === "sandbox" || context.environment === "qa") {
    return "test_financial_ledger";
  }

  return "operational_financial_ledger";
}

async function postFinancialTransaction(
  supabase: SupabaseClientLike,
  params: {
    transactionKey: string;
    transactionType: string;
    description: string;
    currency?: string;
    idempotencyKey: string;
    entries: LedgerEntry[];
    context: LedgerContext;
  }
) {
  const entries = params.entries
    .map((entry) => ({
      ...entry,
      amount: toMoney(entry.amount)
    }))
    .filter((entry) => entry.amount > 0);

  const debitTotal = toMoney(
    entries.filter((entry) => entry.entry_side === "debit").reduce((sum, entry) => sum + entry.amount, 0)
  );
  const creditTotal = toMoney(
    entries.filter((entry) => entry.entry_side === "credit").reduce((sum, entry) => sum + entry.amount, 0)
  );

  if (!entries.length || debitTotal <= 0 || debitTotal !== creditTotal) {
    throw new Error(`FINANCIAL_LEDGER_UNBALANCED ${params.transactionType}`);
  }

  const { data, error } = await supabase.rpc("financial_post_transaction", {
    p_ledger_code: ledgerCodeFor(params.context),
    p_transaction_key: params.transactionKey,
    p_transaction_type: params.transactionType,
    p_description: params.description,
    p_currency: params.currency ?? "ARS",
    p_idempotency_key: params.idempotencyKey,
    p_entries: entries,
    p_context: {
      source: params.context.source ?? "payment_webhook",
      service_request_id: params.context.service_request_id ?? null,
      payment_id: params.context.payment_id ?? null,
      payment_intent_id: params.context.payment_intent_id ?? null,
      provider_id: params.context.provider_id ?? null,
      actor_user_id: params.context.actor_user_id ?? null,
      provider_name: params.context.provider_name ?? null,
      provider_event_id: params.context.provider_event_id ?? null,
      trace_id: params.context.trace_id ?? crypto.randomUUID(),
      correlation_id: params.context.correlation_id ?? params.context.provider_event_id ?? crypto.randomUUID(),
      environment: params.context.environment ?? "production",
      is_test: Boolean(params.context.is_test),
      test_run_id: params.context.test_run_id ?? null,
      fiscal_visibility:
        params.context.fiscal_visibility ??
        (params.context.is_test ? "sandbox_only" : "fiscal_reportable"),
      metadata: params.context.metadata ?? {}
    }
  });

  if (error) {
    throw new Error(`FINANCIAL_LEDGER_POST_FAILED ${params.transactionType}`);
  }

  return data;
}

export async function postPaymentCaptureLedger(
  supabase: SupabaseClientLike,
  payment: Record<string, unknown>,
  eventId: string,
  context: LedgerContext
) {
  const totalAmount = toMoney(payment.total_amount);
  const platformFee = toMoney(payment.platform_fee);
  const providerAmount = toMoney(payment.provider_amount);
  const currency = String(payment.currency ?? "ARS");
  const paymentId = String(payment.id ?? "");
  const serviceRequestId = String(payment.service_request_id ?? context.service_request_id ?? "") || null;
  const providerId = String(payment.provider_id ?? context.provider_id ?? "") || null;

  await postFinancialTransaction(supabase, {
    transactionKey: `payment.capture:${paymentId}`,
    transactionType: "payment.capture",
    description: "Captura de pago del cliente en PSP",
    currency,
    idempotencyKey: `payment.capture:${paymentId}:${eventId}`,
    entries: [
      {
        account_code: "cash_psp_ars",
        entry_side: "debit",
        amount: totalAmount,
        description: "Fondos capturados por PSP",
        service_request_id: serviceRequestId,
        payment_id: paymentId,
        provider_id: providerId
      },
      {
        account_code: "escrow_funds_ars",
        entry_side: "credit",
        amount: totalAmount,
        description: "Fondos retenidos por cuenta de terceros",
        service_request_id: serviceRequestId,
        payment_id: paymentId,
        provider_id: providerId
      }
    ],
    context: { ...context, payment_id: paymentId, service_request_id: serviceRequestId, provider_id: providerId }
  });

  if (platformFee > 0) {
    await postFinancialTransaction(supabase, {
      transactionKey: `platform.commission:${paymentId}`,
      transactionType: "platform.commission.recognized",
      description: "Reconocimiento de comision tecnologica MIMI",
      currency,
      idempotencyKey: `platform.commission:${paymentId}:${eventId}`,
      entries: [
        {
          account_code: "escrow_funds_ars",
          entry_side: "debit",
          amount: platformFee,
          description: "Liberacion de escrow por comision MIMI",
          service_request_id: serviceRequestId,
          payment_id: paymentId,
          provider_id: providerId
        },
        {
          account_code: "platform_revenue_ars",
          entry_side: "credit",
          amount: platformFee,
          description: "Revenue por comision de plataforma",
          service_request_id: serviceRequestId,
          payment_id: paymentId,
          provider_id: providerId
        }
      ],
      context: { ...context, payment_id: paymentId, service_request_id: serviceRequestId, provider_id: providerId }
    });
  }

  if (providerAmount > 0) {
    await postFinancialTransaction(supabase, {
      transactionKey: `provider.earning:${paymentId}`,
      transactionType: "provider.earning.recognized",
      description: "Reconocimiento de saldo a liquidar al prestador",
      currency,
      idempotencyKey: `provider.earning:${paymentId}:${eventId}`,
      entries: [
        {
          account_code: "escrow_funds_ars",
          entry_side: "debit",
          amount: providerAmount,
          description: "Liberacion de escrow hacia payable prestador",
          service_request_id: serviceRequestId,
          payment_id: paymentId,
          provider_id: providerId
        },
        {
          account_code: "provider_payable_ars",
          entry_side: "credit",
          amount: providerAmount,
          description: "Saldo neto pendiente de liquidacion al prestador",
          service_request_id: serviceRequestId,
          payment_id: paymentId,
          provider_id: providerId
        }
      ],
      context: { ...context, payment_id: paymentId, service_request_id: serviceRequestId, provider_id: providerId }
    });
  }
}

export async function postRefundLedger(
  supabase: SupabaseClientLike,
  payment: Record<string, unknown>,
  refund: Record<string, unknown>,
  context: LedgerContext
) {
  const amount = toMoney(refund.amount);
  const currency = String(payment.currency ?? "ARS");
  const paymentId = String(payment.id ?? "");
  const refundId = String(refund.id ?? crypto.randomUUID());
  const serviceRequestId = String(payment.service_request_id ?? context.service_request_id ?? "") || null;
  const providerId = String(payment.provider_id ?? context.provider_id ?? "") || null;

  await postFinancialTransaction(supabase, {
    transactionKey: `payment.refund:${refundId}`,
    transactionType: "payment.refund.compensating",
    description: "Movimiento compensatorio por devolucion al cliente",
    currency,
    idempotencyKey: `payment.refund:${refundId}`,
    entries: [
      {
        account_code: "escrow_funds_ars",
        entry_side: "debit",
        amount,
        description: "Reduccion de fondos retenidos por refund",
        service_request_id: serviceRequestId,
        payment_id: paymentId,
        provider_id: providerId
      },
      {
        account_code: "cash_psp_ars",
        entry_side: "credit",
        amount,
        description: "Salida de fondos por refund procesado en PSP",
        service_request_id: serviceRequestId,
        payment_id: paymentId,
        provider_id: providerId
      }
    ],
    context: {
      ...context,
      source: context.source ?? "refund_payment",
      payment_id: paymentId,
      service_request_id: serviceRequestId,
      provider_id: providerId,
      metadata: { ...(context.metadata ?? {}), refund_id: refundId }
    }
  });
}
