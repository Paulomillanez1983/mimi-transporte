import supabaseService from "./supabase-client.js";
import { initSupportPushFCM } from "./push-support.js";

const SUPPORT_API_BASE = "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1";
const SUPPORT_POLL_MS = 12000;

const supportState = {
  initialized: false,
  panelOpen: false,
  mobileThreadOpen: false,
  loadingList: false,
  sendingReply: false,
  pollTimer: null,
  conversations: [],
  filtered: [],
  selectedId: null,
  currentUserId: null,
  currentUserEmail: null,
  realtimeChannel: null,
  pushPromptShown: false,
  pushEnabled: false,
  installPromptEvent: null,
  installPromptShown: false
};
const SUPPORT_REQUEST_TIMEOUT_MS = 12000;

function getEls() {
  return {
    overlay: document.getElementById("supportOverlay"),
    backdrop: document.getElementById("supportOverlayBackdrop"),
    panel: document.getElementById("supportPanel"),
    close: document.getElementById("supportCloseBtn"),
    shell: document.getElementById("supportShell"),
    sidebar: document.getElementById("supportSidebar"),
    thread: document.getElementById("supportThread"),
    list: document.getElementById("supportConversationList"),
    search: document.getElementById("supportSearchInput"),
    filter: document.getElementById("supportFilterStatus"),
    refresh: document.getElementById("supportRefreshBtn"),
    threadRefresh: document.getElementById("supportThreadRefreshBtn"),
    threadEmpty: document.getElementById("supportThreadEmpty"),
    threadPanel: document.getElementById("supportThreadPanel"),
    threadAvatar: document.getElementById("supportThreadAvatar"),
    threadName: document.getElementById("supportThreadName"),
    threadSubmeta: document.getElementById("supportThreadSubmeta"),
    threadBack: document.getElementById("supportThreadBackBtn"),
    messages: document.getElementById("supportMessages"),
    reply: document.getElementById("supportReplyInput"),
function getEls() {
  return {
    overlay: document.getElementById("supportOverlay"),
    backdrop: document.getElementById("supportOverlayBackdrop"),
    panel: document.getElementById("supportPanel"),
    close: document.getElementById("supportCloseBtn"),
    shell: document.getElementById("supportShell"),
    sidebar: document.getElementById("supportSidebar"),
    thread: document.getElementById("supportThread"),
    list: document.getElementById("supportConversationList"),
    search: document.getElementById("supportSearchInput"),
    filter: document.getElementById("supportFilterStatus"),
    refresh: document.getElementById("supportRefreshBtn"),
    threadRefresh: document.getElementById("supportThreadRefreshBtn"),
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

    badge: document.getElementById("supportDockBadge"),

    enableAlertsBtn: document.getElementById("supportEnableAlertsBtn"),
    installAppBtn: document.getElementById("supportInstallAppBtn"),

    enableAlertsBtnEmpty: document.getElementById("supportEnableAlertsBtnEmpty"),
    installAppBtnEmpty: document.getElementById("supportInstallAppBtnEmpty"),

    setupStatus: document.getElementById("supportSetupStatus"),
    alertsBadge: document.getElementById("supportAlertsBadge")
  };
}
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function updateSupportUIState() {
  const {
    enableAlertsBtn,
    enableAlertsBtnEmpty,
    installAppBtn,
    installAppBtnEmpty,
    setupStatus,
    alertsBadge
  } = getEls();

  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const enabled = supportState.pushEnabled || permission === "granted";
  const installAvailable = !!supportState.installPromptEvent;

  // 🔔 BOTONES ALERTAS
  const updateBtn = (btn) => {
    if (!btn) return;

    if (enabled) {
      btn.disabled = true;
      btn.innerHTML = "✅ Alertas activadas";
    } else if (permission === "denied") {
      btn.disabled = true;
      btn.innerHTML = "⚠️ Bloqueadas";
    } else {
      btn.disabled = false;
      btn.innerHTML = "🔔 Activar alertas";
    }
  };

  updateBtn(enableAlertsBtn);
  updateBtn(enableAlertsBtnEmpty);

  // 📥 BOTÓN INSTALAR
  const updateInstall = (btn) => {
    if (!btn) return;
    btn.hidden = !installAvailable;
  };

  updateInstall(installAppBtn);
  updateInstall(installAppBtnEmpty);

  // 🟢 BADGE
  if (alertsBadge) {
    alertsBadge.hidden = !enabled;
  }

  // 📝 TEXTO
  if (setupStatus) {
    if (enabled) {
      setupStatus.textContent = "Ya tenés activadas las alertas de soporte.";
    } else if (permission === "denied") {
      setupStatus.textContent = "Las alertas están bloqueadas en el navegador.";
    } else {
      setupStatus.textContent = "Las alertas están desactivadas.";
    }
  }
}
function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatTime(value) {
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

function formatDateTime(value) {
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

function initials(name = "S") {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "S";
}

function normalizeStatus(status) {
  const normalized = normalizeText(status);
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
    default:
      return "abierto";
  }
}

function statusLabel(status) {
  switch (normalizeStatus(status)) {
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

function statusClass(status) {
  switch (normalizeStatus(status)) {
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

function normalizeRole(role) {
  const normalized = normalizeText(role);
  if (normalized === "admin") return "admin";
  if (normalized === "driver" || normalized === "chofer") return "driver";
  return "client";
}
function roleLabel(role) {
  switch (normalizeRole(role)) {
    case "admin":
      return "Admin";
    case "driver":
      return "Chofer";
    default:
      return "Cliente";
  }
}
function getMessageText(msg) {
  return String(msg?.text || msg?.mensaje || msg?.body || "").trim();
}

function normalizeAttachments(msg) {
  if (Array.isArray(msg?.attachments)) return msg.attachments;
  if (Array.isArray(msg?.adjuntos)) return msg.adjuntos;
  if (Array.isArray(msg?.metadata?.attachments)) return msg.metadata.attachments;
  return [];
}

function conversationName(item) {
  return (
    item?.name ||
    item?.full_name ||
    item?.subject ||
    item?.asunto ||
    item?.email ||
    "Soporte"
  );
}

function conversationSecondary(item) {
  const parts = [
    roleLabel(item?.role || item?.rol_origen || "driver"),
    statusLabel(item?.status || item?.estado || "abierto"),
    String(item?.subject || item?.asunto || "").trim()
  ].filter(Boolean);

  return parts.join(" · ");
}
function normalizeConversation(item) {
  if (!item || typeof item !== "object") return null;
  const messages = Array.isArray(item.messages) ? item.messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    ...item,
    id: String(item.id || item.ticket_id || item.conversation_id || ""),
    status: normalizeStatus(item.status || item.estado),
    role: normalizeRole(item.role || item.rol_origen || "driver"),
    name: conversationName(item),
    subject: String(item.subject || item.asunto || "").trim(),
    unread_count: Number(item.unread_count || item.unreadCount || 0),
    updated_at: item.updated_at || item.last_message_at || item.created_at || null,
    preview_text: getMessageText(lastMessage) || String(item.ultimo_mensaje || item.last_message || "").trim(),
    messages
  };
}

function isDriverOwnedConversation(item) {
  const currentUserId = String(supportState.currentUserId || "").trim();
  const currentUserEmail = normalizeText(supportState.currentUserEmail || "");
  const conversationRole = normalizeRole(item?.role || item?.rol_origen || item?.metadata?.role || "driver");
  const ownerId = String(item?.user_id || item?.created_by || item?.owner_id || "").trim();
  const email = normalizeText(item?.email || item?.user_email || item?.metadata?.email || "");

  if (conversationRole !== "driver") return false;

  if (currentUserId && ownerId && ownerId === currentUserId) return true;
  if (currentUserEmail && email && email === currentUserEmail) return true;

  return false;
}

function isMobileSupport() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function showToast(message, type = "info") {
  if (typeof window.uiController?.showToast === "function") {
    window.uiController.showToast(message, type);
    return;
  }
  console.log(`[driver-support.${type}]`, message);
}
function canAskForNotifications() {
  return "Notification" in window && "serviceWorker" in navigator;
}
function updateSupportSmartActionsUI() {
  const { pushBtn, installBtn, pushBadge, smartNote } = getEls();

  const notificationSupported = "Notification" in window;
  const installAvailable = !!supportState.installPromptEvent;
  const permission = notificationSupported ? Notification.permission : "unsupported";
  const pushActive = supportState.pushEnabled || permission === "granted";

  if (pushBtn) {
    if (!notificationSupported) {
      pushBtn.disabled = true;
      pushBtn.innerHTML = `<span aria-hidden="true">🔕</span><span>Alertas no compatibles</span>`;
    } else if (pushActive) {
      pushBtn.disabled = true;
      pushBtn.innerHTML = `<span aria-hidden="true">✅</span><span>Alertas activadas</span>`;
    } else if (permission === "denied") {
      pushBtn.disabled = true;
      pushBtn.innerHTML = `<span aria-hidden="true">⚠️</span><span>Alertas bloqueadas</span>`;
    } else {
      pushBtn.disabled = false;
      pushBtn.innerHTML = `<span aria-hidden="true">🔔</span><span>Activar alertas</span>`;
    }
  }

  if (pushBadge) {
    pushBadge.hidden = !pushActive;
  }

  if (installBtn) {
    installBtn.hidden = !installAvailable;
    installBtn.disabled = !installAvailable;
    if (installAvailable) {
      installBtn.innerHTML = `<span aria-hidden="true">⬇️</span><span>Instalar app</span>`;
    }
  }

function updateSupportUIState() {
  const {
    enableAlertsBtn,
    enableAlertsBtnEmpty,
    installAppBtn,
    installAppBtnEmpty,
    setupStatus,
    alertsBadge
  } = getEls();

  const permission = "Notification" in window ? Notification.permission : "unsupported";
  const enabled = supportState.pushEnabled || permission === "granted";
  const installAvailable = !!supportState.installPromptEvent;

  const paintAlertBtn = (btn) => {
    if (!btn) return;

    if (enabled) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="support-utility-btn-icon" aria-hidden="true">✅</span>
        <span class="support-utility-btn-text">Alertas activadas</span>
      `;
      return;
    }

    if (permission === "denied") {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="support-utility-btn-icon" aria-hidden="true">⚠️</span>
        <span class="support-utility-btn-text">Bloqueadas</span>
      `;
      return;
    }

    btn.disabled = false;
    btn.innerHTML = `
      <span class="support-utility-btn-icon" aria-hidden="true">🔔</span>
      <span class="support-utility-btn-text">Activar alertas</span>
    `;
  };

  paintAlertBtn(enableAlertsBtn);
  paintAlertBtn(enableAlertsBtnEmpty);

  const paintInstallBtn = (btn) => {
    if (!btn) return;
    btn.hidden = !installAvailable;
    btn.disabled = !installAvailable;
  };

  paintInstallBtn(installAppBtn);
  paintInstallBtn(installAppBtnEmpty);

  if (alertsBadge) {
    alertsBadge.hidden = !enabled;
  }

  if (setupStatus) {
    if (enabled) {
      setupStatus.textContent = "Ya tenés activadas las alertas de soporte.";
    } else if (permission === "denied") {
      setupStatus.textContent = "Las alertas están bloqueadas en el navegador.";
    } else {
      setupStatus.textContent = "Las alertas están desactivadas.";
    }
  }
}
  
async function ensureSupportPushPermissionOnOpen(options = {}) {
  const { forcePrompt = false, silentDenied = false } = options;

  if (supportState.pushEnabled) {
    updateSupportUIState();
    return true;
  }

async function ensureSupportPushPermissionOnOpen(options = {}) {
  const { forcePrompt = false, silentDenied = false } = options;

  if (supportState.pushEnabled) {
    updateSupportUIState();
    return true;
  }

  if (!canAskForNotifications()) {
    updateSupportUIState();
    return false;
  }

  if (supportState.pushPromptShown && !forcePrompt) {
    const granted = Notification.permission === "granted";
    supportState.pushEnabled = granted;
    updateSupportUIState();
    return granted;
  }

  supportState.pushPromptShown = true;

  try {
    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      console.warn("[driver-support] permiso de notificaciones no concedido:", permission);
      supportState.pushEnabled = false;
      updateSupportUIState();

      if (!silentDenied) {
        showToast("No activaste las notificaciones de soporte", "warning");
      }
      return false;
    }

    await initSupportPushFCM();
    supportState.pushEnabled = true;
    updateSupportUIState();
    showToast("Notificaciones de soporte activadas", "success");
    return true;
  } catch (err) {
    supportState.pushEnabled = false;
    updateSupportUIState();
    console.warn("[driver-support] error activando notificaciones:", err);
    showToast("No se pudieron activar las notificaciones", "error");
    return false;
  }
}
  
function bindInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    supportState.installPromptEvent = event;
    updateSupportUIState();
  });

  window.addEventListener("appinstalled", () => {
    supportState.installPromptEvent = null;
    supportState.installPromptShown = true;
    updateSupportUIState();
    showToast("App instalada correctamente", "success");
  });
}
async function maybeShowInstallPrompt() {
  const deferredPrompt = supportState.installPromptEvent;
  if (!deferredPrompt) {
    updateSupportUIState();
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    supportState.installPromptEvent = null;
    supportState.installPromptShown = choice?.outcome === "accepted";
    updateSupportUIState();
    return choice?.outcome === "accepted";
  } catch (err) {
    console.warn("[driver-support] install prompt error:", err);
    updateSupportUIState();
    return false;
  }
}

function withTimeout(promise, timeoutMs = SUPPORT_REQUEST_TIMEOUT_MS, message = "Tiempo de espera agotado") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function getSession(forceRefresh = false) {
  const ready = await supabaseService.init();
  if (!ready || !supabaseService.client) {
    throw new Error("No se pudo inicializar Supabase");
  }

  try {
    const { data } = await supabaseService.client.auth.getSession();
    let session = data?.session || null;

    if (session?.user?.id) {
      return session;
    }

    if (forceRefresh) {
      try {
        const { data: refreshed } = await supabaseService.client.auth.refreshSession();
        session = refreshed?.session || session;
      } catch (refreshErr) {
        console.warn("[driver-support.getSession] refresh warning:", refreshErr);
      }
    }

    return session;
  } catch (err) {
    console.warn("[driver-support.getSession] getSession error:", err);
    return null;
  }
}

async function getAccessToken(forceRefresh = false) {
  const session = await getSession(forceRefresh);
  if (!session?.access_token || !session?.user?.id) {
    throw new Error("No hay sesion activa");
  }

  supportState.currentUserId = session.user.id;
  supportState.currentUserEmail = session.user.email || null;
  return session.access_token;
}

async function getCurrentUser() {
  const session = await getSession(false);
  if (!session?.user?.id) {
    throw new Error("No hay usuario activo");
  }
  supportState.currentUserId = session.user.id;
  supportState.currentUserEmail = session.user.email || null;
  return session.user;
}

function updateBadge() {
  const { badge } = getEls();
  if (!badge) return;

  const unread = supportState.conversations.reduce((total, item) => total + Number(item.unread_count || 0), 0);
  badge.hidden = unread <= 0;
  badge.textContent = unread > 99 ? "99+" : String(unread);
}

function applyFilters() {
  const { search, filter } = getEls();
  const term = normalizeText(search?.value || "");
  const status = normalizeText(filter?.value || "all");

  supportState.filtered = supportState.conversations.filter((item) => {
    const haystack = [
      item.name,
      item.subject,
      item.preview_text,
      conversationSecondary(item)
    ].join(" ").toLowerCase();

    const matchesSearch = !term || haystack.includes(term);
    const matchesStatus = status === "all" ? true : normalizeStatus(item.status) === status;
    return matchesSearch && matchesStatus;
  });
}

function getCurrentConversation() {
  return supportState.conversations.find((item) => String(item.id) === String(supportState.selectedId)) || null;
}

function setBusy(isBusy) {
  supportState.loadingList = !!isBusy;
  const { refresh, threadRefresh } = getEls();
  if (refresh) refresh.disabled = !!isBusy;
  if (threadRefresh) threadRefresh.disabled = !!isBusy;
}

function setSendBusy(isBusy) {
  supportState.sendingReply = !!isBusy;
  const { send, reply, attachmentInput } = getEls();

  if (send) {
    send.disabled = !!isBusy;
    send.textContent = isBusy ? "Enviando..." : "Enviar respuesta";
  }

  if (reply) reply.disabled = !!isBusy;
  if (attachmentInput) attachmentInput.disabled = !!isBusy;
}

function syncLayout() {
  const { shell, sidebar, thread, threadBack } = getEls();
  if (!shell) return;

  const mobile = isMobileSupport();
  const threadOpen = mobile && (supportState.mobileThreadOpen || !supportState.filtered.length);

  shell.classList.toggle("is-mobile-support", mobile);
  shell.classList.toggle("is-thread-open", threadOpen);

  if (sidebar) sidebar.hidden = mobile ? threadOpen : false;
  if (thread) thread.hidden = mobile ? !threadOpen : false;
  if (threadBack) threadBack.hidden = !mobile;
}

function openMobileThread() {
  if (!isMobileSupport()) return;
  supportState.mobileThreadOpen = true;
  syncLayout();
}

function closeMobileThread() {
  supportState.mobileThreadOpen = false;
  syncLayout();
}

function scrollMessagesToBottom(smooth = false) {
  const { messages } = getEls();
  if (!messages) return;

  try {
    messages.scrollTo({
      top: messages.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });
  } catch {
    messages.scrollTop = messages.scrollHeight;
  }
}

function renderConversationList() {
  const { list } = getEls();
  if (!list) return;

  if (!supportState.filtered.length) {
    list.innerHTML = `
      <div class="support-empty-state">
        No hay chats todavia. Escribinos y abrimos la conversacion automaticamente.
      </div>
    `;
    return;
  }

  list.innerHTML = supportState.filtered.map((item) => `
    <button
      class="support-conversation-item ${String(supportState.selectedId) === String(item.id) ? "active" : ""}"
      data-support-id="${escapeAttr(item.id)}"
      type="button"
    >
      <div class="support-conversation-avatar">${escapeHtml(initials(item.name))}</div>

      <div class="support-conversation-body">
        <div class="support-conversation-top">
          <div class="support-conversation-name">${escapeHtml(item.name)}</div>
          <div class="support-conversation-time">${formatTime(item.updated_at)}</div>
        </div>

        <div class="support-conversation-meta">
          <span class="support-role-badge">${escapeHtml(roleLabel(item.role))}</span>
          <span class="support-status-badge ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
        </div>

        <div class="support-conversation-secondary">${escapeHtml(conversationSecondary(item))}</div>
        <div class="support-conversation-preview">${escapeHtml(item.preview_text || "Sin mensajes")}</div>
      </div>

      ${Number(item.unread_count || 0) > 0 ? `<div class="support-conversation-unread">${Number(item.unread_count || 0)}</div>` : ""}
    </button>
  `).join("");
}

function renderSelectedConversation() {
  const {
    threadEmpty,
    threadPanel,
    messages,
    threadAvatar,
    threadName,
    threadSubmeta
  } = getEls();

  const current = getCurrentConversation();

  if (!threadEmpty || !threadPanel || !messages) return;

if (!current) {
  threadEmpty.hidden = false;
  threadPanel.hidden = true;
  messages.innerHTML = "";
  updateBadge();
  setSendBusy(false);
  syncLayout();
  return;
}

  threadEmpty.hidden = true;
  threadPanel.hidden = false;

  if (threadAvatar) threadAvatar.textContent = initials(current.name);
  if (threadName) threadName.textContent = current.name || "Soporte";
  if (threadSubmeta) {
    threadSubmeta.textContent = [
      roleLabel(current.role),
      statusLabel(current.status),
      formatDateTime(current.updated_at)
    ].filter(Boolean).join(" · ");
  }

  const msgList = Array.isArray(current.messages) ? current.messages : [];
  messages.innerHTML = msgList.length
    ? msgList.map((msg) => {
        const role = normalizeRole(msg.sender_role || msg.role || "driver");
        const isIncoming = role === "admin";
        const attachments = normalizeAttachments(msg);

        const attachmentsHtml = attachments.length
          ? `
            <div class="support-message-attachments">
              ${attachments.map((file) => {
                const safeUrl = String(file?.url || "").trim();
                if (!safeUrl) return "";
                return `
                  <a href="${escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="support-attachment-chip">
                    Adj. ${escapeHtml(file?.name || "Archivo")}
                  </a>
                `;
              }).join("")}
            </div>
          `
          : "";

        return `
          <div class="support-message-row ${isIncoming ? "incoming" : "outgoing"}">
            <div class="support-message-bubble">
              ${getMessageText(msg) ? `<div>${escapeHtml(getMessageText(msg))}</div>` : ""}
              ${attachmentsHtml}
              <div class="support-message-meta">
                ${escapeHtml(roleLabel(role))} · ${formatTime(msg.created_at)}
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="support-empty-state">Todavia no hay mensajes en esta conversacion.</div>`;

  syncLayout();
  scrollMessagesToBottom(false);
}

function selectConversation(id, options = {}) {
  const { openThread = true, markVisualRead = false } = options;
  supportState.selectedId = String(id);

  if (markVisualRead) {
    const current = getCurrentConversation();
    if (current && normalizeStatus(current.status) === "esperando_usuario") {
      current.unread_count = 0;
      current.status = "en_proceso";
    }
  }

  renderConversationList();
  renderSelectedConversation();
  updateBadge();

  if (openThread && isMobileSupport()) {
    openMobileThread();
  } else {
    syncLayout();
  }
}

async function uploadAttachments(conversationId, files) {
  if (!files.length) return [];
  const ready = await supabaseService.init();
  if (!ready || !supabaseService.client) return [];

  const uploaded = [];

  for (const file of files) {
    const ext = String(file.name || "bin").split(".").pop() || "bin";
    const path = `support/${conversationId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await supabaseService.client
      .storage
      .from("support-attachments")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream"
      });

    if (error) throw error;

    const { data } = supabaseService.client
      .storage
      .from("support-attachments")
      .getPublicUrl(path);

    uploaded.push({
      name: file.name,
      path,
      url: data?.publicUrl || "",
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size || 0
    });
  }

  return uploaded;
}

async function createConversationIfNeeded(initialMessage) {
  const current = getCurrentConversation();
  if (current?.id) return current.id;

  const user = await getCurrentUser();
  const subject = initialMessage
    ? `Consulta chofer · ${new Date().toLocaleDateString("es-AR")}`
    : "Consulta general chofer";

  const { data, error } = await supabaseService.client
.from("soporte_tickets")
.insert({
  created_by: user.id,
  user_id: user.id,
  rol_origen: "driver",
  asunto: subject,
  canal: "in_app",
  categoria: "driver",
  prioridad: "normal",
  estado: "abierto",
  ultimo_mensaje: initialMessage || "",
  last_message_at: new Date().toISOString(),
  metadata: {
    email: user.email || null,
    role: "driver",
    source: "chofer-panel"
  }
})
    .select("*")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "No se pudo crear la conversacion");
  }

  const normalized = normalizeConversation({
    ...data,
    id: data.id,
    status: data.estado,
    subject: data.asunto,
    last_message: data.ultimo_mensaje,
    messages: []
  });

  if (normalized) {
    supportState.conversations = [normalized, ...supportState.conversations.filter((item) => String(item.id) !== String(normalized.id))];
    applyFilters();
    supportState.selectedId = String(normalized.id);
  }

  return String(data.id);
}

async function sendSupportReply() {
  if (supportState.sendingReply) return;

  const { reply, attachmentInput } = getEls();
  const text = String(reply?.value || "").trim();
  const files = Array.from(attachmentInput?.files || []);

  if (!text && !files.length) {
    showToast("Escribi un mensaje o adjunta un archivo", "warning");
    return;
  }

  const previousText = text;

  try {
    setSendBusy(true);

    const session = await getSession(false);
    if (!session?.user?.id) {
      throw new Error("No hay sesion activa");
    }

    const conversationId = await withTimeout(
      createConversationIfNeeded(previousText),
      SUPPORT_REQUEST_TIMEOUT_MS,
      "No se pudo abrir el chat de soporte"
    );
    const uploadedAttachments = await withTimeout(
      uploadAttachments(conversationId, files),
      SUPPORT_REQUEST_TIMEOUT_MS,
      "No se pudieron subir los adjuntos"
    );

    const nowIso = new Date().toISOString();
    const messagePayload = {
      ticket_id: conversationId,
      sender_user_id: session.user.id,
      sender_role: "driver",
      mensaje: previousText || "",
      leido: false,
      mensaje_tipo: uploadedAttachments.length
        ? (previousText ? "mixto" : "archivo")
        : "texto",
      metadata: {
        attachments: uploadedAttachments,
        sender_name: "Chofer MIMI",
        source: "chofer-panel",
        created_at: nowIso
      }
    };

    const { error: ticketUpdateError } = await withTimeout(
      supabaseService.client
        .from("soporte_tickets")
        .update({
          ultimo_mensaje: previousText || (uploadedAttachments.length ? "Adjunto enviado" : ""),
          last_message_at: nowIso,
          estado: "esperando_usuario",
          updated_at: nowIso
        })
        .eq("id", conversationId),
      SUPPORT_REQUEST_TIMEOUT_MS,
      "No se pudo actualizar la conversacion"
    );

    if (ticketUpdateError) {
      console.warn("[driver-support.sendSupportReply] ticket update warning:", ticketUpdateError);
    }

    const { data: insertedMessage, error: messageError } = await withTimeout(
      supabaseService.client
        .from("soporte_mensajes")
        .insert(messagePayload)
        .select("*")
        .single(),
      SUPPORT_REQUEST_TIMEOUT_MS,
      "No se pudo enviar el mensaje"
    );

    if (messageError || !insertedMessage?.id) {
      throw new Error(messageError?.message || "No se pudo enviar el mensaje");
    }

    if (reply) {
      reply.value = "";
      reply.style.height = "";
    }

    if (attachmentInput) {
      attachmentInput.value = "";
    }

    const currentConversation = supportState.conversations.find((item) => String(item.id) === String(conversationId));
    if (currentConversation) {
      currentConversation.status = "esperando_usuario";
      currentConversation.updated_at = nowIso;
      currentConversation.preview_text = previousText || "Adjunto enviado";
      currentConversation.messages = Array.isArray(currentConversation.messages)
        ? [...currentConversation.messages, insertedMessage]
        : [insertedMessage];
    }

    await loadSupportConversations({ preserveSelection: true, silent: true, preferredId: conversationId });
    if (supportState.selectedId) {
      selectConversation(supportState.selectedId, { openThread: true });
    }
    scrollMessagesToBottom(true);
    showToast("Mensaje enviado", "success");
  } catch (err) {
    console.error("[driver-support.sendSupportReply]", err);
    showToast(err?.message || "No se pudo enviar el mensaje", "error");
  } finally {
    setSendBusy(false);
  }
}

async function fallbackLoadConversations(preferredId = null) {
  const user = await getCurrentUser();

  const { data: tickets, error } = await supabaseService.client
    .from("soporte_tickets")
    .select("*")
    .in("rol_origen", ["driver", "chofer"])
    .or(`user_id.eq.${user.id},created_by.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const conversations = await Promise.all(
    (Array.isArray(tickets) ? tickets : []).map(async (ticket) => {
      const { data: messages } = await supabaseService.client
        .from("soporte_mensajes")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });

      return normalizeConversation({
        ...ticket,
        id: ticket.id,
        status: ticket.estado,
        subject: ticket.asunto,
        last_message: ticket.ultimo_mensaje,
        messages: Array.isArray(messages) ? messages : []
      });
    })
  );

  supportState.conversations = conversations.filter((item) => item && isDriverOwnedConversation(item));
  applyFilters();

  const previousId = preferredId || supportState.selectedId;
  const existing = previousId && supportState.conversations.some((item) => String(item.id) === String(previousId));

  if (existing) {
    supportState.selectedId = String(previousId);
  } else if (supportState.filtered[0]) {
    supportState.selectedId = String(supportState.filtered[0].id);
  } else {
    supportState.selectedId = null;
    supportState.mobileThreadOpen = false;
  }

  renderConversationList();
  renderSelectedConversation();
  updateBadge();
}

async function loadSupportConversations(options = {}) {
  const { preserveSelection = true, silent = false, preferredId = null } = options;

  try {
    if (!silent) setBusy(true);

    await fallbackLoadConversations(preferredId || (preserveSelection ? supportState.selectedId : null));
    return;
  } catch (scopedErr) {
    console.warn("[driver-support.loadSupportConversations.scoped]", scopedErr);

    try {
      const token = await getAccessToken(true);
      const response = await fetch(`${SUPPORT_API_BASE}/support-list-conversation`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || "No se pudo cargar soporte");
      }

      const previousId = preserveSelection ? (preferredId || supportState.selectedId) : null;

      supportState.conversations = (Array.isArray(data.conversations) ? data.conversations : [])
        .map(normalizeConversation)
        .filter((item) => item && isDriverOwnedConversation(item));

      applyFilters();

      const existing = previousId && supportState.conversations.some((item) => String(item.id) === String(previousId));
      if (existing) {
        supportState.selectedId = String(previousId);
      } else if (supportState.filtered[0]) {
        supportState.selectedId = String(supportState.filtered[0].id);
      } else {
        supportState.selectedId = null;
        supportState.mobileThreadOpen = false;
      }

      renderConversationList();
      renderSelectedConversation();
      updateBadge();

      if (!silent) {
        showToast("Soporte cargado con respaldo", "success");
      }
    } catch (fallbackErr) {
      console.error("[driver-support.loadSupportConversations]", fallbackErr);
      supportState.conversations = [];
      supportState.filtered = [];
      supportState.selectedId = null;
      supportState.mobileThreadOpen = false;
      renderConversationList();
      renderSelectedConversation();
      updateBadge();
      if (!silent) {
        showToast(fallbackErr?.message || "No se pudo cargar soporte", "error");
      }
    }
  } finally {
    if (!silent) setBusy(false);
  }
}

function autoResizeReply() {
  const { reply } = getEls();
  if (!reply) return;
  reply.style.height = "auto";
  reply.style.height = `${Math.min(reply.scrollHeight, 180)}px`;
}

function stopPolling() {
  if (supportState.pollTimer) {
    clearInterval(supportState.pollTimer);
    supportState.pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  supportState.pollTimer = window.setInterval(() => {
    if (document.hidden || !supportState.panelOpen) return;
    loadSupportConversations({ preserveSelection: true, silent: true });
  }, SUPPORT_POLL_MS);
}

function unsubscribeRealtime() {
  if (supportState.realtimeChannel && supabaseService.client) {
    try {
      supabaseService.client.removeChannel(supportState.realtimeChannel);
    } catch {}
  }
  supportState.realtimeChannel = null;
}

async function subscribeRealtime() {
  const ready = await supabaseService.init();
  if (!ready || !supabaseService.client) return;

  const user = await getCurrentUser().catch(() => null);
  if (!user?.id) return;

  unsubscribeRealtime();

  supportState.realtimeChannel = supabaseService.client
    .channel(`driver-support-${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "soporte_mensajes"
      },
      async () => {
        await loadSupportConversations({ preserveSelection: true, silent: true });
        if (supportState.panelOpen && supportState.selectedId) {
          selectConversation(supportState.selectedId, { openThread: true });
        }
      }
    )
    .subscribe();
}

export async function openDriverSupportPanel() {
  const { overlay, panel } = getEls();
  if (!overlay || !panel) return;

  overlay.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("support-open");
  supportState.panelOpen = true;
  syncLayout();

  await loadSupportConversations({ preserveSelection: true, silent: false });
  await subscribeRealtime().catch(() => null);
  startPolling();

await ensureSupportPushPermissionOnOpen({ silentDenied: true }).catch(() => null);
updateSupportUIState();
}
export function closeDriverSupportPanel() {
  const { overlay, panel } = getEls();
  if (!overlay || !panel) return;

  overlay.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("support-open");
  supportState.panelOpen = false;
  supportState.mobileThreadOpen = false;
  syncLayout();
  stopPolling();
}

function handleResize() {
  if (!isMobileSupport()) {
    supportState.mobileThreadOpen = false;
  }
  syncLayout();
}

function bindPushHooks() {
  window.__mimiSupportPushRole = "driver";

  window.obtenerSesionCliente = async function obtenerSesionCliente(forceRefresh = false) {
    return getSession(forceRefresh);
  };

  window.supabaseInsert = async function supabaseInsert(table, data) {
    const ready = await supabaseService.init();
    if (!ready || !supabaseService.client) {
      return { error: { message: "Supabase no disponible" } };
    }

    try {
      const query = supabaseService.client.from(table).insert(data).select();
      const { data: result, error } = Array.isArray(data)
        ? await query
        : await query.single();

      return { data: result, error };
    } catch (err) {
      return { error: { message: err?.message || "Insert error" } };
    }
  };

  window.supabaseUpdate = async function supabaseUpdate(table, matchColumn, matchValue, data) {
    const ready = await supabaseService.init();
    if (!ready || !supabaseService.client) {
      return { error: { message: "Supabase no disponible" } };
    }

    try {
      const { data: result, error } = await supabaseService.client
        .from(table)
        .update(data)
        .eq(matchColumn, matchValue)
        .select();

      return { data: result, error };
    } catch (err) {
      return { error: { message: err?.message || "Update error" } };
    }
  };

  window.handleSupportPushForeground = async ({ title, body } = {}) => {
    await loadSupportConversations({ preserveSelection: true, silent: true });
    updateBadge();
    showToast(body || title || "Tenes una nueva respuesta de soporte", "success");
  };
}

export function initDriverSupport() {
  if (supportState.initialized) return;

  const els = getEls();
  if (!els.overlay || !els.list) return;

  supportState.initialized = true;
  bindPushHooks();

  els.close?.addEventListener("click", closeDriverSupportPanel);
  els.backdrop?.addEventListener("click", closeDriverSupportPanel);
  els.refresh?.addEventListener("click", () => loadSupportConversations({ preserveSelection: true, silent: false }));
  els.threadRefresh?.addEventListener("click", () => loadSupportConversations({ preserveSelection: true, silent: false }));
  els.pushBtn?.addEventListener("click", async () => {
  await ensureSupportPushPermissionOnOpen({ forcePrompt: true, silentDenied: false });
  updateSupportUIState();
});

els.installBtn?.addEventListener("click", async () => {
  const installed = await maybeShowInstallPrompt();
  if (!installed && !supportState.installPromptEvent) {
    showToast("La instalacion no esta disponible todavia en este navegador", "warning");
  }
  updateSupportUIState();
});
  els.search?.addEventListener("input", () => {
    applyFilters();
    renderConversationList();
  });
  els.filter?.addEventListener("change", () => {
    applyFilters();
    renderConversationList();
  });
  els.list?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-support-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-support-id");
    if (!id) return;
    selectConversation(id, { openThread: true, markVisualRead: true });
  });
  els.threadBack?.addEventListener("click", closeMobileThread);
  els.send?.addEventListener("click", sendSupportReply);
  els.reply?.addEventListener("input", autoResizeReply);
  els.reply?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendSupportReply();
    }
  });

  window.addEventListener("resize", handleResize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && supportState.panelOpen) {
      loadSupportConversations({ preserveSelection: true, silent: true });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && supportState.panelOpen) {
      closeDriverSupportPanel();
    }
  });

bindInstallPrompt();
updateSupportUIState();
handleResize();
loadSupportConversations({ preserveSelection: true, silent: true }).catch(() => null);
}
