import { appConfig } from "../config.js";

let client = null;
let authSubscription = null;

const AUTH_REDIRECT_KEY = "mimi_services_auth_redirect_in_progress";
const AUTH_INTENT_KEY = "mimi_services_auth_intent";
const ACTIVE_MODE_KEY = "mimi_services_active_mode";
const CLIENT_AUTH_STORAGE_KEY = "mimi_services_client_auth";
const PROVIDER_AUTH_STORAGE_KEY = "mimi_services_provider_auth";
const PROVIDER_AUTH_LOCK_KEY = "mimi_services_provider_auth_lock";
const CLIENT_AUTH_LOCK_KEY = "mimi_services_client_auth_lock";

function currentPageName() {
  const cleanPath = window.location.pathname.replace(/\/+$/, "");
  return cleanPath.split("/").pop() || "";
}

function safeMode(value = null) {
  return value === "provider" ? "provider" : "client";
}

function servicesBasePath() {
  const origin = window.location.origin;
  const isGithubPages = origin.includes("github.io");

  // GitHub Pages
  if (isGithubPages) {
    return "/mimi-transporte/mimi-servicios/";
  }

  // Vercel / dominio propio
  return "/mimi-servicios/";
}

function servicePageUrl(pageName) {
  return new URL(`${servicesBasePath()}${pageName}`, window.location.origin).toString();
}

function authCallbackUrl(mode = "client", targetPage = "cliente.html") {
  const modeName = safeMode(mode);
  const callbackPage = modeName === "provider" ? "auth-provider-callback.html" : "auth-callback.html";
  const url = new URL(`${servicesBasePath()}${callbackPage}`, window.location.origin);
  const target = modeName === "provider" ? "prestador.html" : "cliente.html";

  url.searchParams.set("appRole", modeName);
  url.searchParams.set("returnTo", target === "prestador.html" ? "/prestador" : "/servicios");
  url.searchParams.set("target", targetPage === "prestador.html" && modeName === "provider" ? "prestador.html" : target);

  return url.toString();
}

function projectRefFromUrl() {
  try {
    return new URL(appConfig.supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function authStorageKey(mode = currentEntryMode()) {
  return safeMode(mode) === "provider" ? PROVIDER_AUTH_STORAGE_KEY : CLIENT_AUTH_STORAGE_KEY;
}

function authStorageKeys(mode = currentEntryMode()) {
  const ref = projectRefFromUrl();
  const roleStorageKey = authStorageKey(mode);
  const roleKeys = Array.from(new Set([
    roleStorageKey,
    CLIENT_AUTH_STORAGE_KEY,
    PROVIDER_AUTH_STORAGE_KEY
  ]));

  return [
    ...roleKeys,
    ...roleKeys.map((key) => `${key}-code-verifier`),
    ...(ref
      ? [
          `sb-${ref}-auth-token`,
          `sb-${ref}-auth-token-code-verifier`
        ]
      : [])
  ];
}

export function forceCleanSession(mode = currentEntryMode()) {
  try {
    authSubscription?.unsubscribe?.();
    authSubscription = null;
    authStorageKeys(mode).forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    localStorage.removeItem(AUTH_INTENT_KEY);
    sessionStorage.removeItem(PROVIDER_AUTH_LOCK_KEY);
    localStorage.removeItem(PROVIDER_AUTH_LOCK_KEY);
    sessionStorage.removeItem(CLIENT_AUTH_LOCK_KEY);
    localStorage.removeItem(CLIENT_AUTH_LOCK_KEY);
    client = null;
  } catch {
    // noop
  }
}

function isInvalidRefreshTokenError(error) {
  const message = String(error?.message || error?.name || error || "").toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

export function hasSupabaseEnv() {
  return Boolean(
    appConfig.supabaseUrl &&
    appConfig.supabaseAnonKey &&
    window.supabase?.createClient
  );
}

export function getSupabaseClient() {
  if (client) {
    return client;
  }

  if (!hasSupabaseEnv()) {
    return null;
  }

  const mode = currentEntryMode();

  client = window.supabase.createClient(
    appConfig.supabaseUrl,
    appConfig.supabaseAnonKey,
    {
      auth: {
        storageKey: authStorageKey(mode),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      },
      global: {
        headers: {
          "x-client-info": "mimi-servicios-web"
        }
      }
    }
  );

  return client;
}

export async function recoverSessionSafely() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  let result = null;
  try {
    result = await supabase.auth.getSession();
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      forceCleanSession();
      return null;
    }
    throw error;
  }

  const { data, error } = result;

  if (error) {
    console.warn("[auth] sesión inválida, limpiando", error);

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // noop
    }

    forceCleanSession();
    return null;
  }

  return data?.session ?? null;
}

export async function getCurrentSession() {
  return recoverSessionSafely();
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

function currentEntryMode(explicitMode = null) {
  if (explicitMode === "provider" || explicitMode === "client") {
    return explicitMode;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const appRole = params.get("appRole") || params.get("mode");
    if (appRole === "provider" || appRole === "client") return appRole;
  } catch {
    // noop
  }

  const page = currentPageName().toLowerCase();
  if (page === "prestador" || page === "prestador.html" || page === "auth-provider-callback.html") {
    return "provider";
  }

  return "client";
}

export function clearAuthRedirectIntent() {
  try {
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    localStorage.removeItem(AUTH_INTENT_KEY);
    sessionStorage.removeItem(PROVIDER_AUTH_LOCK_KEY);
    localStorage.removeItem(PROVIDER_AUTH_LOCK_KEY);
    sessionStorage.removeItem(CLIENT_AUTH_LOCK_KEY);
    localStorage.removeItem(CLIENT_AUTH_LOCK_KEY);
  } catch {
    // noop
  }
}

function setAuthRedirectIntent(mode = currentEntryMode()) {
  const safe = safeMode(mode);
  const redirectTarget = safe === "provider" ? "prestador.html" : "cliente.html";
  const lockKey = safe === "provider" ? PROVIDER_AUTH_LOCK_KEY : CLIENT_AUTH_LOCK_KEY;
  const oppositeLockKey = safe === "provider" ? CLIENT_AUTH_LOCK_KEY : PROVIDER_AUTH_LOCK_KEY;
  const lockPayload = JSON.stringify({
    mode: safe,
    target: redirectTarget,
    startedAt: Date.now()
  });

  try {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectTarget);
    sessionStorage.setItem(AUTH_INTENT_KEY, safe);
    localStorage.setItem(AUTH_INTENT_KEY, safe);
    localStorage.setItem(ACTIVE_MODE_KEY, safe);
    sessionStorage.setItem(ACTIVE_MODE_KEY, safe);
    sessionStorage.setItem(lockKey, lockPayload);
    localStorage.setItem(lockKey, lockPayload);
    sessionStorage.removeItem(oppositeLockKey);
    localStorage.removeItem(oppositeLockKey);
  } catch {
    // noop
  }
}

export function hasProviderAuthIntent() {
  try {
    return (
      sessionStorage.getItem(AUTH_REDIRECT_KEY) === "prestador.html" ||
      sessionStorage.getItem(AUTH_REDIRECT_KEY) === "./prestador.html" ||
      sessionStorage.getItem(AUTH_INTENT_KEY) === "provider" ||
      localStorage.getItem(AUTH_INTENT_KEY) === "provider" ||
      Boolean(sessionStorage.getItem(PROVIDER_AUTH_LOCK_KEY)) ||
      Boolean(localStorage.getItem(PROVIDER_AUTH_LOCK_KEY))
    );
  } catch {
    return false;
  }
}

export async function signInWithGoogle(options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const mode = currentEntryMode(options?.mode);
  const redirectTarget = mode === "provider" ? "prestador.html" : "cliente.html";
  const redirectTo = authCallbackUrl(mode, redirectTarget);

  console.log("[MIMI servicios auth] redirectTo:", redirectTo);

  setAuthRedirectIntent(mode);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: false,
      queryParams: {
        prompt: "select_account"
      }
    }
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut(mode = currentEntryMode()) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    forceCleanSession(mode);
  }

  return true;
}

