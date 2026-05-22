import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const source = {
  provider: read("src/main-provider.js"),
  api: read("src/services/service-api.js"),
  supabase: read("src/services/supabase.js"),
  html: read("prestador.html")
};

const checks = [];

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
}

const initBlock = source.provider.slice(
  source.provider.indexOf("async init()"),
  source.provider.indexOf("this.setupEventListeners();")
);
const loadInitialDataBlock = source.provider.slice(
  source.provider.indexOf("async loadInitialData("),
  source.provider.indexOf("scheduleProviderSecondaryBootResources(")
);
const workspaceBlock = source.api.slice(
  source.api.indexOf("export async function loadProviderWorkspace"),
  source.api.indexOf("function normalizeUuidForSave")
);
const activeRequestBlock = source.api.slice(
  source.api.indexOf("export async function loadActiveRequest"),
  source.api.indexOf("export async function loadClientServiceHistory")
);

check("provider boot build identifies boot hotfix", /MIMI_PROVIDER_BUILD\s*=\s*"2026\.05\.22\.boot-hotfix1"/.test(source.provider));
check("init passes preloaded early session into panel boot", /earlySession\s*=\s*await bootstrapSession\(\)/.test(initBlock) && /await this\.loadInitialData\(earlySession\)/.test(initBlock));
check("loadInitialData accepts preloaded session", /async loadInitialData\(preloadedSession = null\)/.test(source.provider));
check("loadInitialData reuses authenticated preloaded session", /preloadedSession\?\.isAuthenticated\s*\?\s*preloadedSession\s*:\s*null/.test(loadInitialDataBlock));
check("second bootstrap is only fallback path", /if \(session\)[\s\S]+bootstrapSession\.2\.reused[\s\S]+else[\s\S]+session = await bootstrapSession\(\)/.test(loadInitialDataBlock));
check("bootstrap client profile lookup has timeout guard", /CLIENT_PROFILE_BOOT_TIMEOUT_MS/.test(source.api) && /CLIENT_PROFILE_BOOT_TIMEOUT/.test(source.api));
check("boot loader still has slow and retry states", /providerBootTimeout/.test(source.provider) && /providerBootRetryTimeout/.test(source.provider) && /Reintentar ahora/.test(source.provider));
check("workspace boot keeps safe fallback wrapper", /safeProviderWorkspaceRead/.test(workspaceBlock) && /fallback/.test(workspaceBlock));
check("workspace reads have timeout guard", /PROVIDER_WORKSPACE_READ_TIMEOUT_MS/.test(source.api) && /timeoutLabel\("PROVIDER_WORKSPACE", label\)/.test(workspaceBlock));
check("active request read has timeout guard", /ACTIVE_REQUEST_READ_TIMEOUT_MS/.test(source.api) && /ACTIVE_REQUEST_TIMEOUT/.test(activeRequestBlock));
check("legal center has timeout and fallback", /PROVIDER_LEGAL_CENTER_TIMEOUT_MS/.test(source.api) && /PROVIDER_LEGAL_CENTER_TIMEOUT/.test(source.api) && /mergeProviderLegalFallbacks/.test(source.api));
check("document signed URL resolution has timeout", /PROVIDER_DOCUMENT_SIGNED_URL_TIMEOUT/.test(source.api));
check("avatar signed URL resolution has timeout", /PROVIDER_AVATAR_SIGNED_URL_TIMEOUT/.test(source.api));
check("generic fetchTable is not globally timeout-wrapped", /async function fetchTable[\s\S]+const \{ data, error \} = await query;[\s\S]+return data \?\? \[\];/.test(source.api));
check("service-api still keeps authenticated session requirement", /async function requireSession\(\)/.test(source.api) && /AUTH_REQUIRED/.test(source.api));
check("provider login UI remains present", /providerGoogleLoginButton/.test(source.html) && /Continuar con Google/.test(source.html));
const serviceRolePattern = new RegExp(`service_${"role"}|SUPABASE_SERVICE_${"ROLE"}`, "i");

check("no service role in frontend boot code", !serviceRolePattern.test(source.provider + source.api + source.supabase));
check("no payment backend or transport scope in boot hotfix", !/payment-webhook|_shared\/payments|Mercado Pago|mimi-transporte-servicios-release/i.test(source.provider + source.api));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider boot performance checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider boot performance checks passed.`);
