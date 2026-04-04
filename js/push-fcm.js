import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import supabaseService from "./supabase-client.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY",
  authDomain: "mimi-transporte.firebaseapp.com",
  projectId: "mimi-transporte",
  storageBucket: "mimi-transporte.firebasestorage.app",
  messagingSenderId: "1066211116754",
  appId: "1:1066211116754:web:8cfb14cfb15ecd0cb28f0b",
};

const VAPID_KEY =
  "BPcP-yGxjeXhO4PoDzy_4qfrlsy52DFRMWJJj5AjF935xmxQX8rg2S7vA5qtDKqWnLLzglEnrTi36JTsNOtmcQ4";

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

let foregroundListenerBound = false;

export async function initPushFCM(rol) {
  try {
    if (!("serviceWorker" in navigator)) {
      console.warn("No hay service worker disponible");
      return null;
    }

    if (!supabaseService.client) {
      console.warn("Supabase no inicializado. Inicializando...");
      await supabaseService.init();
    }

    const supabase = supabaseService.client;

    if (!supabase) {
      console.error("Supabase client sigue siendo null");
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Permiso notificaciones denegado");
      return null;
    }

    const existingReg = await navigator.serviceWorker.getRegistration(
      "/mimi-transporte/firebase-messaging-sw.js"
    );

    const reg =
      existingReg ||
      (await navigator.serviceWorker.register(
        "/mimi-transporte/firebase-messaging-sw.js"
      ));

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });

    if (!token) {
      console.warn("No se pudo obtener token FCM");
      return null;
    }

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id || null;

    if (!userId) {
      console.warn("No hay usuario autenticado para guardar token push");
      return null;
    }

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    const { data, error } = await supabase
      .from("push_tokens")
      .upsert(
        {
          user_id: userId,
          rol,
          token,
          device: isMobile ? "mobile" : "desktop",
          updated_at: new Date().toISOString(),
          platform: navigator.userAgent,
        },
        { onConflict: "token" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error guardando token en Supabase:", error);
      return null;
    }

    console.log("✅ Token FCM guardado en Supabase:", data);

    if (!foregroundListenerBound) {
      onMessage(messaging, (payload) => {
        console.log("📩 Push en foreground:", payload);
      });
      foregroundListenerBound = true;
    }

    return token;
  } catch (err) {
    console.error("❌ Error initPushFCM:", err);
    return null;
  }
}
