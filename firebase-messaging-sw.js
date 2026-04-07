importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const APP_BASE_PATH = '/mimi-transporte/';
const DEFAULT_ICON = `${APP_BASE_PATH}assets/icons/icon-192x192.png`;
const DEFAULT_BADGE = `${APP_BASE_PATH}assets/icons/icon-192x192.png`;
const DEFAULT_URL = APP_BASE_PATH;
const DEFAULT_TAG = 'mimi-driver-notification';

firebase.initializeApp({
  apiKey: 'AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY',
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

function buildNotificationFromPayload(payload) {
  const notification = payload?.notification || {};
  const data = payload?.data || {};

  const title = safeString(
    notification.title || data.title,
    'Nuevo mensaje'
  );

  const body = safeString(
    notification.body || data.body,
    'Tenés una nueva notificación'
  );

  const url = normalizeUrl(
    data.url ||
    data.click_action ||
    notification.click_action ||
    DEFAULT_URL
  );

  const tag = safeString(
    data.viaje_id || data.trip_id || data.tag,
    DEFAULT_TAG
  );

  return {
    title,
    options: {
      body,
      icon: safeString(data.icon, DEFAULT_ICON),
      badge: safeString(data.badge, DEFAULT_BADGE),
      tag,
      data: {
        ...data,
        url
      },
      requireInteraction: true,
      renotify: true
    }
  };
}

messaging.onBackgroundMessage(async (payload) => {
  try {
    console.log('[firebase-messaging-sw.js] Background:', payload);

    const { title, options } = buildNotificationFromPayload(payload);
    await self.registration.showNotification(title, options);
  } catch (err) {
    console.error('[firebase-messaging-sw.js] Error showing notification:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = normalizeUrl(event.notification?.data?.url || DEFAULT_URL);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);

          if (
            clientUrl.pathname.startsWith(APP_BASE_PATH) &&
            'focus' in client
          ) {
            return client.focus().then(() => {
              if ('navigate' in client) {
                return client.navigate(targetUrl);
              }
              return client;
            });
          }
        } catch (err) {
          console.warn('[firebase-messaging-sw.js] Error focusing existing client:', err);
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return Promise.resolve();
    })
  );
});
