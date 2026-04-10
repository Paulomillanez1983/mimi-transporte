import supabaseAdminService from "./supabase-admin-client.js";

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
async function getAdminAccessToken() {
  const session = await supabaseAdminService.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("Sesión admin expirada");
  }

  return token;
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
    .replaceAll(">", "&gt;");
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

els.messages.innerHTML = (current.messages || []).map((msg) => {
  const isAdmin = msg.sender_role === "admin";
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
                    href="${escapeHtmlAttr(file.url || "#")}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="support-attachment-chip"
                  >
                    📎 ${escapeHtmlSupport(file.name || "Adjunto")}
                  </a>
                `).join("")}
              </div>
            `
            : ""
        }

        <div class="support-message-meta">
          ${msg.sender_role} · ${supportFormatTime(msg.created_at)}
          ${ticks ? `<span class="support-message-ticks">${ticks}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}).join("");
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

async function sendSupportReply() {
  const els = getSupportElements();
  const current = supportState.conversations.find((x) => x.id === supportState.selectedId);
  const text = String(els.reply?.value || "").trim();

  const attachmentInput = document.getElementById("supportAttachmentInput");
  const files = Array.from(attachmentInput?.files || []);

  if (!current || (!text && !files.length)) return;

  const previousText = els.reply.value;
  els.send.disabled = true;

  try {
    const token = await getAdminAccessToken();

    const uploadedAttachments = [];

    for (const file of files) {
      const fileExt = file.name.split(".").pop() || "bin";
      const fileName = `support/${current.id}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

      const ready = await supabaseAdminService.init();
      if (!ready || !supabaseAdminService.client) {
        throw new Error("No se pudo inicializar Supabase para adjuntos");
      }

      const { error: uploadError } = await supabaseAdminService.client
        .storage
        .from("support-attachments")
        .upload(fileName, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });

      if (uploadError) throw uploadError;

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

    const response = await fetch(
      "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/support-send-message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          conversation_id: current.id,
          message: text,
          sender_role: "admin",
          attachments: uploadedAttachments
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo enviar la respuesta");
    }

    els.reply.value = "";
    if (attachmentInput) attachmentInput.value = "";

    await loadSupportConversations();

    if (supportState.selectedId) {
      selectConversation(supportState.selectedId);
    }
  } catch (err) {
    console.error("[support.sendSupportReply]", err);
    els.reply.value = previousText;
    alert(err?.message || "No se pudo enviar el mensaje");
  } finally {
    els.send.disabled = false;
  }
}
async function loadSupportConversations() {
  try {
    const token = await getAdminAccessToken();

    const response = await fetch(
      "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/support-list-conversations",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudieron cargar las conversaciones");
    }

    supportState.conversations = Array.isArray(data.conversations)
      ? data.conversations
      : [];

    applySupportFilters();

    if (
      !supportState.selectedId &&
      supportState.filtered[0]
    ) {
      supportState.selectedId = supportState.filtered[0].id;
    }

    renderConversationList();
    renderSelectedConversation();
  } catch (err) {
    console.error("[support.loadSupportConversations]", err);
    supportState.conversations = [];
    applySupportFilters();
    renderConversationList();
    renderSelectedConversation();
  }
}

async function persistConversationStatus(status) {
  const current = supportState.conversations.find((x) => x.id === supportState.selectedId);
  if (!current) return;

  try {
    const token = await getAdminAccessToken();

    const response = await fetch(
      "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/support-update-status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          conversation_id: current.id,
          status
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo actualizar el estado");
    }

    await loadSupportConversations();

    if (supportState.selectedId) {
      selectConversation(supportState.selectedId);
    }
  } catch (err) {
    console.error("[support.persistConversationStatus]", err);
    alert(err?.message || "No se pudo actualizar el estado");
  }
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
els.markRead?.addEventListener("click", () => persistConversationStatus("READ"));
els.markPending?.addEventListener("click", () => persistConversationStatus("PENDING"));
els.markResolved?.addEventListener("click", () => persistConversationStatus("RESOLVED"));

loadSupportConversations();
}
