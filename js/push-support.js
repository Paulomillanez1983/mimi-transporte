import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "TU_FIREBASE_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
};

const VAPID_KEY = "TU_FIREBASE_WEB_PUSH_CERTIFICATE_KEY_PAIR";

let messagingInstance = null;

async function upsertPushToken({ userId, token }) {
  if (!userId || !token || !window.supabaseInsert) return;

  const payload = {
    user_id: userId,
    rol: "client",
    token,
    platform: "web",
    updated_at: new Date().toISOString()
  };

  const session = await window.obtenerSesionCliente?.(true);

  if (!session?.access_token) {
    console.warn("[push-support] sin sesión para guardar push token");
    return;
  }

  const { error } = await window.supabaseInsert("push_tokens", payload, session.access_token);

  if (error) {
    console.warn("[push-support] no se pudo guardar token", error);
  } else {
    console.log("[push-support] token guardado");
  }
}

export async function initSupportPushFCM() {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("[push-support] FCM no soportado en este navegador");
      return;
    }

    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      console.warn("[push-support] navegador sin soporte SW/Notification");
      return;
    }

    const session = await window.obtenerSesionCliente?.(true);
    if (!session?.user?.id) {
      console.warn("[push-support] usuario no logueado");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[push-support] permiso denegado");
      return;
    }

    const app = initializeApp(firebaseConfig);
    messagingInstance = getMessaging(app);

    const swRegistration = await navigator.serviceWorker.register(
      "/mimi-transporte/firebase-messaging-sw.js",
      { scope: "/mimi-transporte/" }
    );

    const currentToken = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    if (!currentToken) {
      console.warn("[push-support] no se obtuvo token FCM");
      return;
    }

    await upsertPushToken({
      userId: session.user.id,
      token: currentToken
    });

    onMessage(messagingInstance, (payload) => {
      console.log("[push-support] mensaje foreground", payload);

      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "Soporte";

      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        "Tenés una nueva respuesta de soporte.";

      if (window.notif?.show) {
        window.notif.show(title, body, "success", 4500);
      }

      if (typeof window.actualizarCentroNotificacionesViaje === "function") {
        window.actualizarCentroNotificacionesViaje({
          estado: "SOPORTE",
          texto: body
        });
      }
    });

    console.log("[push-support] FCM inicializado OK");
  } catch (err) {
    console.error("[push-support] init error", err);
  }
}
