#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function check(name, ok, detail = "") {
  return { name, ok: Boolean(ok), detail };
}

const files = {
  mapCore: "js/mimi-maps/map-core.js",
  mapMarkers: "js/mimi-maps/map-markers.js",
  mapRouting: "js/mimi-maps/map-routing.js",
  mapCss: "css/mimi-maps.css",
  servicesMapCss: "mimi-servicios/styles/map-ui.css",
  servicesMap: "mimi-servicios/src/services/map.js",
  driverMap: "js/map-service.js",
  servicesSw: "mimi-servicios/sw-2026.js",
  driverSw: "service-worker.js",
  clientHtml: "mimi-servicios/cliente.html",
  providerHtml: "mimi-servicios/prestador.html",
  driverHtml: "chofer-panel.html",
  vercel: "vercel.json"
};

const servicesMap = read(files.servicesMap);
const driverMap = read(files.driverMap);
const servicesSw = read(files.servicesSw);
const driverSw = read(files.driverSw);
const clientHtml = read(files.clientHtml);
const providerHtml = read(files.providerHtml);
const driverHtml = read(files.driverHtml);
const vercel = JSON.parse(read(files.vercel));

const expectedRoutes = ["/", "/cliente", "/viaje", "/chofer", "/servicios", "/prestador", "/operadores"];
const rewrites = new Map((vercel.rewrites || []).map((item) => [item.source, item.destination]));

const checks = [
  check("mimi maps core exists", exists(files.mapCore), files.mapCore),
  check("mimi maps markers exists", exists(files.mapMarkers), files.mapMarkers),
  check("mimi maps routing exists", exists(files.mapRouting), files.mapRouting),
  check("mimi maps shared css exists", exists(files.mapCss), files.mapCss),
  check("services map css exists", exists(files.servicesMapCss), files.servicesMapCss),
  check(
    "services map imports shared core",
    servicesMap.includes("../../../js/mimi-maps/map-core.js"),
    files.servicesMap
  ),
  check(
    "services map imports shared markers",
    servicesMap.includes("../../../js/mimi-maps/map-markers.js"),
    files.servicesMap
  ),
  check(
    "services map imports shared routing",
    servicesMap.includes("../../../js/mimi-maps/map-routing.js"),
    files.servicesMap
  ),
  check(
    "driver map uses shared resize helper",
    driverMap.includes("./mimi-maps/map-core.js") && driverMap.includes("scheduleMapResize"),
    files.driverMap
  ),
  check("client html loads map-ui css", clientHtml.includes("./styles/map-ui.css?v=2026.05.10.3")),
  check("provider html loads map-ui css", providerHtml.includes("./styles/map-ui.css?v=2026.05.10.3")),
  check("driver html loads mimi maps css", driverHtml.includes("css/mimi-maps.css?v=2026.05.10.3")),
  check("services sw caches map-ui css", servicesSw.includes("./styles/map-ui.css")),
  check("services sw caches shared map modules", servicesSw.includes("../js/mimi-maps/map-core.js")),
  check("driver sw caches shared map modules", driverSw.includes("js/mimi-maps/map-core.js")),
  check("driver sw cache version bumped", driverSw.includes("mimi-driver-v8-mimi-maps")),
  ...expectedRoutes.map((route) => check(`vercel route ${route}`, rewrites.has(route) || route === "/"))
];

const failed = checks.filter((item) => !item.ok);
const result = {
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  checks,
  failed
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
