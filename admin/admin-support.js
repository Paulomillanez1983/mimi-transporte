const supportState = {
  conversations: [],
  filtered: [],
  selectedId: null
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

function supportStatusClass(status) {
  switch (String(status || "").toUpperCase()) {
    case "UNREAD":
      return "unread";
    case "RESOLVED":
      return "resolved";
    default:
      return "pending";
  }
}

function getSupportElements() {
  return {
    list: document.getElementById("supportConversationList"),
    search: document.getElementById("supportSearchInput"),
    filter: document.getElementById("supportFilterStatus"),
    refresh: document.getElementById("supportRefreshBtn"),
    threadEmpty: document.getElementById("supportThreadEmpty"),
    threadPanel: document.getElementById("supportThreadPanel"),
    threadAvatar: document.getElementById("supportThreadAvatar"),
    threadName: document.getElementById("supportThreadName"),
    threadSubmeta: document.getElementById("supportThreadSubmeta"),
    messages: document.getElementById("supportMessages"),
    reply: document.getElementById("supportReplyInput"),
    send: document.getElementById("supportSendReplyBtn"),
    markRead: document.getElementById("supportMarkReadBtn"),
    markPending: document.getElementById("supportMarkPendingBtn"),
    markResolved: document.getElementById("supportMarkResolvedBtn")
  };
}

/* DEMO LOCAL
   Después lo reemplazamos por Supabase real
*/
function getMockSupportData() {
  return [
    {
      id: "conv_1",
      name: "Paulo Millanez",
      role: "cliente",
      subject: "Consulta sobre mi viaje",
      email: "paulomillanez@gmail.com",
      status: "UNREAD",
      unread_count: 2,
      updated_at: new Date().toISOString(),
      messages: [
        {
          id: "m1",
          sender_role: "cliente",
          text: "Hola, no veo al chofer todavía. ¿Me pueden ayudar?",
          created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString()
        },
        {
          id: "m2",
          sender_role: "cliente",
          text: "Ya estoy en el punto de retiro.",
          created_at: new Date(Date.now() - 1000 * 60 * 7).toISOString()
        }
      ]
    },
    {
      id: "conv_2",
      name: "Juan Pérez",
      role: "chofer",
      subject: "Problema con validación",
      email: "juanchofer@gmail.com",
      status: "PENDING",
      unread_count: 0,
      updated_at: new Date(Date.now() - 1000 * 60 * 26).toISOString(),
      messages: [
        {
          id: "m3",
          sender_role: "chofer",
          text: "Hola, no me deja subir la foto del seguro.",
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        }
      ]
    }
  ];
}

function applySupportFilters() {
  const { search, filter } = getSupportElements();

  const term = String(search?.value || "").trim().toLowerCase();
  const status = String(filter?.value || "ALL").toUpperCase();

  supportState.filtered = supportState.conversations.filter((item) => {
    const matchesSearch =
      !term ||
      item.name?.toLowerCase().includes(term) ||
      item.email?.toLowerCase().includes(term) ||
      item.subject?.toLowerCase().includes(term);

    const normalizedStatus = String(item.status || "").toUpperCase();
    const matchesStatus = status === "ALL" ? true : normalizedStatus === status;

    return matchesSearch && matchesStatus;
  });
}

function renderConversationList() {
  const { list } = getSupportElements();
  if (!list) return;

  if (!supportState.filtered.length) {
    list.innerHTML = `<div class="support-empty-state">No hay conversaciones para mostrar.</div>`;
    return;
  }

  list.innerHTML = supportState.filtered.map((item) => {
    const last = item.messages?.[item.messages.length - 1];
    return `
      <button class="support-conversation-item ${supportState.selectedId === item.id ? "active" : ""}" data-support-id="${item.id}" type="button">
        <div class="support-conversation-avatar">${supportInitials(item.name)}</div>

        <div class="support-conversation-body">
          <div class="support-conversation-top">
            <div class="support-conversation-name">${item.name}</div>
            <div class="support-conversation-time">${supportFormatTime(item.updated_at)}</div>
          </div>

          <div class="support-conversation-meta">
            <span class="support-role-badge">${item.role}</span>
            <span class="support-status-badge ${supportStatusClass(item.status)}">${item.status}</span>
          </div>

          <div class="support-conversation-preview">
            ${last?.text || item.subject || "Sin mensajes"}
          </div>
        </div>

        ${item.unread_count > 0 ? `<div class="support-conversation-unread">${item.unread_count}</div>` : ""}
      </button>
    `;
  }).join("");
}

function renderSelectedConversation() {
  const els = getSupportElements();
  const current = supportState.conversations.find((x) => x.id === supportState.selectedId);

  if (!current) {
    els.threadEmpty.hidden = false;
    els.threadPanel.hidden = true;
    return;
  }

  els.threadEmpty.hidden = true;
  els.threadPanel.hidden = false;

  els.threadAvatar.textContent = supportInitials(current.name);
  els.threadName.textContent = current.name;
  els.threadSubmeta.textContent = `${current.role} · ${current.status.toLowerCase()} · ${current.subject || "sin asunto"}`;

  els.messages.innerHTML = (current.messages || []).map((msg) => `
    <div class="support-message-row ${msg.sender_role === "admin" ? "admin" : "user"}">
      <div class="support-message-bubble">
        <div>${msg.text}</div>
        <div class="support-message-meta">
          ${msg.sender_role} · ${supportFormatTime(msg.created_at)}
        </div>
      </div>
    </div>
  `).join("");

  els.messages.scrollTop = els.messages.scrollHeight;
}

function selectConversation(id) {
  supportState.selectedId = id;
  renderConversationList();
  renderSelectedConversation();
}

function updateConversationStatus(status) {
  const current = supportState.conversations.find((x) => x.id === supportState.selectedId);
  if (!current) return;

  current.status = status;

  if (status !== "UNREAD") {
    current.unread_count = 0;
  }

  applySupportFilters();
  renderConversationList();
  renderSelectedConversation();
}

function sendSupportReply() {
  const els = getSupportElements();
  const current = supportState.conversations.find((x) => x.id === supportState.selectedId);
  const text = String(els.reply?.value || "").trim();

  if (!current || !text) return;

  current.messages.push({
    id: `admin_${Date.now()}`,
    sender_role: "admin",
    text,
    created_at: new Date().toISOString()
  });

  current.status = "PENDING";
  current.updated_at = new Date().toISOString();
  els.reply.value = "";

  applySupportFilters();
  renderConversationList();
  renderSelectedConversation();
}

async function loadSupportConversations() {
  supportState.conversations = getMockSupportData();
  applySupportFilters();
  renderConversationList();

  if (!supportState.selectedId && supportState.filtered[0]) {
    supportState.selectedId = supportState.filtered[0].id;
  }

  renderConversationList();
  renderSelectedConversation();
}

export function initAdminSupport() {
  const els = getSupportElements();
  if (!els.list) return;

  els.search?.addEventListener("input", () => {
    applySupportFilters();
    renderConversationList();
  });

  els.filter?.addEventListener("change", () => {
    applySupportFilters();
    renderConversationList();
  });

  els.refresh?.addEventListener("click", loadSupportConversations);

  els.list?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-support-id]");
    if (!btn) return;
    selectConversation(btn.getAttribute("data-support-id"));
  });

  els.send?.addEventListener("click", sendSupportReply);
  els.markRead?.addEventListener("click", () => updateConversationStatus("PENDING"));
  els.markPending?.addEventListener("click", () => updateConversationStatus("PENDING"));
  els.markResolved?.addEventListener("click", () => updateConversationStatus("RESOLVED"));

  loadSupportConversations();
}
