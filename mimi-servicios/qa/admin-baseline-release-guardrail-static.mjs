import fs from "node:fs";
import path from "node:path";

const servicesRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(servicesRoot, "..");

const files = {
  publicPanel: path.join(repoRoot, "admin", "admin-panel.html"),
  publicShell: path.join(repoRoot, "admin", "admin.js"),
  publicCatalog: path.join(repoRoot, "admin", "admin-service-catalog.js"),
  publicCss: path.join(repoRoot, "admin", "admin.css"),
  servicesPanel: path.join(servicesRoot, "admin", "admin-panel.html"),
  servicesShell: path.join(servicesRoot, "admin", "admin.js"),
  servicesCatalog: path.join(servicesRoot, "admin", "admin-service-catalog.js"),
  servicesCss: path.join(servicesRoot, "admin", "admin.css"),
  releaseDoc: path.join(servicesRoot, "docs", "release", "ADMIN_BASELINE_GUARDRAILS.md"),
};

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${path.relative(repoRoot, file)}`);
  }
  return fs.readFileSync(file, "utf8");
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);

const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function hasAll(text, items) {
  return items.every((item) => (item instanceof RegExp ? item.test(text) : text.includes(item)));
}

function adminSurfaceChecks(prefix, panel, shell, catalog, css) {
  const requiredViews = [
    'data-admin-mobile-view-target="providers"',
    'data-admin-mobile-view-target="clients"',
    'data-admin-mobile-view-target="catalog"',
    'data-admin-mobile-view-target="finance"',
    'data-admin-mobile-view-target="support"',
  ];

  check(`${prefix} keeps required admin navigation`, hasAll(panel, requiredViews));
  check(`${prefix} keeps provider KYC module`, /servicesProvidersModule|Prestadores|KYC/.test(panel));
  check(`${prefix} keeps clients module`, /adminClientsModule/.test(panel) && /Clientes/.test(panel));
  check(`${prefix} keeps finance module`, /financialAdminModule/.test(panel) && /Finanzas/.test(panel));
  check(`${prefix} keeps support module`, /support-section|supportDockBadge|Soporte/.test(panel));
  check(`${prefix} includes intelligent catalog module`, /adminServiceCatalogModule/.test(panel) && /Catalogo|Cat.logo/.test(panel));
  check(`${prefix} loads all module scripts`, hasAll(panel, [
    "admin-services-providers.js",
    "admin-clients.js",
    "admin-service-catalog.js",
    "admin-finance.js",
    "admin-support.js",
  ]));
  check(`${prefix} shell routes catalog without losing old views`, /catalog/.test(shell) && /providers/.test(shell) && /clients/.test(shell) && /finance/.test(shell) && /support/.test(shell));
  check(`${prefix} catalog is read-only`, !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(catalog) && !/service_role|SUPABASE_SERVICE_ROLE/i.test(catalog));
  check(`${prefix} catalog reads foundation tables`, hasAll(catalog, [
    "svc_service_templates",
    "svc_service_template_versions",
    "svc_service_attributes",
    "svc_service_questions",
    "svc_pricing_rules",
    "svc_regulated_service_requirements",
    "svc_service_discovery_events",
    "svc_feature_flags",
  ]));
  check(`${prefix} CSS supports catalog without hiding old modules permanently`, /ADMIN SERVICE INTELLIGENCE CATALOG/.test(css) && /data-admin-mobile-view="catalog"/.test(css));
}

adminSurfaceChecks("public /admin/admin-panel", source.publicPanel, source.publicShell, source.publicCatalog, source.publicCss);
adminSurfaceChecks("services /mimi-servicios/admin", source.servicesPanel, source.servicesShell, source.servicesCatalog, source.servicesCss);

check("release doc records admin baseline guardrails", hasAll(source.releaseDoc, [
  "Admin Baseline Guardrails",
  "Clientes",
  "Prestadores",
  "Finanzas",
  "Soporte",
  "Catalogo Inteligente",
  "No borrar",
]));

check("release doc blocks blind cleanup", /no se borra/i.test(source.releaseDoc) && /inventario/i.test(source.releaseDoc) && /rollback/i.test(source.releaseDoc));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} admin baseline guardrail checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} admin baseline guardrail checks passed.`);
