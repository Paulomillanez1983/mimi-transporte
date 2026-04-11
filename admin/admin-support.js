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
  initialized: false
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

function normalizeSupportStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  switch (normalized) {
    case "abierto":
    case "en_proceso":
    case "esperando_usuario":
    case "resuelto":
      return normalized;
    default:
      return "abierto";
  }
}
function supportStatusClass(status) {
  switch (normalizeSupportStatus(status)) {
    case "UNREAD":
      return "unread";
    case "READ":
      return "read";
    case "RESOLVED":
      return "resolved";
    default:
      return "pending";
  }
}

function supportStatusLabel(status) {
  switch (normalizeSupportStatus(status)) {
    case "UNREAD":
      return "UNREAD";
    case "READ":
      return "READ";
    case "RESOLVED":
      return "RESOLVED";
    default:
      return "PENDING";
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

function supportMessageTicks(status) {
  switch (String(status || "").toUpperCase()) {
    case "READ":
      return "✓✓";
    case "DELIVERED":
      return "✓✓";
    case "SENT":
      return "✓";
    default:
      return "✓";
  }
}

function isMobileSupport() {
  return window.matchMedia("(max-width: 720px)").matches;
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

function getCurrentConversation() {
  return supportState.conversations.find((item) => item.id === supportState.selectedId) || null;
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
    els.send.textContent = isBusy ? "Enviando..." : "Enviar";
  }

  if (els.reply) {
    els.reply.disabled = !!isBusy;
  }

  if (els.attachmentInput) {
    els.attachmentInput.disabled = !!isBusy;
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
    els.sidebar.hidden = threadOpen;
  }

  if (els.thread) {
    els.thread.hidden = mobile ? !threadOpen && !hasSelected : false;
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
    throw new Error("Sesión admin expirada");
  }

  return token;
}

function applySupportFilters() {
  const { search, filter } = getSupportElements();

  const term = String(search?.value || "").trim().toLowerCase();
  const status = String(filter?.value || "ALL").trim().toUpperCase();

  supportState.filtered = supportState.conversations.filter((item) => {
    const matchesSearch =
      !term ||
      String(item.name || "").toLowerCase().includes(term) ||
      String(item.email || "").toLowerCase().includes(term) ||
      String(item.subject || "").toLowerCase().includes(term);

    const currentStatus = normalizeSupportStatus(item.status);
    const matchesStatus = status === "ALL" ? true : currentStatus === status;

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
    const last = item.messages?.[item.messages.length - 1];
    const safeName = escapeHtmlSupport(item.name || "Usuario");
    const safeRole = escapeHtmlSupport(item.role || "user");
    const statusLabel = supportStatusLabel(item.status);
    const preview = escapeHtmlSupport(last?.text || item.subject || "Sin mensajes");
    const unreadCount = Number(item.unread_count || 0);

    return `
      <button
        class="support-conversation-item ${supportState.selectedId === item.id ? "active" : ""}"
        data-support-id="${escapeHtmlAttr(item.id)}"
        type="button"
        aria-label="Abrir conversación con ${safeName}"
      >
        <div class="support-conversation-avatar">${escapeHtmlSupport(supportInitials(item.name))}</div>

        <div class="support-conversation-body">
          <div class="support-conversation-top">
            <div class="support-conversation-name">${safeName}</div>
            <div class="support-conversation-time">${supportFormatTime(item.updated_at)}</div>
          </div>

          <div class="support-conversation-meta">
            <span class="support-role-badge">${safeRole}</span>
            <span class="support-status-badge ${supportStatusClass(item.status)}">${escapeHtmlSupport(statusLabel)}</span>
          </div>

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

  if (!els.threadEmpty || !els.threadPanel || !els.messages) {
    return;
  }

  if (!current) {
    els.threadEmpty.hidden = false;
    els.threadPanel.hidden = true;
    syncSupportLayout();
    return;
  }

  els.threadEmpty.hidden = true;
  els.threadPanel.hidden = false;

  if (els.threadAvatar) {
    els.threadAvatar.textContent = supportInitials(current.name);
  }

  if (els.threadName) {
    els.threadName.textContent = current.name || "Usuario";
  }

  if (els.threadSubmeta) {
    const role = String(current.role || "user");
    const status = supportStatusLabel(current.status);
    const subject = current.subject || "sin asunto";
    const updatedAt = supportFormatDateTime(current.updated_at);
    els.threadSubmeta.textContent = `${role} · ${status.toLowerCase()} · ${subject}${updatedAt ? ` · ${updatedAt}` : ""}`;
  }

  const messages = Array.isArray(current.messages) ? current.messages : [];

  els.messages.innerHTML = messages.length
    ? messages.map((msg) => {
        const isAdmin = String(msg.sender_role || "").toLowerCase() === "admin";
        const ticks = isAdmin ? supportMessageTicks(msg.delivery_status) : "";
        const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];

        return `
          <div class="support-message-row ${isAdmin ? "admin" : "user"}">
            <div class="support-message-bubble">
              ${msg.text ? `<div>${escapeHtmlSupport(msg.text)}</div>` : ""}

              ${
                attachments.length
                  ? `
                    <div class="support-message-attachments">
                      ${attachments.map((file) => `
                        <a
                          href="${escapeHtmlAttr(file?.url || "#")}"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="support-attachment-chip"
                        >
                          📎 ${escapeHtmlSupport(file?.name || "Adjunto")}
                        </a>
                      `).join("")}
                    </div>
                  `
                  : ""
              }

              <div class="support-message-meta">
                ${escapeHtmlSupport(msg.sender_role || "user")} · ${supportFormatTime(msg.created_at)}
                ${ticks ? `<span class="support-message-ticks">${ticks}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `
      <div class="support-empty-state">
        Esta conversación todavía no tiene mensajes.
      </div>
    `;

  syncSupportLayout();
  scrollMessagesToBottom(false);
}

function selectConversation(id, options = {}) {
  const { openThread = true, markVisualRead = false } = options;

  if (!id) return;

  supportState.selectedId = id;

  if (markVisualRead) {
    const current = getCurrentConversation();
    if (current && normalizeSupportStatus(current.status) === "UNREAD") {
      current.status = "READ";
      current.unread_count = 0;
    }
  }

  renderConversationList();
  renderSelectedConversation();

  if (openThread && isMobileSupport()) {
    openMobileThread();
  }
}

function updateConversationStatusLocally(status) {
  const current = getCurrentConversation();
  if (!current) return;

  current.status = normalizeSupportStatus(status);

  if (current.status !== "UNREAD") {
    current.unread_count = 0;
  }

  applySupportFilters();
  renderConversationList();
  renderSelectedConversation();
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
    showSupportToast("Primero seleccioná una conversación.", "error");
    return;
  }

  if (!text && !files.length) {
    showSupportToast("Escribí un mensaje o adjuntá un archivo.", "warning");
    return;
  }

  const previousText = els.reply?.value || "";

  try {
    setSendBusy(true);

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
      push_title: `Soporte MIMICAR · ${current.name || "Administrador"}`,
      push_body: text || "Tenés una nueva respuesta de soporte.",
      sender_name: current.name || "Soporte MIMICAR",
      conversation_name: current.name || "Usuario",
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
    title: `Soporte MIMICAR · ${current.name || "Administrador"}`,
    body: text || "Tenés una nueva respuesta de soporte.",
    sender_name: current.name || "Soporte MIMICAR",
    sender_role: "admin",
    conversation_name: current.name || "Usuario",
    unread_count: Number(current.unread_count || 0) + 1
  })
});
  const pushData = await pushResponse.json().catch(() => ({}));

  if (!pushResponse.ok || pushData?.ok === false) {
    console.warn("[support.sendSupportReply] push response warning:", pushData);
  } else {
    console.log("[support.sendSupportReply] push enviada:", pushData);
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
    setSendBusy(false);
  }
}

async function loadSupportConversations(options = {}) {
  const {
    preserveSelection = true,
    silent = false
  } = options;

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

    supportState.conversations = Array.isArray(data.conversations)
      ? data.conversations
      : [];

    applySupportFilters();

    const stillExists = previousSelectedId && supportState.conversations.some((item) => item.id === previousSelectedId);

    if (stillExists) {
      supportState.selectedId = previousSelectedId;
    } else if (supportState.filtered[0]) {
      supportState.selectedId = supportState.filtered[0].id;
    } else {
      supportState.selectedId = null;
    }

    renderConversationList();
    renderSelectedConversation();
  } catch (err) {
    console.error("[support.loadSupportConversations]", err);

    supportState.conversations = [];
    supportState.filtered = [];
    supportState.selectedId = null;

    renderConversationList();
    renderSelectedConversation();

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
    showSupportToast("Primero seleccioná una conversación.", "warning");
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
  } else if (supportState.selectedId && supportState.mobileThreadOpen) {
    supportState.mobileThreadOpen = true;
  }

  syncSupportLayout();
}

export function initAdminSupport() {
  if (supportState.initialized) return;

  const els = getSupportElements();
  if (!els.list) return;

  supportState.initialized = true;

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
  loadSupportConversations({ preserveSelection: true, silent: false });
  startSupportPolling();
}
