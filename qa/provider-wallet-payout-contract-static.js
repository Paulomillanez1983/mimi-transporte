const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  migration: "supabase/migrations/20260518213030_services_payment_wallet_contract.sql",
  serviceApi: "mimi-servicios/src/services/service-api.js",
  renderProvider: "mimi-servicios/src/ui/render-provider.js",
  paymentWebhook: "mimi-servicios/supabase/functions/payment-webhook/index.ts",
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

check("package exposes wallet payout contract QA", /qa:provider-wallet-payout-contract/.test(content.packageJson));

check("provider dashboard reads provider wallet snapshot", /from\("provider_wallets"\)/.test(content.serviceApi) && /PROVIDER_WALLET_SAFE_SELECT/.test(content.serviceApi));
check("provider dashboard fallback sums provider price, not customer total", /provider_price_snapshot/.test(content.serviceApi) && !/acc \+ Number\(item\.total_price_snapshot/.test(content.serviceApi));
check("provider wallet UI shows payout hold and available balance", /payoutHoldBalance/.test(content.renderProvider) && /availableBalance/.test(content.renderProvider));
check("provider wallet UI avoids promising automatic real payout", /Payout real todavia desactivado/.test(content.renderProvider));

check("migration overrides provider visible wallet recompute", /create or replace function public\.financial_recompute_provider_wallet_foundation/.test(content.migration));
check("wallet recompute subtracts paid payouts", /v_paid_out/.test(content.migration) && /status = 'paid'/.test(content.migration) && /v_available_gross[\s\S]{0,220}- v_paid_out/.test(content.migration));
check("wallet recompute subtracts pending payout holds", /v_payout_hold/.test(content.migration) && /status in \('pending','processing','sent','on_hold'\)/.test(content.migration));
check("wallet recompute writes payout_hold_balance", /payout_hold_balance = greatest\(v_payout_hold, 0\)/.test(content.migration));
check("wallet recompute preserves lifetime earnings gross before payouts", /lifetime_earnings = greatest\(v_available_gross \+ v_pending, 0\)/.test(content.migration));
check("migration creates payout trigger", /trg_financial_recompute_provider_wallet_after_payout/.test(content.migration) && /after insert or update/.test(content.migration));
check("payout trigger recomputes visible wallet", /financial_recompute_provider_wallet_after_payout/.test(content.migration) && /financial_recompute_provider_wallet_foundation/.test(content.migration));
check("migration documents real payout still disabled", /real_payout_execution_enabled', false/.test(content.migration));

check("webhook recomputes provider wallet after real approved payment", /payment-webhook/.test(content.paymentWebhook) && /financial_recompute_provider_wallet_foundation/.test(content.paymentWebhook));
check("webhook avoids duplicate capture ledger posts", /paymentCaptureLedgerAlreadyPosted/.test(content.paymentWebhook));
check("get-payment-status recomputes provider wallet after approved sync", /postApprovedPaymentAccounting/.test(content.getPaymentStatus) && /financial_recompute_provider_wallet_foundation/.test(content.getPaymentStatus));
check("get-payment-status accounting is disabled for sandbox/test", /if \(isTest \|\| !payment\.provider_id\) return/.test(content.getPaymentStatus));

check("wallet contract does not enable production payments", !/PAYMENTS_REAL_ENABLED\s*=\s*true|PAYMENT_ENVIRONMENT\s*=\s*production/.test(Object.values(content).join("\n")));
check("wallet contract does not touch Transporte", !/notificar-chofer|admin-list-drivers|dispatch-viaje|driver-|TRANSPORT_TRIP/.test(Object.values(content).join("\n")));

if (failures) {
  console.error(`\n${failures} provider wallet payout contract checks failed.`);
  process.exit(1);
}

console.log(`\n${passes} provider wallet payout contract checks passed.`);
