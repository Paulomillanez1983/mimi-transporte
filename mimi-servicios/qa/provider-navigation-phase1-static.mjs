import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  html: "prestador.html",
  main: "src/main-provider.js",
  helper: "src/services/provider-navigation.js",
  css: "styles/provider.css",
  swPartner: "../sw-partner.js",
  packageJson: "../package.json"
};

const content = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);

const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail });
}

function loadHelperForStaticExecution(source) {
  const executable = source.replace(/\bexport\s+/g, "");
  return Function(`${executable}; return { buildProviderNavigationUrl, markProviderExternalNavigationStarted, hasProviderExternalNavigationStarted, clearProviderExternalNavigationStarted, PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY };`)();
}

const {
  buildProviderNavigationUrl,
  markProviderExternalNavigationStarted,
  hasProviderExternalNavigationStarted,
  clearProviderExternalNavigationStarted,
  PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY
} = loadHelperForStaticExecution(content.helper);

const googleLatLng = buildProviderNavigationUrl({
  lat: -31.4201,
  lng: -64.1888,
  addressText: "Nueva Cordoba",
  app: "google"
});

const googleAddress = buildProviderNavigationUrl({
  addressText: "Av. Colon 123, Cordoba",
  app: "google"
});

const missingDestination = buildProviderNavigationUrl({ app: "google" });
const wazeLatLng = buildProviderNavigationUrl({ lat: -31.42, lng: -64.18, app: "waze" });
const wazeWithoutLatLng = buildProviderNavigationUrl({ addressText: "Av. Colon 123", app: "waze" });

const storage = new Map();
const fakeStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

check(
  "Google navigation uses lat/lng destination without API key",
  googleLatLng === "https://www.google.com/maps/dir/?api=1&destination=-31.4201,-64.1888&travelmode=driving" &&
    !/key=|GOOGLE_MAPS_API_KEY|google\.maps/.test(googleLatLng)
);
check(
  "Google navigation falls back to encoded address",
  googleAddress === "https://www.google.com/maps/dir/?api=1&destination=Av.%20Colon%20123%2C%20Cordoba&travelmode=driving"
);
check("missing destination returns null", missingDestination === null);
check("Waze is supported only with lat/lng", wazeLatLng === "https://waze.com/ul?ll=-31.42,-64.18&navigate=yes" && wazeWithoutLatLng === null);
check(
  "external navigation flag stores only a timestamp",
  markProviderExternalNavigationStarted({ storage: fakeStorage, now: 123456 }) &&
    hasProviderExternalNavigationStarted({ storage: fakeStorage, now: 123999 }) &&
    fakeStorage.getItem(PROVIDER_EXTERNAL_NAVIGATION_STORAGE_KEY) === "123456" &&
    clearProviderExternalNavigationStarted({ storage: fakeStorage }) &&
    !hasProviderExternalNavigationStarted({ storage: fakeStorage, now: 124000 })
);

check("provider imports navigation helper", /from "\.\/services\/provider-navigation\.js"/.test(content.main));
check("provider openExternalNavigation uses helper", /buildProviderNavigationUrl\(\{[\s\S]+addressText:\s*this\.activeServiceAddressText\(\)/.test(content.main));
check("provider records non-sensitive external navigation flag", /markProviderExternalNavigationStarted\(\)/.test(content.main));
check("provider handles focus visibility and pageshow return", /handleExternalNavigationReturn\("visibilitychange"\)/.test(content.main) && /handleExternalNavigationReturn\("focus"\)/.test(content.main) && /handleExternalNavigationReturn\("pageshow"\)/.test(content.main));
check("provider return flow rehydrates active service", /resyncActiveService\(`external-navigation-\$\{trigger\}`\)/.test(content.main));
check("provider return flow is debounced and in-flight guarded", /externalNavigationReturnSyncInFlight/.test(content.main) && /lastExternalNavigationReturnSyncAt/.test(content.main));
check("active card has return-to-MIMIGO copy", /serviceReturnCopy/.test(content.html) && /volvé a MIMIGO/.test(content.html) && /tocá 'Llegué'/.test(content.html));
check("active card keeps stable navigation selector and accessible CTA", /id="openExternalNavigation"/.test(content.html) && />Navegar<\/button>/.test(content.html) && /aria-label="Navegar al domicilio/.test(content.html));
check("active card keeps arrival action", /id="serviceActionBtn"[\s\S]+Llegu/.test(content.html));
check("return copy has provider CSS", /\.service-return-copy/.test(content.css));
check("partner service worker precaches navigation helper", /\/mimi-servicios\/src\/services\/provider-navigation\.js/.test(content.swPartner));
check("no Mapbox or Google Maps Platform dependency added", !/mapbox|MAPBOX_TOKEN|GOOGLE_MAPS_API_KEY|google\.maps|Directions API|Distance Matrix|Routes API/i.test(content.helper + content.main + content.packageJson));
check("no new dependencies added for phase 1", !/"dependencies"\s*:/.test(content.packageJson));
check("no Mercado Pago/payment webhook/wallet code in phase 1 helper", !/mercadopago|Mercado Pago|payment-webhook|wallet/i.test(content.helper));

for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider navigation phase 1 checks failed.`);
  process.exit(1);
}

console.log(`\n${results.length} provider navigation phase 1 checks passed.`);
