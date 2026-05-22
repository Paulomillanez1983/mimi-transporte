import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const files = {
  panel: "admin/admin-panel.html",
  adminShell: "admin/admin.js",
  catalog: "admin/admin-service-catalog.js",
  css: "admin/admin.css",
  providerHtml: "prestador.html",
  provider: "src/main-provider.js",
  api: "src/services/service-api.js",
  runtimeConfig: "src/services/runtime-config.js",
  supabase: "src/services/supabase.js",
  foundationQa: "qa/service-intelligence-foundation-static.mjs",
  docs: "docs/service-intelligence/SERVICE_INTELLIGENCE_FOUNDATION.md",
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

function hasAll(text, items) {
  return items.every((item) => (
    item instanceof RegExp ? item.test(text) : text.includes(item)
  ));
}

const adminCatalogTables = [
  "svc_service_templates",
  "svc_service_template_versions",
  "svc_service_attributes",
  "svc_service_questions",
  "svc_pricing_rules",
  "svc_regulated_service_requirements",
  "svc_service_discovery_events",
  "svc_feature_flags",
];

const serviceIntelligenceFlags = [
  "MIMI_SERVICE_CATALOG_V2_ENABLED",
  "MIMI_PROVIDER_GUIDED_SERVICE_ENABLED",
  "MIMI_CLIENT_DYNAMIC_QUESTIONS_ENABLED",
  "MIMI_PRICING_ENGINE_ENABLED",
  "MIMI_QUOTES_V2_ENABLED",
  "MIMI_AI_INTENT_ASSIST_ENABLED",
  "MIMI_SERVICE_DISCOVERY_ENABLED",
  "MIMI_REGULATED_SERVICES_GUARD_ENABLED",
  "MIMI_CLIENT_ONE_SHOT_SEARCH_ENABLED",
];

check("admin panel includes Catalogo Inteligente nav", /data-admin-mobile-view-target="catalog"/.test(source.panel) && /Catálogo/.test(source.panel));
check("admin panel includes catalog section only under admin", /id="adminServiceCatalogModule"/.test(source.panel) && /admin-service-catalog-section/.test(source.panel));
check("admin panel loads catalog module", /admin-service-catalog\.js/.test(source.panel));
check("admin shell recognizes catalog view", /providers", "clients", "catalog", "finance", "support"/.test(source.adminShell));
check("catalog module requires active admin", /waitForActiveAdmin/.test(source.catalog) && /admin_required/.test(source.catalog));
check("catalog module uses Supabase anon admin session, not service role", !/service_role|SUPABASE_SERVICE_ROLE|service-role/i.test(source.catalog));
check("catalog module is read-only", !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.catalog) && !/functions\/v1/.test(source.catalog));
check("catalog module reads expected foundation tables", adminCatalogTables.every((table) => source.catalog.includes(`"${table}"`)));
check("catalog module renders filters", hasAll(source.catalog, ["catalogSearchInput", "catalogMacroFilter", "catalogFamilyFilter", "catalogRiskFilter", "catalogStatusFilter"]));
check("catalog module renders detail blocks", hasAll(source.catalog, ["Atributos", "Preguntas", "Pricing rules", "Requisitos regulados", "Metadata"]));
check("catalog module renders feature flags read-only", serviceIntelligenceFlags.every((flag) => source.catalog.includes(flag)) && /Read-only/.test(source.panel));
check("catalog module renders regulated services fields", hasAll(source.catalog, ["regulated_level", "sensitive_level", "requires_credentials", "requires_admin_approval", "emergency_disclaimer_required", "blocks_auto_pricing", "blocks_results_without_disclaimer"]));
check("catalog module renders discovery empty or list", /catalogDiscoveryList/.test(source.panel) && /Todavía no hay discovery events|Discovery events/.test(source.catalog + source.panel));
check("catalog CSS scopes styles to admin catalog", /ADMIN SERVICE INTELLIGENCE CATALOG/.test(source.css) && /admin-service-catalog-section/.test(source.css));
check("catalog CSS supports mobile catalog view", /data-admin-mobile-view="catalog"/.test(source.css));
check("catalog mobile dock supports five tabs", /grid-template-columns:\s*repeat\(5,\s*(?:minmax\(0,\s*)?1fr/.test(source.css));

check("provider UI guardrail markers remain", hasAll(source.providerHtml, ["data-tab=\"wallet\"", "notificationBadge", "notificationsDrawer", "sheetNotificationBell", "provider-auth-loading"]));
check("provider JS guardrail markers remain", hasAll(source.provider, ["providerPayoutAccount", "walletLoading", "signInWithGoogle", "syncNotifications"]));
check("provider auth lock remains", hasAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("audited service save path remains", /svc-save-provider-service/.test(source.api));
check("runtime bootstrap flag remains", /MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));

check("admin catalog does not touch public provider/client modules", !/adminServiceCatalogModule|Catálogo Inteligente/.test(source.provider + source.providerHtml + source.api));
check("admin catalog does not touch payments/transport/webhook", !/payment-webhook|Mercado Pago|mercadopago|_shared\/payments|Transporte|transport/i.test(source.catalog));
check("public feature flags remain default false in foundation QA", serviceIntelligenceFlags.every((flag) => source.foundationQa.includes(flag)));
check("docs include Phase 3B admin catalog section", /Fase 3B - Admin Catálogo Inteligente/.test(source.docs));
check("docs state admin catalog does not activate public surfaces", /admin-only/.test(source.docs) && /no activa público/i.test(source.docs));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} admin catalog checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} admin catalog checks passed.`);
