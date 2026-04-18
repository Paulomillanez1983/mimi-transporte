const CACHE_NAME = 'mimi-driver-v6';
const APP_BASE_PATH = (() => {
  const path = self.location.pathname || '/';
  return path.endsWith('/') ? path : path.replace(/[^/]*$/, '');
})();
const STATIC_ASSETS = [
  `${APP_BASE_PATH}login-chofer.html`,
  `${APP_BASE_PATH}driver-review-pending.html`,
  `${APP_BASE_PATH}driver-documents-observed.html`,
  `${APP_BASE_PATH}reset-password.html`,
  `${APP_BASE_PATH}chofer-panel.html`,
  `${APP_BASE_PATH}manifest.json`,
  `${APP_BASE_PATH}manifest-driver.json`,
  `${APP_BASE_PATH}libs/supabase-js.js`
];

function isCacheableAsset(requestUrl) {
  try {
    const url = new URL(requestUrl);
    if (url.origin !== self.location.origin) return false;
    if (!url.pathname.startsWith(APP_BASE_PATH)) return false;
    if (url.pathname.endsWith('/driver-onboarding.html')) return false;
    return !/\.(?:map)$/i.test(url.pathname);
  } catch (_) {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        STATIC_ASSETS.map(async (assetUrl) => {
          try {
            await cache.add(assetUrl);
          } catch (err) {
            console.warn('[SW] cache add failed', assetUrl, err);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = request.url;

  if (
    requestUrl.includes('supabase.co') ||
    requestUrl.includes('/functions/v1/') ||
    requestUrl.includes('/rest/v1/') ||
    requestUrl.includes('/storage/v1/') ||
    requestUrl.includes('/auth/v1/')
  ) {
    return;
  }

  if (!isCacheableAsset(requestUrl)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        void fetch(request).then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
