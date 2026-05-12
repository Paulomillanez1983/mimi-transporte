const APP_VERSION = "2026-05-11-cms-runtime-1";
const CACHE_NAME = `mimi-servicios-provider-${APP_VERSION}`;

const APP_ASSETS = [
  "./",
  "./index.html",
  "./auth-callback.html",
  "./cliente.html",
  "./prestador.html",
  "./manifest.json",
  "./manifest-prestador.json",
  "./env.js",
  "./favicon.ico",
  "../favicon.png",

  "./styles/app.css",
  "./styles/map-ui.css",
  "./styles/client.css",
  "./styles/provider.css",
  "../css/mimi-maps.css",

  "../js/mimi-maps/map-core.js",
  "../js/mimi-maps/map-markers.js",
  "../js/mimi-maps/map-routing.js",

  "./src/config.js",
  "./src/main-client.js",
  "./src/main-provider.js",

  "./src/services/map.js",
  "./src/services/realtime.js",
  "./src/services/realtime-manager.js",
  "./src/services/runtime-config.js",
  "./src/services/observability.js",
  "./src/services/pocketbase-cms.js",
  "./src/services/service-api.js",
  "./src/services/service-geocoding.js",
  "./src/services/sound.js",
  "./src/services/supabase.js",
  "./src/services/mock-data.js",
  "./src/services/push.js",

  "./src/state/app-state.js",

  "./src/ui/render-client.js",
  "./src/ui/render-provider.js",

  "./assets/icons/mimigo-client-icon-192.png",
  "./assets/icons/mimigo-client-icon-512.png",
  "./assets/icons/mimigo-client-icon-512-maskable.png",
  "./assets/icons/mimigo-client-apple-touch-icon.png?v=branding-v3",
  "./assets/icons/mimigo-client-icon-32.png?v=branding-v3",
  "./assets/icons/mimigo-client-icon-16.png?v=branding-v3",
  "./assets/icons/mimigo-partners-icon-192.png",
  "./assets/icons/mimigo-partners-icon-512.png",
  "./assets/icons/mimigo-partners-icon-512-maskable.png",
  "./assets/icons/mimigo-partners-apple-touch-icon.png?v=branding-v3",
  "./assets/icons/mimigo-partners-icon-32.png?v=branding-v3",
  "./assets/icons/mimigo-partners-icon-16.png?v=branding-v3",
  "./assets/brand/mimigo-client-wordmark.png",
  "./assets/brand/mimigo-partners-wordmark.png",
  "./assets/brand/mimigo-client-splash-1536x1024.png",
  "./assets/brand/mimigo-partners-splash-1536x1024.png",
  "./assets/brand/mimigo-partners-workspace-hero-1600x1100.png",

  "./sw-2026.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppAssets());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanupOldCaches());
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

  const isNavigation = request.mode === "navigate";
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticAsset = isSameOrigin && isAppAsset(url);

  if (isPocketBaseCmsRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigation) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(isCoreUiAsset(url) ? networkFirstAsset(request) : cacheFirstAsset(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// =================================================================
// Push notifications: muestra notificación nativa cuando llega un
// push del backend, incluso si la app está cerrada. Soportada en
// Chrome/Firefox/Edge desktop y Android. Safari iOS solo si la PWA
// está instalada (iOS 16.4+).
// =================================================================
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "MIMI", body: event.data?.text?.() ?? "" };
  }

  const title = payload.title || payload.notification?.title || "MIMI Servicios";
  const options = {
    body: payload.body || payload.notification?.body || "Tenés una novedad en MIMI",
    icon: payload.icon || "./assets/icons/mimigo-client-icon-192.png",
    badge: payload.badge || "./assets/icons/mimigo-client-icon-32.png?v=branding-v3",
    tag: payload.tag || "mimi-services-push",
    renotify: true,
    requireInteraction: payload.requireInteraction || false,
    data: payload.data || {},
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./prestador.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/mimi-servicios/") && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICKED", data: event.notification.data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

async function precacheAppAssets() {
  const cache = await caches.open(CACHE_NAME);

  return Promise.allSettled(
    APP_ASSETS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn("[SW] No se pudo precachear:", asset, error);
      }
    })
  );
}

async function cleanupOldCaches() {
  const keys = await caches.keys();

  await Promise.all(
    keys
      .filter((key) => key.startsWith("mimi-servicios-provider-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key))
  );
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);

    if (shouldCacheResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached =
      (await caches.match(request)) ||
      (await caches.match("./prestador.html")) ||
      (await caches.match("./index.html"));

    if (cached) return cached;

    return new Response("Sin conexión y sin página disponible en cache.", {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (shouldCacheResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return Response.error();
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });

    if (shouldCacheResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (shouldCacheResponse(response)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  return Response.error();
}

function shouldCacheResponse(response) {
  if (!response) return false;
  if (response.status !== 200) return false;
  if (response.type === "opaque") return false;

  let responseUrl;
  try {
    responseUrl = new URL(response.url);
  } catch {
    return false;
  }

  return ["http:", "https:"].includes(responseUrl.protocol);
}

function isAppAsset(url) {
  const pathname = url.pathname;

  return APP_ASSETS.some((asset) => {
    try {
      const assetUrl = new URL(asset, self.location.href);
      return pathname === assetUrl.pathname;
    } catch {
      const normalizedAsset = asset.replace(/^\.\//, "/");
      return pathname.endsWith(normalizedAsset);
    }
  });
}

function isCoreUiAsset(url) {
  const pathname = url.pathname;
  return [
    "/mimi-servicios/env.js",
    "/mimi-servicios/prestador.html",
    "/mimi-servicios/prestador",
    "/mimi-servicios/cliente.html",
    "/mimi-servicios/styles/map-ui.css",
    "/mimi-servicios/styles/provider.css",
    "/mimi-servicios/styles/client.css",
    "/mimi-servicios/src/main-provider.js",
    "/mimi-servicios/src/main-client.js",
    "/mimi-servicios/src/services/map.js",
    "/mimi-servicios/src/services/service-api.js",
    "/mimi-servicios/src/ui/render-provider.js",
    "/mimi-servicios/src/ui/render-client.js",
    "/js/mimi-maps/map-core.js",
    "/js/mimi-maps/map-markers.js",
    "/js/mimi-maps/map-routing.js",
    "/css/mimi-maps.css",
    "/mimi-servicios/sw-2026.js"
  ].some((asset) => pathname.endsWith(asset));
}

function isPocketBaseCmsRequest(url) {
  return url.origin !== self.location.origin && url.pathname.startsWith("/api/collections/");
}
