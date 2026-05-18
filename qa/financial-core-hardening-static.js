const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  providers: "mimi-servicios/supabase/functions/_shared/payments/providers.ts",
  interface: "mimi-servicios/supabase/functions/_shared/payments/payment-provider.interface.ts",
  locks: "mimi-servicios/supabase/functions/_shared/payments/operation-locks.ts",
  webhook: "mimi-servicios/supabase/functions/payment-webhook/index.ts",
  refund: "mimi-servicios/supabase/functions/refund-payment/index.ts",
  cancel: "mimi-servicios/supabase/functions/cancel-payment/index.ts",
  create: "mimi-servicios/supabase/functions/create-payment-intent/index.ts",
  migration: "supabase/migrations/20260514105935_financial_core_hardening_phase_2a.sql"
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
}

function indexOfRequired(source, before, after) {
  const left = source.indexOf(before);
  const right = source.indexOf(after);
  return left >= 0 && right >= 0 && left < right;
}

check("provider interface exposes verifyWebhook", /verifyWebhook\(req: Request, rawBody: string\)/.test(content.interface));
check("providers include Stripe prepared adapter", /class StripePaymentProvider/.test(content.providers));
check("mercadopago is not inheriting mock", /class MercadoPagoPaymentProvider extends PreparedProvider/.test(content.providers));
check("mobbex requires webhook secret", /MOBBEX_WEBHOOK_SECRET/.test(content.providers) && /WEBHOOK_SECRET_MISSING/.test(content.providers));
check("stripe verifies stripe-signature", /stripe-signature/.test(content.providers) && /STRIPE_WEBHOOK_SECRET/.test(content.providers));
check("webhook timestamp tolerance exists", /PAYMENT_WEBHOOK_TOLERANCE_SECONDS/.test(content.providers) && /timestampWithinTolerance/.test(content.providers));
check("mock webhook requires explicit mode", /MOCK_WEBHOOK_NOT_EXPLICIT/.test(content.providers) && /x-mimi-test-webhook/.test(content.providers));
check("operation locks helper exists", /reserveOperationLock/.test(content.locks) && /markOperationSucceeded/.test(content.locks));
check("migration creates financial_operation_locks", /create table if not exists public\.financial_operation_locks/.test(content.migration));
check("migration grants operation locks to service_role", /grant select, insert, update on public\.financial_operation_locks to service_role/.test(content.migration));
check("migration prepares cash/manual fields without activating cash", /cash_collection_status/.test(content.migration) && /payment_method/.test(content.migration));
check("webhook uses verifyWebhook", /provider\.verifyWebhook\(req, rawBody\)/.test(content.webhook));
check("webhook reserves idempotency before payment lookup", indexOfRequired(content.webhook, "reserveOperationLock", ".from(\"payments\")"));
check("webhook marks operation succeeded", /markOperationSucceeded/.test(content.webhook));
check("refund reserves before provider refund call", indexOfRequired(content.refund, "reserveOperationLock", "provider.refundPayment"));
check("refund checks replay before provider refund call", indexOfRequired(content.refund, "operation.replay", "provider.refundPayment"));
check("cancel reserves before provider cancel call", indexOfRequired(content.cancel, "reserveOperationLock", "provider.cancelPayment"));
check("cancel checks replay before provider cancel call", indexOfRequired(content.cancel, "operation.replay", "provider.cancelPayment"));
check("create-payment fails safe when provider not configured", /PAYMENT_PROVIDER_NOT_CONFIGURED/.test(content.create));
check("providers list Edge Function secrets", /MOBBEX_WEBHOOK_SECRET/.test(content.providers) && /STRIPE_WEBHOOK_SECRET/.test(content.providers));

const failed = results.filter((item) => !item.pass);
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} financial hardening checks failed.`);
  process.exit(1);
}

console.log(`\n${results.length} financial hardening checks passed.`);
