/* ==========================================================================
   MIMI Clientes — Service Worker (Producción 2026)
   Ruta: /service-worker-clientes.js
   Scope esperado: /
   ========================================================================== */

const SW_VERSION = "mimi-clientes-v2026.05.03-ui-reference-final";
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const IMAGE_CACHE = `${SW_VERSION}-images`;

/* --------------------------------------------------------------------------
   App Shell (Hub Cliente)
   -------------------------------------------------------------------------- */
const APP_SHELL = [
  "/",
  "/hub-clientes.html",
  "/hub-clientes.css",
  "/manifest-clientes.json",

  // verticales
  "/index.html",
  "/mimi-servicios/cliente.html",

  // branding / assets
  "/favicon.ico",
  "/assets/auto-mimicar-safe.png",

  // personas reales (card inferior)
"/assets/ui/clarity-card-compact.png",
"/mimi-servicios/assets/people/driver-real.webp",
"/mimi-servicios/assets/people/client-real.webp",
  // icons PWA
  "/assets/icons/icon-192x192.png",
  "/assets/icons/icon-512x512.png"
];

/* --------------------------------------------------------------------------
   Install
   -------------------------------------------------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      try {
        await cache.addAll(APP_SHELL);
      } catch (err) {
        console.warn("[SW CLIENTES] cache addAll warning:", err);
      }
    })
  );

  self.skipWaiting();
});

/* --------------------------------------------------------------------------
   Activate
   -------------------------------------------------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

/* --------------------------------------------------------------------------
   Fetch Strategy
   --------------------------------------------------------------------------
   HTML      -> Network First
   CSS / JS  -> Stale While Revalidate
   Images    -> Cache First
   Others    -> Network fallback cache
   -------------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // sólo mismo origen
  if (url.origin !== self.location.origin) return;

  // ignorar extensiones de browser / devtools
  if (
    url.pathname.startsWith("/chrome-extension") ||
    url.pathname.includes("hot-update")
  ) {
    return;
  }

  const destination = request.destination;

  /* ------------------------------------------------------------------------
     HTML → Network First
     ------------------------------------------------------------------------ */
  if (destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }

  /* ------------------------------------------------------------------------
     CSS / JS → Stale While Revalidate
     ------------------------------------------------------------------------ */
  if (destination === "style" || destination === "script") {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  /* ------------------------------------------------------------------------
     Images → Cache First
     ------------------------------------------------------------------------ */
  if (destination === "image") {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* ------------------------------------------------------------------------
     Default
     ------------------------------------------------------------------------ */
  event.respondWith(networkFallback(request));
});

/* ==========================================================================
   Strategies
   ========================================================================== */

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    return cached || caches.match("/hub-clientes.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || networkFetch;
}

async function cacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    return Response.error();
  }
}

async function networkFallback(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}
