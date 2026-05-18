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
  getStatus: "mimi-servicios/supabase/functions/get-payment-status/index.ts",
  adminDashboard: "supabase/functions/admin-financial-dashboard/index.ts",
  adminFinance: "admin/admin-finance.js",
  packageJson: "package.json"
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));
let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function containsAll(source, values) {
  return values.every((value) => source.includes(value));
}

function ordered(source, first, second) {
  const left = source.indexOf(first);
  const right = source.indexOf(second);
  return left >= 0 && right >= 0 && left < right;
}

check("package exposes Mercado Pago phase 1 QA", /qa:mercadopago-phase1/.test(content.packageJson));

check("client handles Mercado Pago return params", /handlePaymentReturnFromUrl/.test(content.mainClient) && containsAll(content.mainClient, [
  "payment=success",
  "payment=failure",
  "payment=pending"
]));
check("client return success triggers status sync before confirmed copy", ordered(content.mainClient, "getPaymentStatus", "Pago confirmado"));
check("client renders required payment copy", containsAll(`${content.mainClient}\n${content.renderClient}`, [
  "Pago requerido para confirmar",
  "Estamos verificando el pago",
  "Pago pendiente",
  "Pago no completado",
  "Pago confirmado"
]));
check("client never treats CHECKOUT_CREATED as approved", /CHECKOUT_CREATED/.test(content.renderClient) && /Pago preparado/.test(content.renderClient) && !/CHECKOUT_CREATED[\s\S]{0,120}Pago confirmado/.test(content.renderClient));
check("payment API preserves sync warnings", /sync_warning/.test(content.paymentApi) || /provider_warning/.test(content.paymentApi));

check("get-payment-status imports provider adapter", /getPaymentProvider/.test(content.getStatus));
check("get-payment-status syncs only Mercado Pago pending checkout states", /isMercadoPagoProvider\(payment\.provider_name\)/.test(content.getStatus) && /SYNCABLE_PAYMENT_STATUSES/.test(content.getStatus) && /CHECKOUT_CREATED/.test(content.getStatus) && /PENDING/.test(content.getStatus));
check("get-payment-status does not downgrade final approved payments", /FINAL_PAYMENT_STATUSES/.test(content.getStatus) && /APPROVED/.test(content.getStatus));
check("get-payment-status calls provider before updating local payment", ordered(content.getStatus, "provider.getPaymentStatus", ".update(patch)"));
check("get-payment-status returns local state with controlled warning on provider failure", /sync_warning/.test(content.getStatus) && /provider_sync_failed/.test(content.getStatus));
check("get-payment-status preserves sandbox/test flags", /is_test/.test(content.getStatus) && /fiscal_visibility/.test(content.getStatus) && /excluded_from_accounting/.test(content.getStatus));
check("get-payment-status does not enable real money", !/PAYMENTS_REAL_ENABLED\s*=\s*true/.test(content.getStatus));

check("provider shows payment state labels", containsAll(`${content.mainProvider}\n${content.renderProvider}`, [
  "Pago pendiente",
  "Pago confirmado"
]));
check("provider keeps provider-facing price copy", /Tu precio/.test(content.renderProvider) && !/Cliente paga|CLIENTE PAGA/.test(`${content.mainProvider}\n${content.renderProvider}`));
check("provider UI does not expose internal commission copy", !/comisi[oó]n interna|platform_fee|MIMIGO cobra/.test(content.renderProvider));

check("admin dashboard computes payment operation health", containsAll(content.adminDashboard, [
  "open_checkouts",
  "missing_webhooks",
  "advanced_without_approved"
]));
check("admin finance renders payment operation health", containsAll(content.adminFinance, [
  "Checkouts abiertos",
  "Webhooks no recibidos",
  "Servicios sin pago aprobado"
]));

check("phase 1 does not touch quote workflow copy", !/svc_request_quotes|quote_accepted|QUOTE_PAYMENT_REQUIRED/.test(`${content.getStatus}\n${content.adminDashboard}`));
check("phase 1 backend/admin changes do not require transport", !/solicitar-viaje|notificar-chofer|admin-list-drivers|driver/i.test(`${content.getStatus}\n${content.adminDashboard}\n${content.adminFinance}`));

if (failures) {
  console.error(`\n${failures} Mercado Pago phase 1 checks failed.`);
  process.exit(1);
}

console.log("\n20 Mercado Pago phase 1 checks passed.");
