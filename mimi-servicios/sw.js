const CACHE_NAME = "mimi-servicios-v2";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./cliente.html",
  "./prestador.html",
  "./config.js",
  "./env.js",
  "./manifest.json",
  "./styles/app.css",
  "./styles/client.css",
  "./styles/provider.css",
  "./src/main-client.js",
  "./src/main-provider.js",
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

  const isNavigation = event.request.mode === "navigate";

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).catch(() => {
        if (isNavigation) {
          return caches.match("./cliente.html");
        }
        return Response.error();
      });
    }),
  );
});
