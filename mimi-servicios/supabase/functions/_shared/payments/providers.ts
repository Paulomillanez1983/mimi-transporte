import type { PaymentIntentInput, PaymentProvider, PaymentProviderResult } from "./payment-provider.interface.ts";

function mockCheckoutUrl(paymentId: string) {
  return `https://mock-payments.mimi.local/checkout/${encodeURIComponent(paymentId)}`;
}

function result(providerName: string, providerPaymentId: string, status: string, raw: Record<string, unknown> = {}): PaymentProviderResult {
  return {
    providerName,
    providerPaymentId,
    checkoutUrl: raw.checkout_url as string ?? mockCheckoutUrl(providerPaymentId),
    status,
    rawResponse: raw
  };
}

export class MockPaymentProvider implements PaymentProvider {
  name = "mock";

  async createPaymentIntent(input: PaymentIntentInput) {
    return result(this.name, `mock_${input.paymentId}`, "PENDING", {
      mode: "mock",
      checkout_url: mockCheckoutUrl(input.paymentId),
      total_amount: input.totalAmount,
      platform_fee: input.platformFee,
      provider_amount: input.providerAmount
    });
  }

  async getPaymentStatus(providerPaymentId: string) {
    return result(this.name, providerPaymentId, "PENDING", { mode: "mock" });
  }

  async cancelPayment(providerPaymentId: string, reason = "cancelled") {
    return result(this.name, providerPaymentId, "CANCELLED", { mode: "mock", reason });
  }

  async refundPayment(providerPaymentId: string, amount: number, reason = "refund") {
    return result(this.name, providerPaymentId, "REFUNDED", { mode: "mock", amount, reason });
  }

  async parseWebhook(_req: Request, rawBody: string) {
    const payload = rawBody ? JSON.parse(rawBody) : {};
    return {
      valid: true,
      providerPaymentId: payload.provider_payment_id ?? payload.payment_id,
      status: String(payload.status ?? "APPROVED").toUpperCase(),
      eventType: payload.event_type ?? "mock.payment.updated",
      payload
    };
  }
}

export class MobbexPaymentProvider implements PaymentProvider {
  name = "mobbex";
  private apiKey = Deno.env.get("MOBBEX_API_KEY") ?? "";
  private accessToken = Deno.env.get("MOBBEX_ACCESS_TOKEN") ?? "";
  private entityId = Deno.env.get("MOBBEX_ENTITY_ID") ?? "";
  private webhookSecret = Deno.env.get("MOBBEX_WEBHOOK_SECRET") ?? "";

  private ensureConfigured() {
    if (!this.apiKey || !this.accessToken || !this.entityId) {
      throw new Error("Mobbex no configurado. Definir MOBBEX_API_KEY, MOBBEX_ACCESS_TOKEN y MOBBEX_ENTITY_ID.");
    }
  }

  async createPaymentIntent(input: PaymentIntentInput) {
    this.ensureConfigured();

    return result(this.name, `mobbex_pending_${input.paymentId}`, "PENDING", {
      provider: "mobbex",
      status: "SKELETON_NOT_ACTIVE",
      message: "Completar endpoint checkout de Mobbex cuando existan credenciales y contrato operativo.",
      entity_id_present: Boolean(this.entityId)
    });
  }

  async getPaymentStatus(providerPaymentId: string) {
    this.ensureConfigured();
    return result(this.name, providerPaymentId, "PENDING", { provider: "mobbex", status: "SKELETON_NOT_ACTIVE" });
  }

  async cancelPayment(providerPaymentId: string, reason = "cancelled") {
    this.ensureConfigured();
    return result(this.name, providerPaymentId, "CANCELLED", { provider: "mobbex", reason, status: "SKELETON_NOT_ACTIVE" });
  }

  async refundPayment(providerPaymentId: string, amount: number, reason = "refund") {
    this.ensureConfigured();
    return result(this.name, providerPaymentId, "REFUND_PENDING", { provider: "mobbex", amount, reason, status: "SKELETON_NOT_ACTIVE" });
  }

  async parseWebhook(req: Request, rawBody: string) {
    const signature = req.headers.get("x-mobbex-signature") ?? "";
    const payload = rawBody ? JSON.parse(rawBody) : {};

    return {
      valid: !this.webhookSecret || Boolean(signature),
      providerPaymentId: payload?.data?.id ?? payload?.id,
      status: String(payload?.data?.status ?? payload?.status ?? "PENDING").toUpperCase(),
      eventType: payload?.type ?? "mobbex.payment.updated",
      payload
    };
  }
}

export class MercadoPagoPaymentProvider extends MockPaymentProvider {
  name = "mercadopago";
}

export function getPaymentProvider(name = Deno.env.get("PAYMENT_PROVIDER") ?? "mock"): PaymentProvider {
  const normalized = String(name || "mock").toLowerCase();

  if (normalized === "mobbex") return new MobbexPaymentProvider();
  if (normalized === "mercadopago") return new MercadoPagoPaymentProvider();

  return new MockPaymentProvider();
}
