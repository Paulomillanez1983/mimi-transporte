/**
 * MIMI Driver - Supabase Client (PRODUCTION FINAL HARDENED)
 */

import CONFIG from "./config.js";

class SupabaseClient {
  constructor() {
    this.client = null;
    this.channels = new Map();

    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8;
    this.reconnectTimer = null;

    this.session = null;

    this.userId = null;
    this.userEmail = null;
    this.driverId = null;

    this.profileEnsured = false;
    this.profileEnsuring = false;

    this._initPromise = null;
    this.authSubscription = null;
  }

  // =========================================================
  // INIT
  // =========================================================
async init() {
  if (this._initPromise) return this._initPromise;

  this._initPromise = (async () => {
    console.log("[Supabase] Initializing...");

    const ok = await this._waitForSupabaseLib();
    if (!ok) return null;

    this.client = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "mimi-driver-auth",
          flowType: "pkce",
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      }
    );

    await this._loadSession();

    if (!this.authSubscription) {
      const { data } = this.client.auth.onAuthStateChange(
        async (event, session) => {
          this.session = session || null;
          this.userId = session?.user?.id || null;
          this.userEmail = session?.user?.email || null;

          console.log("[Supabase] Auth event:", event);

          this.profileEnsured = false;
          this.profileEnsuring = false;
          this.driverId = null;

          if (!this.userId) {
            this.unsubscribeAll();
            return;
          }

          await this.ensureDriverProfile();
        }
      );

      this.authSubscription = data?.subscription || null;
    }

    if (this.userId) {
      await this.ensureDriverProfile();
    }

    console.log("[Supabase] Ready");
    return this.client;
  })();

  return this._initPromise;
}

async _waitForSupabaseLib(timeoutMs = 8000) {
  const start = Date.now();

  while (!window.supabase?.createClient) {
    await new Promise((r) => setTimeout(r, 100));
    if (Date.now() - start > timeoutMs) return false;
  }

  return true;
}
  async _loadSession() {
    const { data } = await this.client.auth.getSession();
    this.session = data?.session || null;
    this.userId = this.session?.user?.id || null;
    this.userEmail = this.session?.user?.email || null;
  }

  // =========================================================
  // DRIVER PROFILE (ANTI RACE)
  // =========================================================
  async ensureDriverProfile() {
    if (!this.client || !this.userId) return;

    if (this.profileEnsured && this.driverId) {
      return { ok: true, cached: true };
    }

    if (this.profileEnsuring) {
      await new Promise(r => setTimeout(r, 300));
      return { ok: true, pending: true };
    }

    this.profileEnsuring = true;

    try {
      const { data: existing } = await this.client
        .from("choferes")
        .select("id_uuid")
        .eq("user_id", this.userId)
        .maybeSingle();

      if (existing?.id_uuid) {
        this.driverId = existing.id_uuid;
        this.profileEnsured = true;
        return { ok: true };
      }

      const { data: userData } = await this.client.auth.getUser();

      const payload = {
        user_id: this.userId,
        email: userData?.user?.email,
        nombre: userData?.user?.email || "Chofer",
        online: false,
        disponible: true,
        bloqueado: false,
        last_seen_at: new Date().toISOString(),
      };

      const { data: created, error } = await this.client
        .from("choferes")
        .upsert(payload, { onConflict: "user_id" })
        .select("id_uuid")
        .single();

      if (error) throw error;

      this.driverId = created.id_uuid;
      this.profileEnsured = true;

      return { ok: true };
    } catch (err) {
      console.error("[Supabase] ensureDriverProfile error:", err);
      return { ok: false };
    } finally {
      this.profileEnsuring = false;
    }
  }

  // =========================================================
  // REALTIME (HARDENED)
  // =========================================================
  subscribeToOffers(callbacks) {
    if (!this.client || !this.driverId) return;

    const name = `offers:${this.driverId}`;
    this.unsubscribe(name);

    const channel = this.client
      .channel(name)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "viaje_ofertas",
          filter: `chofer_id=eq.${this.driverId}`,
        },
        (payload) => {
          callbacks?.onOffer?.(payload);
        }
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") {
          this._handleReconnect(callbacks);
        }
      });

    this.channels.set(name, channel);
  }

  subscribeToTrips(callbacks) {
    if (!this.client || !this.driverId) return;

    const name = `trips:${this.driverId}`;
    this.unsubscribe(name);

    const channel = this.client
      .channel(name)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "viajes",
          filter: `chofer_id_uuid=eq.${this.driverId}`, // 🔥 FIX IMPORTANTE
        },
        (payload) => {
          callbacks?.onTrip?.(payload);
        }
      )
      .subscribe();

    this.channels.set(name, channel);
  }

  unsubscribe(name) {
    const ch = this.channels.get(name);
    if (ch) {
      try { ch.unsubscribe(); } catch {}
      this.channels.delete(name);
    }
  }

  unsubscribeAll() {
    this.channels.forEach((c) => {
      try { c.unsubscribe(); } catch {}
    });
    this.channels.clear();
  }

  // =========================================================
  // DB OPERATIONS (OPTIMIZED)
  // =========================================================
  async updateDriverLocation(position) {
    if (!this.client || !this.driverId) return;

    await this.client
      .from("choferes")
      .update({
        lat: position.lat,
        lng: position.lng,
        heading: position.heading,
        speed: position.speed,
        accuracy: position.accuracy,
        last_location_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id_uuid", this.driverId);
  }

  async setDriverOnline(isOnline) {
    if (!this.client || !this.driverId) return;

    await this.client
      .from("choferes")
      .update({
        online: isOnline,
        disponible: isOnline,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id_uuid", this.driverId);
  }

  // =========================================================
  // RPC
  // =========================================================
  async acceptOffer(tripId) {
    return this.client.rpc("aceptar_oferta_viaje", {
      p_viaje_id: tripId,
      p_chofer_id: this.driverId,
    });
  }

  async rejectOffer(tripId) {
    return this.client.rpc("rechazar_oferta_viaje", {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId,
    });
  }

  async startTrip(tripId) {
    return this.client.rpc("iniciar_viaje", {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId,
    });
  }

  async completeTrip(tripId) {
    return this.client.rpc("completar_viaje", {
      p_viaje_id: tripId,
      p_chofer_id_uuid: this.driverId,
    });
  }

  // =========================================================
  // RECONNECT
  // =========================================================
  _handleReconnect(callbacks) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);

    clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(() => {
      console.log("[Supabase] Reconnecting...");

      this.subscribeToOffers(callbacks);
      this.subscribeToTrips(callbacks);
    }, delay);
  }
}

export default new SupabaseClient();
