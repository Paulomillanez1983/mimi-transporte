import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const files = {
  providerHtml: "prestador.html",
  provider: "src/main-provider.js",
  renderProvider: "src/ui/render-provider.js",
  api: "src/services/service-api.js",
  runtimeConfig: "src/services/runtime-config.js",
  supabase: "src/services/supabase.js",
  schema: "supabase/migrations/20260520230844_service_intelligence_foundation_schema.sql",
  seed: "supabase/migrations/20260520230852_service_intelligence_initial_seed.sql",
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

function includesAll(text, patterns) {
  return patterns.every((pattern) => (
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
  ));
}

const expectedTables = [
  "svc_feature_flags",
  "svc_service_templates",
  "svc_service_template_versions",
  "svc_service_attributes",
  "svc_service_questions",
  "svc_pricing_rules",
  "svc_provider_offering_attribute_values",
  "svc_provider_offering_addons",
  "svc_quote_requests",
  "svc_quote_offers",
  "svc_quote_events",
  "svc_intent_resolution_events",
  "svc_pricing_decision_events",
  "svc_service_discovery_events",
  "svc_regulated_service_requirements",
];

const requiredFlags = [
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

check("baseline keeps provider wallet HTML", includesAll(source.providerHtml, ["data-tab=\"wallet\"", "provider-wallet-section"]));
check("baseline keeps wallet logic", includesAll(source.provider, ["providerPayoutAccount", "walletLoading"]));
check("baseline keeps notifications UI", includesAll(source.providerHtml, ["notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("baseline keeps notification sync logic", includesAll(source.provider, ["syncNotifications", "startNotificationSync", "notificationRealtimeChannel"]));
check("baseline keeps provider auth and Google login", includesAll(source.provider, ["provider-auth", "signInWithGoogle"]));
check("baseline keeps provider auth storage/lock", includesAll(source.supabase, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("baseline keeps audited publication path", includesAll(source.api, ["svc-save-provider-service", "Authorization", "X-MIMI-Correlation-Id"]));
check("baseline keeps remote bootstrap export", /export const MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("baseline keeps services list UX guardrail", /Tus servicios/.test(source.renderProvider) && /(Servicios desactivados|Pausados)/.test(source.renderProvider));

check("schema creates all expected foundation tables", expectedTables.every((table) => source.schema.includes(`public.${table}`)));
check("schema enables RLS on all new tables", expectedTables.every((table) => source.schema.includes(`alter table public.${table} enable row level security`)));
check("schema grants service_role on all new tables", /grant all privileges on table[\s\S]+to service_role;/.test(source.schema));
check("schema keeps public catalog read separate from writes", /for select[\s\S]+to anon, authenticated/.test(source.schema) && /admin_all/.test(source.schema));
check("schema links offerings only through nullable optional columns", includesAll(source.schema, ["add column if not exists service_template_id uuid", "add column if not exists service_template_version_id uuid"]));
check("schema includes search-first pricing support", includesAll(source.schema, ["allow_search_without_full_price", "suggested_result_mode", "show_results_with_refinements"]));
check("schema includes dynamic question strategy levels", includesAll(source.schema, ["NO_QUESTION", "OPTIONAL_REFINEMENT", "REQUIRED_BEFORE_PRICE", "REQUIRED_BEFORE_RESULTS", "SAFETY_GATE"]));
check("schema includes regulated service safeguards", includesAll(source.schema, ["blocks_auto_pricing", "blocks_results_without_disclaimer", "emergency_disclaimer_required"]));
check("schema does not alter historical requests", !/alter\s+table\s+public\.svc_requests/i.test(source.schema));
check("schema does not create payment or transport objects", !/(create|alter|drop)\s+(table|policy|function|trigger|index)[\s\S]{0,120}(payment|mercado|transporte|transport)/i.test(source.schema));
check("schema keeps discovery inserts behind disabled flag", /MIMI_SERVICE_DISCOVERY_ENABLED[\s\S]+f\.enabled = true/.test(source.schema));

check("seed defines every required feature flag", requiredFlags.every((flag) => source.seed.includes(`'${flag}'`)));
check("seed keeps every required feature flag disabled", requiredFlags.every((flag) => new RegExp(`'${flag}',\\s*false`).test(source.seed)));
check("seed includes broad macro verticals", includesAll(source.seed, ["Hogar y mantenimiento", "Salud y bienestar", "Belleza y cuidado personal", "Mascotas", "Educacion", "Tecnologia", "Eventos", "Cuidado de personas", "Profesionales", "Otros / discovery"]));
check("seed includes service template examples across domains", includesAll(source.seed, ["pintura-interior", "plomeria-reparar-perdida", "gas-reparacion-perdida", "peluqueria-corte", "psicologia-primera-consulta", "paseo-perro", "profesor-particular", "reparacion-pc", "cuidador-adultos", "otros-discovery"]));
check("seed marks regulated/sensitive services", includesAll(source.seed, ["\"slug\":\"gas-reparacion-perdida\"", "\"sensitive\":\"critical\"", "\"slug\":\"psicologia-primera-consulta\"", "\"regulated\":\"regulated\"", "\"slug\":\"ninera\"", "\"regulated\":\"restricted\""]));
check("seed creates optional questions and price-only refinements", includesAll(source.seed, ["optional_refinement", "price_only", "No bloquea la primera busqueda"]));
check("seed keeps AI from final pricing", includesAll(source.seed, ["ai_final_price_allowed", "false"]));

check("provider guided beta is present only behind provider flag", /MIMI_PROVIDER_GUIDED_SERVICE_ENABLED/.test(source.api) && /guidedEnabled \?/.test(source.renderProvider) && /Agregar servicio guiado \(Beta\)/.test(source.renderProvider));
check("provider guided beta defaults disabled", /emptyProviderGuidedServiceCatalog[\s\S]+enabled:\s*false/.test(source.api));
check("client one-shot search flag stays off", /'MIMI_CLIENT_ONE_SHOT_SEARCH_ENABLED',\s*false/.test(source.seed));
check("pricing engine flag stays off", /'MIMI_PRICING_ENGINE_ENABLED',\s*false/.test(source.seed));
check("AI intent flag stays off", /'MIMI_AI_INTENT_ASSIST_ENABLED',\s*false/.test(source.seed));
check("quotes v2 flag stays off", /'MIMI_QUOTES_V2_ENABLED',\s*false/.test(source.seed));

check("docs explain search-first questions-later", /SEARCH-FIRST, QUESTIONS-LATER/.test(source.docs));
check("docs state seeds are not the system boundary", /semillas iniciales/.test(source.docs) && /no son el limite/i.test(source.docs));
check("docs state no UI replacement", /No reemplaza la UI vigente/.test(source.docs));
check("docs document AI limits", /La IA no calcula ni inventa precios finales/.test(source.docs));
check("docs document regulated service guard", /servicios sensibles o regulados/i.test(source.docs));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} Service Intelligence Foundation checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} Service Intelligence Foundation checks passed.`);
