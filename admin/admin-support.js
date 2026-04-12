import supabaseAdminService from "./supabase-admin-client.js";

const SUPPORT_API_BASE = "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1";
const SUPPORT_POLL_MS = 12000;

const supportState = {
  conversations: [],
  filtered: [],
  selectedId: null,
  mobileThreadOpen: false,
  loadingList: false,
  sendingReply: false,
  pollTimer: null,
  initialized: false,
  lastConversationIds: new Set(),
  typingTimer: null,
  preloadController: null,
  activeFetchToken: 0,
  shouldStickToBottom: true,
  touchSwipe: {
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    dragging: false
  }
};
function supportInitials(name = "U") {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function supportFormatTime(value) {
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

function supportFormatDateTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function escapeHtmlSupport(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&#039;");
}

function sanitizeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    const protocol = url.protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSupportStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  switch (normalized) {
    case "unread":
    case "esperando_usuario":
      return "esperando_usuario";
    case "read":
    case "pending":
    case "en_proceso":
      return "en_proceso";
    case "resolved":
    case "resuelto":
      return "resuelto";
    case "abierto":
    default:
      return "abierto";
  }
}

function supportStatusClass(status) {
  switch (normalizeSupportStatus(status)) {
    case "esperando_usuario":
      return "unread";
    case "en_proceso":
      return "read";
    case "resuelto":
      return "resolved";
    default:
      return "pending";
  }
}

function supportStatusLabel(status) {
  switch (normalizeSupportStatus(status)) {
    case "esperando_usuario":
      return "Esperando usuario";
    case "en_proceso":
      return "En proceso";
    case "resuelto":
      return "Resuelto";
    default:
      return "Abierto";
  }
}

function supportMessageTicks(status) {
  switch (String(status || "").toUpperCase()) {
    case "READ":
      return "Leido";
    case "DELIVERED":
      return "Leido";
    case "SENT":
      return "";
    default:
      return "";
  }
}

function isMobileSupport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function normalizeSupportRole(role) {
  const normalized = String(role || "").trim().toLowerCase();

  switch (normalized) {
    case "driver":
    case "chofer":
      return "chofer";
    case "admin":
      return "admin";
    default:
      return "cliente";
  }
}

function supportRoleLabel(role) {
  switch (normalizeSupportRole(role)) {
    case "chofer":
      return "Chofer";
    case "admin":
      return "Admin";
    default:
      return "Cliente";
  }
}

function getConversationEmail(item) {
  return (
    item?.email ||
    item?.user_email ||
    item?.cliente_email ||
    item?.driver_email ||
    item?.chofer_email ||
    item?.participant_email ||
    item?.metadata?.email ||
    ""
  );
}

function getConversationName(item) {
  return (
    item?.name ||
    item?.full_name ||
    item?.user_name ||
    item?.participant_name ||
    item?.metadata?.name ||
    ""
  );
}

function getConversationRole(item) {
  return (
    item?.role ||
    item?.sender_role ||
    item?.user_type ||
    item?.rol_origen ||
    item?.participant_role ||
    item?.metadata?.role ||
    "cliente"
  );
}

function getConversationDisplayName(item) {
  return getConversationEmail(item) || getConversationName(item) || "Usuario";
}

function getConversationSecondary(item) {
  const email = getConversationEmail(item);
  const name = getConversationName(item);
  const role = supportRoleLabel(getConversationRole(item));
  const subject = String(item?.subject || item?.asunto || "").trim();
  const parts = [];

  if (name && email && name !== email) {
    parts.push(name);
  }

  parts.push(role);

  if (subject) {
    parts.push(subject);
  }

  return parts.join(" Â· ");
}

function getMessageText(msg) {
  return String(msg?.text || msg?.mensaje || msg?.body || "").trim();
}

function normalizeAttachments(msg) {
  if (Array.isArray(msg?.attachments)) return msg.attachments;
  if (Array.isArray(msg?.adjuntos)) return msg.adjuntos;
  return [];
}

function normalizeConversation(item) {
  if (!item || typeof item !== "object") return null;

  const messages = Array.isArray(item.messages) ? item.messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    ...item,
    id: String(item.id || item.ticket_id || item.conversation_id || ""),
    email: getConversationEmail(item),
    name: getConversationName(item),
    role: normalizeSupportRole(getConversationRole(item)),
    subject: String(item.subject || item.asunto || "").trim(),
    status: normalizeSupportStatus(item.status),
    unread_count: Number(item.unread_count || item.unreadCount || 0),
    messages,
    updated_at: item.updated_at || item.last_message_at || item.created_at || null,
    preview_text: getMessageText(lastMessage) || String(item.last_message || item.ultimo_mensaje || "").trim()
  };
}

