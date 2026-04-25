const APP_VERSION = "2026-04-25-14";
const CACHE_NAME = `mimi-servicios-provider-${APP_VERSION}`;

const APP_ASSETS = [
  "./",
  "./index.html",
  "./cliente.html",
  "./prestador.html",
  "./manifest.json",
  "./env.js",
  "./favicon.ico",
  "../favicon.png",

  "./styles/app.css",
  "./styles/client.css",
  "./styles/provider.css",

  "./src/config.js",
  "./src/main-client.js",
  "./src/main-provider.js",

  "./src/services/map.js",
  "./src/services/realtime.js",
  "./src/services/service-api.js",
  "./src/services/service-geocoding.js",
  "./src/services/sound.js",
  "./src/services/supabase.js",
  "./src/services/mock-data.js",

  "./src/state/app-state.js",

  "./src/ui/render-client.js",
  "./src/ui/render-provider.js",

  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/favicon-16.png",

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

  if (isNavigation) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
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
    const normalizedAsset = asset.replace(/^\.\//, "/");
    return pathname.endsWith(normalizedAsset);
  });
}
