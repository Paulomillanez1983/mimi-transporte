import supabaseAdminService from "./supabase-admin-client.js";

const API_BASE = "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1";
const SUPPORT_LIST_URL = `${API_BASE}/admin-list-support-conversations`;
const SUPPORT_SEND_URL = `${API_BASE}/admin-send-support-message`;
const SUPPORT_STATUS_URL = `${API_BASE}/admin-update-support-status`;

const supportListEl = document.getElementById("supportConversationList");
const supportMessagesEl = document.getElementById("supportMessages");
const supportMetaEl = document.getElementById("supportMeta");
const supportStatusEl = document.getElementById("supportStatus");
const supportComposerForm = document.getElementById("supportComposerForm");
const supportComposerInput = document.getElementById("supportComposerInput");
const supportSendBtn = document.getElementById("supportSendBtn");
const supportEmptyEl = document.getElementById("supportEmpty");

let supportConversations = [];
let activeConversationId = null;
let supportLoading = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function getConversationTitle(conversation) {
  return (
    conversation?.subject ||
    `${conversation?.app_context === "transport" ? "Transporte" : "Servicios"} · ${conversation?.participant_role || "usuario"}`
  );
}

function getConversationSubtitle(conversation) {
  return conversation?.last_message_preview || "Sin mensajes todavía";
}

function getConversationMessages(conversation) {
  return Array.isArray(conversation?.svc_messages)
    ? [...conversation.svc_messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    : [];
}

function renderConversationList() {
  if (!supportListEl) return;

  if (!supportConversations.length) {
    supportListEl.innerHTML = `<div class="empty-state">No hay conversaciones.</div>`;
    return;
  }

  supportListEl.innerHTML = supportConversations
    .map((conversation) => {
      const isActive = conversation.id === activeConversationId;

      return `
        <button
          class="support-conversation-item ${isActive ? "is-active" : ""}"
          type="button"
          data-conversation-id="${escapeHtml(conversation.id)}"
        >
          <div class="support-conversation-main">
            <strong>${escapeHtml(getConversationTitle(conversation))}</strong>
            <span>${escapeHtml(getConversationSubtitle(conversation))}</span>
          </div>

          <div class="support-conversation-side">
            <small>${escapeHtml(formatDate(conversation.last_message_at || conversation.created_at))}</small>
            <span class="support-status-pill status-${escapeHtml(conversation.admin_status || "abierto")}">
              ${escapeHtml(conversation.admin_status || "abierto")}
            </span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderMessages() {
  if (!supportMessagesEl) return;

  const conversation = supportConversations.find((c) => c.id === activeConversationId);

  if (!conversation) {
    supportMessagesEl.innerHTML = `<div class="empty-state">Seleccioná una conversación.</div>`;
    supportMetaEl && (supportMetaEl.textContent = "Sin conversación seleccionada");
    supportStatusEl && (supportStatusEl.value = "abierto");
    return;
  }

  const messages = getConversationMessages(conversation);

  supportMetaEl &&
    (supportMetaEl.textContent = `${conversation.app_context} · ${conversation.participant_role} · ${conversation.status}`);

  supportStatusEl && (supportStatusEl.value = conversation.admin_status || "abierto");

  if (!messages.length) {
    supportMessagesEl.innerHTML = `<div class="empty-state">Sin mensajes todavía.</div>`;
    return;
  }

  supportMessagesEl.innerHTML = messages
    .map((message) => {
      const isAdmin = message.sender_role === "admin";

      return `
        <article class="support-message ${isAdmin ? "is-admin" : "is-user"}">
          <div class="support-message-bubble">
            <strong>${escapeHtml(isAdmin ? "Admin" : message.sender_role || "Usuario")}</strong>
            <p>${escapeHtml(message.body || "")}</p>
            <small>${escapeHtml(formatDate(message.created_at))}</small>
          </div>
        </article>
      `;
    })
    .join("");

  supportMessagesEl.scrollTop = supportMessagesEl.scrollHeight;
}

async function fetchSupportConversations() {
  if (supportLoading) return;
  supportLoading = true;

  try {
    const session = await supabaseAdminService.refreshSessionIfNeeded();

    const response = await fetch(SUPPORT_LIST_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No pudimos cargar soporte");
    }

    supportConversations = Array.isArray(data.conversations) ? data.conversations : [];

    if (!activeConversationId && supportConversations.length) {
      activeConversationId = supportConversations[0].id;
    }

    if (
      activeConversationId &&
      !supportConversations.some((conversation) => conversation.id === activeConversationId)
    ) {
      activeConversationId = supportConversations[0]?.id || null;
    }

    renderConversationList();
    renderMessages();
  } catch (error) {
    console.error("[admin-support.fetchSupportConversations]", error);
    if (supportListEl) {
      supportListEl.innerHTML = `<div class="empty-state error">No pudimos cargar soporte.</div>`;
    }
  } finally {
    supportLoading = false;
  }
}

async function sendSupportMessage(event) {
  event.preventDefault();

  const message = String(supportComposerInput?.value || "").trim();
  if (!activeConversationId || !message) return;

  try {
    const session = await supabaseAdminService.refreshSessionIfNeeded();

    supportSendBtn && (supportSendBtn.disabled = true);

    const response = await fetch(SUPPORT_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        conversation_id: activeConversationId,
        message
      })
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No pudimos enviar el mensaje");
    }

    supportComposerInput.value = "";
    await fetchSupportConversations();
  } catch (error) {
    console.error("[admin-support.sendSupportMessage]", error);
  } finally {
    supportSendBtn && (supportSendBtn.disabled = false);
  }
}

async function updateSupportStatus() {
  if (!activeConversationId || !supportStatusEl) return;

  try {
    const session = await supabaseAdminService.refreshSessionIfNeeded();

    await fetch(SUPPORT_STATUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        conversation_id: activeConversationId,
        status: supportStatusEl.value
      })
    });

    await fetchSupportConversations();
  } catch (error) {
    console.error("[admin-support.updateSupportStatus]", error);
  }
}

export function initAdminSupport() {
  supportListEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-conversation-id]");
    if (!button) return;

    activeConversationId = button.getAttribute("data-conversation-id");
    renderConversationList();
    renderMessages();
  });

  supportComposerForm?.addEventListener("submit", sendSupportMessage);
  supportStatusEl?.addEventListener("change", updateSupportStatus);

  fetchSupportConversations();
}
