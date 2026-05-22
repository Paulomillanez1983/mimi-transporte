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
  edge: "supabase/functions/svc-save-provider-service/index.ts",
  foundationSchema: "supabase/migrations/20260520230844_service_intelligence_foundation_schema.sql",
  addonsMigration: "supabase/migrations/20260521153000_svc_provider_service_addons_phase_d.sql",
};

function read(key) {
  const fullPath = path.join(root, files[key]);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${files[key]}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

const source = Object.fromEntries(Object.keys(files).map((key) => [key, read(key)]));
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function includesAll(text, patterns) {
  return patterns.every((pattern) => (
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
  ));
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

const workspaceLoader = between(source.api, "export async function loadProviderWorkspace", "function normalizeUuidForSave");
const servicesHome = between(source.renderProvider, "function renderProviderServicesHome", "function renderOfferingEditorV2");
const offeringEditor = between(source.renderProvider, "function renderOfferingEditorV2", "function renderProviderBusiness");
const previewRenderer = between(source.renderProvider, "export function renderProviderServicePreviewSheet", "function firstImageUrlFrom");
const addonsEditor = between(source.renderProvider, "function renderProviderOfferingAddonsEditor", "function providerOfferingUpdatedLabel");
const addonCss = source.providerCss;
const addonsMigrationExecutable = source.addonsMigration
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

check("baseline keeps wallet HTML and logic", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]) && includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps provider auth and Google login", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]) && includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps remote bootstrap flag", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("baseline keeps audited service save path", includesAll(source.api, ["svc-save-provider-service", "saveProviderWorkspaceViaEdge"]));

check("foundation schema created provider addons table", includesAll(source.foundationSchema, ["create table if not exists public.svc_provider_offering_addons", "alter table public.svc_provider_offering_addons enable row level security"]));
check("addons phase migration exists", includesAll(source.addonsMigration, ["MIMI_PROVIDER_SERVICE_ADDONS_ENABLED", "MIMI_PROVIDER_SERVICE_PACKAGES_ENABLED"]));
check("addons flags default false", /'MIMI_PROVIDER_SERVICE_ADDONS_ENABLED'[\s\S]{0,120}false/.test(source.addonsMigration) && /'MIMI_PROVIDER_SERVICE_PACKAGES_ENABLED'[\s\S]{0,120}false/.test(source.addonsMigration));
check("addons migration revokes direct writes", includesAll(source.addonsMigration, ["revoke insert, update, delete", "from anon", "from authenticated"]));
check("addons migration keeps service_role write path", /grant all privileges on table public\.svc_provider_offering_addons to service_role/.test(source.addonsMigration));
check("addons migration keeps provider/admin select policy", includesAll(source.addonsMigration, ["svc_provider_addons_provider_select", "svc_get_provider_id_by_user", "is_admin_user"]));
check("addons migration extends audit change types", includesAll(source.addonsMigration, ["addon_created", "addon_updated", "addon_deactivated"]));
check("addons migration avoids forbidden executable scopes", !/(payment-webhook|create-payment-intent|get-payment-status|refund-payment|cancel-payment|_shared\/payments|mercado\s*pago|mercadopago|transporte)/i.test(addonsMigrationExecutable));

check("provider workspace loads addons read-only", includesAll(workspaceLoader, ["svc_provider_offering_addons", ".select(\"id,provider_id,offering_id,name,description,addon_code,price,pricing_model,unit,is_active,created_at,updated_at\")", "addonsByOfferingId", "offeringsWithAddons"]));
check("provider workspace exposes addons on business state", /addons:\s*addonRows/.test(workspaceLoader) && /business:\s*\{[\s\S]+addons,/.test(source.provider));
check("provider loads addons feature flag disabled by default", includesAll(source.api + source.provider, ["MIMI_PROVIDER_SERVICE_ADDONS_ENABLED", "loadProviderServiceAddonsConfig", "providerServiceAddonsFallback", "serviceAddons"]));
check("provider addons local override is localhost-only", includesAll(source.api, ["readLocalProviderServiceAddonsOverride", "provider_service_addons_beta", "if (!isLocalDevelopmentHost()) return null;"]));
check("provider addons flag uses provider-scoped allowlist", includesAll(source.api, ["providerServiceAddonsFlagAllowsProvider", "enabled_provider_ids", "allowed_provider_ids", "metadata.providers", "scope !== \"provider\""]));
check("provider addons global enabled is not enough", includesAll(source.api, ["if (scope !== \"provider\") return false", "providerServiceAddonsFlagAllowsProvider(remoteFlag, providerId)", "provider_scope_allowlist"]));
check("provider addons provider scope without provider id stays disabled", includesAll(source.api, ["const normalizedProviderId = normalizeFeatureFlagProviderId(providerId)", "if (!normalizedProviderId) return false"]));
check("provider addons invalid metadata stays disabled", includesAll(source.api, ["function featureFlagMetadata", "JSON.parse(metadata)", "catch (_)", "return {}"]));
check("provider addons production query override remains blocked", includesAll(source.api, ["function isLocalDevelopmentHost", "readLocalProviderServiceAddonsOverride", "if (!isLocalDevelopmentHost()) return null;"]));
check("provider passes current provider id to addons flag loader", /loadProviderServiceAddonsConfig\(\{\s*(providerId|providerId:\s*session\.providerId)\s*\}\)/.test(source.provider));
check("provider keeps addon flag context in state", includesAll(source.provider, ["flag: config.flag ?? previous.flag ?? null", "providerId: config.providerId ?? previous.providerId ?? null"]));
check("renderer can re-evaluate provider allowlist", includesAll(source.renderProvider, ["providerServiceAddonsEnabledForState", "providerAddonsAllowedIdsFromMetadata", "enabled_provider_ids", "allowed_provider_ids", "state.session?.providerId", "offering?.provider_id"]));
check("provider packages flag remains unused by frontend activation", !/MIMI_PROVIDER_SERVICE_PACKAGES_ENABLED/.test(source.api + source.provider + source.renderProvider));
check("provider API does not write addons direct", !/from\(["']svc_provider_offering_addons["']\)[\s\S]{0,260}\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.api));
check("provider JS does not write addons direct", !/from\(["']svc_provider_offering_addons["']\)[\s\S]{0,260}\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.provider));
check("render shows addon count only behind flag and data", includesAll(servicesHome, ["addonsEnabled", "providerOfferingActiveAddons", "provider-service-addon-strip", "Adicionales disponibles"]));
check("render includes addons editor behind flag", includesAll(offeringEditor + addonsEditor, ["addonsEnabled", "renderProviderOfferingAddonsEditor", "provider-service-addons-editor", "Agregar", "addon:${index}:${addonIndex}:name"]));
check("builder shows addons as gated step", includesAll(source.renderProvider, ["provider-flow-step-addons", "addonsEnabled", "renderProviderOfferingAddonsEditor(firstOffering, 0)", "Adicionales simples", "+ Agregar adicional", "Los adicionales se pueden agregar despues de publicar el servicio"]));
check("preview shows addon block only behind flag and data", includesAll(previewRenderer, ["addonsEnabled", "provider-service-preview-addons", "Adicionales disponibles", "No se cobran automaticamente todavia"]));
check("provider collects addon form fields", includesAll(source.provider, ["offeringAddons", "addon:${index}:${addonIndex}:present", "addon:${index}:${addonIndex}:pricingModel"]));
check("provider saves addons through audited Edge helper", includesAll(source.api + source.provider, ["saveProviderOfferingAddons", "save_offering_addons", "svc-save-provider-service addons rejected"]));
check("Edge Function supports audited addon operation", includesAll(source.edge, ["saveOfferingAddons", "save_offering_addons", "svc_provider_offering_addons", "assertOfferingOwnership", "addon_created", "addon_updated", "addon_deactivated"]));
check("Edge Function writes addon audit events", includesAll(source.edge, ["svc_provider_service_change_events", "snapshotAddon", "diffSnapshots", "metadata_json"]));
check("addon UI keeps preview CTAs visual only", /data-provider-preview-only/.test(previewRenderer) && !/data-provider-preview-only[\s\S]{0,140}data-provider-business-action/.test(previewRenderer));
check("addon UI does not create requests or payments", !/(svc-create-request|createRequest|svc_requests|payment-webhook|mercado\s*pago|mercadopago|create-payment-intent|get-payment-status|refund-payment|cancel-payment)/i.test(servicesHome + previewRenderer));
check("addon UI does not touch client search", !/(main-client|render-client|svc-search-providers|searchProviders|cliente\.html)/i.test(servicesHome + previewRenderer));
check("addon UI never uses service_role", !/service_role/i.test(servicesHome + previewRenderer + workspaceLoader));
check("addon CSS styles service cards and preview", includesAll(addonCss, ["provider-service-addon-strip", "provider-service-preview-addons"]));
check("addon CSS is mobile safe", /@media \(max-width:\s*560px\)[\s\S]+provider-service-addon-strip/.test(addonCss) && /@media \(max-width:\s*430px\)[\s\S]+provider-service-preview-addons/.test(addonCss));
check("existing pause/reactivate remain audited", /deactivateProviderOffering\(providerId, offeringId\)/.test(source.provider) && /reactivateProviderOffering\(providerId, offeringId\)/.test(source.provider));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider service addons checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider service addons checks passed.`);
