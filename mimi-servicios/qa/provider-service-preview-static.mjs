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

const servicesHome = between(source.renderProvider, "function renderProviderServicesHome", "function renderOfferingEditorV2");
const previewRenderer = between(source.renderProvider, "export function renderProviderServicePreviewSheet", "function firstImageUrlFrom");
const previewHandlers = between(source.provider, "openProviderServicePreview(offeringId", "setProviderPublicationActionLoading");
const businessActions = between(source.provider, 'if (action === "filter-provider-services")', 'if (action === "select-guided-service-template")');
const cssPreview = between(source.providerCss, "Provider Services Enterprise UI - Phase B preview", "body.provider-authenticated[data-provider-tab=\"pricing\"] #providerBusinessPanel .provider-client-preview-heading");

check("baseline keeps wallet", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]) && includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps login and provider auth", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]) && includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps remote bootstrap flag", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("baseline keeps audited service path", includesAll(source.api, ["svc-save-provider-service", "deactivateProviderOffering", "reactivateProviderOffering"]));

check("Ver como cliente exists in service cards", /data-provider-business-action="preview-offering"/.test(servicesHome) && /Ver como cliente/.test(servicesHome));
check("preview action opens sheet instead of toast placeholder", /openProviderServicePreview\(source\?\.dataset\?\.offeringId/.test(businessActions) && !/proxima fase/.test(businessActions));
check("preview sheet renderer exists", /renderProviderServicePreviewSheet/.test(source.renderProvider) && /role="dialog"/.test(previewRenderer));
check("preview sheet uses premium title and subtitle", includesAll(previewRenderer, ["Vista como cliente", "Asi aparece tu publicacion en MIMI GO.", "provider-service-preview-handle"]));
check("preview sheet includes local tabs", includesAll(previewRenderer, ["Card en busqueda", "Perfil completo", "Calidad", "providerServicePreviewTabCard", "providerServicePreviewTabProfile", "providerServicePreviewTabQuality"]));
check("preview sheet shows premium marketplace card", includesAll(previewRenderer, ["provider-service-preview-client-card", "provider-service-market-card", "Card premium del servicio", "Ver perfil", "Solicitar presupuesto"]));
check("preview sheet keeps platform-protection copy", includesAll(previewRenderer, ["El presupuesto, la aceptacion y el pago se realizan dentro de MIMIGO.", "Acciones visuales sin flujo real"]));
check("preview price does not add Desde prefix", !/Desde\s+\$\{rawPriceLabel\}/.test(previewRenderer));
check("preview sheet shows quality checklist", includesAll(previewRenderer, ["providerOfferingQualityChecklist", "Calidad de publicacion", "Podes mejorar tu visibilidad completando estos puntos.", "provider-service-quality-checklist"]));
check("preview sheet includes didactic microcopy", includesAll(source.renderProvider, ["Aparece en busquedas", "Pausado: no aparece para clientes", "Agrega una descripcion", "Precio visible", "requiere validacion"]));
check("preview sheet includes status badges", includesAll(previewRenderer, ["Visible para clientes", "Pausado", "Incompleto", "Requiere validacion"]));
check("preview sheet includes Editar/Reactivar/Pausar/Cerrar actions", includesAll(previewRenderer, ["Editar servicio", "Reactivar", "Pausar", "Cerrar", "close-service-preview"]));
check("preview sheet reuses audited pause/reactivate actions", /footerPrimaryAction = isPaused \? "reactivate-offering" : "delete-offering"/.test(previewRenderer) && /data-provider-business-action="\$\{escapeHtml\(footerPrimaryAction\)\}"/.test(previewRenderer));
check("preview open/close handlers are local DOM only", includesAll(previewHandlers, ["document.createElement", "appendChild", "closeProviderServicePreview", "providerServicePreviewHost"]));
check("preview close supports Escape and overlay click", /closeProviderServicePreview\(\)/.test(source.provider) && /data-provider-service-preview-overlay/.test(source.provider));
check("preview-only CTAs do not attach business actions", /data-provider-preview-only/.test(previewRenderer) && !/data-provider-preview-only[\s\S]{0,120}data-provider-business-action/.test(previewRenderer));

check("preview does not create requests", !/(svc-create-request|createRequest|svc_requests|request_id:\s*crypto|insert\(\s*\{[\s\S]{0,80}request)/i.test(previewRenderer + previewHandlers + businessActions));
check("preview does not touch payments", !/(payment-webhook|mercado\s*pago|mercadopago|create-payment-intent|get-payment-status|refund-payment|cancel-payment)/i.test(previewRenderer + previewHandlers + businessActions + cssPreview));
check("preview does not touch client/search public", !/(main-client|render-client|svc-search-providers|cliente\.html|searchProviders)/i.test(previewRenderer + previewHandlers + businessActions));
check("preview does not use service_role", !/service_role/i.test(previewRenderer + previewHandlers + businessActions));
check("preview does not write direct legacy tables", !/from\(["']svc_provider_(service_offerings|pricing|categories)["']\)[\s\S]{0,260}\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.provider + source.renderProvider));
check("pause/reactivate still use service API", /deactivateProviderOffering\(providerId, offeringId\)/.test(source.provider) && /reactivateProviderOffering\(providerId, offeringId\)/.test(source.provider));
check("preview CSS uses premium sheet treatment", includesAll(cssPreview, ["backdrop-filter: blur", "max-height: 92dvh", "border-radius: 34px", "provider-service-preview-handle", "provider-service-preview-tab-list"]));
check("preview CSS keeps internal scroll and sticky footer", includesAll(cssPreview, ["provider-service-preview-tab-panels", "overflow: auto", "position: sticky", "bottom: 0"]));
check("preview CSS is mobile-safe", /@media \(max-width:\s*560px\)[\s\S]+provider-service-preview-sheet[\s\S]+max-height:\s*92dvh[\s\S]+provider-service-preview-actions[\s\S]+grid-template-columns:\s*1fr/.test(cssPreview));
check("preview CSS has compact mode for phones", /@media \(max-width:\s*430px\)[\s\S]+provider-service-preview-sheet[\s\S]+max-height:\s*91dvh[\s\S]+provider-service-preview-sheet \*[\s\S]+min-width:\s*0/.test(cssPreview));
check("preview CSS compacts tabs and footer on phones", /@media \(max-width:\s*430px\)[\s\S]+provider-service-preview-tab-list[\s\S]+overflow-x:\s*auto[\s\S]+provider-service-preview-actions[\s\S]+grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(cssPreview));
check("preview CSS has extra compact mode for very small phones", /@media \(max-width:\s*380px\)[\s\S]+provider-service-preview-sheet[\s\S]+max-height:\s*90dvh[\s\S]+provider-service-preview-tab-list label::after[\s\S]+content:\s*"Card"/.test(cssPreview));
check("preview CSS keeps premium pieces in compact mode", includesAll(cssPreview, ["provider-service-market-card", "provider-service-quality-checklist", "provider-service-preview-price-row", "provider-service-preview-close"]));
check("preview CSS avoids forbidden product scopes", !/(payment-webhook|mercado\s*pago|mercadopago|transporte|transport)/i.test(cssPreview));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider service preview checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider service preview checks passed.`);
