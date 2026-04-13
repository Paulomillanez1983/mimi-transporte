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

  console.log("[push-support] intentando guardar token:", {
    user_id: payload.user_id,
    rol: payload.rol,
    platform: payload.platform,
    token_preview: `${String(token).slice(0, 12)}...${String(token).slice(-10)}`
  });

  const insertResult = await window.supabaseInsert?.("push_tokens", payload, accessToken);
  console.log("[push-support] insert result:", insertResult);

  if (!insertResult?.error) {
    console.log("[push-support] token guardado correctamente");
    return insertResult?.data || null;
  }

  if (!isDuplicateError(insertResult.error)) {
    console.warn("[push-support] insert falló con error no duplicado", insertResult.error);
    return null;
  }

  console.warn("[push-support] insert duplicado, intento update por token");

  const updateResult = await window.supabaseUpdate?.(
    "push_tokens",
    "token",
    token,
    {
      user_id: userId,
      rol: supportRole,
      platform: "web",
      updated_at: new Date().toISOString()
    },
    accessToken
  );

  console.log("[push-support] update result:", updateResult);

  if (updateResult?.error) {
    console.warn("[push-support] tampoco se pudo actualizar token", updateResult.error);
    return null;
  }

  console.log("[push-support] token actualizado correctamente");
  return updateResult?.data || null;
}

export async function initSupportPushFCM() {
  try {
    if (initialized) {
      console.log("[push-support] ya inicializado");
      return null;
    }

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

    const permission = await Notification.requestPermission();
    console.log("[push-support] notification permission:", permission);

    if (permission !== "granted") {
      console.warn("[push-support] permiso de notificaciones no concedido");
      return null;
    }

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

window.initSupportPushFCM = initSupportPushFCM;