function getSupportElements() {
  return {
    shell: document.getElementById("supportShell"),
    sidebar: document.getElementById("supportSidebar"),
    thread: document.getElementById("supportThread"),
    list: document.getElementById("supportConversationList"),
    search: document.getElementById("supportSearchInput"),
    filter: document.getElementById("supportFilterStatus"),
    refresh: document.getElementById("supportRefreshBtn"),
    threadEmpty: document.getElementById("supportThreadEmpty"),
    threadPanel: document.getElementById("supportThreadPanel"),
    threadAvatar: document.getElementById("supportThreadAvatar"),
    threadName: document.getElementById("supportThreadName"),
    threadSubmeta: document.getElementById("supportThreadSubmeta"),
    threadBack: document.getElementById("supportThreadBackBtn"),
    messages: document.getElementById("supportMessages"),
    reply: document.getElementById("supportReplyInput"),
    send: document.getElementById("supportSendReplyBtn"),
    attachmentInput: document.getElementById("supportAttachmentInput"),
    markRead: document.getElementById("supportMarkReadBtn"),
    markPending: document.getElementById("supportMarkPendingBtn"),
    markResolved: document.getElementById("supportMarkResolvedBtn")
  };
}

function updateSupportDockBadge() {
  const badge = document.getElementById("supportDockBadge");
  if (!badge) return;

  const unreadTotal = supportState.conversations.reduce((total, item) => {
    return total + Number(item?.unread_count || 0);
  }, 0);

  badge.hidden = unreadTotal <= 0;
  badge.textContent = unreadTotal > 99 ? "99+" : String(unreadTotal);
}

function getCurrentConversation() {
  return supportState.conversations.find((item) => String(item.id) === String(supportState.selectedId)) || null;
}

function setSupportBusy(isBusy) {
  supportState.loadingList = !!isBusy;
  const els = getSupportElements();
  if (els.refresh) {
    els.refresh.disabled = !!isBusy;
  }
}

function setSendBusy(isBusy) {
  supportState.sendingReply = !!isBusy;
  const els = getSupportElements();

  if (els.send) {
    els.send.disabled = !!isBusy;
    els.send.textContent = isBusy ? "Enviando..." : "Enviar respuesta";
  }

  if (els.reply) {
    els.reply.disabled = !!isBusy;
  }

  if (els.attachmentInput) {
    els.attachmentInput.disabled = !!isBusy;
  }
}

function focusSupportReply(options = {}) {
  const { preventScroll = false } = options;
  const els = getSupportElements();
  if (!els.reply || isMobileSupport()) return;

  requestAnimationFrame(() => {
    try {
      els.reply.focus({ preventScroll });
    } catch {
      els.reply.focus();
    }
  });
}

