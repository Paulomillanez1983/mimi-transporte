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
  const isGithubPages = window.location.hostname === "paulomillanez1983.github.io";
  return isGithubPages ? "/mimi-transporte/" : "/";
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

  console.log("[push-support] upsert token:", {
    user_id: payload.user_id,
    rol: payload.rol,
    platform: payload.platform,
    token_preview: `${String(token).slice(0, 12)}...${String(token).slice(-10)}`
  });

  try {
    const { data, error } = await supabaseService.client
      .from("push_tokens")
      .upsert(payload, { onConflict: "token" })
      .select()
      .single();

    if (error) {
      console.error("[push-support] upsert error:", error);
      return null;
    }

    console.log("[push-support] token guardado correctamente");
    return data;
  } catch (err) {
    console.error("[push-support] fallo upsert:", err);
    return null;
  }
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
    if (initialized) {
      console.log("[push-support] ya inicializado");
      return null;
    }

    const {
      promptIfNeeded = false,
      forcePrompt = false
    } = options || {};

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      console.warn("[push-support] Firebase Messaging no soportado en este navegador");
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

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    const swRegistration = await navigator.serviceWorker.register(getSwPath(), {
      scope: getAppBasePath()
    });

    if (!FIREBASE_VAPID_KEY || FIREBASE_VAPID_KEY === "ACA_TU_VAPID_KEY") {
      console.error("[push-support] Falta configurar FIREBASE_VAPID_KEY");
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
    console.log("[push-support] initSupportPushFCM OK");
    return token;
  } catch (err) {
    console.error("[push-support] init error:", err);
    return null;
  }
}

export function resetSupportPushFCMState() {
  initialized = false;
}

window.initSupportPushFCM = initSupportPushFCM;
window.getSupportPushPermissionState = getNotificationPermission;
window.resetSupportPushFCMState = resetSupportPushFCMState;
