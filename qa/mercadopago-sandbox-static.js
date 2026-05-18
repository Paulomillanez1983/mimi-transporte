const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  providers: "mimi-servicios/supabase/functions/_shared/payments/providers.ts",
  create: "mimi-servicios/supabase/functions/create-payment-intent/index.ts",
  webhook: "mimi-servicios/supabase/functions/payment-webhook/index.ts",
  refund: "mimi-servicios/supabase/functions/refund-payment/index.ts"
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const mercadoPagoSection = content.providers.slice(
  content.providers.indexOf("export class MercadoPagoPaymentProvider"),
  content.providers.indexOf("export class StripePaymentProvider")
);
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
}

function before(source, earlier, later) {
  const left = source.indexOf(earlier);
  const right = source.indexOf(later);
  return left >= 0 && right >= 0 && left < right;
}

check("Mercado Pago adapter creates Checkout Pro preferences", /\/checkout\/preferences/.test(content.providers) && /init_point \?\? preference\.sandbox_init_point/.test(content.providers));
check("Mercado Pago adapter requires test token while real money is disabled", /MERCADOPAGO_TEST_TOKEN_REQUIRED/.test(content.providers) && /PAYMENTS_REAL_ENABLED=false/.test(content.providers));
check("Mercado Pago adapter stores payment external_reference", /external_reference: input\.paymentId/.test(content.providers));
check("Mercado Pago adapter includes webhook notification URL", /notification_url/.test(content.providers) && /paymentWebhookUrl/.test(content.providers));
check("Mercado Pago adapter fetches payment status by payment id", /\/v1\/payments\/\$\{encodeURIComponent\(providerPaymentId\)\}/.test(content.providers));
check("Mercado Pago adapter refunds through provider API with idempotency", /\/refunds/.test(content.providers) && /X-Idempotency-Key/.test(content.providers));
check("Mercado Pago webhook verifies official signature manifest", /x-request-id/.test(content.providers) && /id:\$\{dataId\};request-id:\$\{xRequestId\};ts:\$\{timestamp\};/.test(content.providers));
check("Mercado Pago webhook does not use legacy raw-body HMAC", !/`\$\{timestamp\}\.\$\{rawBody\}`/.test(mercadoPagoSection));
check("Mercado Pago webhook accepts simulator query payload", /mercadoPagoWebhookPayload/.test(content.providers) && /url\.searchParams\.get\("data\.id"\)/.test(content.providers) && /url\.searchParams\.get\("action"\)/.test(content.providers));
check("create-payment-intent derives test context from env flags", /PAYMENTS_REAL_ENABLED/.test(content.create) && /PAYMENT_ENVIRONMENT/.test(content.create) && /executionContext\.isTest/.test(content.create));
check("create-payment-intent persists excluded accounting for sandbox", /executionContext\.fiscalVisibility/.test(content.create) && /excluded_from_accounting/.test(content.create));
check("create-payment-intent reuses only same test-real context", /\.eq\("is_test", executionContext\.isTest\)/.test(content.create));
check("webhook fetches Mercado Pago payment details after idempotency lock", before(content.webhook, "reserveOperationLock", "provider.getPaymentStatus"));
check("webhook has Mercado Pago prefixed logs", /\[payment-webhook\]\[mercado_pago\]/.test(content.webhook) && /mercadoPagoLog/.test(content.webhook));
check("webhook returns controlled 400 when payment id is missing", /missing_provider_payment_id/.test(content.webhook) && /return fail\("provider payment id required", 400\)/.test(content.webhook));
check("webhook keeps invalid Mercado Pago signatures fail-closed", /invalid_signature_or_webhook/.test(content.webhook) && /return fail\("Invalid webhook signature", 401\)/.test(content.webhook));
check("webhook accepts Mercado Pago simulator 404 or 400 in sandbox", /sandbox_payment_not_found_or_simulator_event/.test(content.webhook) && /statusCode === 400 \|\| statusCode === 404/.test(content.webhook) && /}, 202\)/.test(content.webhook));
check("webhook returns controlled Mercado Pago auth 502", /mercado_pago_auth_error/.test(content.webhook) && /statusCode === 401 \|\| statusCode === 403/.test(content.webhook) && /return fail\("mercado_pago_auth_error", 502/.test(content.webhook));
check("webhook resolves local payment by Mercado Pago external_reference", /mercadoPagoLocalPaymentId/.test(content.webhook) && /\.eq\("id", localPaymentIdFromProvider\)/.test(content.webhook));
check("webhook updates local provider_payment_id from preference id to payment id", /provider_payment_id: event\.providerPaymentId/.test(content.webhook) && /provider_preference_id/.test(content.webhook));
check("webhook keeps sandbox events excluded from accounting", /paymentEnvironmentIsSandbox/.test(content.webhook) && /excluded_from_accounting/.test(content.webhook));
check("webhook preserves real approved Mercado Pago flow", /postPaymentCaptureLedger/.test(content.webhook) && /nextStatus === "APPROVED"/.test(content.webhook) && /markOperationSucceeded/.test(content.webhook));
check("refund passes local idempotency key to PSP", /provider\.refundPayment\(payment\.provider_payment_id \?\? payment\.id, amount, reason, idempotencyKey\)/.test(content.refund));
check("refund propagates sandbox environment", /const refundEnvironment = isTest \? "sandbox" : "production"/.test(content.refund) && /environment: refundEnvironment/.test(content.refund));
const failed = results.filter((item) => !item.pass);
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} Mercado Pago sandbox checks failed.`);
  process.exit(1);
}

console.log(`\n${results.length} Mercado Pago sandbox foundation checks passed.`);
