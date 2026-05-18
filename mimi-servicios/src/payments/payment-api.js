import { appConfig } from "../config.js";
import { invokeFunction } from "../services/service-api.js";
import { calculateCommission } from "./commission-engine.js";

function normalizePayment(row = null) {
  if (!row) return null;

  return {
    ...row,
    total_amount: Number(row.total_amount ?? row.amount_total ?? 0),
    platform_fee: Number(row.platform_fee ?? row.amount_platform_fee ?? 0),
    provider_amount: Number(row.provider_amount ?? row.amount_provider ?? 0),
    currency: row.currency ?? "ARS",
    status: String(row.status ?? "PENDING").toUpperCase(),
    checkout_url: row.checkout_url ?? row.checkoutUrl ?? null,
    provider_name: row.provider_name ?? row.providerName ?? "mock",
    provider_payment_id: row.provider_payment_id ?? row.providerPaymentId ?? null,
    sync_warning: row.sync_warning ?? row.syncWarning ?? null,
    provider_warning: row.provider_warning ?? row.providerWarning ?? null
  };
}

export async function createPaymentIntent(input = {}) {
  const data = await invokeFunction(appConfig.functions.createPaymentIntent, {
    service_request_id: input.serviceRequestId ?? input.requestId ?? null,
    trip_id: input.tripId ?? null,
    context_type: input.contextType ?? (input.tripId ? "TRANSPORT_TRIP" : "SERVICE_REQUEST")
  });

  return normalizePayment(data?.payment ?? data);
}

export async function getPaymentStatus(paymentId, options = {}) {
  const data = await invokeFunction(appConfig.functions.getPaymentStatus, {
    payment_id: paymentId,
    provider_payment_id:
      options.providerPaymentId ??
      options.provider_payment_id ??
      options.collectionId ??
      options.collection_id ??
      null,
    preference_id: options.preferenceId ?? options.preference_id ?? null
  });

  const payment = normalizePayment(data?.payment ?? data);
  if (payment) {
    payment.sync_warning = payment.sync_warning ?? data?.sync_warning ?? null;
    payment.provider_warning = payment.provider_warning ?? data?.provider_warning ?? null;
  }
  return payment;
}

export async function cancelPayment(paymentId, reason = "cancelled_from_client_ui") {
  const data = await invokeFunction(appConfig.functions.cancelPayment, {
    payment_id: paymentId,
    reason
  });

  return normalizePayment(data?.payment ?? data);
}

export async function refundPayment(paymentId, amount = null, reason = "requested_from_app") {
  const data = await invokeFunction(appConfig.functions.refundPayment, {
    payment_id: paymentId,
    amount,
    reason
  });

  return normalizePayment(data?.payment ?? data);
}

export { calculateCommission };
