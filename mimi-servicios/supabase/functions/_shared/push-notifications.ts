import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SupabaseAdmin = ReturnType<typeof createClient>;

type PushNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  fallbackTag?: string;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function toPushData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value ?? "")]),
  );
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function serviceAccountFromEnv(): FirebaseServiceAccount | null {
  const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        return parsed as FirebaseServiceAccount;
      }
    } catch {
      // fallback to split envs below
    }
  }

  const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") || "";
  const privateKey = (Deno.env.get("FIREBASE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function firebaseAccessToken(serviceAccount: FirebaseServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.access_token) {
    throw new Error(`firebase_token_failed:${JSON.stringify(result).slice(0, 220)}`);
  }
  cachedAccessToken = {
    token: String(result.access_token),
    expiresAt: now + Number(result.expires_in || 3600),
  };
  return cachedAccessToken.token;
}

async function sendPushMessage(
  token: string,
  notification: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const serviceAccount = serviceAccountFromEnv();
  const title = String(notification.title || payload.title || "MIMI Servicios");
  const body = String(notification.body || payload.body || "Tenes una novedad en MIMI.");
  const tag = String(payload.tag || `mimi-svc-${notification.id || Date.now()}`);

  if (serviceAccount) {
    const accessToken = await firebaseAccessToken(serviceAccount);
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: toPushData({ ...payload, title, body, tag }),
            android: {
              priority: "HIGH",
              notification: {
                sound: "default",
                channel_id: "mimi_services",
              },
            },
            webpush: {
              headers: { Urgency: "high" },
              notification: {
                title,
                body,
                icon: "/mimi-servicios/assets/icons/icon-192.png",
                badge: "/mimi-servicios/assets/icons/favicon-32.png",
                tag,
                renotify: true,
              },
              fcm_options: {
                link: String(payload.url || "/mimi-servicios/cliente.html"),
              },
            },
          },
        }),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`firebase_v1_failed:${JSON.stringify(result).slice(0, 500)}`);
    }
    return String(result?.name || "");
  }

  const serverKey = Deno.env.get("FCM_SERVER_KEY") || Deno.env.get("FIREBASE_SERVER_KEY") || "";
  if (!serverKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_OR_FCM_SERVER_KEY_MISSING");

  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Authorization": `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      priority: "high",
      notification: {
        title,
        body,
        icon: "/mimi-servicios/assets/icons/icon-192.png",
        tag,
      },
      data: toPushData(payload),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || Number(result?.failure || 0) > 0) {
    throw new Error(`firebase_legacy_failed:${JSON.stringify(result).slice(0, 500)}`);
  }
  return String(result?.results?.[0]?.message_id || result?.message_id || "");
}

export async function dispatchPushDeliveries(
  admin: SupabaseAdmin,
  notification: Record<string, unknown> | null,
  userId: string,
  payload: Record<string, unknown>,
) {
  if (!notification?.id || !userId) return;

  try {
    const { data: devices, error } = await admin
      .from("svc_user_devices")
      .select("id,push_token,platform")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("notifications_enabled", true)
      .not("push_token", "is", null);

    if (error) throw error;
    if (!devices?.length) return;

    let sent = 0;
    let failed = 0;

    for (const device of devices) {
      const token = String(device.push_token || "").trim();
      if (!token) continue;

      let status = "QUEUED";
      let providerMessageId: string | null = null;
      let errorMessage: string | null = null;
      let sentAt: string | null = null;

      try {
        providerMessageId = await sendPushMessage(token, notification, payload);
        status = "SENT";
        sent += 1;
        sentAt = new Date().toISOString();
      } catch (sendError) {
        status = "FAILED";
        failed += 1;
        errorMessage = sendError instanceof Error ? sendError.message : "push_send_failed";
      }

      await admin.from("svc_notification_deliveries").insert({
        notification_id: notification.id,
        user_device_id: device.id,
        channel: "PUSH",
        status,
        provider_message_id: providerMessageId,
        error_message: errorMessage,
        sent_at: sentAt,
        provider_status: status,
      });
    }

    await admin
      .from("svc_notifications")
      .update({
        delivery_status: sent === devices.length ? "SENT" : sent > 0 ? "PARTIAL" : failed > 0 ? "FAILED" : "PENDING",
        delivered_at: sent > 0 ? new Date().toISOString() : null,
      })
      .eq("id", notification.id);
  } catch (error) {
    console.warn("push dispatch skipped:", error);
  }
}

export async function createUserNotificationWithPush(
  admin: SupabaseAdmin,
  input: PushNotificationInput,
) {
  if (!input.userId) return null;

  const dataJson = input.data ?? {};
  const { data: notification, error } = await admin
    .from("svc_notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data_json: dataJson,
    })
    .select("*")
    .single();

  if (error) {
    console.warn("notification insert skipped:", error);
    return null;
  }

  await dispatchPushDeliveries(admin, notification, input.userId, {
    type: input.type,
    title: input.title,
    body: input.body,
    tag: input.fallbackTag || input.type,
    notification_id: notification.id,
    ...dataJson,
  });

  return notification;
}
