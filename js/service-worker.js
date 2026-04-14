/**
 * MIMI Driver - Service Worker
 * Offline support and background sync
 */

const CACHE_NAME = 'mimi-driver-v3';
const STATIC_ASSETS = [
  '/mimi-transporte/login-chofer.html',
  '/mimi-transporte/driver-onboarding.html',
  '/mimi-transporte/driver-review-pending.html',
  '/mimi-transporte/driver-documents-observed.html',
  '/mimi-transporte/reset-password.html',
  '/mimi-transporte/chofer-panel.html',
  '/mimi-transporte/manifest.json',
  '/mimi-transporte/manifest-driver.json',
  '/mimi-transporte/libs/supabase-js.js',
  '/mimi-transporte/css/design-system.css',
  '/mimi-transporte/css/components.css',
  '/mimi-transporte/css/animations.css',
  '/mimi-transporte/css/panel.css',
  '/mimi-transporte/js/config.js',
  '/mimi-transporte/js/state-manager.js',
  '/mimi-transporte/js/supabase-client.js',
  '/mimi-transporte/js/location-tracker.js',
  '/mimi-transporte/js/map-service.js',
  '/mimi-transporte/js/trip-manager.js',
  '/mimi-transporte/js/ui-controller.js',
  '/mimi-transporte/js/driver-app.js'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve from cache or network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // No cachear llamadas a Supabase
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => cached);
    })
  );
});

// Background sync for location updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-update') {
    event.waitUntil(syncLocation());
  }
});

async function syncLocation() {
  console.log('[SW] Syncing location...');
}
