/**
 * MIMI Driver - Service Worker v5
 * Offline-first, background sync y manejo de conexiones lentas
 */

const CACHE_NAME = 'mimi-driver-v5';
const STATIC_ASSETS = [
  '/mimi-transporte/login-chofer.html',
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

// IndexedDB para cola offline
const DB_NAME = 'mimi-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-uploads';

// Abrir IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Guardar en cola offline
async function queueForLater(data) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.add({
    ...data,
    timestamp: Date.now(),
    retries: 0
  });
}

// Install - cache static assets con manejo de errores individual
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cacheo individual para no fallar todo si un archivo falla
      const promises = STATIC_ASSETS.map(async (url) => {
        try {
          await cache.add(url);
          console.log('[SW] Cached:', url);
        } catch (err) {
          console.warn('[SW] Failed to cache:', url, err);
        }
      });
      await Promise.all(promises);
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

// Estrategia de fetch: Network First con timeout para API, Cache First para assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  if (request.method !== 'GET') {
    // Manejar POST/PUT para cola offline si es necesario
    if (request.method === 'POST' && request.url.includes('supabase')) {
      event.respondWith(handleOfflinePost(request));
    }
    return;
  }

  // No cachear llamadas a Supabase (usar network first con timeout)
  if (request.url.includes('supabase.co') || request.url.includes('supabase.in')) {
    event.respondWith(networkFirstWithTimeout(request, 8000)); // 8 segundos max
    return;
  }

  // Assets estáticos: Cache First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Revalidar en background
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
    })
  );
});

// Network First con timeout configurable
async function networkFirstWithTimeout(request, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return networkResponse;
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Si hay caché, devolverlo
    const cached = await caches.match(request);
    if (cached) return cached;

    // Si es una petición de documentos, encolar para después
    if (request.url.includes('driver_documents') || request.url.includes('storage')) {
      // No podemos encolar GETs fácilmente, devolver error controlado
      return new Response(JSON.stringify({ 
        error: 'Network timeout',
        code: 'TIMEOUT',
        retryable: true 
      }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    throw error;
  }
}

// Manejar POSTs offline (para documentos)
async function handleOfflinePost(request) {
  try {
    const clone = request.clone();
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Encolar para background sync
    const body = await request.clone().json().catch(() => ({}));
    await queueForLater({
      type: 'document-upload',
      url: request.url,
      body: body,
      method: 'POST'
    });

    return new Response(JSON.stringify({
      queued: true,
      message: 'Documento encolado para subir cuando haya conexión'
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background sync mejorado
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-update') {
    event.waitUntil(syncLocation());
  }
  if (event.tag === 'document-upload') {
    event.waitUntil(processDocumentQueue());
  }
});

async function syncLocation() {
  console.log('[SW] Syncing location...');
  // Implementar lógica de location aquí
}

// Procesar cola de documentos pendientes
async function processDocumentQueue() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const requests = await store.getAll();

  for (const req of requests) {
    if (req.retries > 3) continue; // Max 3 retries

    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });

      if (response.ok) {
        // Eliminar de la cola
        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
        await deleteTx.objectStore(STORE_NAME).delete(req.id);
      } else {
        // Incrementar contador de retries
        const updateTx = db.transaction(STORE_NAME, 'readwrite');
        const updateStore = updateTx.objectStore(STORE_NAME);
        req.retries++;
        await updateStore.put(req);
      }
    } catch (err) {
      console.error('[SW] Failed to process queued request:', err);
    }
  }
}

// Push notifications (mantener compatibilidad con tu código anterior)
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjE',
  authDomain: 'mimi-transporte.firebaseapp.com',
  projectId: 'mimi-transporte',
  storageBucket: 'mimi-transporte.firebasestorage.app',
  messagingSenderId: '1066211116754',
  appId: '1:1066211116754:web:8cfb14cfb15ecd0cb28f0b'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(async (payload) => {
  const notificationTitle = payload.notification?.title || 'MIMI';
  const notificationOptions = {
    body: payload.notification?.body || 'Nueva notificación',
    icon: '/mimi-transporte/assets/icons/icon-192x192.png',
    badge: '/mimi-transporte/assets/icons/badge-icon.png',
    data: payload.data || {}
  };
  
  await self.registration.showNotification(notificationTitle, notificationOptions);
});
