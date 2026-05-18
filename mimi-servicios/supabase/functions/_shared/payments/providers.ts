import type {
  PaymentIntentInput,
  PaymentProvider,
  PaymentProviderResult,
  PaymentProviderWebhookEvent
} from "./payment-provider.interface.ts";

const WEBHOOK_TOLERANCE_SECONDS = Number(Deno.env.get("PAYMENT_WEBHOOK_TOLERANCE_SECONDS") ?? 300);

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

function safeJson(rawBody: string): Record<string, unknown> {
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boolEnv(name: string, fallback = false) {
  const raw = Deno.env.get(name);
  if (raw == null) return fallback;
  return ["true", "1", "yes", "on"].includes(raw.toLowerCase());
}

function paymentEnvironment() {
  return String(Deno.env.get("PAYMENT_ENVIRONMENT") ?? "test").toLowerCase() === "production"
    ? "production"
    : "test";
}

function shouldUseSandboxMoney() {
  return paymentEnvironment() !== "production" || !boolEnv("PAYMENTS_REAL_ENABLED", false);
}

function siteBaseUrl() {
  return String(
    Deno.env.get("MIMIGO_PUBLIC_URL") ??
      Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL") ??
      "https://mimigo.com.ar"
  ).replace(/\/+$/, "");
}

function paymentWebhookUrl() {
  const explicit = Deno.env.get("MERCADOPAGO_WEBHOOK_URL") ?? Deno.env.get("PAYMENT_WEBHOOK_URL");
  if (explicit) return explicit;
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return supabaseUrl ? `${supabaseUrl}/functions/v1/payment-webhook?provider=mercado_pago` : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMercadoPagoStatus(status: unknown) {
  const value = stringValue(status).toLowerCase();
  if (["approved", "accredited", "paid"].includes(value)) return "APPROVED";
  if (["rejected", "cancelled", "canceled"].includes(value)) return value.startsWith("cancel") ? "CANCELLED" : "REJECTED";
  if (["refunded", "charged_back"].includes(value)) return "REFUNDED";
  return "PENDING";
}

function mercadoPagoFeeAmount(payload: Record<string, unknown>) {
  const explicit = numberValue(payload.fee_amount ?? payload.fee);
  if (explicit > 0) return explicit;
  return arrayValue(payload.fee_details).reduce((sum, item) => {
    const detail = asRecord(item);
    return sum + numberValue(detail.amount);
  }, 0);
}

function mercadoPagoIsTest(payload: Record<string, unknown>) {
  const metadata = asRecord(payload.metadata);
  return payload.live_mode === false ||
    payload.livemode === false ||
    payload.sandbox === true ||
    metadata.is_test === true ||
    metadata.is_test === "true" ||
    shouldUseSandboxMoney();
}

function parseMercadoPagoSignature(signature: string) {
  return signature.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) return acc;
    acc[key.trim()] = rest.join("=").trim();
    return acc;
  }, {});
}

function mercadoPagoDataId(req: Request, payload: Record<string, unknown>) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (fromQuery) return fromQuery.toLowerCase();
  const data = asRecord(payload.data);
  const fallback = stringValue(data.id ?? payload.id);
  return fallback ? fallback.toLowerCase() : "";
}

function mercadoPagoWebhookPayload(req: Request, payload: Record<string, unknown>) {
  const url = new URL(req.url);
  const data = asRecord(payload.data);
  const paymentId = mercadoPagoDataId(req, payload);
  const queryType = url.searchParams.get("type");
  const queryAction = url.searchParams.get("action");
  const queryLiveMode = url.searchParams.get("live_mode");

  return {
    ...payload,
    ...(queryType && payload.type == null ? { type: queryType } : {}),
    ...(queryAction && payload.action == null ? { action: queryAction } : {}),
    ...(queryLiveMode != null && payload.live_mode == null ? { live_mode: queryLiveMode === "true" } : {}),
    data: paymentId ? { ...data, id: paymentId } : data
  };
}