function updateSupportActionState() {
  const els = getSupportElements();
  const current = getCurrentConversation();
  const normalizedStatus = normalizeSupportStatus(current?.status);

  if (els.markRead) {
    els.markRead.textContent = normalizedStatus === "en_proceso" ? "Tomada" : "Marcar leido";
    els.markRead.disabled = !current || normalizedStatus === "en_proceso";
  }

  if (els.markPending) {
    els.markPending.textContent = "Esperando usuario";
    els.markPending.disabled = !current || normalizedStatus === "esperando_usuario";
  }

  if (els.markResolved) {
    els.markResolved.textContent = normalizedStatus === "resuelto" ? "Resuelto" : "Resolver";
    els.markResolved.disabled = !current || normalizedStatus === "resuelto";
  }

  if (els.send) {
    els.send.disabled = supportState.sendingReply || !current;
  }

  if (els.reply) {
    els.reply.disabled = supportState.sendingReply || !current;
    if (!current) {
      els.reply.value = "";
      els.reply.style.height = "";
    }
  }

  if (els.attachmentInput) {
    els.attachmentInput.disabled = supportState.sendingReply || !current;
    if (!current) {
      els.attachmentInput.value = "";
    }
  }
}

function syncSupportLayout() {
  const els = getSupportElements();
  if (!els.shell) return;

  const hasSelected = !!supportState.selectedId;
  const mobile = isMobileSupport();
  const threadOpen = mobile && supportState.mobileThreadOpen && hasSelected;

  els.shell.classList.toggle("is-mobile-support", mobile);
  els.shell.classList.toggle("is-thread-open", threadOpen);

  if (els.sidebar) {
    els.sidebar.hidden = mobile ? threadOpen : false;
  }

  if (els.thread) {
    els.thread.hidden = mobile ? !threadOpen : false;
  }

  if (els.threadBack) {
    els.threadBack.hidden = !mobile;
  }
}

