const FIREBASE_CONFIG = window.MIMI_FIREBASE_CONFIG || {
  apiKey: "AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY",
  authDomain: "mimi-transporte.firebaseapp.com",
  projectId: "mimi-transporte",
  storageBucket: "mimi-transporte.firebasestorage.app",
  messagingSenderId: "1066211116754",
  appId: "1:1066211116754:web:8cfb14cfb15ecd0cb28f0b"
};

const DEFAULT_FIREBASE_VAPID_KEY =
  "BKjAYoEwolpGEXVXpLRRBD5zHdkBbCHaUo9QgwFoPAULSdPn7qt8RNsMHAT2RrJtQpBsO3sRfMOHhFh1YBTfKSo";
const LEGACY_FIREBASE_VAPID_KEY =
  "BKHvLJ5xJM9pJdPmOhq2JcXg_W7Oqmsy-qqZYsKtgHvD9QnCKbqJ8JnbBtV5xBp4kGV7c8mZ5Q9QmZpL3hX7dY8";
const PUSH_ASSET_ORIGIN = window.location?.origin || "https://mimigo.com.ar";
const PUSH_ASSET_BASE = `${PUSH_ASSET_ORIGIN}/mimi-servicios/assets/icons`;

const PUSH_SURFACES = {
  client: {
    key: "client",
    scope: "/servicios",
    worker: "/sw-client.js",
    diagnosticKey: "mimi_client_push_diagnostic",
    icon: `${PUSH_ASSET_BASE}/mimigo-client-icon-v10-192.png`,
    badge: `${PUSH_ASSET_BASE}/mimigo-client-badge-v11-96.png`
  },
  provider: {
    key: "provider",
    scope: "/prestador",
    worker: "/sw-partner.js",
    diagnosticKey: "mimi_provider_push_diagnostic",
    icon: `${PUSH_ASSET_BASE}/mimigo-pro-icon-v10-192.png`,
    badge: `${PUSH_ASSET_BASE}/mimigo-pro-badge-v11-96.png`
  }
};

let activePushSurface = null;
let pushTokenPromises = new Map();
let serviceWorkerPromises = new Map();
let foregroundListenerBound = false;
const PUSH_REGISTRATION_TTL_MS = 12 * 60 * 60 * 1000;

function setPushDiagnostic(status, detail = {}) {
  const surface = activePushSurface || detectPushSurface();

  try {
    localStorage.setItem(surface.diagnosticKey, JSON.stringify({
      status,
      detail,
      permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
      updated_at: new Date().toISOString()
    }));
  } catch {
    // Diagnostic storage is best-effort only.
  }
}

function detectPushSurface(options = {}) {
  if (options.surface && PUSH_SURFACES[options.surface]) {
    return PUSH_SURFACES[options.surface];
  }

  const targetUrl = String(options.targetUrl || window.location?.pathname || "").toLowerCase();
  const isProviderTarget =
    targetUrl.includes("/prestador") ||
    targetUrl.includes("hub-operadores") ||
    targetUrl.includes("partners");

  return isProviderTarget ? PUSH_SURFACES.provider : PUSH_SURFACES.client;
}

async function getMimiServiceWorkerRegistration(surface = detectPushSurface()) {
  if (!serviceWorkerPromises.has(surface.key)) {
    serviceWorkerPromises.set(surface.key, (async () => {
      const existing = await navigator.serviceWorker.getRegistration(surface.scope);
    if (existing?.active || existing?.installing || existing?.waiting) {
      await existing.update?.().catch(() => {});
      return existing;
    }

      const registration = await navigator.serviceWorker.register(surface.worker, {
        scope: surface.scope
    });
    await registration.update?.().catch(() => {});
    return registration;
    })());
  }

  return serviceWorkerPromises.get(surface.key);
}

async function getPartnerServiceWorkerRegistration() {
  return getMimiServiceWorkerRegistration(PUSH_SURFACES.provider);
}

async function firebaseApp() {
  const firebaseAppModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const { initializeApp, getApps, getApp } = firebaseAppModule;
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
}

function vapidCandidates() {
  return [
    window.MIMI_FIREBASE_VAPID_KEY,
    DEFAULT_FIREBASE_VAPID_KEY,
    LEGACY_FIREBASE_VAPID_KEY
  ]
    .map((key) => String(key || "").trim())
    .filter((key, index, list) => key && list.indexOf(key) === index);
}

function errorText(error) {
  return error?.message || error?.code || String(error || "unknown_error");
}

