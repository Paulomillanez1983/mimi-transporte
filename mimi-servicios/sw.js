const CACHE_NAME = "mimi-servicios-v5";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./cliente.html",
  "./prestador.html",
  "./src/config.js",
  "./styles/app.css",
  "./styles/client.css",
  "./styles/provider.css",
  "./env.js",
  "./favicon.ico",
  "../favicon.png",
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
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        APP_ASSETS.map((asset) => cache.add(asset))
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn("[SW] No se pudo precachear:", APP_ASSETS[index], result.reason);
        }
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // No interceptar esquemas no soportados por Cache Storage
  if (!["http:", "https:"].includes(url.protocol)) {
    return;
  }

  const isNavigation = request.mode === "navigate";

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }

          const responseUrl = new URL(response.url);

          // Solo cachear recursos http/https válidos
          if (["http:", "https:"].includes(responseUrl.protocol)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy).catch((error) => {
                console.warn("[SW] No se pudo guardar en cache:", request.url, error);
              });
            });
          }

          return response;
        })
        .catch(() => {
          if (isNavigation) {
            return caches.match("./index.html");
          }
          return Response.error();
        });
    }),
  );
});
