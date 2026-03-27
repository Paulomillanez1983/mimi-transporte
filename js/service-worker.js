/**
 * MIMI Driver - Service Worker
 * Offline support and background sync
 */

const CACHE_NAME = 'mimi-driver-v1';
const STATIC_ASSETS = [
  '/mimi-transporte/chofer-panel.html',
  '/mimi-transporte/css/design-system.css',
  '/mimi-transporte/css/components.css',
  '/mimi-transporte/css/animations.css',
  '/mimi-transporte/css/panel.css',
  '/mimi-transporte/js/config.js',
  '/mimi-transporte/js/state-manager.js',
  '/mimi-transporte/js/supabase-client.js',
  '/mimi-transporte/js/sound-service.js',
  '/mimi-transporte/js/location-service.js',
  '/mimi-transporte/js/map-service.js',
  '/mimi-transporte/js/trip-manager.js',
  '/mimi-transporte/js/ui-controller.js',
  '/mimi-transporte/js/app.js'
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
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // Don't cache if not valid
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone and cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
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
  // Implementation for background location sync
  console.log('[SW] Syncing location...');
}