function tokenFingerprint(token) {
  const text = String(token || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `${text.length}:${Math.abs(hash)}`;
}

function registrationCacheKey(surface) {
  return `mimi_push_registration_${surface?.key || "default"}_v1`;
}

export function shouldRegisterPushToken(surfaceKey, token, { prompt = false, ttlMs = PUSH_REGISTRATION_TTL_MS } = {}) {
  if (prompt) return true;
  const surface = PUSH_SURFACES[surfaceKey] || detectPushSurface({ surface: surfaceKey });
  const fingerprint = tokenFingerprint(token);
  if (!fingerprint) return false;

  try {
    const cached = JSON.parse(localStorage.getItem(registrationCacheKey(surface)) || "{}");
    const cachedAt = new Date(cached.registered_at || 0).getTime();
    const fresh = cachedAt && Date.now() - cachedAt < ttlMs;
    return !(fresh && cached.token_fingerprint === fingerprint);
  } catch {
    return true;
  }
}

export function rememberPushTokenRegistration(surfaceKey, token) {
  const surface = PUSH_SURFACES[surfaceKey] || detectPushSurface({ surface: surfaceKey });
  try {
    localStorage.setItem(registrationCacheKey(surface), JSON.stringify({
      token_fingerprint: tokenFingerprint(token),
      registered_at: new Date().toISOString()
    }));
  } catch {
    // Best-effort cache only.
  }
}

function isFcmSubscribeError(error) {
  const text = errorText(error).toLowerCase();
  return (
    text.includes("token-subscribe-failed") ||
    text.includes("missing required authentication credential") ||
    text.includes("applicationserverkey")
  );
}

async function resetPushSubscription(registration) {
  try {
    const subscription = await registration?.pushManager?.getSubscription?.();
    if (subscription) await subscription.unsubscribe();
    return Boolean(subscription);
  } catch (error) {
    console.warn("[MIMI Push] no se pudo limpiar la suscripción push anterior:", errorText(error));
    return false;
  }
}

async function getFcmTokenWithRecovery(getToken, messaging, registration) {
  const candidates = vapidCandidates();
  let lastError = null;

  for (const [index, vapidKey] of candidates.entries()) {
    try {
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration
      });

      if (token) {
        setPushDiagnostic("token_ready", {
          scope: registration.scope,
          tokenPrefix: token.slice(0, 16),
          vapidIndex: index
        });
        return token;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[MIMI Push] FCM token fallo con VAPID #${index + 1}:`, errorText(error));

      if (isFcmSubscribeError(error)) {
        const cleaned = await resetPushSubscription(registration);
        if (cleaned) {
          try {
            const retryToken = await getToken(messaging, {
              vapidKey,
              serviceWorkerRegistration: registration
            });

            if (retryToken) {
              setPushDiagnostic("token_ready", {
                scope: registration.scope,
                tokenPrefix: retryToken.slice(0, 16),
                vapidIndex: index,
                recovered: true
              });
              return retryToken;
            }
          } catch (retryError) {
            lastError = retryError;
            console.warn(`[MIMI Push] reintento FCM fallo con VAPID #${index + 1}:`, errorText(retryError));
          }
        }
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

export async function getMimiPushToken({ prompt = true, surface, targetUrl } = {}) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    console.info("[MIMI Push] Browser no soporta web push");
    setPushDiagnostic("unsupported");
    return null;
  }

  if (Notification.permission === "denied") {
    setPushDiagnostic("denied");
    return null;
  }
  if (!prompt && Notification.permission !== "granted") {
    setPushDiagnostic("permission_required");
    return null;
  }

  const currentSurface = detectPushSurface({ surface, targetUrl });
  activePushSurface = currentSurface;
  const promiseKey = `${currentSurface.key}:${prompt ? "prompt" : "silent"}`;

  if (!pushTokenPromises.has(promiseKey)) {
    pushTokenPromises.set(promiseKey, (async () => {
    try {
      const [{ getMessaging, getToken, onMessage, isSupported }, registration, app] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js")
          .then((module) => module),
          getMimiServiceWorkerRegistration(currentSurface),
        firebaseApp()
      ]);

      let permission = Notification.permission;
      if (permission === "default" && prompt) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        console.info("[MIMI Push] permiso de notificaciones:", permission);
        setPushDiagnostic("permission_not_granted", { permission });
        pushTokenPromises.delete(promiseKey);
        return null;
      }

      const supported = await isSupported().catch(() => false);
      if (!supported) {
        setPushDiagnostic("firebase_messaging_not_supported", {
          userAgent: navigator.userAgent
        });
        pushTokenPromises.delete(promiseKey);
        return null;
      }

      const messaging = getMessaging(app);
      const token = await getFcmTokenWithRecovery(getToken, messaging, registration);

      if (!token) {
        setPushDiagnostic("token_empty");
        pushTokenPromises.delete(promiseKey);
        return null;
      }

      if (!foregroundListenerBound) {
        onMessage(messaging, (payload) => {
          if (!payload?.notification && !payload?.data) return;
          const targetUrl = String(payload.data?.url || window.location.pathname || "");
            const notificationSurface = detectPushSurface({ targetUrl });
          registration.showNotification(payload.notification?.title || payload.data?.title || "MIMIGO", {
            body: payload.notification?.body || payload.data?.body || "",
              icon: notificationSurface.icon,
              badge: notificationSurface.badge,
            tag: payload.data?.tag || `mimi-foreground-${Date.now()}`,
            renotify: true,
            silent: false,
            vibrate: [220, 80, 220, 80, 320],
            data: payload.data || {}
          });
        });
        foregroundListenerBound = true;
      }

      return token;
    } catch (error) {
      console.warn("[MIMI Push] init fallo:", error?.message ?? error);
      setPushDiagnostic("token_error", {
        message: errorText(error),
        code: error?.code || ""
      });
        pushTokenPromises.delete(promiseKey);
      return null;
    }
    })());
  }

  return pushTokenPromises.get(promiseKey);
}
