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
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

const servicesHome = between(source.renderProvider, "function renderProviderServicesHome", "function renderOfferingEditorV2");
const businessRenderer = between(source.renderProvider, "function renderProviderBusiness", "function renderProviderTrust");
const mobileFocusCss = between(source.providerCss, "Provider Services mobile 11/10 focus polish 2026-05-21");
const businessActions = between(source.provider, 'if (action === "add-provider-service")', 'if (action === "refresh-location")');
const addServiceCtaCount = (servicesHome.match(/data-provider-business-action="add-provider-service"/g) || []).length;

check("baseline keeps wallet", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]) && includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications in DOM", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps login and provider auth", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]) && includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps remote bootstrap flag", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("baseline keeps audited save path", includesAll(source.api, ["svc-save-provider-service", "deactivateProviderOffering", "reactivateProviderOffering"]));

check("services screen has one primary add CTA", addServiceCtaCount === 1);
check("empty state does not duplicate add CTA", !/provider-services-empty-state[\s\S]{0,420}data-provider-business-action="add-provider-service"/.test(servicesHome));
check("bottom duplicate add CTA is absent", !/Agregar otro servicio/.test(servicesHome));
check("services cards keep enterprise actions", includesAll(servicesHome, ["Ver como cliente", "Pausar", "Reactivar", "provider-service-list-card", "provider-service-card-actions"]));
check("services cards avoid destructive copy", !/>\s*Eliminar\s*</.test(servicesHome + businessRenderer));

check("composer focus header exists", includesAll(businessRenderer, ["provider-service-composer-head", "Modo foco Servicios", "Cerrar y volver a Tus servicios"]));
check("composer close action is wired", includesAll(businessActions, ["close-provider-service-composer", "closeProviderServiceComposer", "renderProviderScreen"]));
check("composer uses compact builder copy", includesAll(businessRenderer, ["Que servicio ofreces?", "Precio y modalidad", "Adicionales", "Donde trabajas", "Perfil publico"]));
check("composer has five step roadmap", includesAll(businessRenderer, ["provider-service-builder-roadmap", "Pasos para publicar servicio", "Servicio", "Precio", "Zona", "Perfil"]));
check("composer keeps zone and profile collapsed by default", includesAll(businessRenderer, ["shouldKeepProfileCompact = true", "shouldOpenAddressStep = !shouldKeepProfileCompact", "shouldOpenPublicProfileStep = !shouldKeepProfileCompact"]));
check("composer keeps save audit microcopy", /Los cambios se guardan por el flujo auditado de MIMIGO/.test(businessRenderer));
check("composer keeps manual flow inputs", includesAll(businessRenderer, ["providerAiPrompt", "offering:0:title", "offering:0:pricingModel", "providerAddressText"]));
check("guided beta remains gated", /guidedEnabled[\s\S]+Agregar servicio guiado \(Beta\)/.test(servicesHome));

check("focus mode hides notification bell only visually", /data-provider-tab="pricing"[\s\S]+\.sheet-notification-bell[\s\S]+visibility:\s*hidden[\s\S]+opacity:\s*0[\s\S]+pointer-events:\s*none/.test(mobileFocusCss));
check("focus mode does not remove notification drawer", !/notificationsDrawer[\s\S]{0,120}display:\s*none/i.test(mobileFocusCss));
check("mobile compact mode 430 exists", /@media \(max-width:\s*430px\)[\s\S]+provider-services-home-hero[\s\S]+provider-service-composer-head[\s\S]+provider-service-card-actions/.test(mobileFocusCss));
check("mobile compact mode 380 exists", /@media \(max-width:\s*380px\)[\s\S]+provider-services-summary-card[\s\S]+provider-service-card-actions/.test(mobileFocusCss));
check("mobile roadmap scrolls horizontally", /provider-service-builder-roadmap[\s\S]+grid-template-columns:\s*repeat\(5/.test(mobileFocusCss) && /@media \(max-width:\s*430px\)[\s\S]+provider-service-builder-roadmap[\s\S]+overflow-x:\s*auto/.test(mobileFocusCss));
check("mobile buttons stay touchable", /provider-services-hero-cta[\s\S]+min-height:\s*44px/.test(mobileFocusCss) && /provider-save-button[\s\S]+min-height:\s*48px/.test(mobileFocusCss));
check("mobile card actions stay compact but present", /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(mobileFocusCss));
check("mobile CSS avoids horizontal overflow patterns", !/width:\s*100vw/.test(mobileFocusCss));

check("no direct legacy writes in provider JS", !/from\(["']svc_provider_(service_offerings|pricing|categories)["']\)[\s\S]{0,260}\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.provider + source.renderProvider));
check("no service role in frontend", !/service_role/i.test(source.provider + source.renderProvider + source.providerCss));
check("no payment scopes touched", !/(payment-webhook|create-payment-intent|get-payment-status|cancel-payment|refund-payment|mercado\s*pago|mercadopago|_shared\/payments|_shared\\payments)/i.test(servicesHome + businessRenderer + mobileFocusCss));
check("no Transporte scope touched", !/(transporte|transport)/i.test(servicesHome + businessRenderer + mobileFocusCss));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider services mobile focus checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider services mobile focus checks passed.`);
