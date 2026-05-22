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

const guidedCatalogApi = between(
  source.api,
  "export async function loadProviderGuidedServiceCatalog",
  "export async function resolveServiceIntent"
);
const guidedRender = between(
  source.renderProvider,
  "function providerGuidedQuestionStrategyLabel",
  "function renderProviderServicesHome"
);
const guidedProviderCode = between(
  source.provider,
  "findProviderGuidedTemplate",
  "async handleProviderBusinessAction"
);

check("baseline keeps provider wallet HTML", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]));
check("baseline keeps wallet logic", includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications UI", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps provider auth and Google login", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]));
check("baseline keeps provider auth storage/lock", includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps audited save path", includesAll(source.api, ["svc-save-provider-service", "saveProviderWorkspaceViaEdge", "X-MIMI-Correlation-Id"]));
check("baseline keeps remote bootstrap export", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));

check("guided provider flag key is used", includesAll(source.api + source.renderProvider, ["MIMI_PROVIDER_GUIDED_SERVICE_ENABLED"]));
check("guided provider beta defaults disabled", /emptyProviderGuidedServiceCatalog[\s\S]+enabled:\s*false/.test(source.api));
check("guided provider local override is localhost-only", /function isLocalDevelopmentHost/.test(source.api) && /if \(!isLocalDevelopmentHost\(\)\) return null;/.test(source.api));
check("guided provider catalog loader exists", /export async function loadProviderGuidedServiceCatalog/.test(source.api));
check("guided catalog API is read-only", guidedCatalogApi && !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(guidedCatalogApi));
check(
  "guided catalog API reads foundation tables",
  includesAll(guidedCatalogApi, [
    "svc_feature_flags",
    "svc_service_templates",
    "svc_service_template_versions",
    "svc_categories",
    "svc_service_attributes",
    "svc_service_questions",
    "svc_pricing_rules",
    "svc_regulated_service_requirements",
  ])
);
check("guided catalog API never uses service_role", !/service_role/i.test(guidedCatalogApi));

check("provider loads guided catalog during boot", /loadProviderGuidedServiceCatalog/.test(source.provider) && /catalogo guiado de servicios/.test(source.provider));
check("provider exposes guided beta action", /add-provider-guided-service/.test(source.provider) && /openProviderBusinessSetup\(\{\s*mode:\s*"new",\s*guided:\s*guidedEnabled\s*\}\)/.test(source.provider));
check("provider can select a guided template", /select-guided-service-template/.test(source.provider) && /handleProviderGuidedTemplateSelect/.test(source.provider));
check("provider guided selection prefills form only", includesAll(source.provider, ["offering:0:title", "offering:0:description", "offering:0:pricingModel", "offering:0:quoteRequired"]));
check("provider guided selection updates local summary and preview", includesAll(guidedProviderCode, ["renderProviderGuidedTemplateSelection", "refreshProviderGuidedDraftPreview", "providerGuidedDraftPreviewHtml"]));
check("provider guided save still uses audited workspace save", /saveProviderWorkspace\(providerId, payload\)/.test(source.provider));
check("provider JS has no direct offering deactivate update", !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*false/.test(source.provider));
check("provider JS has no direct offering reactivate update", !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*true/.test(source.provider));
check("guided code does not create requests or payments", !/svc-create-request|create-payment|payment-webhook|Mercado Pago|mercadopago|_shared\/payments/i.test(guidedProviderCode + guidedRender + guidedCatalogApi));

check("render keeps Tus servicios as main screen", /<h3>Tus servicios<\/h3>/.test(source.renderProvider));
check("render keeps normal add service action", /data-provider-business-action="add-provider-service"/.test(source.renderProvider));
check("render gates beta entry behind guidedEnabled", /guidedEnabled \?[\s\S]+Agregar servicio guiado \(Beta\)/.test(source.renderProvider));
check("render keeps guided composer optional after normal add", /const guidedPanelOpen = Boolean\(guidedEnabled && guidedService\?\.panelOpen\)/.test(source.renderProvider) && /isAddingOffering && guidedPanelOpen/.test(source.renderProvider));
check("render includes guided catalog search", /data-provider-guided-search/.test(source.renderProvider) && /Busca lo que ofreces/.test(source.renderProvider));
check("render includes template suggestions and selected summary", includesAll(guidedRender, ["data-provider-guided-template-id", "data-provider-guided-selection-summary", "data-template-search-value"]));
check("render includes regulated and quote badges", /Requiere validacion/.test(source.renderProvider) && /Cotizar/.test(source.renderProvider));
check("render includes guided draft preview before save", /provider-guided-draft-preview/.test(guidedRender) && includesAll(guidedProviderCode, ["data-provider-guided-save-preview", "Asi se vera para clientes"]));
check("render keeps questions as chips, not blocking form", includesAll(guidedRender, ["Preguntas sugeridas", "no bloquean el alta beta"]));
check("render includes catalog failure fallback to manual add", /No pudimos cargar sugerencias/.test(guidedRender) && /alta manual/.test(guidedRender));
check("render states save path remains audited", /svc-save-provider-service/.test(source.renderProvider));
check("CSS styles guided beta without touching wallet selectors", /provider-guided-service-entry/.test(source.providerCss) && /provider-guided-service-panel/.test(source.providerCss));
check("CSS styles selected summary and draft preview", includesAll(source.providerCss, ["provider-guided-selection-card", "provider-guided-draft-preview", "provider-guided-regulated-box"]));
check("CSS keeps guided beta mobile safe", /@media \(max-width:\s*560px\)[\s\S]+provider-guided-service-panel[\s\S]+provider-guided-draft-card-head/.test(source.providerCss));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider guided service checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider guided service checks passed.`);
