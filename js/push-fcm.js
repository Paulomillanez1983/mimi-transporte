import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY",
  authDomain: "mimi-transporte.firebaseapp.com",
  projectId: "mimi-transporte",
  storageBucket: "mimi-transporte.firebasestorage.app",
  messagingSenderId: "1066211116754",
  appId: "1:1066211116754:web:8cfb14cfb15ecd0cb28f0b"
};

const FIREBASE_VAPID_KEY = "BKjAYoEwolpGEXVXpLRRBD5zHdkBbCHaUo9QgwFoPAULSdPn7qt8RNsMHAT2RrJtQpBsO3sRfMOHhFh1YBTfKSo".trim();

let initialized = false;
let foregroundListenerBound = false;
const PUSH_PROMPT_DISMISSED_KEY = "mimi_client_push_prompt_dismissed_v1";

function getAppBasePath() {
  const path = window.location.pathname || "/";
  return path.endsWith("/") ? path : path.replace(/[^/]*$/, "");
}

function getSwPath() {
  return `${getAppBasePath()}firebase-messaging-sw.js`;
}

function normalizeSupportRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();

  if (role === "chofer" || role === "driver") return "chofer";
  return "cliente";
}

function isDuplicateError(error) {
  const text = JSON.stringify(error || {}).toLowerCase();
  return (
    text.includes("duplicate") ||
    text.includes("409") ||
    text.includes("23505") ||
    text.includes("unique")
  );
}

async function upsertPushToken({ userId, token, accessToken }) {
  if (!userId || !token || !accessToken) {
    console.warn("[push-support] faltan datos para guardar token", {
      hasUserId: !!userId,
      hasToken: !!token,
      hasAccessToken: !!accessToken
    });
    return null;
  }

  const supportRole = normalizeSupportRole(window.__mimiSupportPushRole || "cliente");

  const payload = {
    user_id: userId,
    rol: supportRole,
    token,
    platform: "web",
    updated_at: new Date().toISOString()
  };

  const upsertResult = await window.supabaseUpsert?.("push_tokens", payload, "token");

  if (!upsertResult?.error) {
    console.log("[push-support] token guardado correctamente");
    return upsertResult?.data || null;
  }

  if (!isDuplicateError(upsertResult.error)) {
    console.warn("[push-support] upsert falló", upsertResult.error);
    return null;
  }

  const updateResult = await window.supabaseUpdate?.(
    "push_tokens",
    "token",
    token,
    {
      user_id: userId,
      rol: supportRole,
      platform: "web",
      updated_at: new Date().toISOString()
    }
  );

  if (updateResult?.error) {
    console.warn("[push-support] tampoco se pudo actualizar token", updateResult.error);
    return null;
  }

  console.log("[push-support] token actualizado correctamente");
  return updateResult?.data || null;
}

function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission || "default";
}

function markPushPromptDismissed(userId) {
  if (!userId) return;

  try {
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, String(userId));
  } catch (_) {}
}

function clearPushPromptDismissed(userId) {
  if (!userId) return;

  try {
    const current = localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY);
    if (current === String(userId)) {
      localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
    }
  } catch (_) {}
}

function wasPushPromptDismissed(userId) {
  if (!userId) return false;

  try {
    return localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === String(userId);
  } catch (_) {
    return false;
  }
}