export function subscribeToAuthChanges(callback) {
  const supabase = getSupabaseClient();
  if (!supabase || typeof callback !== "function") {
    return null;
  }

  authSubscription?.unsubscribe?.();

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      forceCleanSession();
    }

    callback(event, session ?? null);
  });

  authSubscription = data?.subscription ?? null;
  return authSubscription;
}

export async function resolveSessionRole(session) {
  if (!session?.user?.id) {
    return "client";
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("svc_providers")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return "provider";
    }
  }

  const metadataRole =
    session?.user?.app_metadata?.role ||
    session?.user?.user_metadata?.role ||
    "client";

  return metadataRole === "provider" ? "provider" : "client";
}

export async function redirectAfterLoginByRole(session) {
  const entryMode = currentEntryMode();
  const providerIntent = hasProviderAuthIntent();
  const preferred =
    sessionStorage.getItem(AUTH_REDIRECT_KEY) ||
    (providerIntent
      ? "prestador.html"
      : null);

  const preferredPage = String(preferred || "").replace(/^\.\//, "");
  const currentPage = currentPageName();

  if (entryMode === "provider" || providerIntent || (
    preferredPage === "prestador.html" ||
    preferredPage === "prestador" ||
    currentPage === "prestador.html" ||
    currentPage === "prestador"
  )) {
    clearAuthRedirectIntent();

    if (currentPage !== "prestador.html" && currentPage !== "prestador") {
      window.location.href = servicePageUrl("prestador.html");
    }

    return;
  }

  let targetPage = "cliente.html";

  clearAuthRedirectIntent();

  if (
    currentPage === targetPage ||
    (currentPage === "prestador" && targetPage === "prestador.html") ||
    (currentPage === "cliente" && targetPage === "cliente.html") ||
    (currentPage === "servicios" && targetPage === "cliente.html")
  ) {
    return;
  }

  window.location.href = servicePageUrl(targetPage);
}

export async function invokeFunction(name, body = {}, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    ...options
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function callRpc(name, params = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc(name, params);

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchTable(table, queryBuilder) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const query = queryBuilder(supabase.from(table));
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchSingle(table, queryBuilder) {
  const rows = await fetchTable(table, queryBuilder);
  return rows[0] ?? null;
}
