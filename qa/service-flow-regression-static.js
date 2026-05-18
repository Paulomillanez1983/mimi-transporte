const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  packageJson: "package.json",
  mainClient: "mimi-servicios/src/main-client.js",
  renderClient: "mimi-servicios/src/ui/render-client.js",
  mainProvider: "mimi-servicios/src/main-provider.js",
  providerCss: "mimi-servicios/styles/provider.css",
  clientCss: "mimi-servicios/styles/client.css",
  rootManifest: "manifest-partners.json",
  providerManifest: "mimi-servicios/manifest-prestador.json",
  providerHtml: "mimi-servicios/prestador.html",
  publicProviderHtml: "prestador/index.html",
  getPin: "mimi-servicios/supabase/functions/svc-get-service-pin/index.ts",
  respondOffer: "mimi-servicios/supabase/functions/svc-provider-respond-offer/index.ts",
  startService: "mimi-servicios/supabase/functions/svc-start-service/index.ts"
};

const content = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, read(file)]));

let failures = 0;
let passes = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function ordered(source, first, second) {
  const left = source.indexOf(first);
  const right = source.indexOf(second);
  return left >= 0 && right >= 0 && left < right;
}

check("package exposes service flow regression QA", /qa:service-flow-regression/.test(content.packageJson));

check("PIN is generated when provider accepts", /pin_generated:\s*true/.test(content.respondOffer) && /p_pin_ciphertext/.test(content.respondOffer));
check("PIN can only be fetched by the owning client", /request\.client_user_id !== user\.id/.test(content.getPin) && /request_forbidden/.test(content.getPin));
check("provider start validates submitted PIN", /submittedHash !== request\.service_pin_hash/.test(content.startService) && /service_pin_verified_at/.test(content.startService));
check("client fetches PIN during live hydration", /fetchServicePinForRequest\(activeRequest,\s*"hydrate"\)/.test(content.mainClient));
check("client refreshes PIN after realtime request state changes", /refreshServicePinForRequest\(safePayload,\s*"realtime_request_update"\)/.test(content.mainClient));
check("client renders PIN only when provider is at the door", /currentStatus === "PROVIDER_ARRIVED" && servicePin/.test(content.renderClient));
check("client never renders PIN hash or ciphertext", !/service_pin_hash|service_pin_ciphertext/.test(content.renderClient));

check("client auto-opens Mercado Pago after creating paid request", ordered(content.mainClient, "await hydrateLiveContext(request);", "openMercadoPagoCheckout(paymentIntent, \"request_created\")"));
check("payment button navigates through same checkout helper", /openMercadoPagoCheckout\(payment,\s*"payment_button"\)/.test(content.mainClient));
check("payment CTA is visible in the service summary", /payment-required-card/.test(content.renderClient) && /Ir a Mercado Pago/.test(content.renderClient));
check("payment CTA CSS is scoped to client summary", /payment-required-card/.test(content.clientCss) && /summary-actions-inline/.test(content.clientCss));

check("provider PWA install copy uses MIMI GO Pro", /Instalá MIMI GO Pro/.test(content.mainProvider) && /Instalar MIMI GO Pro/.test(content.mainProvider));
check("provider HTML install copy uses MIMI GO Pro", /Instalá MIMI GO Pro/.test(content.providerHtml) && /Instalá MIMI GO Pro/.test(content.publicProviderHtml));
check("provider uses Pro manifest, not partners manifest", /manifest-prestador\.json\?v=2026\.05\.18\.4/.test(content.providerHtml) && /manifest-prestador\.json\?v=2026\.05\.18\.4/.test(content.publicProviderHtml) && !/manifest-partners\.json/.test(content.providerHtml + content.publicProviderHtml));
check("provider manifest id is MIMI GO Pro route", /"id":\s*"\/mimi-servicios\/prestador"/.test(content.providerManifest) && /"id":\s*"\/mimi-servicios\/prestador"/.test(content.rootManifest));
check("provider automatic install prompt is disabled", /const PROVIDER_INSTALL_PROMPT_ENABLED = false/.test(content.mainProvider) && /if \(!PROVIDER_INSTALL_PROMPT_ENABLED\)[\s\S]{0,180}this\.hideInstallBanner\(\)/.test(content.mainProvider));
check("provider install dismissal persists instead of reopening every refresh", /PARTNER_INSTALL_DISMISSED_KEY[\s\S]*Date\.now\(\) \+ 30 \* 24/.test(content.mainProvider));
check("provider setup does not clear installed PWA marker", !/removeItem\(PARTNER_PWA_INSTALLED_KEY/.test(content.mainProvider));

check("provider Wallet remains a dedicated tab", /data-tab="wallet"[\s\S]*Wallet/.test(content.providerHtml) && /id="tabWallet"/.test(content.providerHtml));
check("public provider Wallet remains a dedicated tab", /data-tab="wallet"[\s\S]*Wallet/.test(content.publicProviderHtml) && /id="tabWallet"/.test(content.publicProviderHtml));
check("provider incoming offer card stays compact on mobile", /Service-flow stabilization 2026-05-18/.test(content.providerCss) && /max-height:\s*min\(32dvh,\s*268px\)/.test(content.providerCss));
check("provider active service card leaves map visible", /active-service-float:not\(\[hidden\]\)[\s\S]*max-height:\s*min\(42dvh,\s*340px\)/.test(content.providerCss));
check("provider collapsed sheet height stays bounded", /--provider-bottom-nav-visible:\s*calc\(154px/.test(content.providerCss));

check("service flow regression does not touch Transporte", !/notificar-chofer|admin-list-drivers|dispatch-viaje|driver-|TRANSPORT_TRIP/.test([
  content.mainClient,
  content.renderClient,
  content.mainProvider,
  content.providerCss,
  content.clientCss
].join("\n")));
check("service flow regression does not enable production payments", !/PAYMENTS_REAL_ENABLED\s*=\s*true|PAYMENT_ENVIRONMENT\s*=\s*production/.test(Object.values(content).join("\n")));

if (failures) {
  console.error(`\n${failures} service flow regression checks failed.`);
  process.exit(1);
}

console.log(`\n${passes} service flow regression checks passed.`);