function normalizeStatus(status: unknown) {
  const value = stringValue(status || "PENDING").toUpperCase();
  if (["APPROVED", "PAID", "CAPTURED", "SUCCEEDED", "SUCCESS"].includes(value)) return "APPROVED";
  if (["REJECTED", "FAILED", "FAILURE", "DENIED"].includes(value)) return "REJECTED";
  if (["CANCELLED", "CANCELED", "VOIDED", "EXPIRED"].includes(value)) return "CANCELLED";
  if (["REFUNDED", "REFUND", "PARTIALLY_REFUNDED"].includes(value)) return "REFUNDED";
  return "PENDING";
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  const left = a.toLowerCase().replace(/^sha256=/, "");
  const right = b.toLowerCase().replace(/^sha256=/, "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function timestampWithinTolerance(timestamp: string) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return false;
  const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
  return Math.abs(Date.now() - millis) <= WEBHOOK_TOLERANCE_SECONDS * 1000;
}

function invalid(providerName: string, payload: Record<string, unknown>, errorCode: string, errorMessage: string): PaymentProviderWebhookEvent {
  return {
    valid: false,
    signatureValid: false,
    providerName,
    payload,
    errorCode,
    errorMessage
  };
}

function baseEvent(providerName: string, payload: Record<string, unknown>, overrides: Partial<PaymentProviderWebhookEvent> = {}): PaymentProviderWebhookEvent {
  const eventId = stringValue(overrides.providerEventId ?? payload.id ?? payload.event_id ?? payload.eventId);
  const providerPaymentId = stringValue(
    overrides.providerPaymentId ??
      payload.provider_payment_id ??
      payload.payment_id ??
      payload.paymentId ??
      (payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>).id : "")
  );

  return {
    valid: overrides.valid ?? true,
    signatureValid: overrides.signatureValid ?? true,
    providerName,
    providerPaymentId: providerPaymentId || undefined,
    providerEventId: eventId || undefined,
    status: normalizeStatus(overrides.status ?? payload.status ?? (payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>).status : "")),
    eventType: stringValue(overrides.eventType ?? payload.event_type ?? payload.type ?? `${providerName}.payment.updated`) || `${providerName}.payment.updated`,
    occurredAt: stringValue(overrides.occurredAt ?? payload.created_at ?? payload.createdAt) || undefined,
    payload,
    providerFeeAmount: numberValue(overrides.providerFeeAmount ?? payload.fee_amount ?? payload.fee),
    isTest: overrides.isTest ?? false,
    replayProtectionKey: overrides.replayProtectionKey,
    errorCode: overrides.errorCode,
    errorMessage: overrides.errorMessage
  };
}

abstract class PreparedProvider implements PaymentProvider {
  abstract name: string;

  protected requireSecrets(secretNames: string[]) {
    const missing = secretNames.filter((secret) => !Deno.env.get(secret));
    if (missing.length > 0) {
      throw new Error(`${this.name} no configurado. Faltan secrets: ${missing.join(", ")}.`);
    }
  }

  async createPaymentIntent(_input: PaymentIntentInput): Promise<PaymentProviderResult> {
    throw new Error(`${this.name} preparado pero no activo. Configurar adapter real antes de usar dinero real.`);
  }

  async getPaymentStatus(providerPaymentId: string) {
    return result(this.name, providerPaymentId, "PENDING", {
      provider: this.name,
      status: "PREPARED_NOT_ACTIVE"
    });
  }

  async cancelPayment(providerPaymentId: string, reason = "cancelled") {
    this.requireSecrets(this.requiredOperationalSecrets());
    return result(this.name, providerPaymentId, "CANCELLED", {
      provider: this.name,
      reason,
      status: "PREPARED_NOT_ACTIVE"
    });
  }

  async refundPayment(providerPaymentId: string, amount: number, reason = "refund", _idempotencyKey?: string) {
    this.requireSecrets(this.requiredOperationalSecrets());
    return result(this.name, providerPaymentId, "REFUND_PENDING", {
      provider: this.name,
      amount,
      reason,
      status: "PREPARED_NOT_ACTIVE"
    });
  }

  normalizeEvent(payload: Record<string, unknown>) {
    return baseEvent(this.name, payload, { signatureValid: false, valid: false, errorCode: "WEBHOOK_NOT_VERIFIED" });
  }

  async parseWebhook(req: Request, rawBody: string) {
    return await this.verifyWebhook(req, rawBody);
  }

  abstract verifyWebhook(req: Request, rawBody: string): Promise<PaymentProviderWebhookEvent>;
  protected abstract requiredOperationalSecrets(): string[];
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

  async refundPayment(providerPaymentId: string, amount: number, reason = "refund", _idempotencyKey?: string) {
    return result(this.name, providerPaymentId, "REFUNDED", { mode: "mock", amount, reason });
  }

  normalizeEvent(payload: Record<string, unknown>) {
    return baseEvent(this.name, payload, {
      isTest: true,
      replayProtectionKey: stringValue(payload.event_id ?? payload.id ?? payload.provider_payment_id ?? payload.payment_id)
    });
  }

