import supabaseService from "./supabase-client.js";

const TRIP_CHAT = {
  role: window.__APP_ROLE__ === "chofer" ? "driver" : "client",
  initialized: false,
  overlay: null,
  sheet: null,
  body: null,
  input: null,
  sendBtn: null,
  title: null,
  subtitle: null,
  status: null,
  activeTicketId: null,
  activeTripId: null,
  activeChannel: null,
  activeContext: null,
  unreadCount: 0,
  badgeClient: null,
  badgeDriver: null,
  sending: false,
  audioEnabled: false,
  audioCtx: null,
  lastSoundAt: 0
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatHour(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  if (value === "driver" || value === "chofer") return "driver";
  return "client";
}

function setStatus(text = "") {
  if (TRIP_CHAT.status) {
    TRIP_CHAT.status.textContent = text;
  }
}

function cacheBadgeRefs() {
  TRIP_CHAT.badgeClient = document.getElementById("tripChatBadgeClient");
  TRIP_CHAT.badgeDriver = document.getElementById("tripChatBadgeDriver");
}

function getActiveBadgeEl() {
  cacheBadgeRefs();
  return TRIP_CHAT.role === "driver"
    ? TRIP_CHAT.badgeDriver
    : TRIP_CHAT.badgeClient;
}

function setChatBadge(count = 0) {
  const badge = getActiveBadgeEl();
  if (!badge) return;

  const safeCount = Number(count) || 0;

  if (safeCount <= 0) {
    badge.hidden = true;
    badge.textContent = "";
    badge.classList.remove("has-count");
    return;
  }

  badge.hidden = false;

  if (safeCount === 1) {
    badge.textContent = "";
    badge.classList.remove("has-count");
    return;
  }

  badge.textContent = safeCount > 9 ? "9+" : String(safeCount);
  badge.classList.add("has-count");
}

function canPlaySound() {
  return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
}

function enableIncomingMessageAudio() {
  if (!canPlaySound()) return;

  try {
    if (!TRIP_CHAT.audioCtx) {
      TRIP_CHAT.audioCtx = new window.AudioContext();
    }

    if (TRIP_CHAT.audioCtx.state === "suspended") {
      TRIP_CHAT.audioCtx.resume().catch(() => {});
    }

    TRIP_CHAT.audioEnabled = true;
  } catch (err) {
    console.warn("[trip-chat.audio] no se pudo habilitar audio", err);
  }
}

function playIncomingMessageSound() {
  const now = Date.now();

  if (!TRIP_CHAT.audioEnabled) return;
  if (!TRIP_CHAT.audioCtx) return;
  if (now - TRIP_CHAT.lastSoundAt < 600) return;

  TRIP_CHAT.lastSoundAt = now;

  try {
    const ctx = TRIP_CHAT.audioCtx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.connect(ctx.destination);

    // Volumen alto pero controlado
    master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();

    osc1.type = "sine";
    osc2.type = "triangle";
    osc3.type = "sine";

    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.10);

    osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.20);

    osc3.frequency.setValueAtTime(1560, ctx.currentTime + 0.12);
    osc3.frequency.exponentialRampToValueAtTime(1240, ctx.currentTime + 0.28);

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const g3 = ctx.createGain();

    g1.gain.setValueAtTime(0.0001, ctx.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.50, ctx.currentTime + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);

    g2.gain.setValueAtTime(0.0001, ctx.currentTime + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.30, ctx.currentTime + 0.09);
    g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);

    g3.gain.setValueAtTime(0.0001, ctx.currentTime + 0.11);
    g3.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.15);
    g3.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);

    osc1.connect(g1).connect(master);
    osc2.connect(g2).connect(master);
    osc3.connect(g3).connect(master);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.05);
    osc3.start(ctx.currentTime + 0.11);

    osc1.stop(ctx.currentTime + 0.26);
    osc2.stop(ctx.currentTime + 0.36);
    osc3.stop(ctx.currentTime + 0.44);

    if (navigator?.vibrate) {
      navigator.vibrate([70, 30, 70]);
    }
  } catch (err) {
    console.warn("[trip-chat.audio] no se pudo reproducir sonido", err);
  }
}