function openMobileThread() {
  if (!isMobileSupport()) return;
  supportState.mobileThreadOpen = true;
  syncSupportLayout();

  const els = getSupportElements();
  requestAnimationFrame(() => {
    els.thread?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function closeMobileThread() {
  supportState.mobileThreadOpen = false;
  syncSupportLayout();

  const els = getSupportElements();
  requestAnimationFrame(() => {
    els.sidebar?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function scrollMessagesToBottom(smooth = false) {
  const els = getSupportElements();
  if (!els.messages) return;

  try {
    els.messages.scrollTo({
      top: els.messages.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  } catch {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
}

function showSupportToast(message, type = "info") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
    return;
  }

  if (typeof window.toast === "function") {
    window.toast(message, type);
    return;
  }

  console.log(`[support.${type}]`, message);
}

async function getAdminAccessToken() {
  const session = await supabaseAdminService.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("Sesion admin expirada");
  }

  return token;
}

function applySupportFilters() {
  const { search, filter } = getSupportElements();
  const term = String(search?.value || "").trim().toLowerCase();
  let status = String(filter?.value || "all").trim().toLowerCase();

  if (status !== "all") {
    status = normalizeSupportStatus(status);
  }

  supportState.filtered = supportState.conversations.filter((item) => {
    const haystack = [
      getConversationDisplayName(item),
      getConversationSecondary(item),
      item?.email,
      item?.subject,
      item?.preview_text
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !term || haystack.includes(term);
    const currentStatus = normalizeSupportStatus(item.status);
    const matchesStatus = status === "all" ? true : currentStatus === status;

    return matchesSearch && matchesStatus;
  });
}

function renderConversationList() {
  const { list } = getSupportElements();
  if (!list) return;

  if (!supportState.filtered.length) {
    list.innerHTML = `
      <div class="support-empty-state">
        No hay conversaciones para mostrar.
      </div>
    `;
    return;
  }

  list.innerHTML = supportState.filtered.map((item) => {
    const safeName = escapeHtmlSupport(getConversationDisplayName(item));
    const safeRole = escapeHtmlSupport(supportRoleLabel(item.role));
    const statusLabel = supportStatusLabel(item.status);
    const preview = escapeHtmlSupport(item.preview_text || item.subject || "Sin mensajes");
    const secondary = escapeHtmlSupport(getConversationSecondary(item) || "Sin detalles");
    const unreadCount = Number(item.unread_count || 0);

    return `
      <button
        class="support-conversation-item ${String(supportState.selectedId) === String(item.id) ? "active" : ""}"
        data-support-id="${escapeHtmlAttr(item.id)}"
        type="button"
        aria-label="Abrir conversacion con ${safeName}"
      >
        <div class="support-conversation-avatar">${escapeHtmlSupport(supportInitials(getConversationDisplayName(item)))}</div>

        <div class="support-conversation-body">
          <div class="support-conversation-top">
            <div class="support-conversation-name">${safeName}</div>
            <div class="support-conversation-time">${supportFormatTime(item.updated_at)}</div>
          </div>

          <div class="support-conversation-meta">
            <span class="support-role-badge">${safeRole}</span>
            <span class="support-status-badge ${supportStatusClass(item.status)}">${escapeHtmlSupport(statusLabel)}</span>
          </div>

          <div class="support-conversation-secondary">${secondary}</div>
          <div class="support-conversation-preview">${preview}</div>
        </div>

        ${unreadCount > 0 ? `<div class="support-conversation-unread">${unreadCount}</div>` : ""}
      </button>
    `;
  }).join("");
}

function renderSelectedConversation() {
  const els = getSupportElements();
  const current = getCurrentConversation();

  if (!els.threadEmpty || !els.threadPanel || !els.messages) return;

  if (!current) {
    els.threadEmpty.hidden = false;
    els.threadPanel.hidden = true;
    updateSupportActionState();
    syncSupportLayout();
    return;
  }

  els.threadEmpty.hidden = true;
  els.threadPanel.hidden = false;

  const displayName = getConversationDisplayName(current);
  const secondary = getConversationSecondary(current);

  if (els.threadAvatar) {
    els.threadAvatar.textContent = supportInitials(displayName);
  }

  if (els.threadName) {
    els.threadName.textContent = displayName;
  }

  if (els.threadSubmeta) {
    const bits = [
      supportRoleLabel(current.role),
      supportStatusLabel(current.status),
      secondary,
      supportFormatDateTime(current.updated_at)
    ].filter(Boolean);

    els.threadSubmeta.textContent = bits.join(" · ");
  }

  const messages = Array.isArray(current.messages) ? current.messages : [];

  els.messages.innerHTML = messages.length
    ? messages.map((msg) => {
        const senderRole = String(msg.sender_role || msg.role || "user").toLowerCase();
        const isAdmin = senderRole === "admin";
        const ticks = isAdmin ? supportMessageTicks(msg.delivery_status) : "";
        const text = getMessageText(msg);
        const attachments = normalizeAttachments(msg);

        const attachmentsHtml = attachments.length
          ? `
            <div class="support-message-attachments">
              ${attachments.map((file) => {
                const safeUrl = sanitizeExternalUrl(file?.url);
                if (!safeUrl) return "";

                return `
                  <a
                    href="${escapeHtmlAttr(safeUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="support-attachment-chip"
                  >
                    Adj. ${escapeHtmlSupport(file?.name || "Archivo")}
                  </a>
                `;
              }).join("")}
            </div>
          `
          : "";

        return `
          <div class="support-message-row ${isAdmin ? "admin" : "user"}">
            <div class="support-message-bubble">
              ${text ? `<div>${escapeHtmlSupport(text)}</div>` : ""}
              ${attachmentsHtml}
              <div class="support-message-meta">
                ${escapeHtmlSupport(supportRoleLabel(senderRole))} · ${supportFormatTime(msg.created_at)}
                ${ticks ? `<span class="support-message-ticks">${ticks}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `
      <div class="support-empty-state">
        Esta conversacion todavia no tiene mensajes.
      </div>
    `;

  syncSupportLayout();
  updateSupportActionState();
  bindMessageScroll();
  smartScrollAfterRender();
  preloadNearbyConversations();
}
function selectConversation(id, options = {}) {
  const { openThread = true, markVisualRead = false } = options;
  if (!id) return;

  preloadConversation(id);
  supportState.selectedId = String(id);
  if (markVisualRead) {
    const current = getCurrentConversation();
    if (current && normalizeSupportStatus(current.status) === "esperando_usuario") {
      current.status = "en_proceso";
      current.unread_count = 0;
    }
  }

  renderConversationList();
  renderSelectedConversation();

  if (openThread && isMobileSupport()) {
    openMobileThread();
  } else {
    syncSupportLayout();
    focusSupportReply({ preventScroll: true });
  }
}

function updateConversationStatusLocally(status) {
  const current = getCurrentConversation();
  if (!current) return;

  current.status = normalizeSupportStatus(status);

  if (current.status !== "esperando_usuario") {
    current.unread_count = 0;
  }

  applySupportFilters();
  renderConversationList();
  renderSelectedConversation();
  updateSupportActionState();
}

async function uploadSupportAttachments(conversationId, files) {
  if (!files.length) return [];

  const ready = await supabaseAdminService.init();
  if (!ready || !supabaseAdminService.client) {
    throw new Error("No se pudo inicializar Supabase para adjuntos");
  }

  const uploadedAttachments = [];

  for (const file of files) {
    const fileExt = file.name.split(".").pop() || "bin";
    const fileName = `support/${conversationId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabaseAdminService.client
      .storage
      .from("support-attachments")
      .upload(fileName, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicData } = supabaseAdminService.client
      .storage
      .from("support-attachments")
      .getPublicUrl(fileName);

    uploadedAttachments.push({
      name: file.name,
      path: fileName,
      url: publicData?.publicUrl || "",
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size || 0
    });
  }

  return uploadedAttachments;
}

async function sendSupportReply() {
  if (supportState.sendingReply) return;

  const els = getSupportElements();
  const current = getCurrentConversation();
  const text = String(els.reply?.value || "").trim();
  const files = Array.from(els.attachmentInput?.files || []);

  if (!current) {
    showSupportToast("Primero selecciona una conversacion.", "error");
    return;
  }

  if (!text && !files.length) {
    showSupportToast("Escribi un mensaje o adjunta un archivo.", "warning");
    return;
  }

  const previousText = els.reply?.value || "";

  try {
setSendBusy(true);
showTypingIndicator();
    const token = await getAdminAccessToken();
    const uploadedAttachments = await uploadSupportAttachments(current.id, files);

    const response = await fetch(`${SUPPORT_API_BASE}/support-send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        conversation_id: current.id,
        message: text,
        sender_role: "admin",
        attachments: uploadedAttachments,
        metadata: {
          push_title: `Soporte MIMICAR · ${getConversationDisplayName(current)}`,
          push_body: text || "Tenes una nueva respuesta de soporte.",
          sender_name: "Soporte MIMICAR",
          conversation_name: getConversationDisplayName(current),
          unread_count: Number(current.unread_count || 0) + 1
        }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo enviar la respuesta");
    }

    const newMessageId =
      data?.message?.id ||
      data?.message_id ||
      data?.data?.id ||
      null;

    try {
      const pushResponse = await fetch(`${SUPPORT_API_BASE}/send-push-support-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ticket_id: current.id,
          message_id: newMessageId,
          title: `Soporte MIMICAR · ${getConversationDisplayName(current)}`,
          body: text || "Tenes una nueva respuesta de soporte.",
          sender_name: "Soporte MIMICAR",
          sender_role: "admin",
          conversation_name: getConversationDisplayName(current),
          unread_count: Number(current.unread_count || 0) + 1
        })
      });

      const pushData = await pushResponse.json().catch(() => ({}));
      if (!pushResponse.ok || pushData?.ok === false) {
        console.warn("[support.sendSupportReply] push response warning:", pushData);
      }
    } catch (pushErr) {
      console.warn("[support.sendSupportReply] push warning:", pushErr);
    }

    if (els.reply) {
      els.reply.value = "";
      els.reply.style.height = "";
    }

    if (els.attachmentInput) {
      els.attachmentInput.value = "";
    }

    await loadSupportConversations({ preserveSelection: true, silent: true });

    if (supportState.selectedId) {
      selectConversation(supportState.selectedId, { openThread: true });
    }

    scrollMessagesToBottom(true);
    showSupportToast("Respuesta enviada.", "success");
  } catch (err) {
    console.error("[support.sendSupportReply]", err);

    if (els.reply) {
      els.reply.value = previousText;
    }

    alert(err?.message || "No se pudo enviar el mensaje");
  } finally {
    hideTypingIndicator();
    setSendBusy(false);
  }
}

async function loadSupportConversations(options = {}) {
  const { preserveSelection = true, silent = false } = options;

  try {
    if (!silent) {
      setSupportBusy(true);
    }

    const token = await getAdminAccessToken();

    const response = await fetch(`${SUPPORT_API_BASE}/support-list-conversation`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudieron cargar las conversaciones");
    }

    const previousSelectedId = preserveSelection ? supportState.selectedId : null;

    supportState.conversations = (Array.isArray(data.conversations) ? data.conversations : [])
      .map(normalizeConversation)
      .filter((item) => item && item.id);

    applySupportFilters();
    renderConversationList();
    updateSupportDockBadge();
    markNewUnreadVisuals();
    animateDockBadge();

    if (previousSelectedId) {
      const stillExists = supportState.conversations.some(
        (item) => String(item.id) === String(previousSelectedId)
      );

      if (stillExists) {
        supportState.selectedId = String(previousSelectedId);
      } else {
        supportState.selectedId = supportState.filtered[0]?.id || null;
      }
    } else {
      supportState.selectedId = supportState.filtered[0]?.id || null;
    }

    if (!supportState.selectedId) {
      supportState.mobileThreadOpen = false;
    }

    renderSelectedConversation();
  } catch (err) {
    console.error("[support.loadSupportConversations]", err);

    supportState.conversations = [];
    supportState.filtered = [];
    supportState.selectedId = null;
    supportState.mobileThreadOpen = false;

    renderConversationList();
    renderSelectedConversation();
    updateSupportDockBadge();

    if (!silent) {
      showSupportToast(err?.message || "No se pudieron cargar las conversaciones", "error");
    }
  } finally {
    if (!silent) {
      setSupportBusy(false);
    }
  }
}
async function persistConversationStatus(status) {
  const current = getCurrentConversation();
  if (!current) {
    showSupportToast("Primero selecciona una conversacion.", "warning");
    return;
  }

  try {
    const token = await getAdminAccessToken();

    const response = await fetch(`${SUPPORT_API_BASE}/support-update-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        conversation_id: current.id,
        status: normalizeSupportStatus(status)
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo actualizar el estado");
    }

    updateConversationStatusLocally(status);
    await loadSupportConversations({ preserveSelection: true, silent: true });

    if (supportState.selectedId) {
      selectConversation(supportState.selectedId, { openThread: true });
    }

    showSupportToast("Estado actualizado.", "success");
  } catch (err) {
    console.error("[support.persistConversationStatus]", err);
    alert(err?.message || "No se pudo actualizar el estado");
  }
}

function autoResizeSupportReply() {
  const els = getSupportElements();
  if (!els.reply) return;

  els.reply.style.height = "auto";
  els.reply.style.height = `${Math.min(els.reply.scrollHeight, 180)}px`;
}

function startSupportPolling() {
  stopSupportPolling();

  supportState.pollTimer = window.setInterval(() => {
    if (document.hidden) return;
    loadSupportConversations({ preserveSelection: true, silent: true });
  }, SUPPORT_POLL_MS);
}

function stopSupportPolling() {
  if (supportState.pollTimer) {
    window.clearInterval(supportState.pollTimer);
    supportState.pollTimer = null;
  }
}

function handleVisibilitySupportRefresh() {
  if (!document.hidden) {
    loadSupportConversations({ preserveSelection: true, silent: true });
  }
}

function handleSupportResize() {
  if (!isMobileSupport()) {
    supportState.mobileThreadOpen = false;
  } else if (!supportState.selectedId) {
    supportState.mobileThreadOpen = false;
  }

  syncSupportLayout();
}
function getConversationIndexById(id) {
  return supportState.filtered.findIndex((item) => String(item.id) === String(id));
}

function getNextConversationId(direction = 1) {
  if (!supportState.filtered.length) return null;

  const currentIndex = getConversationIndexById(supportState.selectedId);
  if (currentIndex < 0) return supportState.filtered[0]?.id || null;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= supportState.filtered.length) return null;

  return supportState.filtered[nextIndex]?.id || null;
}

function markNewUnreadVisuals() {
  const list = document.getElementById("supportConversationList");
  if (!list) return;

  const currentIds = new Set(supportState.conversations.map((item) => String(item.id)));
  const previousIds = supportState.lastConversationIds;

  supportState.conversations.forEach((item) => {
    const isNew = !previousIds.has(String(item.id)) && Number(item.unread_count || 0) > 0;
    if (!isNew) return;

    const node = list.querySelector(`[data-support-id="${CSS.escape(String(item.id))}"]`);
    if (!node) return;

    node.classList.remove("is-new-unread");
    void node.offsetWidth;
    node.classList.add("is-new-unread");
  });

  supportState.lastConversationIds = currentIds;
}

function animateDockBadge() {
  const badge = document.getElementById("supportDockBadge");
  if (!badge || badge.hidden) return;

  badge.classList.remove("support-dock-badge-live");
  void badge.offsetWidth;
  badge.classList.add("support-dock-badge-live");
}

function bindMessageScroll() {
  const els = getSupportElements();
  if (!els.messages || els.messages.dataset.bound === "1") return;

  els.messages.dataset.bound = "1";
  els.messages.addEventListener("scroll", () => {
    const distance = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
    supportState.shouldStickToBottom = distance < 42;
  }, { passive: true });
}

function smartScrollAfterRender() {
  if (supportState.shouldStickToBottom) {
    scrollMessagesToBottom(false);
  }
}

function showTypingIndicator() {
  const els = getSupportElements();
  if (!els.messages) return;
  if (els.messages.querySelector(".support-typing-row")) return;

  const row = document.createElement("div");
  row.className = "support-typing-row";
  row.innerHTML = `
    <div class="support-typing-bubble">
      <span class="support-typing-dot"></span>
      <span class="support-typing-dot"></span>
      <span class="support-typing-dot"></span>
    </div>
  `;
  els.messages.appendChild(row);
  smartScrollAfterRender();
}

function hideTypingIndicator() {
  const els = getSupportElements();
  els.messages?.querySelector(".support-typing-row")?.remove();
}

function preloadConversation(id) {
  if (!id) return;
  const btn = document.querySelector(`[data-support-id="${CSS.escape(String(id))}"]`);
  btn?.classList.add("is-preloading");

  window.clearTimeout(supportState.preloadController);
  supportState.preloadController = window.setTimeout(() => {
    btn?.classList.remove("is-preloading");
  }, 260);
}

function initConversationSwipe() {
  const list = document.getElementById("supportConversationList");
  if (!list || list.dataset.swipeBound === "1") return;
  list.dataset.swipeBound = "1";

  list.addEventListener("pointerdown", (event) => {
    const item = event.target.closest(".support-conversation-item");
    if (!item || !isMobileSupport()) return;

    supportState.touchSwipe.pointerId = event.pointerId;
    supportState.touchSwipe.startX = event.clientX;
    supportState.touchSwipe.startY = event.clientY;
    supportState.touchSwipe.deltaX = 0;
    supportState.touchSwipe.dragging = false;
  });

  list.addEventListener("pointermove", (event) => {
    if (supportState.touchSwipe.pointerId !== event.pointerId) return;

    const item = event.target.closest(".support-conversation-item");
    if (!item) return;

    const deltaX = event.clientX - supportState.touchSwipe.startX;
    const deltaY = event.clientY - supportState.touchSwipe.startY;

    if (Math.abs(deltaY) > 18 && Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) < 12) return;

    supportState.touchSwipe.dragging = true;
    supportState.touchSwipe.deltaX = deltaX;

    item.classList.add("swiping");
    item.style.transform = `translateX(${Math.max(-72, Math.min(72, deltaX))}px)`;
    item.classList.toggle("swipe-next", deltaX < -24);
    item.classList.toggle("swipe-prev", deltaX > 24);
  });

  function endSwipe(event) {
    if (supportState.touchSwipe.pointerId !== event.pointerId) return;

    const item = event.target.closest(".support-conversation-item");
    const deltaX = supportState.touchSwipe.deltaX;

    supportState.touchSwipe.pointerId = null;
    supportState.touchSwipe.deltaX = 0;

    if (!item) return;

    item.classList.remove("swiping");
    item.style.transform = "";
    item.classList.remove("swipe-next", "swipe-prev");

    if (!supportState.touchSwipe.dragging) return;
    supportState.touchSwipe.dragging = false;

    if (deltaX <= -56) {
      const nextId = getNextConversationId(1);
      if (nextId) selectConversation(nextId, { openThread: true, markVisualRead: false });
    } else if (deltaX >= 56) {
      const prevId = getNextConversationId(-1);
      if (prevId) selectConversation(prevId, { openThread: true, markVisualRead: false });
    }
  }

  list.addEventListener("pointerup", endSwipe);
  list.addEventListener("pointercancel", endSwipe);
}

function preloadNearbyConversations() {
  const nextId = getNextConversationId(1);
  const prevId = getNextConversationId(-1);
  if (nextId) preloadConversation(nextId);
  if (prevId) preloadConversation(prevId);
}
export function initAdminSupport() {
  if (supportState.initialized) return;

  const els = getSupportElements();
  if (!els.list) return;

  supportState.initialized = true;

  if (els.filter) {
    const rawValue = String(els.filter.value || "").trim().toUpperCase();
    if (rawValue === "ALL") els.filter.value = "all";
    if (rawValue === "UNREAD") els.filter.value = "esperando_usuario";
    if (rawValue === "PENDING") els.filter.value = "en_proceso";
    if (rawValue === "RESOLVED") els.filter.value = "resuelto";
  }

  els.search?.addEventListener("input", () => {
    applySupportFilters();
    renderConversationList();
  });

  els.filter?.addEventListener("change", () => {
    applySupportFilters();
    renderConversationList();
  });

  els.refresh?.addEventListener("click", () => {
    loadSupportConversations({ preserveSelection: true, silent: false });
  });

  els.list?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-support-id]");
    if (!btn) return;

    const id = btn.getAttribute("data-support-id");
    if (!id) return;

    selectConversation(id, {
      openThread: true,
      markVisualRead: true
    });
  });

  els.threadBack?.addEventListener("click", () => {
    closeMobileThread();
  });

  els.send?.addEventListener("click", sendSupportReply);
  els.markRead?.addEventListener("click", () => persistConversationStatus("en_proceso"));
  els.markPending?.addEventListener("click", () => persistConversationStatus("esperando_usuario"));
  els.markResolved?.addEventListener("click", () => persistConversationStatus("resuelto"));
  els.reply?.addEventListener("input", autoResizeSupportReply);

  els.reply?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendSupportReply();
    }
  });

  window.addEventListener("resize", handleSupportResize, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilitySupportRefresh);

  handleSupportResize();
  updateSupportActionState();
  initConversationSwipe();
  loadSupportConversations({ preserveSelection: true, silent: false });
  startSupportPolling();
}
