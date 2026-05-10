#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const expectedRoutes = [
  "/", "/hub-clientes", "/hub-clientes.html", "/cliente", "/servicios",
  "/prestador", "/viaje", "/operadores", "/chofer", "/privacidad",
  "/terminos", "/delete-account"
];

function existsWebPath(webPath) {
  const clean = webPath.replace(/^\/+/, "") || "hub-clientes.html";
  return [
    path.join(ROOT, clean),
    path.join(ROOT, `${clean}.html`),
    path.join(ROOT, clean, "index.html")
  ].some((candidate) => fs.existsSync(candidate));
}

const rewrites = new Map((vercel.rewrites || []).map((item) => [item.source, item.destination]));
const redirects = new Map((vercel.redirects || []).map((item) => [item.source, item.destination]));
const routeResults = expectedRoutes.map((route) => {
  const redirectedTo = redirects.get(route) || null;
  const destination = redirectedTo || rewrites.get(route) || route;
  return {
    route,
    redirectedTo,
    destination,
    ok: route.endsWith(".html") ? existsWebPath(route) : existsWebPath(destination)
  };
});

const manifests = [
  "manifest.json",
  "manifest-clientes.json",
  "manifest-driver.json",
  "manifest-partners.json",
  "mimi-servicios/manifest.json",
  "mimi-servicios/manifest-prestador.json"
].map((file) => {
  const full = path.join(ROOT, file);
  try {
    const json = JSON.parse(fs.readFileSync(full, "utf8"));
    return { file, ok: Boolean(json.name && json.start_url && json.icons?.length) };
  } catch (error) {
    return { file, ok: false, error: error.message };
  }
});

const serviceWorkers = [
  "service-worker.js",
  "service-worker-clientes.js",
  "firebase-messaging-sw.js",
  "mimi-servicios/sw-2026.js"
].map((file) => ({ file, ok: fs.existsSync(path.join(ROOT, file)) }));

const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".vercel") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(full);
  }
}
walk(ROOT);

const missingLocalAssets = [];
const attrRegex = /\b(?:src|href)=["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const baseDir = path.dirname(file);
  for (const match of html.matchAll(attrRegex)) {
    const ref = match[1];
    if (!ref || ref.includes("$") || ref.startsWith("http") || ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("#") || ref.startsWith("data:")) continue;
    const cleanRef = ref.split("#")[0].split("?")[0];
    if (!cleanRef || cleanRef === "/") continue;
    const targetOk = cleanRef.startsWith("/")
      ? existsWebPath(cleanRef) || rewrites.has(cleanRef)
      : [
          path.resolve(baseDir, cleanRef),
          path.resolve(baseDir, `${cleanRef}.html`),
          path.resolve(baseDir, cleanRef, "index.html")
        ].some((candidate) => fs.existsSync(candidate));
    if (!targetOk) {
      missingLocalAssets.push({ file: path.relative(ROOT, file), ref });
    }
  }
}

const result = {
  ok: routeResults.every((item) => item.ok) &&
    manifests.every((item) => item.ok) &&
    serviceWorkers.every((item) => item.ok) &&
    missingLocalAssets.length === 0,
  routeResults,
  manifests,
  serviceWorkers,
  missingLocalAssets: missingLocalAssets.slice(0, 100)
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
