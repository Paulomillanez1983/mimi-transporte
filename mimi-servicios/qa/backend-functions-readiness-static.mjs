import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const functionsRoot = path.join(root, "supabase", "functions");

const files = {
  config: "src/config.js",
  serviceApi: "src/services/service-api.js",
  paymentApi: "src/payments/payment-api.js",
  riskEvents: "src/security/risk-events.js"
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [
    key,
    fs.readFileSync(path.join(root, file), "utf8")
  ])
);

const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
}

function functionIndexPath(slug) {
  return path.join(functionsRoot, slug, "index.ts");
}

function hasFunctionIndex(slug) {
  return fs.existsSync(functionIndexPath(slug));
}

function parseConfiguredFunctions(source) {
  const match = source.match(/functions:\s*\{([\s\S]*?)\n\s*\},\n\n\s*securityFlags/);
  if (!match) return new Map();

  const functions = new Map();
  for (const entry of match[1].matchAll(/([A-Za-z0-9_]+):\s*"([^"]+)"/g)) {
    functions.set(entry[1], entry[2]);
  }
  return functions;
}

function collectFunctionKeys(source) {
  return [...source.matchAll(/appConfig\.functions\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
}

function collectDirectInvokes(source) {
  return [...source.matchAll(/(?:invokeFunction|functions\.invoke)\(\s*"([^"]+)"/g)].map((match) => match[1]);
}

function localFunctionDirs() {
  return fs.readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
}

const configured = parseConfiguredFunctions(content.config);
const configuredSlugs = new Set(configured.values());
const scopedSources = `${content.serviceApi}\n${content.paymentApi}\n${content.riskEvents}`;
const functionKeysUsed = new Set(collectFunctionKeys(scopedSources));
const directInvokes = new Set(collectDirectInvokes(scopedSources));
const requiredSlugs = new Set([...configuredSlugs, ...directInvokes, "payment-webhook"]);

const knownRequiredServicesFunctions = [
  "auth-approve-challenge",
  "auth-check-challenge",
  "auth-cleanup-verification",
  "auth-register-device",
  "auth-risk-evaluation",
  "auth-start-verification",
  "cancel-payment",
  "create-payment-intent",
  "customer-identity-verification",
  "customer-trust-profile",
  "device-trust-check",
  "get-legal-center",
  "get-payment-status",
  "mark-notification-read",
  "otp-request",
  "otp-verify",
  "payment-webhook",
  "provider-payout-account",
  "refund-payment",
  "security-risk-event",
  "svc-cancel-request",
  "svc-client-phone-start",
  "svc-client-phone-status",
  "svc-client-phone-verify",
  "svc-complete-service",
  "svc-create-request",
  "svc-get-service-pin",
  "svc-provider-arrived",
  "svc-provider-en-route",
  "svc-provider-respond-offer",
  "svc-register-device",
  "svc-resolve-service-intent",
  "svc-search-providers",
  "svc-save-provider-service",
  "svc-send-message",
  "svc-start-service",
  "svc-submit-review",
  "svc-track-location",
  "svc-verify-provider-identity"
];

const staleFunctionSlugs = ["svc-provider-dashboard", "svc-provider-availability"];
const staleConfigKeys = ["providerDashboard", "updateAvailability"];
const transportLegacyPattern = /(viaje|chofer|driver|transport|solicitar|cancelar-viaje|iniciar-viaje|completar-viaje|dispatch-viaje)/i;
const allowedLegacySourceSnippets = new Map([
  [
    "svc-save-provider-service",
    [
      // Active production alias for MIMIGO Servicios; not a transport function dependency.
      "https://mimi-transporte.vercel.app"
    ]
  ]
]);

check(
  "config exposes all function keys used by scoped frontend APIs",
  [...functionKeysUsed].every((key) => configured.has(key)),
  [...functionKeysUsed].filter((key) => !configured.has(key)).join(", ")
);

check(
  "configured and direct function calls have local index.ts",
  [...requiredSlugs].every(hasFunctionIndex),
  [...requiredSlugs].filter((slug) => !hasFunctionIndex(slug)).join(", ")
);

check(
  "known MIMI Servicios backend functions are normalized locally",
  knownRequiredServicesFunctions.every(hasFunctionIndex),
  knownRequiredServicesFunctions.filter((slug) => !hasFunctionIndex(slug)).join(", ")
);

check(
  "dead provider dashboard and availability functions are not configured",
  staleFunctionSlugs.every((slug) => !content.config.includes(slug)) &&
    staleConfigKeys.every((key) => !content.config.includes(key))
);

check(
  "scoped frontend API files do not call dead provider dashboard and availability functions",
  staleFunctionSlugs.every((slug) => !scopedSources.includes(slug)) &&
    staleConfigKeys.every((key) => !scopedSources.includes(key))
);

const functionDirs = localFunctionDirs();
const emptyFunctionDirs = functionDirs.filter((slug) => !hasFunctionIndex(slug));
check(
  "local functions directory has no empty function folders",
  emptyFunctionDirs.length === 0,
  emptyFunctionDirs.join(", ")
);

const legacyDirs = functionDirs.filter((slug) => transportLegacyPattern.test(slug));
check(
  "local backend excludes transport legacy function folders",
  legacyDirs.length === 0,
  legacyDirs.join(", ")
);

const legacySourceHits = [];
for (const slug of functionDirs) {
  let source = fs.readFileSync(functionIndexPath(slug), "utf8");
  for (const snippet of allowedLegacySourceSnippets.get(slug) || []) {
    source = source.replaceAll(snippet, "");
  }
  if (transportLegacyPattern.test(source)) {
    legacySourceHits.push(slug);
  }
}
check(
  "local backend function sources exclude transport legacy terms",
  legacySourceHits.length === 0,
  legacySourceHits.join(", ")
);

const missingSharedImports = [];
for (const slug of functionDirs) {
  const source = fs.readFileSync(functionIndexPath(slug), "utf8");
  for (const match of source.matchAll(/\.\.\/_shared\/([^"';)]+)/g)) {
    const sharedPath = path.join(functionsRoot, "_shared", match[1]);
    if (!fs.existsSync(sharedPath)) {
      missingSharedImports.push(`${slug} -> ${match[1]}`);
    }
  }
}
check(
  "shared imports referenced by local functions exist",
  missingSharedImports.length === 0,
  missingSharedImports.join(", ")
);

check(
  "payment client functions are configured and local",
  ["createPaymentIntent", "getPaymentStatus", "cancelPayment", "refundPayment"].every((key) => {
    const slug = configured.get(key);
    return slug && hasFunctionIndex(slug);
  })
);

check(
  "trust, OTP, phone and payout functions are configured and local",
  [
    "clientPhoneStatus",
    "clientPhoneStart",
    "clientPhoneVerify",
    "otpRequest",
    "otpVerify",
    "deviceTrustCheck",
    "authRiskEvaluation",
    "authRegisterDevice",
    "authStartVerification",
    "authApproveChallenge",
    "authCheckChallenge",
    "securityRiskEvent",
    "providerPayoutAccount",
    "customerTrustProfile",
    "customerIdentityVerification"
  ].every((key) => {
    const slug = configured.get(key);
    return slug && hasFunctionIndex(slug);
  })
);

for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} backend functions readiness checks failed.`);
  process.exit(1);
}

console.log(`\n${results.length} backend functions readiness checks passed.`);
