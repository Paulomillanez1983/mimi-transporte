const CACHE_NAME = "mimi-servicios-v2";
const APP_ASSETS = [
  "./",
  "./index.html",
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
          console.warn("[mimi-servicios/sw] No se pudo cachear asset:", asset, error);
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
      )
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // NO cachear extensiones del navegador, chrome-extension, moz-extension, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // evitar problemas con requests no cacheables
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // solo cachear respuestas válidas http/https y status OK
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }

          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch((error) => {
              console.warn("[mimi-servicios/sw] cache.put falló:", request.url, error);
            });
          });

          return response;
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
