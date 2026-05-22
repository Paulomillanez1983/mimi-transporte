import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const servicesRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(servicesRoot, "..");

const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function read(relativePath, fromRepoRoot = false) {
  const fullPath = path.join(fromRepoRoot ? repoRoot : servicesRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function exists(relativePath, fromRepoRoot = false) {
  return fs.existsSync(path.join(fromRepoRoot ? repoRoot : servicesRoot, relativePath));
}

function hasAll(source, items) {
  return items.every((item) => (item instanceof RegExp ? item.test(source) : source.includes(item)));
}

function gitStatusPaths() {
  let output = "";
  try {
    output = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch (error) {
    console.warn(`WARN git status unavailable inside Node (${error.code ?? "unknown"}); using disk migration checks and external release scope checks.`);
    return [];
  }

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      const renamed = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop().trim() : rawPath;
      return renamed.replaceAll("\\", "/");
    });
}

function listFiles(relativeDir) {
  const dir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(dir)) return [];

  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        files.push(path.relative(repoRoot, fullPath).replaceAll("\\", "/"));
      }
    }
  };
  visit(dir);
  return files;
}

const statusPaths = gitStatusPaths();

const source = {
  providerHtml: read("prestador.html"),
  providerJs: read("src/main-provider.js"),
  providerRender: read("src/ui/render-provider.js"),
  providerApi: read("src/services/service-api.js"),
  runtimeConfig: read("src/services/runtime-config.js"),
  supabaseClient: read("src/services/supabase.js"),
  rootAdminPanel: read("admin/admin-panel.html", true),
  rootAdminJs: read("admin/admin.js", true),
  rootAdminCatalog: read("admin/admin-service-catalog.js", true),
  rootAdminFinance: read("admin/admin-finance.js", true),
  servicesAdminPanel: read("admin/admin-panel.html"),
  servicesAdminJs: read("admin/admin.js"),
  servicesAdminCatalog: read("admin/admin-service-catalog.js"),
};

const forbiddenPathPatterns = [
  /(^|\/)payment-webhook(\/|$)/i,
  /(^|\/)create-payment-intent(\/|$)/i,
  /(^|\/)get-payment-status(\/|$)/i,
  /(^|\/)cancel-payment(\/|$)/i,
  /(^|\/)refund-payment(\/|$)/i,
  /(^|\/)_shared\/payments(\/|$)/i,
  /(^|\/)admin-payment-provider-config(\/|$)/i,
  /(^|\/)admin-provider-payout-accounts(\/|$)/i,
  /(^|\/)verify-provider-payout-account(\/|$)/i,
  /(^|\/)provider-payout-account(\/|$)/i,
  /(^|\/)admin-financial-dashboard(\/|$)/i,
  /(^|\/)admin-financial-operations(\/|$)/i,
  /mercado[\-_]?pago|mercadopago/i,
  /(^|\/)(transporte|transport|viaje|chofer|driver)(\/|$)/i,
];

const forbiddenStatusPaths = statusPaths.filter((changedPath) =>
  forbiddenPathPatterns.some((pattern) => pattern.test(changedPath))
);

const allowedMigrationFiles = new Set([
  "mimi-servicios/supabase/migrations/20260519093000_mimi_servicios_rls_hardening.sql",
  "mimi-servicios/supabase/migrations/20260520024500_svc_provider_service_change_events.sql",
  "mimi-servicios/supabase/migrations/20260520210959_svc_audit_reactivated_change_type.sql",
  "mimi-servicios/supabase/migrations/20260520220945_svc_provider_publication_write_hardening.sql",
  "mimi-servicios/supabase/migrations/20260520230844_service_intelligence_foundation_schema.sql",
  "mimi-servicios/supabase/migrations/20260520230852_service_intelligence_initial_seed.sql",
  "mimi-servicios/supabase/migrations/20260521153000_svc_provider_service_addons_phase_d.sql",
]);

