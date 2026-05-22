import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(root, "..");
const adminRoot = path.join(root, "admin");
const functionsRoot = path.join(root, "supabase", "functions");
const args = new Set(process.argv.slice(2));
const uiVercelScope = args.has("--scope=ui-vercel");

const results = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readRepo = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function functionSource(slug) {
  return fs.readFileSync(path.join(functionsRoot, slug, "index.ts"), "utf8");
}

const requiredAdminFiles = [
  "admin/admin-login.html",
  "admin/admin-panel.html",
  "admin/admin.js",
  "admin/admin-support.js",
  "admin/admin-services-providers.js",
  "admin/admin-clients.js",
  "admin/admin-service-catalog.js",
  "admin/admin-finance.js",
  "admin/supabase-admin-client.js",
  "admin/admin-env.js",
  "admin/admin.css"
];

const requiredAdminFunctions = [
  "admin-list-service-providers",
  "admin-review-service-provider",
  "admin-list-support-conversations",
  "admin-send-support-message",
  "admin-update-support-status",
  "admin-list-clients",
  "admin-client-action",
  "admin-financial-dashboard",
  "admin-payment-provider-config",
  "admin-provider-payout-accounts",
  "admin-financial-operations",
  "verify-provider-payout-account"
];

check(
  "admin frontend is versioned inside mimi-servicios/admin",
  requiredAdminFiles.every(exists),
  requiredAdminFiles.filter((file) => !exists(file)).join(", ")
);

check(
  "legacy transport admin module is not copied into services admin",
  !exists("admin/admin-transport.js") &&
    !exists("admin/admin-map.js")
);

const panel = read("admin/admin-panel.html");
const adminJs = read("admin/admin.js");
const supportJs = read("admin/admin-support.js");
const clientsJs = read("admin/admin-clients.js");
const financeJs = read("admin/admin-finance.js");
const providersJs = read("admin/admin-services-providers.js");
const supabaseAdminClient = read("admin/supabase-admin-client.js");
const vercel = readRepo("vercel.json");

check(
  "admin panel exposes services modules only",
  /MIMI Servicios Admin/.test(panel) &&
    /data-admin-mobile-view-target="providers"/.test(panel) &&
    /data-admin-mobile-view-target="clients"/.test(panel) &&
    /data-admin-mobile-view-target="catalog"/.test(panel) &&
    /data-admin-mobile-view-target="finance"/.test(panel) &&
    /data-admin-mobile-view-target="support"/.test(panel) &&
    !/data-admin-mobile-view-target="choferes"|data-admin-mobile-view-target="map"|data-admin-mobile-view-target="ai"|driverModal|driversMap|admin-mobile-choferes/i.test(panel)
);

check(
  "admin JS does not route to transport, map or AI shells",
  /new Set\(\["providers", "clients", "catalog", "finance", "support"\]\)/.test(adminJs) &&
    !/transport|chofer|driver|viaje|admin-transport/i.test(adminJs)
);

check(
  "support module uses services roles and copy",
  /prestador/i.test(supportJs) &&
    !/chofer|driver_email|chofer_email/i.test(supportJs)
);

check(
  "admin frontend never exposes service role or internal worker secrets",
  !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|INTERNAL_WORKER_SECRET|PAYOUT_ACCOUNT_ENCRYPTION_KEY|MERCADOPAGO_ACCESS_TOKEN/.test(
    `${panel}\n${adminJs}\n${supportJs}\n${clientsJs}\n${financeJs}\n${providersJs}\n${supabaseAdminClient}`
  )
);

check(
  "admin frontend calls all expected services admin functions",
  [
    "admin-list-service-providers",
    "admin-review-service-provider",
    "admin-list-support-conversations",
    "admin-send-support-message",
    "admin-update-support-status",
    "admin-list-clients",
    "admin-client-action",
    "admin-financial-dashboard",
    "admin-payment-provider-config",
    "admin-provider-payout-accounts",
    "verify-provider-payout-account",
    "admin-financial-operations"
  ].every((slug) => `${supportJs}\n${clientsJs}\n${financeJs}\n${providersJs}`.includes(slug))
);

check(
  "admin routes point to mimi-servicios/admin",
  /"source": "\/admin"[\s\S]{0,120}"destination": "\/mimi-servicios\/admin\/admin-login\.html"/.test(vercel) &&
    /"source": "\/admin\/panel"[\s\S]{0,120}"destination": "\/mimi-servicios\/admin\/admin-panel\.html"/.test(vercel) &&
    /"source": "\/mimi-servicios\/admin\/\(\.\*\)"/.test(vercel) &&
    /"Cache-Control"[\s\S]{0,80}"no-store"/.test(vercel)
);

