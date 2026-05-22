import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  html: "prestador.html",
  main: "src/main-provider.js",
  map: "src/services/map.js",
  css: "styles/provider.css",
  mapCss: "styles/map-ui.css",
  packageJson: "../package.json"
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, read(file)])
);

const checks = [];

function check(name, pass) {
  checks.push({ name, pass: Boolean(pass) });
}

const authenticatedBootBlock = source.main.slice(
  source.main.indexOf("const canBootProviderPanel = await this.loadInitialData("),
  source.main.indexOf("this.setupEventListeners();")
);
const servicesFocusCss = source.css.slice(
  source.css.indexOf("Provider Services mobile 11/10 focus polish 2026-05-21")
);

check("provider HTML keeps map container", /id="mapContainer"[^>]+class="map-background"/.test(source.html));
check("provider HTML keeps map surface", /id="map"[^>]+class="map-surface"/.test(source.html));
check("provider imports MapLibre loader", /import\s+\{\s*ensureMapLibreAssets\s*\}\s+from "\.\/services\/map\.js"/.test(source.main));
check("provider initializes map after authenticated boot", /this\.initUI\(\);\s*this\.ensureProviderMapLoaded\("provider-panel-ready"\);/.test(authenticatedBootBlock));
check("map init remains non-blocking", !/await\s+this\.ensureProviderMapLoaded\("provider-panel-ready"\)/.test(authenticatedBootBlock));
check("lazy map helper remains available", /ensureProviderMapLoaded\(reason = "unknown"\)/.test(source.main));
check("initMap still creates MapLibre map", /new\s+maplibregl\.Map\(\{[\s\S]+container:\s*"map"/.test(source.main));
check("initMap forces map element visible", /mapEl\.style\.display\s*=\s*"block"/.test(source.main) && /mapEl\.style\.visibility\s*=\s*"visible"/.test(source.main));
check("authenticated boot restores map container display", /this\.elements\.mapContainer\)\s*this\.elements\.mapContainer\.style\.display\s*=\s*""/.test(source.main));
check("map CSS gives full viewport dimensions", /\.map-background\s*\{[\s\S]+position:\s*fixed[\s\S]+width:\s*100vw[\s\S]+height:\s*var\(--mimi-dvh\)/.test(source.css));
check("map surface keeps visible height", /\.map-surface,\s*#map\s*\{[\s\S]+height:\s*100%[\s\S]+min-height:\s*var\(--mimi-dvh\)[\s\S]+display:\s*block/.test(source.css));
check("auth loading may hide map only during boot", /body\.provider-auth-loading #mapContainer[\s\S]+display:\s*none/.test(source.css));
check("auth required CSS does not permanently hide map container", !/body\.provider-auth-required\s+#mapContainer[\s\S]{0,120}display:\s*none/.test(source.css));
check("services focus CSS does not hide map container", !/data-provider-tab="pricing"[\s\S]{0,900}#mapContainer[\s\S]{0,120}display:\s*none/.test(servicesFocusCss));
check("MapLibre assets loader is preserved", /MAPLIBRE_CSS_URL/.test(source.map) && /MAPLIBRE_JS_URL/.test(source.map) && /waitForMapLibre|window\.maplibregl/.test(source.map));
check("no Mapbox or Google Maps Platform API dependency", !/MAPBOX_TOKEN|GOOGLE_MAPS_API_KEY|google\.maps|maps\.googleapis\.com/i.test(source.main + source.map + source.packageJson));
check("wallet/login guardrails remain present", /provider-login-google/.test(source.html) && /tabWallet/.test(source.html) && /notificationsDrawer/.test(source.html));
check("provider build bumped for hotfix", /MIMI_PROVIDER_BUILD\s*=\s*"2026\.05\.22\.(map|boot)-hotfix1"/.test(source.main));

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
}

const failed = checks.filter((result) => !result.pass);
if (failed.length) {
  console.error(`\n${failed.length} provider map visibility checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} provider map visibility checks passed.`);
