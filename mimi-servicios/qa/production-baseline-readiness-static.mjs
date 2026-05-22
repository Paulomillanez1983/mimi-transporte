import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..");

const files = {
  providerHtml: "prestador.html",
  providerJs: "src/main-provider.js",
  clientHtml: "cliente.html",
  clientJs: "src/main-client.js",
  serviceApi: "src/services/service-api.js",
  runtimeConfig: "src/services/runtime-config.js",
  supabaseClient: "src/services/supabase.js",
  push: "src/services/push.js",
  riskEvents: "src/security/risk-events.js",
  fingerprint: "src/security/fingerprint-client.js",
  documentQuality: "src/utils/document-image-quality.js",
  svcSaveProviderService: "supabase/functions/svc-save-provider-service/index.ts",
  hardeningMigration: "supabase/migrations/20260520220945_svc_provider_publication_write_hardening.sql",
  foundationSchema: "supabase/migrations/20260520230844_service_intelligence_foundation_schema.sql",
  foundationSeed: "supabase/migrations/20260520230852_service_intelligence_initial_seed.sql",
  hardeningDoc: "docs/release/SERVICIOS_PUBLICATION_HARDENING_RELEASE_TRAIN.md",
  baselineRecoveryDoc: "docs/release/PRODUCTION_BASELINE_RECOVERY.md",
  adminGuardrailDoc: "docs/release/ADMIN_BASELINE_GUARDRAILS.md",
  serviceIntelligenceDoc: "docs/service-intelligence/SERVICE_INTELLIGENCE_FOUNDATION.md",
  adminPanel: "admin/admin-panel.html",
  adminJs: "admin/admin.js",
  adminCatalog: "admin/admin-service-catalog.js",
  servicesAdminPanel: "admin/admin-panel.html",
  servicesAdminJs: "admin/admin.js",
  servicesAdminCatalog: "admin/admin-service-catalog.js",
  adminBaselineQa: "qa/admin-baseline-release-guardrail-static.mjs",
  providerGuardrailQa: "qa/provider-ui-release-guardrail-static.mjs",
  serviceIntelligenceQa: "qa/service-intelligence-foundation-static.mjs",
};

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function readRepo(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required repo file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

const source = {
  providerHtml: read(files.providerHtml),
  providerJs: read(files.providerJs),
  clientHtml: read(files.clientHtml),
  clientJs: read(files.clientJs),
  serviceApi: read(files.serviceApi),
  runtimeConfig: read(files.runtimeConfig),
  supabaseClient: read(files.supabaseClient),
  push: read(files.push),
  riskEvents: read(files.riskEvents),
  fingerprint: read(files.fingerprint),
  documentQuality: read(files.documentQuality),
  svcSaveProviderService: read(files.svcSaveProviderService),
  hardeningMigration: read(files.hardeningMigration),
  foundationSchema: read(files.foundationSchema),
  foundationSeed: read(files.foundationSeed),
  hardeningDoc: read(files.hardeningDoc),
  baselineRecoveryDoc: read(files.baselineRecoveryDoc),
  adminGuardrailDoc: read(files.adminGuardrailDoc),
  serviceIntelligenceDoc: read(files.serviceIntelligenceDoc),
  adminPanel: readRepo("admin/admin-panel.html"),
  adminJs: readRepo("admin/admin.js"),
  adminCatalog: readRepo("admin/admin-service-catalog.js"),
  servicesAdminPanel: read("admin/admin-panel.html"),
  servicesAdminJs: read("admin/admin.js"),
  servicesAdminCatalog: read("admin/admin-service-catalog.js"),
  adminBaselineQa: read(files.adminBaselineQa),
  providerGuardrailQa: read(files.providerGuardrailQa),
  serviceIntelligenceQa: read(files.serviceIntelligenceQa),
};

const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function hasAll(text, items) {
  return items.every((item) => (item instanceof RegExp ? item.test(text) : text.includes(item)));
}

check("runtime-config exports MIMI_REMOTE_BOOTSTRAP_ENABLED", /export\s+const\s+MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("service-api imports and uses runtime bootstrap flag", /MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.serviceApi));
check("service-api keeps audited save function", /svc-save-provider-service/.test(source.serviceApi));
check("provider HTML keeps wallet and notification UI", hasAll(source.providerHtml, ["data-tab=\"wallet\"", "notificationBadge", "notificationsDrawer", "sheetNotificationBell"]));
check("provider JS keeps wallet state and payout account", hasAll(source.providerJs, ["providerPayoutAccount", "walletLoading"]));
check("provider JS keeps provider auth and Google login", hasAll(source.providerJs, ["provider-auth", "signInWithGoogle"]));
check("Supabase provider auth lock remains", hasAll(source.supabaseClient, ["mimi_services_provider_auth", "mimi_services_provider_auth_lock"]));
check("push token registration helper remains", /rememberPushTokenRegistration/.test(source.push));
check("risk-events module exists and imports fingerprint", /recordCriticalRiskEvent/.test(source.riskEvents) && /fingerprint-client/.test(source.riskEvents));
check("fingerprint module exists", /fingerprint/i.test(source.fingerprint));
check("document image quality module exists", /quality|document/i.test(source.documentQuality));
check("provider save Edge Function exists", /deactivate_offering|reactivate_offering|svc_provider_service_change_events/.test(source.svcSaveProviderService));

check("foundation schema migration exists", hasAll(source.foundationSchema, ["svc_service_templates", "svc_service_template_versions", "svc_feature_flags"]));
check("foundation seed migration exists", hasAll(source.foundationSeed, ["MIMI_SERVICE_CATALOG_V2_ENABLED", "MIMI_CLIENT_ONE_SHOT_SEARCH_ENABLED"]));
check("publication hardening migration exists", hasAll(source.hardeningMigration, ["svc_provider_service_offerings", "svc_provider_pricing", "svc_provider_categories"]));
check("hardening release train doc exists", /Servicios Publication Hardening Release Train/.test(source.hardeningDoc));
check("service intelligence doc exists", /Service Intelligence Foundation/.test(source.serviceIntelligenceDoc));
check("production baseline recovery doc exists", /Production Baseline Recovery/.test(source.baselineRecoveryDoc));

const adminRequired = [
  "Prestadores",
  "Clientes",
  "Finanzas",
  "Soporte",
  "adminServiceCatalogModule",
  "admin-service-catalog.js",
];

check("root admin preserves required modules", hasAll(source.adminPanel, adminRequired));
check("services admin preserves required modules", hasAll(source.servicesAdminPanel, adminRequired));
check("root admin shell recognizes catalog and old modules", hasAll(source.adminJs, ["providers", "clients", "catalog", "finance", "support"]));
check("services admin shell recognizes catalog and old modules", hasAll(source.servicesAdminJs, ["providers", "clients", "catalog", "finance", "support"]));
check("admin catalog remains read-only", !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.adminCatalog + source.servicesAdminCatalog));
check("admin catalog does not expose service_role", !/service_role|SUPABASE_SERVICE_ROLE/i.test(source.adminCatalog + source.servicesAdminCatalog));
check("admin baseline guardrail QA exists", /admin baseline guardrail checks/.test(source.adminBaselineQa));
check("provider UI guardrail QA exists", /provider UI release guardrail checks/.test(source.providerGuardrailQa));
check("service intelligence QA exists", /Service Intelligence Foundation checks/.test(source.serviceIntelligenceQa));
check("admin guardrail doc blocks blind cleanup", /no se borra/i.test(source.adminGuardrailDoc) && /inventario/i.test(source.adminGuardrailDoc));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} production baseline readiness checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} production baseline readiness checks passed.`);