  async verifyWebhook(req: Request, rawBody: string) {
    const payload = safeJson(rawBody);
    const explicitMock =
      req.headers.get("x-mimi-test-webhook") === "1" ||
      req.headers.get("x-mimi-mock-signature") === "mock" ||
      Deno.env.get("PAYMENT_PROVIDER") === "mock" ||
      Deno.env.get("ALLOW_MOCK_PAYMENT_WEBHOOKS") === "true";

    if (!explicitMock) {
      return invalid(this.name, payload, "MOCK_WEBHOOK_NOT_EXPLICIT", "Mock webhooks require explicit mock/test mode.");
    }

    return this.normalizeEvent(payload);
  }

  async parseWebhook(req: Request, rawBody: string) {
    return await this.verifyWebhook(req, rawBody);
  }
}

export class MobbexPaymentProvider extends PreparedProvider {
  name = "mobbex";

  protected requiredOperationalSecrets() {
    return ["MOBBEX_API_KEY", "MOBBEX_ACCESS_TOKEN", "MOBBEX_ENTITY_ID"];
  }

  async createPaymentIntent(input: PaymentIntentInput) {
    this.requireSecrets(this.requiredOperationalSecrets());
    return result(this.name, `mobbex_pending_${input.paymentId}`, "PENDING", {
      provider: this.name,
      status: "PREPARED_NOT_ACTIVE",
      entity_id_present: Boolean(Deno.env.get("MOBBEX_ENTITY_ID"))
    });
  }

  normalizeEvent(payload: Record<string, unknown>) {
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    return baseEvent(this.name, payload, {
      providerPaymentId: stringValue(data.id ?? payload.id),
      providerEventId: stringValue(payload.id ?? payload.event_id ?? data.id),
      status: stringValue(data.status ?? payload.status),
      eventType: stringValue(payload.type ?? "mobbex.payment.updated"),
      providerFeeAmount: numberValue(data.fee_amount ?? data.fee ?? payload.fee_amount)
    });
  }

  async verifyWebhook(req: Request, rawBody: string) {
    const payload = safeJson(rawBody);
    const secret = Deno.env.get("MOBBEX_WEBHOOK_SECRET") ?? "";
    if (!secret) return invalid(this.name, payload, "WEBHOOK_SECRET_MISSING", "Mobbex webhook secret is not configured.");

    const signature = req.headers.get("x-mobbex-signature") ?? "";
    const timestamp = req.headers.get("x-mobbex-timestamp") ?? req.headers.get("x-mimi-webhook-timestamp") ?? "";
    if (!signature || !timestamp) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_MISSING", "Mobbex signature or timestamp missing.");
    if (!timestampWithinTolerance(timestamp)) return invalid(this.name, payload, "WEBHOOK_TIMESTAMP_OUT_OF_RANGE", "Mobbex webhook timestamp outside tolerance.");

    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    if (!timingSafeEqual(signature, expected)) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_INVALID", "Mobbex webhook signature mismatch.");

    return this.normalizeEvent(payload);
  }
}

export class MercadoPagoPaymentProvider extends PreparedProvider {
  name = "mercadopago";

  protected requiredOperationalSecrets() {
    return ["MERCADOPAGO_ACCESS_TOKEN"];
  }

  private accessToken() {
    const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
    if (!token) throw new Error("mercadopago no configurado. Falta secret: MERCADOPAGO_ACCESS_TOKEN.");
    if (shouldUseSandboxMoney() && !token.startsWith("TEST-")) {
      throw new Error("MERCADOPAGO_TEST_TOKEN_REQUIRED: PAYMENTS_REAL_ENABLED=false requiere credencial TEST de Mercado Pago.");
    }
    return token;
  }

