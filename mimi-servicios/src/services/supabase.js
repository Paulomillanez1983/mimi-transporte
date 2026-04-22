import { appConfig } from "../../config.js";

let client = null;

function currentPageName() {
  return window.location.pathname.split("/").pop() || "";
}

export function hasSupabaseEnv() {
  return Boolean(
    appConfig.supabaseUrl &&
    appConfig.supabaseAnonKey &&
    window.supabase?.createClient,
  );
}

export function getSupabaseClient() {
  if (client) return client;
  if (!hasSupabaseEnv()) return null;

  client = window.supabase.createClient(
    appConfig.supabaseUrl,
    appConfig.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
      global: {
        headers: {
          "x-client-info": "mimi-servicios-web",
        },
      },
    },
  );

  return client;
}

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session ?? null;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function signInWithGoogle() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const redirectTarget = currentPageName() === "prestador.html"
    ? "./prestador.html"
    : "./cliente.html";
  const redirectTo = new URL(redirectTarget, window.location.href).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
}

export function subscribeToAuthChanges(callback) {
  const supabase = getSupabaseClient();
  if (!supabase || typeof callback !== "function") return null;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session ?? null);
  });

  return data?.subscription ?? null;
}

export function resolveSessionRole(session) {
  const role =
    session?.user?.app_metadata?.role ||
    session?.user?.user_metadata?.role ||
    "client";

  return role === "provider" ? "provider" : "client";
}

export function redirectAfterLoginByRole(session) {
  const role = resolveSessionRole(session);
  const target = role === "provider" ? "./prestador.html" : "./cliente.html";
  const currentPath = currentPageName();
  if (currentPath === target.replace("./", "")) return;
  window.location.href = target;
}

export async function invokeFunction(name, body = {}, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    ...options,
  });

  if (error) throw error;
  return data;
}

export async function callRpc(name, params = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export async function fetchTable(table, queryBuilder) {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const query = queryBuilder(supabase.from(table));
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchSingle(table, queryBuilder) {
  const rows = await fetchTable(table, queryBuilder);
  return rows[0] ?? null;
}
