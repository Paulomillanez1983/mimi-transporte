/**
 * MIMI Admin - Supabase Client (PRODUCTION)
 * Cliente exclusivo para panel admin.
 * No crea perfil de chofer.
 * No reutiliza storage del driver.
 */

const SUPABASE_URL = "https://xrphpqmutvadjrucqicn.supabase.co";
const SUPABASE_ANON_KEY =
  "TU_SUPABASE_ANON_KEY";

class SupabaseAdminService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initialized && this.client) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (!window.supabase?.createClient) {
          throw new Error("La librería de Supabase no está cargada");
        }

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "TU_SUPABASE_ANON_KEY") {
          throw new Error("Falta configurar SUPABASE_URL o SUPABASE_ANON_KEY");
        }

        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "mimi-admin-auth"
          }
        });

        this.client.auth.onAuthStateChange((event, session) => {
          console.log("[MIMI Admin Auth]", event, {
            userId: session?.user?.id || null,
            email: session?.user?.email || null
          });
        });

        this.initialized = true;
        return true;
      } catch (err) {
        console.error("[SupabaseAdminService.init]", err);
        this.client = null;
        this.initialized = false;
        return false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async getSession() {
    const ready = await this.init();
    if (!ready || !this.client?.auth) return null;

    const { data, error } = await this.client.auth.getSession();
    if (error) {
      console.error("[SupabaseAdminService.getSession]", error);
      return null;
    }

    return data?.session || null;
  }

  async getUser() {
    const ready = await this.init();
    if (!ready || !this.client?.auth) return null;

    const { data, error } = await this.client.auth.getUser();
    if (error) {
      console.error("[SupabaseAdminService.getUser]", error);
      return null;
    }

    return data?.user || null;
  }

  async signOut() {
    if (!this.client?.auth) return;
    const { error } = await this.client.auth.signOut();
    if (error) {
      console.error("[SupabaseAdminService.signOut]", error);
      throw error;
    }
  }

  async requireActiveAdmin() {
    const ready = await this.init();
    if (!ready || !this.client) {
      return { ok: false, reason: "init_failed" };
    }

    const session = await this.getSession();
    const user = session?.user || null;

    if (!user?.id) {
      return { ok: false, reason: "no_session" };
    }

    const { data, error } = await this.client
      .from("admin_users")
      .select("user_id, email, full_name, active, is_super_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseAdminService.requireActiveAdmin]", error);
      return { ok: false, reason: "admin_lookup_error", error };
    }

    if (!data) {
      return { ok: false, reason: "not_admin" };
    }

    if (!data.active) {
      return { ok: false, reason: "inactive_admin", admin: data };
    }

    return {
      ok: true,
      user,
      admin: data,
      session
    };
  }
}

const supabaseAdminService = new SupabaseAdminService();
export default supabaseAdminService;
