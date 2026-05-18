const fs = require("fs");

const files = {
  migration: "supabase/migrations/20260514152000_provider_payout_account_foundation.sql",
  providerFn: "supabase/functions/provider-payout-account/index.ts",
  adminFn: "supabase/functions/admin-provider-payout-accounts/index.ts",
  providerHtml: "mimi-servicios/prestador.html",
  publicProviderHtml: "prestador/index.html",
  providerMain: "mimi-servicios/src/main-provider.js",
  providerRender: "mimi-servicios/src/ui/render-provider.js",
  providerApi: "mimi-servicios/src/services/service-api.js",
  providerCss: "mimi-servicios/styles/provider.css",
  appVersion: "app-version.json",
  partnerSw: "sw-partner.js",
  adminHtml: "admin/admin-panel.html",
  adminJs: "admin/admin-finance.js",
  docs: "docs/finance/MIMIGO_PAYMENT_GATEWAY_AND_PAYOUT_ACCOUNT_FOUNDATION_2026-05-14.md",
  packageJson: "package.json"
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

let failures = 0;
let checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasProviderTabOrder(text) {
  return /data-tab="now"[\s\S]*data-tab="scheduled"[\s\S]*data-tab="wallet"[\s\S]*data-tab="pricing"[\s\S]*data-tab="account"/.test(text);
}

const providerBuild = content.providerMain.match(/const MIMI_PROVIDER_BUILD = "([^"]+)"/)?.[1] || "";
const partnerSwVersion = content.partnerSw.match(/APP_VERSION = "([^"]+)"/)?.[1] || "";

