import { appConfig } from "./config.js";

let client = null;

export function hasSupabaseEnv() {
  return Boolean(
    appConfig.supabaseUrl &&
    appConfig.supabaseAnonKey &&
    window.supabase?.createClient
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
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
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

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session ?? null;
}

export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user ?? null;
}

export async function invokeFunction(name, body = {}, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    ...options
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

export async function insertRow(table, payload, options = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const query = supabase.from(table).insert(payload);
  const finalQuery = options.select ? query.select(options.select) : query;
  const { data, error } = await finalQuery;

  if (error) throw error;
  return data ?? null;
}

export async function updateRows(table, values, queryBuilder) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const query = queryBuilder(supabase.from(table).update(values));
  const { data, error } = await query;

  if (error) throw error;
  return data ?? null;
}
