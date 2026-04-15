importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const CACHE_NAME = 'mimi-client-v9';
const APP_SHELL = '/mimi-transporte/index.html';
const APP_BASE_PATH = '/mimi-transporte/';

const STATIC_ASSETS = [
  '/mimi-transporte/',
  '/mimi-transporte/index.html',
  '/mimi-transporte/chofer-panel.html',
  '/mimi-transporte/mimi-transporte.css',
  '/mimi-transporte/css/design-system.css',
  '/mimi-transporte/css/components.css',
  '/mimi-transporte/css/animations.css',
  '/mimi-transporte/css/panel.css',
  '/mimi-transporte/js/push-support.js',
  '/mimi-transporte/js/driver-app.js',
  '/mimi-transporte/js/driver-support.js',
  '/mimi-transporte/js/trip-manager.js',
  '/mimi-transporte/js/ui-controller.js',
  '/mimi-transporte/assets/icons/icon-192x192.png',
  '/mimi-transporte/assets/icons/badge-icon.png',
  '/mimi-transporte/assets/icons/mimi-mark.svg',
  '/mimi-transporte/manifest.json',
  '/mimi-transporte/manifest-driver.json'
];

const DEFAULT_ICON = `${APP_BASE_PATH}assets/icons/icon-192x192.png`;
const DEFAULT_BADGE = `${APP_BASE_PATH}assets/icons/badge-icon.png`;
const DEFAULT_URL = `${APP_BASE_PATH}index.html`;
const DEFAULT_TAG = 'mimi-client-notification';

firebase.initializeApp({
  apiKey: 'AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjE',
  authDomain: 'mimi-transporte.firebaseapp.com',
  projectId: 'mimi-transporte',
  storageBucket: 'mimi-transporte.firebasestorage.app',
  messagingSenderId: '1066211116754',
  appId: '1:1066211116754:web:8cfb14cfb15ecd0cb28f0b'
});

const messaging = firebase.messaging();

function safeString(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

function isAppAsset(url) {
  try {
    const u = new URL(url);

    if (u.origin !== self.location.origin) return false;
    if (!u.pathname.startsWith('/mimi-transporte/')) return false;

    if (
      u.pathname.includes('/functions/v1/') ||
      u.pathname.includes('/rest/v1/') ||
      u.pathname.includes('/auth/v1/')
    ) {
      return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}

function normalizeUrl(rawUrl) {
  const url = safeString(rawUrl, DEFAULT_URL);

  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('/')
  ) {
    return url;
  }

  return DEFAULT_URL;
}

function getNavigationFallback(requestUrl) {
  try {
    const url = new URL(requestUrl);

    if (url.pathname.endsWith('/chofer-panel.html')) {
      return `${APP_BASE_PATH}chofer-panel.html`;
    }

    if (url.pathname.endsWith('/driver-onboarding.html')) {
      return `${APP_BASE_PATH}driver-onboarding.html`;
    }
  } catch (_) {}

  return APP_SHELL;
}

function buildNotificationFromPayload(payload) {
  const notification = payload?.notification || {};
  const data = payload?.data || {};

  const title = safeString(
    data.title || notification.title,
    'MIMI'
  );

  const body = safeString(
    data.body || notification.body,
    '📩 Te respondió soporte — tocá para ver'
  );

  const url = normalizeUrl(
    data.url ||
    data.link ||
    data.click_action ||
    notification.click_action ||
    notification.link ||
    DEFAULT_URL
  );

  const tag = safeString(
    data.tag ||
    notification.tag ||
    data.ticket_id ||
    data.viaje_id ||
    data.trip_id,
    DEFAULT_TAG
  );

  const icon = safeString(
    data.icon || notification.icon,
    DEFAULT_ICON
  );

  const badge = safeString(
    data.badge || notification.badge,
    DEFAULT_BADGE
  );

  const image = safeString(
    data.image || notification.image,
    ''
  );

  return {
    title,
    options: {
      body,
      icon,
      badge,
      image: image || undefined,
      tag,
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [300, 100, 300, 100, 500],
      data: {
        ...data,
        url,
        tag,
        icon,
        badge
      }
    }
  };
}

async function showPayloadNotification(payload) {
  const { title, options } = buildNotificationFromPayload(payload);
  await self.registration.showNotification(title, options);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[sw] no se pudo precachear:', asset, err);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate';
  const sameOrigin = isSameOrigin(request.url);
  const cacheableAsset = isAppAsset(request.url);

  if (isNavigation) {
    const fallbackUrl = getNavigationFallback(request.url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(fallbackUrl, cloned).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedApp = await caches.match(fallbackUrl);
          if (cachedApp) return cachedApp;

          return new Response('Sin conexión', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  if (!sameOrigin || !cacheableAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned).catch((err) => {
              console.warn('[sw] no se pudo guardar en cache:', request.url, err);
            });
          });

          return response;
        })
        .catch(async () => {
          const fallback = await caches.match(request);
          if (fallback) return fallback;

          return new Response('', {
            status: 504,
            statusText: 'Offline cache miss'
          });
        });
    })
  );
});

messaging.onBackgroundMessage(async (payload) => {
  try {
    console.log('[firebase-messaging-sw.js] onBackgroundMessage:', payload);
    await showPayloadNotification(payload);
  } catch (err) {
    console.error('[firebase-messaging-sw.js] Error in onBackgroundMessage:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = safeString(event.action, '');
  const data = event.notification?.data || {};
  const targetUrl = normalizeUrl(data.url || DEFAULT_URL);

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clientList) {
      try {
        const clientUrl = new URL(client.url);

        if (clientUrl.pathname.startsWith(APP_BASE_PATH) && 'focus' in client) {
          await client.focus();

          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }

          return;
        }
      } catch (err) {
        console.warn('[firebase-messaging-sw.js] Error focusing existing client:', err);
      }
    }

    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});
