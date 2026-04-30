import { appConfig } from "../config.js";

let client = null;
let authSubscription = null;

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
    sessionStorage.removeItem("mimi_services_auth_redirect_in_progress");
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

export async function signInWithGoogle() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const isProviderEntry = /^(prestador|prestador\.html)$/i.test(currentPageName());
  const redirectTarget = isProviderEntry ? "prestador.html" : "cliente.html";
  const redirectTo = servicePageUrl(redirectTarget);

  sessionStorage.setItem(
    "mimi_services_auth_redirect_in_progress",
    redirectTarget
  );

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
  const preferred = sessionStorage.getItem(
    "mimi_services_auth_redirect_in_progress"
  );

  const preferredPage = String(preferred || "").replace(/^\.\//, "");
  const currentPage = currentPageName();

  if (
    preferredPage === "prestador.html" ||
    currentPage === "prestador.html" ||
    currentPage === "prestador"
  ) {
    sessionStorage.removeItem("mimi_services_auth_redirect_in_progress");

    if (currentPage !== "prestador.html") {
      window.location.href = servicePageUrl("prestador.html");
    }

    return;
  }

  const role = await resolveSessionRole(session);

  let targetPage = role === "provider" ? "prestador.html" : "cliente.html";

  if (preferredPage === "cliente.html") {
    targetPage = "cliente.html";
  }

  sessionStorage.removeItem("mimi_services_auth_redirect_in_progress");

  if (
    currentPage === targetPage ||
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
