// Recuperado de producción el 18-sep-2026: este archivo nunca había estado en el
// repositorio, aunque la app lo registra y es el service worker real del cliente.
// Sin él, cualquier deploy desde el repo deja /sw-client.js en 404 y se rompe la
// instalación del service worker (notificaciones push y modo offline).
const APP_VERSION = "2026.09.18.4-client-root-services";
const CACHE_PREFIX = "mimi-go-client-";
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const LEGACY_CACHE_PREFIXES = ["mimi-servicios-provider-", "mimi-servicios-client-", "mimi-clientes-"];
const FALLBACK_PAGE = "/mimi-servicios/cliente.html";
const CLIENT_NAVIGATION_PATHS = new Set([
  "/cliente",
  "/servicios",
  "/app-version.json",
  "/mimi-servicios/cliente.html"
]);

const APP_ASSETS = [
  "/servicios",
  "/mimi-servicios/cliente.html",
  "/manifest-clientes.json",
  "/mimi-servicios/styles/app.css",
  "/mimi-servicios/styles/map-ui.css",
  "/mimi-servicios/styles/client.css",
  "/mimi-servicios/src/main-client.js",
  "/mimi-servicios/src/services/pricing-models.js",
  "/mimi-servicios/src/services/request-photos.js",
  "/mimi-servicios/src/services/photo-compression.js",
  "/mimi-servicios/src/services/cancellation-policy.js",
  "/mimi-servicios/src/services/service-api.js",
  "/mimi-servicios/src/services/service-geocoding.js",
  "/mimi-servicios/src/ui/render-client.js",
  "/mimi-servicios/assets/icons/mimigo-client-icon-v10-192.png",
  "/mimi-servicios/assets/icons/mimigo-client-icon-v10-512.png",
  "/mimi-servicios/assets/icons/mimigo-client-icon-v10-512-maskable.png",
  "/mimi-servicios/assets/icons/mimigo-client-badge-v11-96.png",
  "/mimi-servicios/assets/brand/mimigo-client-wordmark.png",
  "/css/mimi-maps.css",
  "/js/mimi-maps/map-core.js",
  "/js/mimi-maps/map-markers.js",
  "/js/mimi-maps/map-routing.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await precacheAssets();
    await self.skipWaiting();
  })());
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
  const tag = data.tag || data.challenge_id || `mimi-client-${Date.now()}`;
  const badgeCount = Math.max(1, Number(data.unread_count || data.badge_count || 1) || 1);

  const actions = data.type === "APP_UPDATE" ? [
    { action: "update", title: "Actualizar" },
    { action: "later", title: "Mas tarde" }
  ] : data.challenge_id ? [
    { action: "approve", title: "Si, soy yo" },
    { action: "reject", title: "No fui yo" }
  ] : [];

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/mimi-servicios/assets/icons/mimigo-client-icon-v10-192.png",
    badge: "/mimi-servicios/assets/icons/mimigo-client-badge-v11-96.png",
    tag,
    renotify: true,
    silent: false,
    vibrate: data.challenge_id ? [220, 80, 220, 80, 320] : [180, 80, 180],
    requireInteraction: Boolean(data.challenge_id),
    timestamp: Date.now(),
    data,
    actions
  }).then(() => setClientAppBadge(badgeCount)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clearClientAppBadge());
  const data = event.notification.data || {};
  const challengeId = data.challenge_id || "";
  const action = event.action || "open";
  const url = data.type === "APP_UPDATE" && action === "update"
    ? "/servicios?app_update=1"
    : challengeId
    ? `/servicios?auth_challenge=${encodeURIComponent(challengeId)}&auth_action=${encodeURIComponent(action)}`
    : (data.url || "/servicios");

  event.waitUntil(openClientUrl(url));
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
    if (!isClientNavigation(url)) return;
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

function isClientNavigation(url) {
  return CLIENT_NAVIGATION_PATHS.has(url.pathname);
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
  return new Response("MIMI GO no tiene conexion en este momento.", {
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

async function openClientUrl(url) {
  const target = new URL(url, self.location.origin).href;
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = list.find((client) => new URL(client.url).pathname === "/servicios");
  if (existing) {
    await existing.focus();
    existing.postMessage({ type: "AUTH_CHALLENGE_ACTION", url: target });
    return;
  }
  await self.clients.openWindow(target);
}

async function setClientAppBadge(count = 1) {
  try {
    if (self.registration?.setAppBadge) {
      await self.registration.setAppBadge(Math.max(1, Number(count) || 1));
    }
  } catch {
    // Badging is optional.
  }
}

async function clearClientAppBadge() {
  try {
    if (self.registration?.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch {
    // Badging is optional.
  }
}
