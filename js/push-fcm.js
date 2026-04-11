import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import supabaseService from './supabase-client.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDNrB9kyK_adPItK911AuRdv_r8WnvxAjY',
  authDomain: 'mimi-transporte.firebaseapp.com',
  projectId: 'mimi-transporte',
  storageBucket: 'mimi-transporte.firebasestorage.app',
  messagingSenderId: '1066211116754',
  appId: '1:1066211116754:web:8cfb14cfb15ecd0cb28f0b'
};

const FIREBASE_VAPID_KEY = "rhsJPi1DonGDISx6gRMNWX1WSDaPFVQ2mMV9KR3U4-0".trim();
const SERVICE_WORKER_PATH = '/mimi-transporte/firebase-messaging-sw.js';

const app = initializeApp(firebaseConfig);

let messagingInstance = null;
let foregroundListenerBound = false;
let initInFlight = null;
let lastSavedToken = null;

function safeRole(value) {
  const rol = String(value || '').trim().toLowerCase();
  if (rol === 'chofer' || rol === 'cliente' || rol === 'admin') return rol;
  return 'cliente';
}

function detectDeviceType() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    ? 'mobile'
    : 'desktop';
}

async function getMessagingSafe() {
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    console.warn('[push-fcm] Firebase Messaging no soportado en este navegador');
    return null;
  }

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }

  return messagingInstance;
}

async function ensureSupabase() {
  if (!supabaseService.client) {
    await supabaseService.init();
  }
  return supabaseService.client || null;
}

async function ensureServiceWorkerRegistration() {
  const existingReg = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);
  if (existingReg) return existingReg;

  const reg = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
  await navigator.serviceWorker.ready;
  return reg;
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('[push-fcm] Notification API no disponible');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.warn('[push-fcm] Permiso de notificaciones denegado previamente');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  return permission;
}

function bindForegroundListenerOnce(messaging) {
  if (foregroundListenerBound) return;

  onMessage(messaging, (payload) => {
    try {
      console.log('[push-fcm] Push en foreground:', payload);

      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        'Nueva notificación';

      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        '';

      window.dispatchEvent(
        new CustomEvent('pushForegroundMessage', {
          detail: {
            title,
            body,
            payload
          }
        })
      );
    } catch (err) {
      console.error('[push-fcm] Error en onMessage:', err);
    }
  });

  foregroundListenerBound = true;
}

async function getAuthenticatedUserId(supabase) {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[push-fcm] Error obteniendo usuario autenticado:', error);
    return null;
  }

  return data?.user?.id || null;
}

async function upsertPushToken({ supabase, userId, rol, token }) {
  const payload = {
    user_id: userId,
    rol: safeRole(rol),
    token,
    device: detectDeviceType(),
    updated_at: new Date().toISOString(),
    platform: navigator.userAgent
  };

  const { data, error } = await supabase
    .from('push_tokens')
    .upsert(payload, { onConflict: 'token' })
    .select()
    .single();

  if (error) {
    console.error('[push-fcm] Error guardando token en Supabase:', error);
    return null;
  }

  return data;
}

export async function initPushFCM(rol = 'cliente') {
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        console.warn('[push-fcm] Service Worker no disponible');
        return null;
      }

      const supabase = await ensureSupabase();
      if (!supabase) {
        console.error('[push-fcm] Supabase no inicializado');
        return null;
      }

      const messaging = await getMessagingSafe();
      if (!messaging) return null;

      const permission = await ensureNotificationPermission();
      if (permission !== 'granted') {
        console.warn('[push-fcm] Permiso de notificaciones no concedido:', permission);
        return null;
      }

      const registration = await ensureServiceWorkerRegistration();

       const token = await getToken(messaging, {
        vapidKey: FIREBASE_VAPID_KEY,
       serviceWorkerRegistration: registration
      });
      if (!token) {
        console.warn('[push-fcm] No se pudo obtener token FCM');
        return null;
      }

      bindForegroundListenerOnce(messaging);

      const userId = await getAuthenticatedUserId(supabase);
      if (!userId) {
        console.warn('[push-fcm] No hay usuario autenticado para guardar token push');
        return null;
      }

      if (lastSavedToken === token) {
        console.log('[push-fcm] Token ya guardado en esta sesión');
        return token;
      }

      const saved = await upsertPushToken({
        supabase,
        userId,
        rol,
        token
      });

      if (!saved) {
        return null;
      }

      lastSavedToken = token;
      console.log('[push-fcm] Token FCM guardado correctamente:', saved);

      return token;
    } catch (err) {
      console.error('[push-fcm] Error initPushFCM:', err);
      return null;
    } finally {
      initInFlight = null;
    }
  })();

  return initInFlight;
}
