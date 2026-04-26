const SUPABASE_URL = "https://xrphpqmutvadjrucqicn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM";

class SupabaseAdminService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.initPromise = null;
    this.authListenerRegistered = false;
    this.lastSession = null;

    this.waitForActiveAdmin = async (timeoutMs = 3200) => {
      const ready = await this.init();
      if (!ready || !this.client?.auth) {
        return { ok: false, reason: "init_failed" };
      }

      const first = await this.requireActiveAdmin();
      if (first?.ok) {
        return first;
      }

      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));

        const next = await this.requireActiveAdmin();
        if (next?.ok) {
          return next;
        }
      }

      return first;
    };
  }

  isConfigured() {
    return Boolean(
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_ANON_KEY !== "TU_ANON_KEY" &&
      SUPABASE_ANON_KEY !== "TU_ANON_KEY_REAL"
    );
  }

  isSupabaseLoaded() {
    return Boolean(window.supabase && typeof window.supabase.createClient === "function");
  }

  getBaseUrl() {
    return window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
  }

  getRedirectUrl(path = "./admin-panel.html") {
    return new URL(path, this.getBaseUrl()).toString();
  }

  async init() {
    if (this.initialized && this.client) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (!this.isSupabaseLoaded()) {
          throw new Error("La librería de Supabase no está cargada.");
        }

        if (!this.isConfigured()) {
          throw new Error("Falta configurar SUPABASE_URL o SUPABASE_ANON_KEY.");
        }

        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "mimi-admin-auth",
            flowType: "pkce"
          }
        });

        if (!this.authListenerRegistered) {
          this.client.auth.onAuthStateChange((event, session) => {
            this.lastSession = session || null;

            console.log("[MIMI Admin Auth]", event, {
              userId: session?.user?.id || null,
              email: session?.user?.email || null
            });

            if (event === "SIGNED_OUT") {
              this.lastSession = null;
            }
          });

          this.authListenerRegistered = true;
        }

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

    try {
      const { data, error } = await this.client.auth.getSession();

      if (error) {
        console.error("[SupabaseAdminService.getSession]", error);
        return null;
      }

      const session = data?.session || null;
      this.lastSession = session;
      return session;
    } catch (err) {
      console.error("[SupabaseAdminService.getSession.catch]", err);
      return null;
    }
  }

  async validateAccessToken(session) {
    const ready = await this.init();
    if (!ready || !this.client?.auth || !session?.access_token) return null;

    try {
      const { data, error } = await this.client.auth.getUser(session.access_token);

      if (error || !data?.user) {
        console.warn("[SupabaseAdminService.validateAccessToken]", error || "token invalido");
        return null;
      }

      const validated = {
        ...session,
        user: data.user
      };

      this.lastSession = validated;
      return validated;
    } catch (err) {
      console.error("[SupabaseAdminService.validateAccessToken.catch]", err);
      return null;
    }
  }

  async refreshSessionIfNeeded() {
    const ready = await this.init();
    if (!ready || !this.client?.auth) return null;

    const currentSession = await this.getSession();
    if (!currentSession) {
      return null;
    }

    const validatedCurrent = await this.validateAccessToken(currentSession);
    if (validatedCurrent) {
      return validatedCurrent;
    }

    if (!currentSession?.refresh_token) {
      return null;
    }

    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: currentSession.refresh_token
      });

      if (error) {
        console.error("[SupabaseAdminService.refreshSessionIfNeeded]", error);
        return null;
      }

      const refreshed = data?.session || null;
      if (!refreshed) {
        return null;
      }

      const validatedRefreshed = await this.validateAccessToken(refreshed);
      if (!validatedRefreshed) {
        return null;
      }

      this.lastSession = validatedRefreshed;
      return validatedRefreshed;
    } catch (err) {
      console.error("[SupabaseAdminService.refreshSessionIfNeeded.catch]", err);
      return null;
    }
  }

  async getUser() {
    const session = await this.refreshSessionIfNeeded();
    return session?.user || null;
  }

  async signInWithGoogle() {
    const ready = await this.init();
    if (!ready || !this.client?.auth) {
      throw new Error("No pudimos inicializar Supabase.");
    }

    const redirectTo = this.getRedirectUrl("./admin-panel.html");

    const { error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account"
        }
      }
    });

    if (error) {
      console.error("[SupabaseAdminService.signInWithGoogle]", error);
      throw error;
    }
  }

  async signOut() {
    const ready = await this.init();
    if (!ready || !this.client?.auth) return;

    try {
      const { error } = await this.client.auth.signOut();

      if (error) {
        console.error("[SupabaseAdminService.signOut]", error);
        throw error;
      }

      this.lastSession = null;
    } catch (err) {
      console.error("[SupabaseAdminService.signOut.catch]", err);
      throw err;
    }
  }

async requireActiveAdmin() {
  const ready = await this.init();
  if (!ready || !this.client) {
    return { ok: false, reason: "init_failed" };
  }

  const session = await this.refreshSessionIfNeeded();
  const user = session?.user || null;

  if (!user?.id) {
    return { ok: false, reason: "no_session" };
  }

  try {
    const { data, error } = await this.client
      .from("admin_users")
      .select("user_id, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

       if (error) {
         console.error("[SupabaseAdminService.requireActiveAdmin]", error);
         return { ok: false, reason: "admin_lookup_error", error };
       }

       if (!data) {
         return { ok: false, reason: "not_admin" };
       }

       return {
         ok: true,
         user,
         admin: {
           ...data,
           email: user.email || null,
           full_name:
             user.user_metadata?.full_name ||
             user.user_metadata?.name ||
             user.email ||
             null,
           avatar_url:
             user.user_metadata?.avatar_url ||
             user.user_metadata?.picture ||
             null,
           is_super_admin: false
         },
         session
       };
     } catch (err) {
       console.error("[SupabaseAdminService.requireActiveAdmin.catch]", err);
       return { ok: false, reason: "unexpected_error", error: err };
     }
   }
 }

const supabaseAdminService = new SupabaseAdminService();
export default supabaseAdminService;
