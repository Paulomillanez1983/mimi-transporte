import { appConfig } from "../config.js";

let client = null;
let authSubscription = null;

const AUTH_REDIRECT_KEY = "mimi_services_auth_redirect_in_progress";
const AUTH_INTENT_KEY = "mimi_services_auth_intent";

function currentPageName() {
  const cleanPath = window.location.pathname.replace(/\/+$/, "");
  return cleanPath.split("/").pop() || "";
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
  const safeMode = mode === "provider" ? "provider" : "client";
  const callbackPage = safeMode === "provider" ? "auth-provider-callback.html" : "auth-callback.html";
  const url = new URL(`${servicesBasePath()}${callbackPage}`, window.location.origin);
  const safeTarget = safeMode === "provider" ? "prestador.html" : "cliente.html";

  if (safeMode === "provider") {
    return url.toString();
  }

  url.searchParams.set("mode", safeMode);
  url.searchParams.set("target", targetPage === "prestador.html" ? "prestador.html" : safeTarget);

  return url.toString();
}

function projectRefFromUrl() {
  try {
    return new URL(appConfig.supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function authStorageKeys() {
  const ref = projectRefFromUrl();
  if (!ref) return [];

  return [
    `sb-${ref}-auth-token`,
    `sb-${ref}-auth-token-code-verifier`
  ];
}

export function forceCleanSession() {
  try {
    authStorageKeys().forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    localStorage.removeItem(AUTH_INTENT_KEY);
  } catch {
    // noop
  }
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

  client = window.supabase.createClient(
    appConfig.supabaseUrl,
    appConfig.supabaseAnonKey,
    {
      auth: {
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

  const { data, error } = await supabase.auth.getSession();

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

  const page = currentPageName().toLowerCase();
  if (page === "prestador" || page === "prestador.html") {
    return "provider";
  }

  return "client";
}

export function clearAuthRedirectIntent() {
  try {
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    localStorage.removeItem(AUTH_INTENT_KEY);
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
      sessionStorage.getItem("mimi_services_active_mode") === "provider" ||
      localStorage.getItem("mimi_services_active_mode") === "provider"
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

  try {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectTarget);
    sessionStorage.setItem(AUTH_INTENT_KEY, mode);
    localStorage.setItem(AUTH_INTENT_KEY, mode);
    localStorage.setItem("mimi_services_active_mode", mode);
    sessionStorage.setItem("mimi_services_active_mode", mode);
  } catch {
    // noop
  }

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

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    forceCleanSession();
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
  const preferred =
    sessionStorage.getItem(AUTH_REDIRECT_KEY) ||
    (sessionStorage.getItem(AUTH_INTENT_KEY) === "provider" ||
    localStorage.getItem(AUTH_INTENT_KEY) === "provider"
      ? "prestador.html"
      : null);

  const preferredPage = String(preferred || "").replace(/^\.\//, "");
  const currentPage = currentPageName();

  if (
    preferredPage === "prestador.html" ||
    preferredPage === "prestador" ||
    currentPage === "prestador.html" ||
    currentPage === "prestador"
  ) {
    clearAuthRedirectIntent();

    if (currentPage !== "prestador.html" && currentPage !== "prestador") {
      window.location.href = servicePageUrl("prestador.html");
    }

    return;
  }

  const role = await resolveSessionRole(session);

  let targetPage = role === "provider" ? "prestador.html" : "cliente.html";

  if (preferredPage === "cliente.html") {
    targetPage = "cliente.html";
  }

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