function ensureUI() {
  if (TRIP_CHAT.initialized) {
    cacheBadgeRefs();
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "trip-chat-overlay";
  overlay.hidden = true;

  const sheet = document.createElement("section");
  sheet.className = "trip-chat-sheet";
  sheet.hidden = true;
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML = `
    <div class="trip-chat-header">
      <div class="trip-chat-title-wrap">
        <h3 class="trip-chat-title">Chat del viaje</h3>
        <div class="trip-chat-subtitle">Cargando...</div>
      </div>
      <button class="trip-chat-close" type="button" aria-label="Cerrar">×</button>
    </div>

    <div class="trip-chat-body">
      <div class="trip-chat-empty">
        Todavía no hay mensajes. Podés escribirle directamente desde acá.
      </div>
    </div>

    <div class="trip-chat-composer">
      <div class="trip-chat-composer-box">
        <textarea
          class="trip-chat-input"
          rows="1"
          placeholder="Escribí un mensaje..."
        ></textarea>
        <button class="trip-chat-send" type="button">Enviar</button>
      </div>
      <div class="trip-chat-status"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  TRIP_CHAT.overlay = overlay;
  TRIP_CHAT.sheet = sheet;
  TRIP_CHAT.body = sheet.querySelector(".trip-chat-body");
  TRIP_CHAT.input = sheet.querySelector(".trip-chat-input");
  TRIP_CHAT.sendBtn = sheet.querySelector(".trip-chat-send");
  TRIP_CHAT.title = sheet.querySelector(".trip-chat-title");
  TRIP_CHAT.subtitle = sheet.querySelector(".trip-chat-subtitle");
  TRIP_CHAT.status = sheet.querySelector(".trip-chat-status");

  cacheBadgeRefs();

  overlay.addEventListener("click", closeTripChat);
  sheet.querySelector(".trip-chat-close")?.addEventListener("click", closeTripChat);

  TRIP_CHAT.input?.addEventListener("input", () => {
    TRIP_CHAT.input.style.height = "auto";
    TRIP_CHAT.input.style.height = `${Math.min(TRIP_CHAT.input.scrollHeight, 140)}px`;
  });

  TRIP_CHAT.input?.addEventListener("focus", enableIncomingMessageAudio);
  TRIP_CHAT.sendBtn?.addEventListener("pointerdown", enableIncomingMessageAudio);
  TRIP_CHAT.sendBtn?.addEventListener("click", sendCurrentMessage);

  TRIP_CHAT.input?.addEventListener("keydown", async (event) => {
    enableIncomingMessageAudio();

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendCurrentMessage();
    }
  });

  TRIP_CHAT.initialized = true;
}

function openUI() {
  ensureUI();

  TRIP_CHAT.overlay.hidden = false;
  TRIP_CHAT.sheet.hidden = false;

  requestAnimationFrame(() => {
    TRIP_CHAT.overlay.classList.add("is-open");
    TRIP_CHAT.sheet.classList.add("is-open");
    TRIP_CHAT.sheet.setAttribute("aria-hidden", "false");
  });

  document.body.style.overflow = "hidden";

  setTimeout(() => {
    TRIP_CHAT.input?.focus();
  }, 180);
}

function closeTripChat() {
  if (!TRIP_CHAT.initialized) return;

  TRIP_CHAT.overlay.classList.remove("is-open");
  TRIP_CHAT.sheet.classList.remove("is-open");
  TRIP_CHAT.sheet.setAttribute("aria-hidden", "true");

  setTimeout(() => {
    if (!TRIP_CHAT.overlay.classList.contains("is-open")) {
      TRIP_CHAT.overlay.hidden = true;
      TRIP_CHAT.sheet.hidden = true;
    }
  }, 280);

  document.body.style.overflow = "";
}

async function getClientSession() {
  if (TRIP_CHAT.role === "driver") {
    await supabaseService.init();
    const sessionData = await supabaseService.client.auth.getSession();
    const session = sessionData?.data?.session || null;

    if (!session?.user) {
      throw new Error("No hay sesión activa de chofer");
    }

    return {
      session,
      client: supabaseService.client,
      user: session.user
    };
  }

  if (!window.sbRealtime?.auth) {
    throw new Error("Cliente realtime no disponible");
  }

  const session = await window.obtenerSesionCliente?.(true);
  if (!session?.user || !session?.access_token) {
    throw new Error("No hay sesión activa de cliente");
  }

  await window.sbRealtime.realtime?.setAuth(session.access_token);

  return {
    session,
    client: window.sbRealtime,
    user: session.user
  };
}

async function resolveDriverAuthUser(driverIdUuid) {
  if (!driverIdUuid) {
    throw new Error("Falta driverIdUuid");
  }

  const { client } = await getClientSession();

  const { data, error } = await client
    .from("choferes")
    .select("id_uuid, user_id, nombre, telefono, email")
    .eq("id_uuid", driverIdUuid)
    .single();

  if (error || !data?.user_id) {
    throw new Error(error?.message || "No se pudo resolver el user_id del chofer");
  }

  return data;
}

async function resolveTripClientContext(trip = {}) {
  const directClientUserId =
    trip?.cliente_auth_id ||
    trip?.cliente_user_id ||
    trip?.user_id ||
    trip?.cliente_id ||
    trip?.client_user_id ||
    trip?.pasajero_user_id ||
    null;

  if (directClientUserId) {
    return {
      clientUserId: directClientUserId,
      clientName: trip?.pasajero_nombre || trip?.cliente_nombre || trip?.cliente || "Cliente"
    };
  }

  const tripId = trip?.id || null;
  if (!tripId) {
    return {
      clientUserId: null,
      clientName: trip?.pasajero_nombre || trip?.cliente_nombre || trip?.cliente || "Cliente"
    };
  }

  const { client } = await getClientSession();
  const { data, error } = await client
    .from("viajes")
    .select(
      "id, cliente_auth_id, cliente_user_id, user_id, cliente_id, client_user_id, pasajero_user_id, pasajero_nombre, cliente_nombre, cliente"
    )
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo releer el viaje para abrir chat");
  }

  return {
    clientUserId:
      data?.cliente_auth_id ||
      data?.cliente_user_id ||
      data?.user_id ||
      data?.cliente_id ||
      data?.client_user_id ||
      data?.pasajero_user_id ||
      null,
    clientName:
      data?.pasajero_nombre ||
      data?.cliente_nombre ||
      data?.cliente ||
      trip?.pasajero_nombre ||
      trip?.cliente_nombre ||
      trip?.cliente ||
      "Cliente"
  };
}

function getParticipantNames(ctx) {
  const isDriver = TRIP_CHAT.role === "driver";

  return {
    me: isDriver ? (ctx.driverName || "Chofer") : (ctx.clientName || "Cliente"),
    other: isDriver ? (ctx.clientName || "Cliente") : (ctx.driverName || "Chofer")
  };
}

async function findOrCreateTripChat(context) {
  const { client, user } = await getClientSession();

  const metadataFilter = {
    thread_kind: "client_driver_trip",
    viaje_id: String(context.tripId),
    client_user_id: String(context.clientUserId),
    driver_user_id: String(context.driverUserId)
  };

  const { data: existing, error: existingError } = await client
    .from("soporte_tickets")
    .select("*")
    .eq("categoria", "viaje")
    .contains("metadata", metadataFilter)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message || "No se pudo consultar el chat del viaje");
  }

  const ticket = Array.isArray(existing) ? existing[0] : null;
  if (ticket?.id) return ticket;

  const subject = `Chat viaje ${context.tripId}`;

  const payload = {
    created_by: user.id,
    user_id: user.id,
    rol_origen: TRIP_CHAT.role === "driver" ? "driver" : "client",
    asunto: subject,
    canal: "in_app",
    categoria: "viaje",
    prioridad: "normal",
    estado: "abierto",
    ultimo_mensaje: "",
    last_message_at: new Date().toISOString(),
    metadata: {
      thread_kind: "client_driver_trip",
      viaje_id: String(context.tripId),
      client_user_id: String(context.clientUserId),
      driver_user_id: String(context.driverUserId),
      driver_id_uuid: String(context.driverIdUuid || ""),
      client_name: context.clientName || "",
      driver_name: context.driverName || "",
      created_by_role: TRIP_CHAT.role,
      created_from: TRIP_CHAT.role,
      opened_by: user.id
    }
  };

  const { data: created, error: createError } = await client
    .from("soporte_tickets")
    .insert(payload)
    .select("*")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message || "No se pudo crear el chat del viaje");
  }

  return created;
}

async function loadMessages(ticketId) {
  const { client } = await getClientSession();

  const { data, error } = await client
    .from("soporte_mensajes")
    .select("id, ticket_id, sender_user_id, sender_role, mensaje, created_at, metadata, leido")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar los mensajes");
  }

  return Array.isArray(data) ? data : [];
}

function renderMessages(messages = []) {
  if (!TRIP_CHAT.body) return;

  if (!messages.length) {
    TRIP_CHAT.body.innerHTML = `
      <div class="trip-chat-empty">
        Todavía no hay mensajes. Podés escribirle directamente desde acá.
      </div>
    `;
    return;
  }

  const currentUserId = String(TRIP_CHAT.activeContext?.meUserId || "");

  TRIP_CHAT.body.innerHTML = messages
    .map((msg) => {
      const mine = String(msg?.sender_user_id || "") === currentUserId;
      const rowClass = mine ? "mine" : "other";
      return `
        <div class="trip-chat-row ${rowClass}" data-message-id="${escapeHtml(msg?.id || "")}">
          <div class="trip-chat-bubble">
            <div>${escapeHtml(msg?.mensaje || "")}</div>
            <div class="trip-chat-time">${escapeHtml(formatHour(msg?.created_at))}</div>
          </div>
        </div>
      `;
    })
    .join("");

  TRIP_CHAT.body.scrollTop = TRIP_CHAT.body.scrollHeight;
}

function appendMessage(message) {
  if (!TRIP_CHAT.body || !message?.id) return;
  if (TRIP_CHAT.body.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) {
    return;
  }

  const currentUserId = String(TRIP_CHAT.activeContext?.meUserId || "");
  const mine = String(message?.sender_user_id || "") === currentUserId;
  const rowClass = mine ? "mine" : "other";

  const row = document.createElement("div");
  row.className = `trip-chat-row ${rowClass}`;
  row.setAttribute("data-message-id", message.id);

  row.innerHTML = `
    <div class="trip-chat-bubble">
      <div>${escapeHtml(message?.mensaje || "")}</div>
      <div class="trip-chat-time">${escapeHtml(formatHour(message?.created_at))}</div>
    </div>
  `;

  const empty = TRIP_CHAT.body.querySelector(".trip-chat-empty");
  if (empty) {
    TRIP_CHAT.body.innerHTML = "";
  }

  TRIP_CHAT.body.appendChild(row);
  TRIP_CHAT.body.scrollTop = TRIP_CHAT.body.scrollHeight;
}

async function refreshUnreadBadge(ticketId) {
  if (!ticketId) {
    TRIP_CHAT.unreadCount = 0;
    setChatBadge(0);
    return;
  }

  try {
    const { client } = await getClientSession();
    const meUserId = String(TRIP_CHAT.activeContext?.meUserId || "");

    const { data, error } = await client
      .from("soporte_mensajes")
      .select("id, sender_user_id, leido")
      .eq("ticket_id", ticketId)
      .eq("leido", false);

    if (error) {
      console.warn("[trip-chat.refreshUnreadBadge]", error);
      return;
    }

    const unread = (Array.isArray(data) ? data : []).filter(
      (msg) => String(msg?.sender_user_id || "") !== meUserId
    ).length;

    TRIP_CHAT.unreadCount = unread;
    setChatBadge(unread);
  } catch (err) {
    console.warn("[trip-chat.refreshUnreadBadge] crash", err);
  }
}

async function markMessagesAsRead(ticketId) {
  if (!ticketId) return;

  try {
    const { client } = await getClientSession();
    const meUserId = String(TRIP_CHAT.activeContext?.meUserId || "");

    const { error } = await client
      .from("soporte_mensajes")
      .update({ leido: true })
      .eq("ticket_id", ticketId)
      .neq("sender_user_id", meUserId)
      .eq("leido", false);

    if (error) {
      console.warn("[trip-chat.markMessagesAsRead]", error);
      return;
    }

    TRIP_CHAT.unreadCount = 0;
    setChatBadge(0);
  } catch (err) {
    console.warn("[trip-chat.markMessagesAsRead] crash", err);
  }
}

async function subscribeRealtime(ticketId) {
  const { client } = await getClientSession();

  if (TRIP_CHAT.activeChannel) {
    try {
      client.removeChannel(TRIP_CHAT.activeChannel);
    } catch {}
    TRIP_CHAT.activeChannel = null;
  }

  TRIP_CHAT.activeChannel = client
    .channel(`trip-chat-${ticketId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "soporte_mensajes",
        filter: `ticket_id=eq.${ticketId}`
      },
      async (payload) => {
        const msg = payload?.new;
        if (!msg?.id) return;

        appendMessage(msg);

        const mine =
          String(msg?.sender_user_id || "") ===
          String(TRIP_CHAT.activeContext?.meUserId || "");

        if (!mine) {
          TRIP_CHAT.unreadCount = (TRIP_CHAT.unreadCount || 0) + 1;
          setChatBadge(TRIP_CHAT.unreadCount);
          playIncomingMessageSound();

          if (TRIP_CHAT.sheet && !TRIP_CHAT.sheet.hidden) {
            await markMessagesAsRead(ticketId);
          }
        }
      }
    )
    .subscribe();
}

