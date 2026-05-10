import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};
const REQUEST_TIMEOUT_MS = 15000;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 240;
const DEFAULT_APP_URL = "/mimi-transporte/";
const DEFAULT_ICON_URL = "/mimi-transporte/assets/icons/icon-192x192.png";
const DEFAULT_BADGE_URL = "/mimi-transporte/assets/icons/icon-192x192.png";
const DEFAULT_TAG = "mimi-driver-notification";
/**
 * IMPORTANTE:
 * Si tu tabla real NO se llama push_tokens,
 * cambiá este valor por el nombre correcto.
 *
 * Ejemplo si usás:
 * const PUSH_TOKENS_TABLE = "chofer_push_subscriptions";
 */ const PUSH_TOKENS_TABLE = "push_tokens";
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}
function base64url(input) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++){
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for(let i = 0; i < bytes.byteLength; i++){
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sanitizeString(value, fallback = "") {
  if (value == null) return fallback;
  return String(value).trim();
}
function truncate(value, max) {
  return value.length > max ? value.slice(0, max) : value;
}
function buildTimeoutSignal(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort("timeout"), ms);
  return {
    signal: controller.signal,
    clear: ()=>clearTimeout(timeoutId)
  };
}
function isTokenDeadError(rawError) {
  const text = String(rawError || "").toLowerCase();
  return text.includes("unregistered") || text.includes("registration-token-not-registered") || text.includes("invalid argument") || text.includes("requested entity was not found") || text.includes("not a valid fcm registration token");
}
function normalizeRelativeUrl(value) {
  const url = sanitizeString(value, DEFAULT_APP_URL);
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
    return url;
  }
  return DEFAULT_APP_URL;
}
function sanitizeDataObject(input) {
  const safeData = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [key, value] of Object.entries(input)){
      safeData[String(key)] = String(value ?? "");
    }
  }
  safeData.url = normalizeRelativeUrl(safeData.url || safeData.click_action || DEFAULT_APP_URL);
  safeData.click_action = safeData.url;
  return safeData;
}
async function getAccessToken() {
  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  let projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  let clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  let privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");

  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      projectId = projectId || parsed.project_id || parsed.projectId;
      clientEmail = clientEmail || parsed.client_email || parsed.clientEmail;
      privateKey = privateKey || parsed.private_key || parsed.privateKey;
    } catch (err) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON invalido: " + (err?.message || String(err)));
    }
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Faltan secrets Firebase HTTP v1: FIREBASE_SERVICE_ACCOUNT_JSON o FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const unsignedToken = `${encHeader}.${encPayload}`;
  const cryptoKey = await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(privateKey), {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsignedToken));
  const encSignature = arrayBufferToBase64Url(signature);
  const jwt = `${unsignedToken}.${encSignature}`;
  const timeout = buildTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      }),
      signal: timeout.signal
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok || !data?.access_token) {
      throw new Error("Error token OAuth: " + JSON.stringify(data));
    }
    return {
      access_token: data.access_token,
      projectId
    };
  } finally{
    timeout.clear();
  }
}
async function sendMessageToToken(accessToken, projectId, token, title, body, data = {}) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const clickUrl = normalizeRelativeUrl(data?.url || data?.click_action || DEFAULT_APP_URL);
  const tag = data?.viaje_id || data?.trip_id || data?.tag || DEFAULT_TAG;
  const payload = {
    message: {
      token,
      notification: {
        title,
        body
      },
      data: {
        ...data,
        url: clickUrl,
        click_action: clickUrl,
        title,
        body,
        tag
      },
      webpush: {
        headers: {
          TTL: "60",
          Urgency: "high"
        },
        notification: {
          title,
          body,
          icon: data?.icon || DEFAULT_ICON_URL,
          badge: data?.badge || DEFAULT_BADGE_URL,
          tag,
          renotify: true,
          requireInteraction: true
        },
        fcm_options: {
          link: clickUrl
        }
      }
    }
  };
  const timeout = buildTimeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: timeout.signal
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) {
      throw new Error(JSON.stringify(json));
    }
    return json;
  } finally{
    timeout.clear();
  }
}
async function registrarEventoPush(supabase, payload) {
  try {
    if (!supabase || !payload.viaje_id) return;
    await supabase.from("viaje_eventos").insert({
      id: crypto.randomUUID(),
      viaje_id: payload.viaje_id,
      chofer_id_uuid: payload.chofer_id_uuid ?? null,
      tipo: payload.tipo,
      payload: payload.data ?? {},
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn("[send-push] no se pudo registrar viaje_eventos:", err);
  }
}
async function cleanupDeadTokens(supabase, deadTokens) {
  try {
    if (!supabase || deadTokens.length === 0) return;
    await supabase.from(PUSH_TOKENS_TABLE).delete().in("token", deadTokens);
  } catch (cleanupErr) {
    console.warn("[send-push] no se pudieron limpiar tokens muertos:", cleanupErr);
  }
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      ok: false,
      error: "Método no permitido"
    }, 405);
  }
  let supabaseAdmin = null;
  try {
    const internalKey = sanitizeString(req.headers.get("x-internal-key"));
    const expectedInternalKey = sanitizeString(
      Deno.env.get("PUSH_INTERNAL_KEY") || Deno.env.get("INTERNAL_WORKER_SECRET")
    );
    if (!expectedInternalKey) {
      return jsonResponse({
        ok: false,
        error: "Falta configurar PUSH_INTERNAL_KEY en secrets"
      }, 500);
    }
    if (!internalKey || internalKey !== expectedInternalKey) {
      return jsonResponse({
        ok: false,
        error: "No autorizado"
      }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({
        ok: false,
        error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
      }, 500);
    }
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false
      }
    });
    let requestBody = null;
    try {
      requestBody = await req.json();
    } catch  {
      return jsonResponse({
        ok: false,
        error: "Body JSON inválido"
      }, 400);
    }
    const token = sanitizeString(requestBody?.token);
    const tokens = Array.isArray(requestBody?.tokens) ? requestBody.tokens.map((t)=>sanitizeString(t)).filter(Boolean) : [];
    const title = truncate(sanitizeString(requestBody?.title), MAX_TITLE_LENGTH);
    const msgBody = truncate(sanitizeString(requestBody?.body), MAX_BODY_LENGTH);
    const viajeId = sanitizeString(requestBody?.viaje_id || requestBody?.trip_id || null, "") || null;
    const choferId = sanitizeString(requestBody?.chofer_id || requestBody?.chofer_id_uuid || requestBody?.driver_id || null, "") || null;
    if (!title) {
      return jsonResponse({
        ok: false,
        error: "Falta title"
      }, 400);
    }
    if (!msgBody) {
      return jsonResponse({
        ok: false,
        error: "Falta body"
      }, 400);
    }
    const tokenList = [
      ...token ? [
        token
      ] : [],
      ...tokens
    ].map((t)=>t.trim()).filter(Boolean);
    const uniqueTokenList = [
      ...new Set(tokenList)
    ];
    if (!uniqueTokenList.length) {
      return jsonResponse({
        ok: false,
        error: "Falta token o tokens"
      }, 400);
    }
    const safeData = sanitizeDataObject(requestBody?.data);
    const { access_token, projectId } = await getAccessToken();
    const results = [];
    const errors = [];
    const deadTokens = [];
    for (const tk of uniqueTokenList){
      try {
        const result = await sendMessageToToken(access_token, projectId, tk, title, msgBody, safeData);
        results.push({
          token: tk,
          ok: true,
          result
        });
      } catch (err) {
        const message = err?.message || String(err);
        if (isTokenDeadError(message)) {
          deadTokens.push(tk);
        }
        errors.push({
          token: tk,
          ok: false,
          error: message
        });
      }
    }
    await registrarEventoPush(supabaseAdmin, {
      viaje_id: viajeId,
      chofer_id_uuid: choferId,
      tipo: errors.length ? "push_enviada_con_errores" : "push_enviada",
      data: {
        title,
        body: msgBody,
        sent: results.length,
        failed: errors.length,
        dead_tokens: deadTokens.length
      }
    });
    await cleanupDeadTokens(supabaseAdmin, deadTokens);
    return jsonResponse({
      ok: errors.length === 0,
      sent: results.length,
      failed: errors.length,
      results,
      errors,
      dead_tokens: deadTokens
    });
  } catch (err) {
    console.error("[send-push] fatal error:", err);
    return jsonResponse({
      ok: false,
      error: err?.message || String(err)
    }, 500);
  }
});