export async function initSupportPushFCM(options = {}) {
  try {
    if (window.__APP_ROLE__ !== "chofer") {
      console.log("[push-fcm] no es chofer, cancelando");
      return null;
    }

    if (window.__PUSH_ACTIVE__) {
      console.log("[push-fcm] push ya inicializado globalmente");
      return null;
    }

    if (initialized) {
      console.log("[push-fcm] ya inicializado");
      return null;
    }

    const {
      promptIfNeeded = false,
      forcePrompt = false
    } = options || {};

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      console.warn("[push-fcm] Firebase Messaging no soportado en este navegador");
      return null;
    }

    if (!window.obtenerSesionCliente) {
      console.warn("[push-support] obtenerSesionCliente no disponible todavía");
      return null;
    }

    const session = await window.obtenerSesionCliente(false);
    if (!session?.user?.id || !session?.access_token) {
      console.warn("[push-support] no hay sesión cliente activa");
      return null;
    }

    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      console.warn("[push-support] browser sin soporte de SW/Notification");
      return null;
    }

    let permission = getNotificationPermission();
    console.log("[push-support] notification permission before init:", permission);

    if (permission === "default") {
      if (!promptIfNeeded) {
        console.log("[push-support] permiso pendiente; init silenciosa sin prompt");
        return null;
      }

      if (!forcePrompt && wasPushPromptDismissed(session.user.id)) {
        console.log("[push-support] prompt ya pospuesto para este usuario");
        return null;
      }

      permission = await Notification.requestPermission();
      console.log("[push-support] notification permission after prompt:", permission);

      if (permission === "granted") {
        clearPushPromptDismissed(session.user.id);
      } else {
        markPushPromptDismissed(session.user.id);
      }
    }

    if (permission !== "granted") {
      console.warn("[push-support] permiso de notificaciones no concedido");
      return null;
    }

    clearPushPromptDismissed(session.user.id);

    window.__PUSH_ACTIVE__ = true;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    const swRegistration = await navigator.serviceWorker.register(getSwPath(), {
      scope: getAppBasePath()
    });

    if (!FIREBASE_VAPID_KEY || FIREBASE_VAPID_KEY === "ACA_TU_VAPID_KEY") {
      console.error("[push-support] Falta configurar FIREBASE_VAPID_KEY");
      window.__PUSH_ACTIVE__ = false;
      return null;
    }

    console.log("[push-support] href:", window.location.href);
    console.log("[push-support] origin:", window.location.origin);
    console.log("[push-support] hostname:", window.location.hostname);
    console.log("[push-support] sw path:", getSwPath());
    console.log("[push-support] scope:", getAppBasePath());
    console.log("[push-support] apiKey:", firebaseConfig.apiKey);
    console.log("[push-support] projectId:", firebaseConfig.projectId);
    console.log("[push-support] senderId:", firebaseConfig.messagingSenderId);
    console.log("[push-support] appId:", firebaseConfig.appId);
    console.log("[push-support] vapid:", FIREBASE_VAPID_KEY);

    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    if (!token) {
      console.warn("[push-support] Firebase no devolvió token");
      window.__PUSH_ACTIVE__ = false;
      return null;
    }

    console.log("[push-support] token FCM:", token);

    await upsertPushToken({
      userId: session.user.id,
      token,
      accessToken: session.access_token
    });

    if (!foregroundListenerBound) {
      onMessage(messaging, (payload) => {
        console.log("[push-support] foreground message", payload);

        const messageId =
          payload?.data?.message_id ||
          payload?.data?.messageId ||
          null;

        if (typeof window.handleSupportPushForeground === "function") {
          window.handleSupportPushForeground({
            messageId,
            title: payload?.notification?.title || payload?.data?.title || "Soporte",
            body: payload?.notification?.body || payload?.data?.body || "Tenés una nueva respuesta de soporte."
          });
        }
      });

      foregroundListenerBound = true;
    }

    initialized = true;
    console.log("[push-fcm] initPushFCM OK");
    return token;
  } catch (err) {
    window.__PUSH_ACTIVE__ = false;
    console.error("[push-fcm] init error:", err);
    return null;
  }
}

export function resetSupportPushFCMState() {
  initialized = false;
  window.__PUSH_ACTIVE__ = false;
}

window.initSupportPushFCM = initSupportPushFCM;
window.getSupportPushPermissionState = getNotificationPermission;
window.resetSupportPushFCMState = resetSupportPushFCMState;