async function sendCurrentMessage() {
  if (TRIP_CHAT.sending) return;

  if (!TRIP_CHAT.activeTicketId) {
    console.warn("[trip-chat] intento de enviar sin ticket");
    setStatus("Error al iniciar el chat. Reintentá.");

    try {
      const ticket = await findOrCreateTripChat(TRIP_CHAT.activeContext);
      if (ticket?.id) {
        TRIP_CHAT.activeTicketId = ticket.id;
      } else {
        return;
      }
    } catch (e) {
      console.error("[trip-chat] no se pudo recrear ticket", e);
      return;
    }
  }

  const text = String(TRIP_CHAT.input?.value || "").trim();
  if (!text) return;

  TRIP_CHAT.sending = true;
  TRIP_CHAT.sendBtn.disabled = true;
  setStatus("Enviando...");

  try {
    enableIncomingMessageAudio();

    const { client, user } = await getClientSession();
    const senderRole = TRIP_CHAT.role === "driver" ? "driver" : "client";
    const nowIso = new Date().toISOString();

    const { error: ticketUpdateError } = await client
      .from("soporte_tickets")
      .update({
        ultimo_mensaje: text,
        last_message_at: nowIso,
        estado: "abierto",
        updated_at: nowIso
      })
      .eq("id", TRIP_CHAT.activeTicketId);

    if (ticketUpdateError) {
      console.warn("[trip-chat] update ticket warning:", ticketUpdateError);
    }

    const { data: inserted, error } = await client
      .from("soporte_mensajes")
      .insert({
        ticket_id: TRIP_CHAT.activeTicketId,
        sender_user_id: user.id,
        sender_role: senderRole,
        mensaje: text,
        leido: false,
        mensaje_tipo: "texto",
        metadata: {
          source: "trip_chat",
          viaje_id: String(TRIP_CHAT.activeTripId || ""),
          thread_kind: "client_driver_trip"
        }
      })
      .select("*")
      .single();

    if (error || !inserted?.id) {
      throw new Error(error?.message || "No se pudo enviar el mensaje");
    }

    TRIP_CHAT.input.value = "";
    TRIP_CHAT.input.style.height = "auto";
    appendMessage(inserted);
    setStatus("Mensaje enviado");
    setTimeout(() => setStatus(""), 1200);
  } catch (err) {
    console.error("[trip-chat.sendCurrentMessage]", err);
    setStatus(err?.message || "No se pudo enviar");
  } finally {
    TRIP_CHAT.sending = false;
    TRIP_CHAT.sendBtn.disabled = false;
  }
}