check("migration creates provider payout accounts", /create table if not exists public\.provider_payout_accounts/i.test(content.migration));
check("migration creates append-only events", /create table if not exists public\.provider_payout_account_events/i.test(content.migration));
check("migration avoids raw cbu/cvu columns", !/\n\s*(cbu|cvu)\s+(text|varchar)/i.test(content.migration));
check("migration stores masked fields", /cbu_masked text/.test(content.migration) && /cvu_masked text/.test(content.migration) && /alias_masked text/.test(content.migration));
check("migration stores stable account hash", /account_hash text not null/.test(content.migration) && /idx_provider_payout_accounts_hash/.test(content.migration));
check("migration requires encrypted payload status", /encrypted_payload_required boolean not null default true/.test(content.migration) && /encrypted_payload_status/.test(content.migration));
check("migration enables RLS", /alter table public\.provider_payout_accounts enable row level security/i.test(content.migration) && /alter table public\.provider_payout_account_events enable row level security/i.test(content.migration));
check("migration grants select only to authenticated", /grant select on public\.provider_payout_accounts to authenticated/i.test(content.migration));
check("migration grants service role writes", /grant all on public\.provider_payout_accounts to service_role/i.test(content.migration));
check("migration writes audit foundation event", /provider_payout_account\.foundation_created/.test(content.migration));
check("migration documents no plaintext bank values", /full_bank_values_plaintext_stored', false/.test(content.migration));

check("provider function requires auth", /Authorization[\s\S]*Bearer/.test(content.providerFn) && /auth\.getUser/.test(content.providerFn));
check("provider function uses service role for writes", /SUPABASE_SERVICE_ROLE_KEY/.test(content.providerFn) && /provider_payout_accounts/.test(content.providerFn));
check("provider function encrypts AES-GCM", /AES-GCM/.test(content.providerFn) && /PAYOUT_ACCOUNT_ENCRYPTION_KEY/.test(content.providerFn));
check("provider function fallback stores masked hash only", /masked_hash_only/.test(content.providerFn) && /encrypted_payload_required:\s*true/.test(content.providerFn));
check("provider function never returns raw values", /raw_values_returned:\s*false/.test(content.providerFn) && /raw_account_values_exposed:\s*false/.test(content.providerFn));
check("provider function hashes account with salt", /PAYOUT_ACCOUNT_HASH_SALT/.test(content.providerFn) && /sha256Hex/.test(content.providerFn));
check("provider function masks CBU CVU", /maskDigits\(normalized\.cbu\)/.test(content.providerFn) && /maskDigits\(normalized\.cvu\)/.test(content.providerFn));
check("provider function validates CBU CVU length", /CBU_INVALID_LENGTH/.test(content.providerFn) && /CVU_INVALID_LENGTH/.test(content.providerFn));
check("provider function writes payout account event", /provider_payout_account_events/.test(content.providerFn) && /risk_event_type: "provider_change_bank_account"/.test(content.providerFn));
check("provider function writes audit event", /audit_financial_events/.test(content.providerFn) && /provider\.payout_account/.test(content.providerFn));
check("provider function writes risk event", /fraud_events/.test(content.providerFn) && /provider_change_bank_account/.test(content.providerFn));
check("provider function does not touch ledger tables", !/financial_entries|financial_transactions|financial_post_transaction/i.test(content.providerFn));

check("admin payout function restricts finance roles", /FINANCE_ADMIN/.test(content.adminFn) && /SUPER_ADMIN/.test(content.adminFn) && /SUPERADMIN/.test(content.adminFn));
check("admin payout function lists masked accounts", /cbu_masked/.test(content.adminFn) && /cvu_masked/.test(content.adminFn));
check("admin payout function rejects verify without encryption", /PAYOUT_ACCOUNT_ENCRYPTION_REQUIRED/.test(content.adminFn));
check("admin payout function writes audit and append-only event", /audit_financial_events/.test(content.adminFn) && /provider_payout_account_events/.test(content.adminFn));
check("admin payout function never returns raw values", /raw_values_returned:\s*false/.test(content.adminFn));
check("admin payout function does not activate real payout", /payout_real_enabled:\s*false/.test(content.adminFn));

check("provider menu labels Wallet", /id="linkEarnings"[\s\S]*<span>Wallet<\/span>/.test(content.providerHtml) && /drawer-stat-label">Wallet/.test(content.providerHtml));
check("provider sheet exposes dedicated wallet tab", /data-tab="wallet"[\s\S]*Wallet/.test(content.providerHtml) && /id="tabWallet"/.test(content.providerHtml));
check("public provider route exposes dedicated wallet tab", /data-tab="wallet"[\s\S]*Wallet/.test(content.publicProviderHtml) && /id="tabWallet"/.test(content.publicProviderHtml));
check("provider tabs keep expected order", hasProviderTabOrder(content.providerHtml));
check("public provider tabs keep expected order", hasProviderTabOrder(content.publicProviderHtml));
check("provider account support copy is simple", /MIMIGO soporte/.test(content.providerHtml) && /Contactarnos/.test(content.providerHtml) && !/soporte\/admin/.test(content.providerHtml));
check("public provider account support copy is simple", /MIMIGO soporte/.test(content.publicProviderHtml) && /Contactarnos/.test(content.publicProviderHtml) && !/soporte\/admin/.test(content.publicProviderHtml));
check("provider UI renders wallet panel", /provider-wallet-overview/.test(content.providerRender) && /Datos para recibir pagos/.test(content.providerRender));
check("provider UI has CBU CVU alias form", /name="cbu"/.test(content.providerRender) && /name="cvu"/.test(content.providerRender) && /name="alias"/.test(content.providerRender));
check("provider UI text avoids payout promise", /Payout real todavia desactivado/.test(content.providerRender));
check("provider API calls provider-payout-account", /provider-payout-account/.test(content.providerApi) && /submitProviderPayoutAccount/.test(content.providerApi));
check("provider main records risk event", /recordCriticalRiskEvent\("provider_change_bank_account"/.test(content.providerMain));
check("provider main submits payout account", /submitProviderPayoutAccount/.test(content.providerMain) && /handleProviderPayoutAccountSubmit/.test(content.providerMain));
check("provider main cache-busts wallet renderer", Boolean(providerBuild) && new RegExp(`render-provider\\.js\\?v=${escapeRegExp(providerBuild)}`).test(content.providerMain));
check("provider wallet drawer targets dedicated wallet tab", /earnings:\s*\{\s*tab:\s*"wallet",\s*target:\s*"providerPayoutAccountPanel"\s*\}/.test(content.providerMain));
check("provider screen renders wallet dashboard", /export function renderProviderScreen\(state\)\s*\{[\s\S]{0,220}renderProviderDashboard\(state\);/.test(content.providerRender));
check("provider function prevents duplicate payout accounts", /\.eq\("account_hash", accountHash\)/.test(content.providerFn) && /duplicate:\s*true/.test(content.providerFn));
check("provider CSS styles wallet", /provider-wallet-card/.test(content.providerCss) && /provider-payout-account-form/.test(content.providerCss));
check("provider wallet has scroll target anchors", /id="providerWalletOverview"/.test(content.providerRender) && /id="providerPayoutAccountPanel"/.test(content.providerRender));
check("provider app version matches provider build", Boolean(providerBuild) && new RegExp(`"provider"[\\s\\S]{0,180}"version":\\s*"${escapeRegExp(providerBuild)}"`).test(content.appVersion));
check("partner service worker cache is refreshed", Boolean(partnerSwVersion) && !/provider-48|notification-icons/.test(partnerSwVersion));

check("admin UI shows payout review panel", /providerPayoutAccountReviewList/.test(content.adminHtml));
check("admin JS calls admin provider payout function", /admin-provider-payout-accounts/.test(content.adminJs));
check("admin JS blocks encrypted payload approval by displaying warning", /encrypted_payload_required/.test(content.adminJs) && /Requiere payload cifrado/.test(content.adminJs));
check("docs describe secrets", /PAYOUT_ACCOUNT_ENCRYPTION_KEY/.test(content.docs) && /PAYOUT_ACCOUNT_HASH_SALT/.test(content.docs));
check("package exposes payout account QA", /qa:provider-payout-account-foundation/.test(content.packageJson));

absent("provider function has no hardcoded bank value", content.providerFn, /\b\d{22}\b/);
absent("admin UI has no CBU CVU full test value", content.adminHtml + content.adminJs + content.providerRender, /\b\d{22}\b/);
absent("migration has no payout activation flag true", content.migration, /payout_real_enabled', true|real_payouts_enabled', true/i);
absent("frontend has no encryption secret names as values", content.providerHtml + content.providerMain + content.providerRender, /PAYOUT_ACCOUNT_ENCRYPTION_KEY\s*[:=]/);

if (failures) {
  console.error(`\n${failures} provider payout account foundation checks failed.`);
  process.exit(1);
}

console.log(`\n${checks} provider payout account foundation checks passed.`);
