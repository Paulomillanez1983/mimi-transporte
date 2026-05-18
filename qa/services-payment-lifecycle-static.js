const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  mainClient: "mimi-servicios/src/main-client.js",
  renderClient: "mimi-servicios/src/ui/render-client.js",
  paymentApi: "mimi-servicios/src/payments/payment-api.js",
  mainProvider: "mimi-servicios/src/main-provider.js",
  renderProvider: "mimi-servicios/src/ui/render-provider.js",
  serviceApi: "mimi-servicios/src/services/service-api.js",
  lifecycle: "mimi-servicios/supabase/functions/_shared/service-lifecycle.ts",
  startService: "mimi-servicios/supabase/functions/svc-start-service/index.ts",
  getPaymentStatus: "mimi-servicios/supabase/functions/get-payment-status/index.ts",
  packageJson: "package.json"
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

let failures = 0;
let passes = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function ordered(source, first, second) {
  const left = source.indexOf(first);
  const right = source.indexOf(second);
  return left >= 0 && right >= 0 && left < right;
}

const providerBundle = `${content.mainProvider}\n${content.renderProvider}`;

check("package exposes service payment lifecycle QA", /qa:services-payment-lifecycle/.test(content.packageJson));
check("client creates request before payment intent", ordered(content.mainClient, "step 5 OK: request created", "step 6: creating payment intent"));
check("client creates payment intent only for positive total", /const totalForPayment = Number/.test(content.mainClient) && /if \(totalForPayment > 0\)/.test(content.mainClient));
check("client skips immediate payment for quote or zero total", /step 6 SKIPPED/.test(content.mainClient) && /quote_required/.test(content.mainClient));
check("client shows Mercado Pago required copy", /Pago requerido para confirmar/.test(content.mainClient) && /Ir a Mercado Pago/.test(content.renderClient));
check("client payment refresh uses get-payment-status", /getPaymentStatus\(payment\.id\)/.test(content.mainClient) && /sync_warning/.test(content.paymentApi));
check("client does not call provider acceptance directly", !/provider-respond-offer|svc-provider-respond-offer/.test(content.mainClient));

check("provider offer card exposes provider price only", /Tu precio/.test(content.renderProvider) && !/Cliente paga|CLIENTE PAGA/.test(providerBundle));
check("provider offer card exposes payment state", /providerPaymentStatusLabel/.test(content.renderProvider) && /Pago pendiente/.test(providerBundle) && /Pago confirmado/.test(providerBundle));
check("provider keeps accepted request booked until payment approved", /actions\.setProviderStatus\("BOOKED_UPCOMING"\)/.test(content.mainProvider) && /canAdvancePaidService/.test(content.mainProvider));
check("provider does not auto en-route without approved payment", ordered(content.mainProvider, "after_accept_payment_check", "svc-provider-en-route") && /Esperamos el pago confirmado/.test(content.mainProvider));
check("provider blocks lifecycle actions when payment not approved", /El cliente debe confirmar el pago antes de avanzar el servicio/.test(content.mainProvider) && /payment_not_approved/.test(content.mainProvider));

check("shared lifecycle exports payment approval guard", /export async function assertRequestPaymentApproved/.test(content.lifecycle));
check("shared lifecycle blocks paid requests without approved payment", /context_type", "SERVICE_REQUEST"/.test(content.lifecycle) && /APPROVED/.test(content.lifecycle) && /payment_not_approved/.test(content.lifecycle));
check("shared lifecycle returns HTTP 402 for payment guard", /payment_not_approved"\) return 402/.test(content.lifecycle));
check("provider transition uses payment guard", ordered(content.lifecycle, "await assertRequestPaymentApproved(admin, request);", "const now = new Date().toISOString()"));
check("provider complete uses payment guard", /handleProviderComplete[\s\S]*await assertRequestPaymentApproved\(admin, request\)/.test(content.lifecycle));
check("start service validates payment before PIN", ordered(content.startService, "await assertRequestPaymentApproved(admin, request);", "service_pin_hash"));
check("start service returns HTTP 402 for unpaid service", /message === "payment_not_approved" \? 402/.test(content.startService));

check("get-payment-status can post accounting when webhook is missing", /postApprovedPaymentAccounting/.test(content.getPaymentStatus) && /payment_status_sync/.test(content.getPaymentStatus));
check("get-payment-status skips accounting for sandbox/test money", /if \(isTest \|\| !payment\.provider_id\) return/.test(content.getPaymentStatus));
check("get-payment-status recomputes provider wallet after approved real sync", /financial_recompute_provider_wallet_foundation/.test(content.getPaymentStatus));
check("get-payment-status does not mark approved without provider call", ordered(content.getPaymentStatus, "provider.getPaymentStatus", ".update(patch)") && !/status:\s*"APPROVED"/.test(content.getPaymentStatus));
check("service API dashboard fallback uses provider amount", /provider_price_snapshot/.test(content.serviceApi) && !/acc \+ Number\(item\.total_price_snapshot/.test(content.serviceApi));

check("payment lifecycle does not touch Transporte", !/notificar-chofer|admin-list-drivers|dispatch-viaje|driver-|TRANSPORT_TRIP/.test(`${content.lifecycle}\n${content.startService}\n${providerBundle}`));
check("payment lifecycle does not enable real payments", !/PAYMENTS_REAL_ENABLED\s*=\s*true|PAYMENT_ENVIRONMENT\s*=\s*production/.test(Object.values(content).join("\n")));

if (failures) {
  console.error(`\n${failures} service payment lifecycle checks failed.`);
  process.exit(1);
}

console.log(`\n${passes} service payment lifecycle checks passed.`);
