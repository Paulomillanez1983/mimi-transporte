const FIREBASE_CONFIG = window.MIMI_FIREBASE_CONFIG || {
  apiKey: "AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY",
  authDomain: "mimi-transporte.firebaseapp.com",
  projectId: "mimi-transporte",
  storageBucket: "mimi-transporte.firebasestorage.app",
  messagingSenderId: "1066211116754",
  appId: "1:1066211116754:web:8cfb14cfb15ecd0cb28f0b"
};

const VAPID_KEY =
  window.MIMI_FIREBASE_VAPID_KEY ||
  "BKHvLJ5xJM9pJdPmOhq2JcXg_W7Oqmsy-qqZYsKtgHvD9QnCKbqJ8JnbBtV5xBp4kGV7c8mZ5Q9QmZpL3hX7dY8";

let pushTokenPromise = null;

export async function getMimiPushToken({ prompt = true } = {}) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    console.info("[MIMI Push] Browser no soporta web push");
    return null;
  }

  if (Notification.permission === "denied") return null;
  if (!prompt && Notification.permission !== "granted") return null;

  pushTokenPromise ??= (async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const [{ initializeApp }, { getMessaging, getToken, onMessage }] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js")
      ]);

      let permission = Notification.permission;
      if (permission === "default" && prompt) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        console.info("[MIMI Push] permiso de notificaciones:", permission);
        return null;
      }

      const app = initializeApp(FIREBASE_CONFIG);
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) return null;

      onMessage(messaging, (payload) => {
        if (!payload?.notification && !payload?.data) return;
        registration.showNotification(payload.notification?.title || payload.data?.title || "MIMI", {
          body: payload.notification?.body || payload.data?.body || "",
          icon: "./assets/icons/mimigo-client-icon-192.png",
          badge: "./assets/icons/mimigo-client-icon-32.png",
          tag: payload.data?.tag || `mimi-foreground-${Date.now()}`,
          data: payload.data || {}
        });
      });

      return token;
    } catch (error) {
      console.warn("[MIMI Push] init fallo:", error?.message ?? error);
      pushTokenPromise = null;
      return null;
    }
  })();

  return pushTokenPromise;
}
