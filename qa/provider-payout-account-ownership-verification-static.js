const fs = require("fs");

const files = {
  migration: "supabase/migrations/20260514163818_provider_payout_account_ownership_verification.sql",
  kycRpcMigration: "supabase/migrations/20260514170500_provider_kyc_tax_id_service_rpc.sql",
  verifyFn: "supabase/functions/verify-provider-payout-account/index.ts",
  adapter: "supabase/functions/_shared/account-verification-provider.ts",
  providerFn: "supabase/functions/provider-payout-account/index.ts",
  adminFn: "supabase/functions/admin-provider-payout-accounts/index.ts",
  adminJs: "admin/admin-finance.js",
  providerRender: "mimi-servicios/src/ui/render-provider.js",
  providerCss: "mimi-servicios/styles/provider.css",
  docs: "docs/finance/MIMIGO_PAYMENT_GATEWAY_AND_PAYOUT_ACCOUNT_FOUNDATION_2026-05-14.md",
  packageJson: "package.json"
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")])
);

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

function absent(name, text, pattern) {
  check(name, !pattern.test(text), pattern.toString());
}

check("migration creates verification table", /create table if not exists public\.provider_payout_account_verifications/i.test(content.migration));
check("migration adds secure KYC tax fields", /kyc_tax_id_hash text/.test(content.migration) && /kyc_tax_id_masked text/.test(content.migration) && /kyc_tax_id_last4 text/.test(content.migration));
check("migration does not add plaintext tax id column", !/\b(kyc_tax_id|holder_tax_id)\s+(text|varchar)\b/i.test(content.migration));
check("migration protects KYC tax fields in trigger", /provider_kyc_tax_id_admin_only/.test(content.migration) && /before insert or update on public\.svc_providers/i.test(content.migration));
check("migration adds ownership status to payout account", /ownership_verification_status text not null default 'not_verified'/.test(content.migration) && /ownership_match boolean not null default false/.test(content.migration));
check("migration supports needs more info without payout approval", /'needs_more_info'/.test(content.migration));
check("migration enables RLS on verifications", /alter table public\.provider_payout_account_verifications enable row level security/i.test(content.migration));
check("migration grants service role writes only", /revoke all on public\.provider_payout_account_verifications from authenticated/i.test(content.migration) && /grant all on public\.provider_payout_account_verifications to service_role/i.test(content.migration));
check("migration encrypts raw response by contract", /raw_response_encrypted jsonb not null/.test(content.migration) && /raw_verification_response_plaintext_stored', false/.test(content.migration));
check("migration documents manual tax id is not plaintext", /manual_observed_tax_id_plaintext_stored', false/.test(content.migration) && /manual_observed_tax_id_compares_full_hash', true/.test(content.migration));
check("migration adds payout guard", /financial_provider_payout_account_guard/.test(content.migration) && /payout_account_guard_enabled/.test(content.migration));
check("migration holds payout when ownership not verified", /coalesce\(guard\.eligible, false\) = false then 'on_hold'/.test(content.migration));
check("migration does not touch ledger", !/financial_post_transaction|financial_entries\s*\(/i.test(content.migration));
check("KYC tax RPC is service-role only", /provider_kyc_tax_id_admin_update/.test(content.kycRpcMigration) && /security definer/i.test(content.kycRpcMigration) && /grant execute[\s\S]*to service_role/i.test(content.kycRpcMigration) && /revoke all[\s\S]*from authenticated/i.test(content.kycRpcMigration));
check("KYC tax RPC stores only hash masked last4", /p_tax_hash/.test(content.kycRpcMigration) && /p_tax_masked/.test(content.kycRpcMigration) && /p_tax_last4/.test(content.kycRpcMigration) && !/p_tax_id|p_cuit|p_cuil/i.test(content.kycRpcMigration));
check("KYC tax RPC sets local service role for guarded update", /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/.test(content.kycRpcMigration));

check("adapter supports providers", /mock/.test(content.adapter) && /bind/.test(content.adapter) && /redlink/.test(content.adapter) && /external_api/.test(content.adapter));
check("adapter defaults safe when unconfigured", /ACCOUNT_VERIFICATION_PROVIDER_NOT_CONFIGURED/.test(content.adapter) && /pending_external_verification/.test(content.adapter));
check("adapter uses secrets only server side", /ACCOUNT_VERIFICATION_API_KEY/.test(content.adapter) && /ACCOUNT_VERIFICATION_BASE_URL/.test(content.adapter));
check("adapter restricts mock to test contexts", /MOCK_PROVIDER_NOT_ALLOWED_FOR_PRODUCTION_ACCOUNT/.test(content.adapter));

check("verify function requires finance admin", /FINANCE_ADMIN/.test(content.verifyFn) && /SUPER_ADMIN/.test(content.verifyFn));
check("verify function supports service flow safely", /x-mimigo-service-flow/.test(content.verifyFn) && /token === serviceRoleKey/.test(content.verifyFn));
check("verify function decrypts account payload", /AES-GCM/.test(content.verifyFn) && /decryptPayload/.test(content.verifyFn));
check("verify function encrypts raw provider response", /encryptRawResponse/.test(content.verifyFn) && /raw_response_encrypted/.test(content.verifyFn));
check("verify function compares by stable tax hash", /stableTaxHash/.test(content.verifyFn) && /holderHashes\.includes\(providerKycTaxHash\)/.test(content.verifyFn));
check("verify function handles co-holder match", /co_holder_tax_id_matches_kyc/.test(content.verifyFn));
check("verify function handles missing tax id", /pending_missing_tax_id/.test(content.verifyFn) && /provider_kyc_tax_id_missing/.test(content.verifyFn));
check("verify function handles mismatch", /ownership_mismatch/.test(content.verifyFn) && /holder_tax_id_does_not_match_kyc/.test(content.verifyFn));
check("verify function supports manual bank review", /manual_verify/.test(content.verifyFn) && /manual_bank_review/.test(content.verifyFn));
check("verify function requires observed tax id for manual approval", /OBSERVED_TAX_ID_REQUIRED/.test(content.verifyFn) && /observedTaxId\.length !== 11/.test(content.verifyFn));
check("verify function requires manual ownership confirmation", /OWNERSHIP_CONFIRMATION_REQUIRED/.test(content.verifyFn) && /confirm_ownership_match/.test(content.verifyFn));
check("verify function hashes observed tax id server side", /observedTaxHash = await stableTaxHash\(observedTaxId\)/.test(content.verifyFn));
check("hash salt fails closed when missing", /PAYOUT_ACCOUNT_HASH_SALT_MISSING/.test(content.verifyFn) && /PAYOUT_ACCOUNT_HASH_SALT_MISSING/.test(content.providerFn));
check("verify function rejects name only and last4 only", /name_only_match_accepted:\s*false/.test(content.verifyFn) && /last4_only_match_accepted:\s*false/.test(content.verifyFn));
check("verify function never stores observed tax id plaintext", /observed_tax_id_plaintext_stored:\s*false/.test(content.verifyFn) && !/raw_response_encrypted:[\s\S]{0,500}observedTaxId/.test(content.verifyFn));
check("verify function handles inactive account", /account_inactive/.test(content.verifyFn));
check("verify function records audit", /audit_financial_events/.test(content.verifyFn) && /provider\.payout_account\.ownership_verification/.test(content.verifyFn));
check("verify function records fraud event", /fraud_events/.test(content.verifyFn) && /provider_payout_account_ownership_verification/.test(content.verifyFn));
check("verify function can set KYC tax hash without plaintext persistence", /set_kyc_tax_id/.test(content.verifyFn) && /raw_tax_id_plaintext_stored:\s*false/.test(content.verifyFn));
check("verify function uses guarded KYC tax RPC", /provider_kyc_tax_id_admin_update/.test(content.verifyFn) && !/from\("svc_providers"\)[\s\S]{0,120}\.update\(\{[\s\S]{0,120}kyc_tax_id_hash/.test(content.verifyFn));
check("verify function supports controlled test audit for KYC tax", /resolveOptionalSmokeContext/.test(content.verifyFn) && /TEST_KYC_TAX_CONTEXT_NOT_ALLOWED/.test(content.verifyFn) && /notes\.includes\("smoke"\)/.test(content.verifyFn));
check("verify events preserve payout account test run id", /provider_payout_account_events[\s\S]{0,900}test_run_id:\s*input\.account\.test_run_id/.test(content.verifyFn));
check("verify function does not return raw values", /raw_values_returned:\s*false/.test(content.verifyFn));
absent("verify function has no hardcoded CUIT or CBU", content.verifyFn + content.adapter, /\b\d{11}\b|\b\d{22}\b/);

check("provider submit hashes holder tax id", /stableTaxHash\(normalized\.holderTaxId\)/.test(content.providerFn) && /holder_tax_id_hash/.test(content.providerFn));
check("provider response includes ownership status", /ownership_verification_status/.test(content.providerFn) && /ownership_match_reason/.test(content.providerFn));
check("provider test fixtures require controlled smoke context", /resolvePayoutAccountContext/.test(content.providerFn) && /TEST_PAYOUT_ACCOUNT_NOT_ALLOWED/.test(content.providerFn) && /@mimigo\.test/.test(content.providerFn) && /notes\.includes\("smoke"\)/.test(content.providerFn));
check("provider propagates test context to account rows", /environment:\s*context\.environment/.test(content.providerFn) && /is_test:\s*context\.isTest/.test(content.providerFn) && /test_run_id:\s*context\.testRunId/.test(content.providerFn));
check("provider propagates test context to events and risk", /context:\s*PayoutAccountContext/.test(content.providerFn) && /risk_scores[\s\S]{0,900}is_test:\s*input\.context\.isTest/.test(content.providerFn) && /provider_payout_account_events[\s\S]{0,900}test_run_id:\s*input\.context\.testRunId/.test(content.providerFn));
check("provider rejects unauthorized test mode with 403", /TEST_PAYOUT_ACCOUNT_NOT_ALLOWED[\s\S]{0,240}403/.test(content.providerFn));
check("admin blocks approve without ownership match", /PAYOUT_ACCOUNT_OWNERSHIP_VERIFICATION_REQUIRED/.test(content.adminFn));
check("admin supports needs more info without approving", /needs_more_info/.test(content.adminFn) && /pending_review/.test(content.adminFn));
check("admin masks holder name", /holder_name_masked/.test(content.adminFn) && /maskName/.test(content.adminFn));
check("admin payout review preserves account test context", /accountEventContext/.test(content.adminFn) && /environment:\s*eventContext\.environment/.test(content.adminFn) && /is_test:\s*eventContext\.isTest/.test(content.adminFn) && /test_run_id:\s*eventContext\.testRunId/.test(content.adminFn));
check("admin list exposes only safe test flags", /environment,is_test,test_run_id,fiscal_visibility/.test(content.adminFn) && /is_test:\s*Boolean\(row\.is_test\)/.test(content.adminFn));
check("admin UI can verify ownership", /verify-provider-payout-account/.test(content.adminJs) && /Verificar API/.test(content.adminJs));
check("admin UI has manual verification fields", /observed_tax_id/.test(content.adminJs) && /observed_holder_name/.test(content.adminJs) && /observed_bank_name/.test(content.adminJs));
check("admin UI requires manual confirmation checkbox", /confirm_ownership_match/.test(content.adminJs) && /Confirmo que el CUIT\/CUIL/.test(content.adminJs));
check("admin UI sends manual verify action", /action:\s*"manual_verify"/.test(content.adminJs));
check("admin UI shows masked declared and KYC tax status", /holder_tax_id_masked/.test(content.adminJs) && /provider_kyc_tax_id_status/.test(content.adminJs));
check("admin UI shows missing tax/provider states", /pending_missing_tax_id/.test(content.adminJs) && /pending_external_verification/.test(content.adminJs));
check("provider UI shows safe ownership states", /Cuenta bancaria en verificacion/.test(content.providerRender) && /La cuenta se verificara cuando tu identidad\/KYC este completo/.test(content.providerRender) && /Cuenta rechazada: no coincide titularidad/.test(content.providerRender));
check("provider UI shows wallet balances", /availableBalance/.test(content.providerRender) && /pendingBalance/.test(content.providerRender) && /futureDebtBalance/.test(content.providerRender));
check("provider UI says no full sensitive details", /Nunca mostramos CBU\/CVU ni CUIT\/CUIL completos/.test(content.providerRender));
check("provider CSS styles ownership note", /provider-wallet-note/.test(content.providerCss));
check("docs describe ownership verification", /Verificacion de titularidad CBU\/CVU/.test(content.docs) && /ACCOUNT_VERIFICATION_PROVIDER/.test(content.docs));
check("docs describe manual full-hash verification", /revision manual inicial/.test(content.docs) && /hash completo/.test(content.docs) && /No se acepta aprobacion por nombre ni por ultimos 4/.test(content.docs));
check("package exposes ownership QA", /qa:provider-payout-account-ownership/.test(content.packageJson));

absent("frontend has no account verification secrets", content.adminJs + content.providerRender, /ACCOUNT_VERIFICATION_API_KEY|PAYOUT_ACCOUNT_ENCRYPTION_KEY|PAYOUT_ACCOUNT_HASH_SALT/);
absent("admin UI does not show full tax id sample", content.adminJs + content.providerRender, /\b\d{11}\b/);

if (failures) {
  console.error(`\n${failures} payout account ownership verification checks failed.`);
  process.exit(1);
}

console.log(`\n${passes} payout account ownership verification checks passed.`);
