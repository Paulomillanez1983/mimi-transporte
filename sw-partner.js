const APP_VERSION = "2026-05-21-mimigo-pro-provider-map1";
const CACHE_PREFIX = "mimi-go-partner-";
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const LEGACY_CACHE_PREFIXES = ["mimi-servicios-provider-"];
const FALLBACK_PAGE = "/mimi-servicios/prestador.html";
const PARTNER_NAVIGATION_PATHS = new Set([
  "/prestador",
  "/app-version.json",
  "/mimi-servicios/prestador.html"
]);

const APP_ASSETS = [
  "/prestador",
  "/mimi-servicios/prestador.html",
  "/manifest-partners.json",
  "/mimi-servicios/env.js",
  "/mimi-servicios/styles/app.css",
  "/mimi-servicios/styles/map-ui.css",
  "/mimi-servicios/styles/provider.css",
  "/mimi-servicios/src/config.js",
  "/mimi-servicios/src/main-provider.js",
  "/mimi-servicios/src/services/map.js",
  "/mimi-servicios/src/services/provider-navigation.js",
  "/mimi-servicios/src/services/realtime-manager.js",
  "/mimi-servicios/src/services/runtime-config.js",
  "/mimi-servicios/src/services/observability.js",
  "/mimi-servicios/src/services/pocketbase-cms.js",
  "/mimi-servicios/src/services/service-api.js",
  "/mimi-servicios/src/services/sound.js",
  "/mimi-servicios/src/services/supabase.js",
  "/mimi-servicios/src/services/provider-storage.js",
  "/mimi-servicios/src/services/push.js",
  "/mimi-servicios/src/state/app-state.js",
  "/mimi-servicios/src/ui/render-provider.js",
  "/mimi-servicios/src/utils/phone-countries.js",
  "/mimi-servicios/assets/icons/mimigo-partners-icon-192.png",
  "/mimi-servicios/assets/icons/mimigo-partners-icon-512.png",
  "/mimi-servicios/assets/icons/mimigo-partners-icon-512-maskable.png",
  "/mimi-servicios/assets/brand/mimigo-partners-wordmark.png",
  "/mimi-servicios/assets/brand/mimigo-partners-workspace-hero-1600x1100.png",
  "/css/mimi-maps.css",
  "/js/mimi-maps/map-core.js",
  "/js/mimi-maps/map-markers.js",
  "/js/mimi-maps/map-routing.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAssets());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanupCaches());
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || "MIMIGO";
  const body = payload.notification?.body || data.body || "Tenes una novedad en MIMIGO.";
  const tag = data.tag || data.challenge_id || `mimi-partner-${Date.now()}`;

  const actions = data.type === "APP_UPDATE" ? [
    { action: "update", title: "Actualizar" },
    { action: "later", title: "Mas tarde" }
  ] : data.challenge_id ? [
    { action: "approve", title: "Si, soy yo" },
    { action: "reject", title: "No fui yo" }
  ] : [];

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/mimi-servicios/assets/icons/mimigo-partners-icon-192.png",
    badge: "/mimi-servicios/assets/icons/mimigo-partners-icon-32.png",
    tag,
    renotify: true,
    data,
    actions
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const challengeId = data.challenge_id || "";
  const action = event.action || "open";
  const url = data.type === "APP_UPDATE" && action === "update"
    ? "/prestador?app_update=1"
    : challengeId
    ? `/prestador?auth_challenge=${encodeURIComponent(challengeId)}&auth_action=${encodeURIComponent(action)}`
    : (data.url || "/prestador");

  event.waitUntil(openPartnerUrl(url));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!["http:", "https:"].includes(url.protocol)) return;
  if (isPocketBaseCmsRequest(url) || isSupabaseRequest(url)) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (!isPartnerNavigation(url)) return;
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isAppAsset(url)) {
    event.respondWith(isCoreAsset(url) ? networkFirstAsset(request) : cacheFirstAsset(request));
  }
});

async function precacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(APP_ASSETS.map((asset) => cache.add(asset)));
}

async function cleanupCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key))
  );
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (shouldCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(FALLBACK_PAGE)) || offlineResponse();
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (shouldCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (shouldCache(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

function isAppAsset(url) {
  return APP_ASSETS.some((asset) => url.pathname === new URL(asset, self.location.origin).pathname);
}

function isCoreAsset(url) {
  return /\.(?:html|js|css|json)$/i.test(url.pathname);
}

function isPartnerNavigation(url) {
  return PARTNER_NAVIGATION_PATHS.has(url.pathname);
}

function isPocketBaseCmsRequest(url) {
  return url.origin !== self.location.origin && url.pathname.startsWith("/api/collections/");
}

function isSupabaseRequest(url) {
  return /\.supabase\.co$/i.test(url.hostname);
}

function shouldCache(response) {
  return response && response.status === 200 && response.type !== "opaque";
}

function offlineResponse() {
  return new Response("MIMI GO Pro no tiene conexion en este momento.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

function readPushPayload(event) {
  try {
    return event.data?.json?.() || {};
  } catch {
    return {};
  }
}

async function openPartnerUrl(url) {
  const target = new URL(url, self.location.origin).href;
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = list.find((client) => new URL(client.url).pathname === "/prestador");
  if (existing) {
    await existing.focus();
    existing.postMessage({ type: "AUTH_CHALLENGE_ACTION", url: target });
    return;
  }
  await self.clients.openWindow(target);
}
