import { appConfig } from "../config.js";

let client;

export function getSupabaseClient() {
  if (client) return client;
  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey || !window.supabase?.createClient) return null;
  client = window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return client;
}

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function invokeFunction(name, body) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

export async function callRpc(name, params) {
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
