// Tiene que subir junto con MIMI_PROVIDER_BUILD (main-provider.js) para que el service
// worker del prestador cambie de cache y no siga sirviendo el panel viejo.
const APP_VERSION = "2026.09.19.6-provider";
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
  "/mimi-servicios/styles/app.css",
  "/mimi-servicios/styles/map-ui.css",
  "/mimi-servicios/styles/provider.css",
  "/mimi-servicios/src/main-provider.js",
  "/mimi-servicios/src/services/pricing-models.js",
  "/mimi-servicios/src/services/price-book.js",
  "/mimi-servicios/src/services/provider-update.js",
  "/mimi-servicios/src/services/provider-navigation.js",
  "/mimi-servicios/src/services/service-api.js",
  "/mimi-servicios/src/ui/render-provider.js",
  "/mimi-servicios/assets/icons/mimigo-pro-icon-v10-192.png",
  "/mimi-servicios/assets/icons/mimigo-pro-icon-v10-512.png",
  "/mimi-servicios/assets/icons/mimigo-pro-icon-v10-512-maskable.png",
  "/mimi-servicios/assets/icons/mimigo-pro-badge-v11-96.png",
  "/mimi-servicios/assets/brand/mimigo-partners-wordmark.png",
  "/mimi-servicios/assets/brand/mimigo-partners-workspace-hero-1600x1100.png",
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
  const body = payload.notification?.body || data.body || "Tenés una novedad en MIMIGO.";
  const tag = data.tag || data.challenge_id || `mimi-partner-${Date.now()}`;
  const isKycAlert = data.type === "PROVIDER_KYC_REVIEW" || data.kyc_alert === "1";
  const badgeCount = Math.max(1, Number(data.unread_count || data.badge_count || 1) || 1);

  const actions = data.type === "APP_UPDATE" ? [
    { action: "update", title: "Actualizar" },
    { action: "later", title: "Más tarde" }
  ] : data.challenge_id ? [
    { action: "approve", title: "Sí, soy yo" },
    { action: "reject", title: "No fui yo" }
  ] : isKycAlert ? [
    { action: "open", title: "Revisar" }
  ] : [];

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/mimi-servicios/assets/icons/mimigo-pro-icon-v10-192.png",
    badge: "/mimi-servicios/assets/icons/mimigo-pro-badge-v11-96.png",
    tag,
    renotify: true,
    silent: false,
    vibrate: isKycAlert ? [220, 80, 220, 80, 320] : [180, 80, 180],
    requireInteraction: Boolean(isKycAlert || data.challenge_id),
    timestamp: Date.now(),
    data,
    actions
  }).then(() => setPartnerAppBadge(badgeCount)));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clearPartnerAppBadge());
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

async function setPartnerAppBadge(count = 1) {
  try {
    if (self.registration?.setAppBadge) {
      await self.registration.setAppBadge(Math.max(1, Number(count) || 1));
    }
  } catch {
    // Badging is optional.
  }
}

async function clearPartnerAppBadge() {
  try {
    if (self.registration?.clearAppBadge) {
      await self.registration.clearAppBadge();
    }
  } catch {
    // Badging is optional.
  }
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
  return new Response("MIMIGO Pro no tiene conexión en este momento.", {
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
