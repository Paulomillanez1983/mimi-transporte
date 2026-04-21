import { appConfig } from "../../config.js";

let client = null;

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

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
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

export async function getProviderProfileByUserId(userId) {
  if (!userId) return null;

  return fetchSingle("svc_providers", (query) =>
    query
      .select("id,user_id,full_name,email,phone,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_seen_at")
      .eq("user_id", userId)
      .limit(1)
  );
}

export async function getCurrentProviderContext() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      session: null,
      user: null,
      provider: null,
    };
  }

  const session = await getCurrentSession();
  const provider = await getProviderProfileByUserId(user.id);

  return {
    session,
    user,
    provider,
  };
}