async function openTripChat(context) {
  ensureUI();
  openUI();
  enableIncomingMessageAudio();

  const names = getParticipantNames(context);
  TRIP_CHAT.title.textContent = `Chat con ${names.other}`;
  TRIP_CHAT.subtitle.textContent = `Viaje ${context.tripId}`;
  setStatus("Cargando...");

  TRIP_CHAT.activeContext = {
    ...context,
    meUserId: context.meUserId
  };
  TRIP_CHAT.activeTripId = context.tripId;
  TRIP_CHAT.activeTicketId = null;

  try {
    const ticket = await findOrCreateTripChat(context);
    TRIP_CHAT.activeTicketId = ticket.id;

    const messages = await loadMessages(ticket.id);
    renderMessages(messages);

    await refreshUnreadBadge(ticket.id);
    await markMessagesAsRead(ticket.id);
    await subscribeRealtime(ticket.id);

    setStatus("");
  } catch (err) {
    console.error("[trip-chat.openTripChat]", err);
    setStatus(err?.message || "No se pudo abrir el chat");
    throw err;
  }
}

export async function openTripChatForClientTrip(viaje = {}) {
  const session = await window.obtenerSesionCliente?.(true);
  const clientUserId = session?.user?.id || null;
  const tripId = viaje?.id || window.state?.viajeId || null;
  const driverIdUuid =
    viaje?.assigned_driver_id ||
    viaje?.chofer_id_uuid ||
    window.state?.choferId ||
    null;

  if (!clientUserId) {
    throw new Error("No hay sesión activa");
  }

  if (!tripId) {
    throw new Error("No hay viaje activo para abrir chat");
  }

  if (!driverIdUuid) {
    throw new Error("El chat se habilita cuando un chofer acepta el viaje");
  }

  const driverInfo = await resolveDriverAuthUser(driverIdUuid);

  return openTripChat({
    tripId,
    meUserId: clientUserId,
    clientUserId,
    driverUserId: driverInfo.user_id,
    driverIdUuid,
    clientName: viaje?.cliente_nombre || "Cliente",
    driverName:
      viaje?.chofer_nombre ||
      viaje?.choferNombre ||
      driverInfo.nombre ||
      driverInfo.email ||
      "Chofer"
  });
}

export async function openTripChatForDriverTrip(trip = {}) {
  await supabaseService.init();

  const sessionData = await supabaseService.client.auth.getSession();
  const me = sessionData?.data?.session?.user || null;
  const driverUserId = me?.id || null;

  const tripId = trip?.id || null;
  const { clientUserId, clientName } = await resolveTripClientContext(trip);

  const driverIdUuid =
    trip?.chofer_id_uuid ||
    supabaseService.getDriverId?.() ||
    supabaseService.driverId ||
    null;

  if (!driverUserId) {
    throw new Error("No hay sesión activa de chofer");
  }

  if (!tripId) {
    throw new Error("No hay viaje activo");
  }

  if (!clientUserId) {
    throw new Error("No pudimos resolver el usuario cliente del viaje");
  }

  return openTripChat({
    tripId,
    meUserId: driverUserId,
    clientUserId,
    driverUserId,
    driverIdUuid,
    clientName,
    driverName: "Chofer"
  });
}

export function initTripChat() {
  ensureUI();
  cacheBadgeRefs();
  setChatBadge(0);
}

window.tripChat = {
  initTripChat,
  closeTripChat,
  openTripChatForClientTrip,
  openTripChatForDriverTrip
};