  private async api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.accessToken()}`);
    headers.set("Content-Type", "application/json");
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      ...init,
      headers
    });

    const text = await response.text();
    const payload = safeJson(text);
    if (!response.ok) {
      const message = stringValue(payload.message ?? payload.error ?? text).slice(0, 260);
      throw new Error(`MERCADOPAGO_API_ERROR_${response.status}: ${message || "request failed"}`);
    }

    return payload;
  }

  async createPaymentIntent(input: PaymentIntentInput) {
    this.requireSecrets(this.requiredOperationalSecrets());
    const sandbox = shouldUseSandboxMoney();
    const baseUrl = siteBaseUrl();
    const notificationUrl = paymentWebhookUrl();
    const preferencePayload: Record<string, unknown> = {
      external_reference: input.paymentId,
      metadata: {
        payment_id: input.paymentId,
        context_type: input.contextType,
        context_id: input.contextId,
        customer_id: input.customerId,
        provider_id: input.providerId ?? null,
        provider: this.name,
        payment_environment: paymentEnvironment(),
        payments_real_enabled: boolEnv("PAYMENTS_REAL_ENABLED", false),
        is_test: sandbox,
        fiscal_visibility: sandbox ? "excluded_from_accounting" : "fiscal_reportable",
        platform_fee: input.platformFee,
        provider_amount: input.providerAmount
      },
      items: [
        {
          id: input.paymentId,
          title: "Servicio MIMIGO",
          description: input.description ?? "Servicio prestado por proveedor independiente en MIMIGO",
          quantity: 1,
          currency_id: input.currency || "ARS",
          unit_price: input.totalAmount
        }
      ],
      back_urls: {
        success: `${baseUrl}/servicios?payment=success`,
        failure: `${baseUrl}/servicios?payment=failure`,
        pending: `${baseUrl}/servicios?payment=pending`
      },
      auto_return: "approved",
      binary_mode: false,
      statement_descriptor: "MIMIGO"
    };

    if (!sandbox && input.customerEmail) {
      preferencePayload.payer = { email: input.customerEmail };
    }

    if (notificationUrl) {
      preferencePayload.notification_url = notificationUrl;
    }

    const preference = await this.api("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify(preferencePayload)
    });

    const checkoutUrl = stringValue(preference.init_point ?? preference.sandbox_init_point);
    const preferenceId = stringValue(preference.id);
    if (!preferenceId || !checkoutUrl) {
      throw new Error("MERCADOPAGO_PREFERENCE_INCOMPLETE: respuesta sin id o checkout URL.");
    }

    return result(this.name, preferenceId, "PENDING", {
      ...preference,
      provider: this.name,
      provider_preference_id: preferenceId,
      checkout_url: checkoutUrl,
      payment_environment: paymentEnvironment(),
      payments_real_enabled: boolEnv("PAYMENTS_REAL_ENABLED", false),
      is_test: sandbox,
      fiscal_visibility: sandbox ? "excluded_from_accounting" : "fiscal_reportable"
    });
  }

  async getPaymentStatus(providerPaymentId: string) {
    this.requireSecrets(this.requiredOperationalSecrets());
    const payment = await this.api(`/v1/payments/${encodeURIComponent(providerPaymentId)}`, {
      method: "GET"
    });
    return result(this.name, stringValue(payment.id ?? providerPaymentId), normalizeMercadoPagoStatus(payment.status), {
      ...payment,
      provider: this.name,
      fee_amount: mercadoPagoFeeAmount(payment),
      is_test: mercadoPagoIsTest(payment),
      fiscal_visibility: mercadoPagoIsTest(payment) ? "excluded_from_accounting" : "fiscal_reportable"
    });
  }

  async refundPayment(providerPaymentId: string, amount: number, reason = "refund", idempotencyKey?: string) {
    this.requireSecrets(this.requiredOperationalSecrets());
    const refund = await this.api(`/v1/payments/${encodeURIComponent(providerPaymentId)}/refunds`, {
      method: "POST",
      headers: {
        "X-Idempotency-Key": idempotencyKey ?? `refund-${providerPaymentId}-${amount}`
      },
      body: JSON.stringify({ amount })
    });

    return result(this.name, stringValue(refund.id ?? providerPaymentId), normalizeMercadoPagoStatus(refund.status ?? "approved"), {
      ...refund,
      provider: this.name,
      provider_payment_id: providerPaymentId,
      amount,
      reason,
      is_test: shouldUseSandboxMoney(),
      fiscal_visibility: shouldUseSandboxMoney() ? "excluded_from_accounting" : "fiscal_reportable"
    });
  }

  normalizeEvent(payload: Record<string, unknown>) {
    const data = asRecord(payload.data);
    const providerPaymentId = stringValue(data.id ?? payload.id);
    const action = stringValue(payload.action ?? payload.type ?? "mercadopago.payment.updated");
    const stableEventId = providerPaymentId ? `mercadopago:${action}:${providerPaymentId}` : stringValue(payload.id ?? payload.event_id);
    return baseEvent(this.name, payload, {
      providerPaymentId,
      providerEventId: stableEventId,
      status: stringValue(payload.status ?? payload.action),
      eventType: action,
      providerFeeAmount: mercadoPagoFeeAmount(payload),
      isTest: mercadoPagoIsTest(payload),
      replayProtectionKey: stableEventId
    });
  }

  async verifyWebhook(req: Request, rawBody: string) {
    const payload = mercadoPagoWebhookPayload(req, safeJson(rawBody));
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ?? "";
    if (!secret) return invalid(this.name, payload, "WEBHOOK_SECRET_MISSING", "Mercado Pago webhook secret is not configured.");

    const signature = req.headers.get("x-signature") ?? req.headers.get("x-mercadopago-signature") ?? "";
    const xRequestId = req.headers.get("x-request-id") ?? "";
    const parts = parseMercadoPagoSignature(signature);
    const timestamp = parts.ts ?? "";
    const signatureValue = parts.v1 ?? "";
    const dataId = mercadoPagoDataId(req, payload);
    if (!signatureValue || !timestamp || !xRequestId || !dataId) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_MISSING", "Mercado Pago signature, request id, timestamp or data.id missing.");
    if (!timestampWithinTolerance(timestamp)) return invalid(this.name, payload, "WEBHOOK_TIMESTAMP_OUT_OF_RANGE", "Mercado Pago webhook timestamp outside tolerance.");

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
    const expected = await hmacSha256Hex(secret, manifest);
    if (!timingSafeEqual(signatureValue, expected)) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_INVALID", "Mercado Pago webhook signature mismatch.");

    return this.normalizeEvent(payload);
  }
}

export class StripePaymentProvider extends PreparedProvider {
  name = "stripe";

  protected requiredOperationalSecrets() {
    return ["STRIPE_SECRET_KEY"];
  }

  async createPaymentIntent(input: PaymentIntentInput) {
    this.requireSecrets(this.requiredOperationalSecrets());
    return result(this.name, `stripe_pending_${input.paymentId}`, "PENDING", {
      provider: this.name,
      status: "PREPARED_NOT_ACTIVE"
    });
  }

  normalizeEvent(payload: Record<string, unknown>) {
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
    const object = data.object && typeof data.object === "object" ? data.object as Record<string, unknown> : {};
    return baseEvent(this.name, payload, {
      providerPaymentId: stringValue(object.id ?? payload.id),
      providerEventId: stringValue(payload.id ?? object.id),
      status: stringValue(object.status ?? payload.type),
      eventType: stringValue(payload.type ?? "stripe.payment.updated"),
      providerFeeAmount: numberValue(object.application_fee_amount) / 100
    });
  }

  async verifyWebhook(req: Request, rawBody: string) {
    const payload = safeJson(rawBody);
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
    if (!secret) return invalid(this.name, payload, "WEBHOOK_SECRET_MISSING", "Stripe webhook secret is not configured.");

    const signature = req.headers.get("stripe-signature") ?? "";
    const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2) ?? "";
    const signatureValue = signature.split(",").find((part) => part.startsWith("v1="))?.slice(3) ?? "";
    if (!signatureValue || !timestamp) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_MISSING", "Stripe signature or timestamp missing.");
    if (!timestampWithinTolerance(timestamp)) return invalid(this.name, payload, "WEBHOOK_TIMESTAMP_OUT_OF_RANGE", "Stripe webhook timestamp outside tolerance.");

    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    if (!timingSafeEqual(signatureValue, expected)) return invalid(this.name, payload, "WEBHOOK_SIGNATURE_INVALID", "Stripe webhook signature mismatch.");

    return this.normalizeEvent(payload);
  }
}

export class ManualPaymentProvider extends MockPaymentProvider {
  name = "manual";

  async createPaymentIntent(input: PaymentIntentInput) {
    return result(this.name, `manual_${input.paymentId}`, "PENDING", {
      mode: "manual",
      status: "PREPARED_NOT_ACTIVE",
      message: "Manual/bank transfer prepared for future controlled activation."
    });
  }

  async verifyWebhook(req: Request, rawBody: string) {
    const payload = safeJson(rawBody);
    if (req.headers.get("x-mimi-test-webhook") !== "1") {
      return invalid(this.name, payload, "MANUAL_WEBHOOK_DISABLED", "Manual webhooks are disabled unless explicitly run as test.");
    }
    return baseEvent(this.name, payload, { isTest: true });
  }
}

export function getPaymentProvider(name = Deno.env.get("PAYMENT_PROVIDER") ?? "mock"): PaymentProvider {
  const normalized = String(name || "mock").toLowerCase().replace(/[^a-z0-9_]/g, "");

  if (normalized === "mobbex") return new MobbexPaymentProvider();
  if (normalized === "mercadopago" || normalized === "mercado_pago") return new MercadoPagoPaymentProvider();
  if (normalized === "stripe") return new StripePaymentProvider();
  if (normalized === "manual" || normalized === "bank_transfer" || normalized === "cash") return new ManualPaymentProvider();
  if (normalized === "mock" || normalized === "test") return new MockPaymentProvider();

  throw new Error(`PAYMENT_PROVIDER_UNSUPPORTED: ${normalized}`);
}
