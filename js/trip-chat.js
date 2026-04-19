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
  sending: false
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

function ensureUI() {
  if (TRIP_CHAT.initialized) return;

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

  overlay.addEventListener("click", closeTripChat);
  sheet.querySelector(".trip-chat-close")?.addEventListener("click", closeTripChat);

  TRIP_CHAT.input?.addEventListener("input", () => {
    TRIP_CHAT.input.style.height = "auto";
    TRIP_CHAT.input.style.height = `${Math.min(TRIP_CHAT.input.scrollHeight, 140)}px`;
  });

  TRIP_CHAT.input?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendCurrentMessage();
    }
  });

  TRIP_CHAT.sendBtn?.addEventListener("click", sendCurrentMessage);

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
    .eq("categoria", "trip_chat")
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
    created_by: context.clientUserId,
    user_id: context.clientUserId,
    rol_origen: "client",
    asunto: subject,
    canal: "trip_in_app",
    categoria: "trip_chat",
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
    .select("id, ticket_id, sender_user_id, sender_role, mensaje, created_at, metadata")
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
      (payload) => {
        const msg = payload?.new;
        if (!msg?.id) return;
        appendMessage(msg);
      }
    )
    .subscribe();
}

async function sendCurrentMessage() {
  if (TRIP_CHAT.sending) return;
  if (!TRIP_CHAT.activeTicketId) return;

  const text = String(TRIP_CHAT.input?.value || "").trim();
  if (!text) return;

  TRIP_CHAT.sending = true;
  TRIP_CHAT.sendBtn.disabled = true;
  setStatus("Enviando...");

  try {
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

  const names = getParticipantNames(context);
  TRIP_CHAT.title.textContent = `Chat con ${names.other}`;
  TRIP_CHAT.subtitle.textContent = `Viaje ${context.tripId}`;
  setStatus("Cargando...");

  TRIP_CHAT.activeContext = {
    ...context,
    meUserId: context.meUserId
  };
  TRIP_CHAT.activeTripId = context.tripId;

  const ticket = await findOrCreateTripChat(context);
  TRIP_CHAT.activeTicketId = ticket.id;

  const messages = await loadMessages(ticket.id);
  renderMessages(messages);

  await subscribeRealtime(ticket.id);
  setStatus("");
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
  const clientUserId =
    trip?.user_id ||
    trip?.cliente_id ||
    trip?.client_user_id ||
    trip?.pasajero_user_id ||
    null;

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
    clientName: trip?.pasajero_nombre || trip?.cliente || "Cliente",
    driverName: "Chofer"
  });
}

export function initTripChat() {
  ensureUI();
}

window.tripChat = {
  initTripChat,
  closeTripChat,
  openTripChatForClientTrip,
  openTripChatForDriverTrip
};
