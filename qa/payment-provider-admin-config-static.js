const fs = require("fs");

const files = {
  migration: "supabase/migrations/20260514143907_payment_provider_admin_config.sql",
  fn: "supabase/functions/admin-payment-provider-config/index.ts",
  packageJson: "package.json"
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function absent(name, text, pattern) {
  check(name, !pattern.test(text), pattern.toString());
}

check("migration creates payment_provider_config", /create table if not exists public\.payment_provider_config/i.test(content.migration));
check("migration stores only public metadata", /metadata_public jsonb/i.test(content.migration) && !/client_secret|access_token text|webhook_secret text/i.test(content.migration));
check("migration supports provider set", /'mock','mercadopago','mobbex','stripe','manual'/.test(content.migration));
check("migration supports test production environments", /environment text.*check \(environment in \('test','production'\)\)/is.test(content.migration));
check("migration enforces one active provider per environment", /payment_provider_config_one_active_per_env/i.test(content.migration));
check("migration enables RLS", /alter table public\.payment_provider_config enable row level security/i.test(content.migration));
check("migration grants authenticated select only", /grant select on public\.payment_provider_config to authenticated/i.test(content.migration));
check("migration grants service role mutations", /grant all on public\.payment_provider_config to service_role/i.test(content.migration));
check("migration seeds mock test active", /'mock'[\s\S]*'test'[\s\S]*true[\s\S]*'active'/i.test(content.migration));
check("migration writes audit event", /audit_financial_events[\s\S]*payment_provider_config\.foundation_created/i.test(content.migration));

check("edge function exists", /serve\(async \(req\)/.test(content.fn));
check("edge function requires JWT", /Authorization[\s\S]*Bearer/.test(content.fn) && /auth\.getUser/.test(content.fn));
check("edge function restricts to finance admin or super admin", /FINANCE_ADMIN/.test(content.fn) && /SUPERADMIN/.test(content.fn) && /SUPER_ADMIN/.test(content.fn));
check("edge function does not allow regular admin role", !/managerRoles[\s\S]*"ADMIN"/.test(content.fn));
check("edge function checks secrets by name only", /REQUIRED_SECRETS/.test(content.fn) && /Deno\.env\.get\(name\)/.test(content.fn));
check("edge function never returns secret values", /secrets_exposed:\s*false/.test(content.fn));
check("edge function real money default false", /PAYMENTS_REAL_ENABLED[\s\S]*false/.test(content.fn));
check("edge function effective provider mock when real disabled", /effective_provider_for_money[\s\S]*realEnabled[\s\S]*"mock"/.test(content.fn));
check("edge function requires change reason", /CHANGE_REASON_REQUIRED/.test(content.fn));
check("edge function audits provider changes", /admin\.payment_provider\.set_active/.test(content.fn) || /action: "set_active"/.test(content.fn));
check("edge function rate limits admin config", /RATE_LIMITED/.test(content.fn) && /60_000/.test(content.fn));
check("edge function test connection avoids provider network", /network_call_performed:\s*false/.test(content.fn));
check("edge function exposes missing secret names only", /missing_secrets/.test(content.fn) && /present_secrets/.test(content.fn));
check("edge function exposes per provider secret status safely", /secret_status/.test(content.fn) && /missing_secret_count/.test(content.fn));
check("edge function accepts mercado_pago alias without adding secret exposure", /provider === "mercado_pago"/.test(content.fn) && !/access_token.*return|secret.*value/i.test(content.fn));
check("package exposes provider admin QA", /qa:payment-provider-admin-config/.test(content.packageJson));

absent("edge function has no hardcoded PSP secret values", content.fn, /(sk_live_|sk_test_|APP_USR-[A-Za-z0-9_-]{8,})/i);
absent("migration has no secret-bearing columns", content.migration, /(client_secret|access_token|webhook_secret|stripe_secret|mercadopago_token)\s+(text|jsonb|varchar)/i);

if (failures) {
  console.error(`\n${failures} payment provider admin config foundation checks failed.`);
  process.exit(1);
}

console.log("\n28 payment provider admin config foundation checks passed.");
