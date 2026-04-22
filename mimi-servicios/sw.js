const CACHE_NAME = "mimi-servicios-v3";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./cliente.html",
  "./prestador.html",
  "./config.js",
  "./env.js",
  "./manifest.json",
  "./favicon.ico",
  "./styles/app.css",
  "./styles/client.css",
  "./styles/provider.css",
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
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)),
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
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const isNavigation = request.mode === "navigate";

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }

          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });

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
