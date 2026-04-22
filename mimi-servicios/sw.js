const CACHE_NAME = "mimi-servicios-v3";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./env.js",
  "./config.js",
  "./styles/app.css",
  "./src/main.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of APP_ASSETS) {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn("[SW] No se pudo cachear:", asset, error);
        }
      }
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
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NO manejar chrome-extension, moz-extension, data, blob, etc.
  if (!["http:", "https:"].includes(url.protocol)) {
    return;
  }

  // evita error interno del cache con requests especiales
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type === "opaque"
          ) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch((error) => {
              console.warn("[SW] cache.put falló:", request.url, error);
            });
          });

          return networkResponse;
        })
        .catch(() => {
          if (
            request.mode === "navigate" ||
            request.destination === "document"
          ) {
            return caches.match("./index.html");
          }

          return caches.match(request);
        });
    }),
  );
});
