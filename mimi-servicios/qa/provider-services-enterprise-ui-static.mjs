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

const servicesHome = between(
  source.renderProvider,
  "function renderProviderServicesHome",
  "function renderOfferingEditorV2"
);
const offeringsSummary = between(
  source.renderProvider,
  "function renderOfferingsSummary(",
  "function renderOfferingsSummaryLegacy"
);
const legacyOfferingsSummaryReferences = (source.renderProvider.match(/renderOfferingsSummaryLegacy/g) || []).length;
const businessActions = between(
  source.provider,
  'if (action === "add-provider-service")',
  'if (action === "refresh-location")'
);
const serviceActions = between(
  source.provider,
  "async handleProviderOfferingDelete",
  "updateProviderServiceActionButtons"
);
const enterpriseCss = between(
  source.providerCss,
  "Provider Services Enterprise UI - Phase A",
  ".provider-client-preview-heading"
);
const servicesMobileFocusCss = between(
  source.providerCss,
  "Provider Services mobile 11/10 focus polish 2026-05-21",
  undefined
);
const addServiceCtaCount = (servicesHome.match(/data-provider-business-action="add-provider-service"/g) || []).length;

check("baseline keeps provider wallet HTML", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]));
check("baseline keeps wallet logic", includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications UI", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps provider auth and Google login", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]));
check("baseline keeps provider auth storage/lock", includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps remote bootstrap export", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("baseline keeps audited save API", includesAll(source.api, ["svc-save-provider-service", "deactivateProviderOffering", "reactivateProviderOffering"]));

check("services screen remains Tus servicios", /<h3>Tus servicios<\/h3>/.test(servicesHome));
check("enterprise services microcopy is present", /Administra que ofreces, como se ve para clientes y cuando aparece en busquedas/.test(servicesHome));
check("primary add service CTA remains present", /data-provider-business-action="add-provider-service"/.test(servicesHome) && /Agregar servicio/.test(servicesHome));
check("services home keeps one primary add service CTA", addServiceCtaCount === 1);
check("guided beta CTA remains gated by flag", /guidedEnabled \?[\s\S]+Agregar servicio guiado \(Beta\)/.test(servicesHome));
check("services summary states are present", includesAll(servicesHome, ["Activos", "Pausados", "Incompletos", "Requieren accion"]));
check("visual filters are local actions", includesAll(servicesHome, ["filter-provider-services", "data-provider-services-filter", "Todos", "Activos", "Pausados", "Incompletos", "Requieren revision"]));
check("service cards expose enterprise layout", includesAll(servicesHome, ["provider-service-list-card", "provider-service-status-pill", "provider-service-price-block", "provider-service-card-actions"]));
check("service cards keep edit action", /data-provider-business-action="edit-offering"/.test(servicesHome));
check("service cards keep audited pause/deactivate action", /data-provider-business-action="delete-offering"/.test(servicesHome) && /Pausar/.test(servicesHome));
check("service cards keep audited reactivate action", /data-provider-business-action="reactivate-offering"/.test(servicesHome) && /Reactivar/.test(servicesHome));
check("service cards include client preview action", /data-provider-business-action="preview-offering"/.test(servicesHome) && /Ver como cliente/.test(servicesHome));
check("service cards include clear pricing and status labels", includesAll(source.renderProvider, ["Visible para clientes", "Pausado", "Cotizar", "Actualizado"]));
check("services empty state is didactic", /Agrega tu primer servicio para aparecer en busquedas/.test(servicesHome));
check("services loading and error states are non-technical", /Cargando tus servicios/.test(servicesHome) && /No pudimos cargar tus servicios\. Volve a intentar/.test(servicesHome));
check("service composer has focus header and close action", includesAll(source.renderProvider, ["provider-service-composer-head", "Modo foco Servicios", "close-provider-service-composer", "Cerrar y volver a Tus servicios"]));
check("service composer uses compact builder copy", includesAll(source.renderProvider, ["Que servicio ofreces?", "Precio y modalidad", "Adicionales", "Donde trabajas", "Perfil publico", "Los cambios se guardan por el flujo auditado de MIMIGO"]));
check("service composer exposes five-step roadmap", includesAll(source.renderProvider, ["provider-service-builder-roadmap", "Pasos para publicar servicio", "Servicio", "Precio", "Zona", "Perfil"]));
check("service composer keeps addons as provider-gated step", includesAll(source.renderProvider, ["provider-flow-step-addons", "providerServiceAddonsEnabledForState(state)", "renderProviderOfferingAddonsEditor(firstOffering, 0)", "Disponible al publicar"]));
check("service composer keeps zone/profile compact by default", includesAll(source.renderProvider, ["shouldKeepProfileCompact = true", "shouldOpenProfileDetails = !shouldKeepProfileCompact", "shouldOpenPublicProfileStep = !shouldKeepProfileCompact"]));
check("composer offerings summary uses enterprise cards", includesAll(offeringsSummary, ["provider-offerings-summary-enterprise", "provider-offerings-enterprise-list", "provider-service-list-card", "provider-service-status-pill"]));
check("composer offerings summary no longer uses old pricing card", !/provider-pricing-card/.test(offeringsSummary));
check("composer offerings summary replaces destructive copy", !/>\s*Eliminar\s*</.test(offeringsSummary) && /Pausar/.test(offeringsSummary) && /Reactivar/.test(offeringsSummary));
check("composer offerings summary includes client preview action", /data-provider-business-action="preview-offering"/.test(offeringsSummary) && /Ver como cliente/.test(offeringsSummary));
check("legacy offerings summary is not referenced", legacyOfferingsSummaryReferences === 1);
check("account mini service card avoids destructive copy", !/provider-service-mini-actions[\s\S]{0,420}>\s*Eliminar\s*</.test(source.provider) && /provider-service-mini-actions[\s\S]{0,520}Ver como cliente/.test(source.provider) && /provider-service-mini-actions[\s\S]{0,720}>Pausar</.test(source.provider));

check("provider implements local filter action", /filter-provider-services/.test(businessActions) && /applyProviderServicesFilter/.test(source.provider));
check("provider implements close composer action", includesAll(source.provider, ["close-provider-service-composer", "closeProviderServiceComposer", "renderProviderScreen"]));
check("provider preview action opens local preview", /preview-offering/.test(businessActions) && /openProviderServicePreview/.test(businessActions));
check("pause confirmation explains visibility impact", /Este servicio dejara de aparecer en busquedas/.test(source.provider));
check("reactivate confirmation explains visibility return", /Este servicio volvera a aparecer para clientes/.test(source.provider));
check("publication actions still call service API functions", /deactivateProviderOffering\(providerId, offeringId\)/.test(serviceActions) && /reactivateProviderOffering\(providerId, offeringId\)/.test(serviceActions));
check("provider JS does not directly write offering active=false", !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*false/.test(source.provider));
check("provider JS does not directly write offering active=true", !/from\(["']svc_provider_service_offerings["']\)[\s\S]{0,220}\.update\(\{\s*active:\s*true/.test(source.provider));

check("enterprise CSS styles cards and filters", includesAll(enterpriseCss, ["provider-services-summary-grid", "provider-services-filter-bar", "provider-service-card-actions", "provider-service-status-pill"]));
check("enterprise CSS styles composer offerings summary", includesAll(source.providerCss, ["provider-offerings-summary-enterprise", "provider-offerings-enterprise-list"]));
check("enterprise CSS includes mobile-first responsive rules", /@media \(max-width:\s*560px\)[\s\S]+provider-service-card-actions/.test(enterpriseCss));
check("mobile focus CSS hides services notification bell without removing DOM", /data-provider-tab="pricing"[\s\S]+\.sheet-notification-bell[\s\S]+visibility:\s*hidden[\s\S]+pointer-events:\s*none/.test(servicesMobileFocusCss));
check("mobile focus CSS has 430 and 380 compact modes", /@media \(max-width:\s*430px\)[\s\S]+provider-service-composer-head[\s\S]+provider-service-card-actions/.test(servicesMobileFocusCss) && /@media \(max-width:\s*380px\)[\s\S]+provider-services-summary-card/.test(servicesMobileFocusCss));
check("mobile focus CSS styles horizontal builder roadmap", /provider-service-builder-roadmap[\s\S]+grid-template-columns:\s*repeat\(5/.test(servicesMobileFocusCss) && /@media \(max-width:\s*430px\)[\s\S]+provider-service-builder-roadmap[\s\S]+overflow-x:\s*auto/.test(servicesMobileFocusCss));
check("enterprise CSS avoids forbidden product scopes", !/(payment-webhook|mercado\s*pago|mercadopago|transport|transporte)/i.test(enterpriseCss));
check("enterprise render scope avoids forbidden product scopes", !/(payment-webhook|mercado\s*pago|mercadopago|transport|transporte)/i.test(servicesHome));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider services enterprise UI checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider services enterprise UI checks passed.`);