if (uiVercelScope) {
  check(
    "ui-vercel scope leaves backend function gates to backend-functions-readiness-static",
    true
  );
} else {
  check(
    "all admin functions required by the admin UI exist locally",
    requiredAdminFunctions.every((slug) => fs.existsSync(path.join(functionsRoot, slug, "index.ts"))),
    requiredAdminFunctions.filter((slug) => !fs.existsSync(path.join(functionsRoot, slug, "index.ts"))).join(", ")
  );

  const adminFunctionSources = Object.fromEntries(
    requiredAdminFunctions.map((slug) => [slug, functionSource(slug)])
  );

  check(
    "admin functions do not use wildcard CORS",
    requiredAdminFunctions.every((slug) =>
      !adminFunctionSources[slug].includes('"Access-Control-Allow-Origin": "*"') &&
        adminFunctionSources[slug].includes("MIMI_CORS_ALLOW_ORIGIN") &&
        adminFunctionSources[slug].includes('"Vary": "Origin"')
    ),
    requiredAdminFunctions.filter((slug) =>
      adminFunctionSources[slug].includes('"Access-Control-Allow-Origin": "*"') ||
        !adminFunctionSources[slug].includes("MIMI_CORS_ALLOW_ORIGIN") ||
        !adminFunctionSources[slug].includes('"Vary": "Origin"')
    ).join(", ")
  );

  check(
    "admin functions require JWT and admin_users before privileged work",
    requiredAdminFunctions.every((slug) =>
      /auth\.getUser/.test(adminFunctionSources[slug]) &&
        /admin_users/.test(adminFunctionSources[slug]) &&
        /active/.test(adminFunctionSources[slug])
    )
  );

  check(
    "provider KYC admin has granular read/write roles",
    /PROVIDER_REVIEW_ROLES/.test(adminFunctionSources["admin-list-service-providers"]) &&
      /TRUST_ANALYST/.test(adminFunctionSources["admin-list-service-providers"]) &&
      /AUDITOR/.test(adminFunctionSources["admin-list-service-providers"]) &&
      /PROVIDER_REVIEW_WRITE_ROLES/.test(adminFunctionSources["admin-review-service-provider"]) &&
      /KYC_ADMIN/.test(adminFunctionSources["admin-review-service-provider"]) &&
      !/PROVIDER_REVIEW_WRITE_ROLES[\s\S]{0,220}AUDITOR/.test(adminFunctionSources["admin-review-service-provider"])
  );

  check(
    "support admin has role-scoped read/write surfaces and method guards",
    /SUPPORT_ROLES/.test(adminFunctionSources["admin-list-support-conversations"]) &&
      /SUPPORT_WRITE_ROLES/.test(adminFunctionSources["admin-send-support-message"]) &&
      /SUPPORT_WRITE_ROLES/.test(adminFunctionSources["admin-update-support-status"]) &&
      /METHOD_NOT_ALLOWED/.test(adminFunctionSources["admin-list-support-conversations"]) &&
      /METHOD_NOT_ALLOWED/.test(adminFunctionSources["admin-send-support-message"]) &&
      /METHOD_NOT_ALLOWED/.test(adminFunctionSources["admin-update-support-status"])
  );

  check(
    "client admin has trust/safety role split",
    /TRUST_ADMIN/.test(adminFunctionSources["admin-list-clients"]) &&
      /TRUST_ANALYST/.test(adminFunctionSources["admin-list-clients"]) &&
      /WRITE_ROLES/.test(adminFunctionSources["admin-client-action"]) &&
      /NOTE_ROLES/.test(adminFunctionSources["admin-client-action"])
  );

  check(
    "finance admin has finance-only write surfaces",
    /FINANCE_READ_ROLES/.test(adminFunctionSources["admin-financial-dashboard"]) &&
      /FINANCE_ADMIN/.test(adminFunctionSources["admin-payment-provider-config"]) &&
      /FINANCE_ADMIN/.test(adminFunctionSources["admin-provider-payout-accounts"]) &&
      /FINANCE_ADMIN/.test(adminFunctionSources["verify-provider-payout-account"]) &&
      /FINANCE_FORBIDDEN/.test(adminFunctionSources["admin-financial-operations"])
  );

  check(
    "admin functions exclude transport product terms",
    requiredAdminFunctions.every((slug) => !/chofer|driver|viaje|transport|solicitar-viaje|dispatch-viaje/i.test(adminFunctionSources[slug])),
    requiredAdminFunctions.filter((slug) => /chofer|driver|viaje|transport|solicitar-viaje|dispatch-viaje/i.test(adminFunctionSources[slug])).join(", ")
  );
}

for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} admin readiness checks failed.`);
  process.exit(1);
}