const changedMigrationFiles = statusPaths.filter((changedPath) =>
  changedPath.startsWith("mimi-servicios/supabase/migrations/")
);
const migrationFilesOnDisk = listFiles("mimi-servicios/supabase/migrations");
const unexpectedMigrationFiles = [...new Set([...changedMigrationFiles, ...migrationFilesOnDisk])]
  .filter((changedPath) => changedPath.endsWith(".sql"))
  .filter((changedPath) => !allowedMigrationFiles.has(changedPath));

check("release scope has no payment or transport backend path changes", forbiddenStatusPaths.length === 0, forbiddenStatusPaths.join(", "));
check("release scope has no unexpected migrations", unexpectedMigrationFiles.length === 0, unexpectedMigrationFiles.join(", "));
check("release does not include payment-webhook source changes", !statusPaths.some((changedPath) => /payment-webhook/i.test(changedPath)));
check("release does not include _shared/payments changes", !statusPaths.some((changedPath) => /_shared\/payments/i.test(changedPath)));
check("release does not include Mercado Pago backend changes", !statusPaths.some((changedPath) => /mercado[\-_]?pago|mercadopago/i.test(changedPath)));

check("provider route assets exist", exists("prestador.html") && exists("src/main-provider.js") && exists("src/services/service-api.js"));
check("client route assets exist", exists("cliente.html") && exists("src/main-client.js"));
check("root admin assets exist", exists("admin/admin-panel.html", true) && exists("admin/admin.js", true) && exists("admin/admin-service-catalog.js", true));
check("scoped admin assets exist", exists("admin/admin-panel.html") && exists("admin/admin.js") && exists("admin/admin-service-catalog.js"));

check("provider wallet remains present", hasAll(source.providerHtml + source.providerJs, [
  "data-tab=\"wallet\"",
  "providerPayoutAccount",
  "walletLoading",
]));
check("provider notifications remain present", hasAll(source.providerHtml, [
  "notificationBadge",
  "notificationsDrawer",
  "sheetNotificationBell",
]));
check("provider login remains present", hasAll(source.providerJs + source.supabaseClient, [
  "provider-auth",
  "signInWithGoogle",
  "mimi_services_provider_auth",
  "mimi_services_provider_auth_lock",
]));
check("runtime bootstrap export remains present", /export\s+const\s+MIMI_REMOTE_BOOTSTRAP_ENABLED/.test(source.runtimeConfig));
check("audited provider save path remains present", hasAll(source.providerApi, [
  "svc-save-provider-service",
  "saveProviderWorkspaceViaEdge",
  "X-MIMI-Correlation-Id",
]));

const adminRequiredViews = [
  "Prestadores",
  "Clientes",
  "Finanzas",
  "Soporte",
  "adminServiceCatalogModule",
  "admin-service-catalog.js",
];

check("root admin preserves existing modules and catalog", hasAll(source.rootAdminPanel, adminRequiredViews));
check("scoped admin preserves existing modules and catalog", hasAll(source.servicesAdminPanel, adminRequiredViews));
check("admin shell routes only expected service admin views", hasAll(source.rootAdminJs + source.servicesAdminJs, [
  "providers",
  "clients",
  "catalog",
  "finance",
  "support",
]));
check("admin catalog remains read-only", !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(source.rootAdminCatalog + source.servicesAdminCatalog));
check("admin frontend does not expose service role", !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY/i.test(
  source.rootAdminPanel + source.rootAdminJs + source.rootAdminCatalog + source.rootAdminFinance +
    source.servicesAdminPanel + source.servicesAdminJs + source.servicesAdminCatalog
));

check("provider guided beta is feature-flag gated", hasAll(source.providerApi + source.providerRender, [
  "MIMI_PROVIDER_GUIDED_SERVICE_ENABLED",
  "Agregar servicio guiado (Beta)",
]) && /emptyProviderGuidedServiceCatalog[\s\S]+enabled:\s*false/.test(source.providerApi));
check("provider guided beta local override is localhost-only", /function isLocalDevelopmentHost/.test(source.providerApi) && /if \(!isLocalDevelopmentHost\(\)\) return null;/.test(source.providerApi));
check("provider guided beta does not replace Tus servicios", /<h3>Tus servicios<\/h3>/.test(source.providerRender));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} UI/Vercel release scope checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} UI/Vercel release scope checks passed.`);
