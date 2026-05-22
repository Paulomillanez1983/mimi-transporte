import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const files = {
  providerHtml: "prestador.html",
  provider: "src/main-provider.js",
  renderProvider: "src/ui/render-provider.js",
  api: "src/services/service-api.js",
  providerCss: "styles/provider.css",
  runtimeConfig: "src/services/runtime-config.js",
  supabase: "src/services/supabase.js",
  saveFunction: "supabase/functions/svc-save-provider-service/index.ts",
};

function read(key) {
  return fs.readFileSync(path.join(root, files[key]), "utf8");
}

const source = Object.fromEntries(Object.keys(files).map((key) => [key, read(key)]));
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

check("provider HTML keeps wallet tab", /data-tab="wallet"/.test(source.providerHtml));
check("provider HTML keeps wallet panel", /provider-wallet-section/.test(source.providerHtml));
check("provider HTML keeps notification badge", /id="notificationBadge"/.test(source.providerHtml));
check("provider HTML keeps notifications drawer", /id="notificationsDrawer"/.test(source.providerHtml));
check("provider HTML keeps sheet notification bell", /id="sheetNotificationBell"/.test(source.providerHtml));
check("provider HTML keeps provider auth body state", /provider-auth-loading/.test(source.providerHtml));

check("provider JS keeps wallet state and payout account", /providerPayoutAccount/.test(source.provider) && /walletLoading/.test(source.provider));
check("provider JS keeps notification realtime channel", /notificationRealtimeChannel/.test(source.provider));
check("provider JS keeps notification sync flow", /async syncNotifications/.test(source.provider) && /startNotificationSync/.test(source.provider));
check("provider JS keeps notification drawer controls", /notificationsDrawer/.test(source.provider) && /sheetNotificationBell/.test(source.provider));
check("provider JS keeps Google provider login", /signInWithGoogle/.test(source.provider) && /provider-auth/.test(source.provider));
check("provider JS saves workspace through service API", /saveProviderWorkspace/.test(source.provider));
check("provider JS deactivates offerings through audited service API", /deactivateProviderOffering/.test(source.provider));
check("provider JS reactivates offerings through audited service API", /reactivateProviderOffering/.test(source.provider));
check("provider service list exposes explicit pause/deactivate action", /(Pausar|Eliminar servicio)/.test(source.renderProvider) && /data-provider-business-action="delete-offering"/.test(source.renderProvider));
check("provider service delete action is styled", /provider-service-delete-button/.test(source.providerCss));
check("provider service list exposes inactive reactivation action", /(Servicios desactivados|Pausados)/.test(source.renderProvider) && /data-provider-business-action="reactivate-offering"/.test(source.renderProvider));
check("provider service reactivate action is styled", /provider-service-reactivate-button/.test(source.providerCss));
check("provider publication actions show loading state", /setProviderPublicationActionLoading/.test(source.provider) && /publicationBusy/.test(source.provider) && /(Pausando|Eliminando)\.\.\./.test(source.provider) && /Reactivando\.\.\./.test(source.provider));
check("provider publication buttons have loading styles", /provider-service-delete-button\.is-loading/.test(source.providerCss) && /provider-service-reactivate-button\.is-loading/.test(source.providerCss) && /animation:\s*mimi-spin/.test(source.providerCss));
check("provider services tab defaults to Tus servicios instead of composer", /<h3>Tus servicios<\/h3>/.test(source.renderProvider) && !/shouldRenderComposer\s*=\s*!offerings\.length/.test(source.renderProvider));
check("provider services tab clears stale composer state", /switchTab\(tab,\s*options\s*=\s*\{\}\)/.test(source.provider) && /tab === "pricing" && !options\.preserveServiceComposer/.test(source.provider) && /serviceComposerOpen:\s*false/.test(source.provider));
check("provider services tab click closes composer before same-tab collapse", /if \(tab === "pricing"\)\s*\{\s*this\.closeProviderServiceComposer\(\);/.test(source.provider));
check("provider add and edit preserve composer explicitly", (source.provider.match(/switchTab\("pricing",\s*\{\s*preserveServiceComposer:\s*true\s*\}\)/g) || []).length >= 3);
check("provider services source does not include old publish hero copy", !/Publica sin repetir datos/.test(source.renderProvider));
check(
  "provider JS has no direct offering soft-delete update",
  !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*false/.test(source.provider),
);
check(
  "provider JS has no direct offering reactivation update",
  !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*true/.test(source.provider),
);

check("Supabase client keeps provider auth storage key", /mimi_services_provider_auth/.test(source.supabase));
check("Supabase client keeps provider auth lock", /mimi_services_provider_auth_lock/.test(source.supabase));
check("runtime config exports remote bootstrap flag", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));

check("service API calls svc-save-provider-service", /svc-save-provider-service/.test(source.api));
check("service API uses explicit JWT authorization", /"Authorization":\s*`Bearer \$\{session\.access_token\}`/.test(source.api));
check("service API sends provider and correlation headers", /X-MIMI-Provider-Id/.test(source.api) && /X-MIMI-Correlation-Id/.test(source.api));
check("service API has audited deactivate operation", /deactivateProviderOffering/.test(source.api) && /"deactivate_offering"/.test(source.api));
check("service API has audited reactivate operation", /reactivateProviderOffering/.test(source.api) && /mode,\s*[\r\n\s]*providerId/.test(source.api) && /"reactivate_offering"/.test(source.api));
check("service API fails closed when save function is missing", /provider_service_save_function_missing/.test(source.api));

check("save Edge Function supports audited deactivation", /deactivate_offering/.test(source.saveFunction));
check("save Edge Function supports audited reactivation", /reactivate_offering/.test(source.saveFunction) && /reactivateOffering/.test(source.saveFunction));
check("save Edge Function validates offering ownership", /assertOfferingOwnership/.test(source.saveFunction) && /offering_forbidden/.test(source.saveFunction));
check("save Edge Function records deactivation audit event", /change_type:\s*"deactivated"/.test(source.saveFunction));
check("save Edge Function records active true to false diff", /active:\s*\{\s*from:\s*true,\s*to:\s*false\s*\}/.test(source.saveFunction));
check("save Edge Function records reactivation audit event", /change_type:\s*"reactivated"/.test(source.saveFunction));
check("save Edge Function records active false to true diff", /active:\s*\{\s*from:\s*false,\s*to:\s*true\s*\}/.test(source.saveFunction));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider UI release guardrail checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider UI release guardrail checks passed.`);
