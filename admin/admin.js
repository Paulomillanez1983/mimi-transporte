import supabaseAdminService from "./supabase-admin-client.js";

const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");
const logoutBtn = document.getElementById("logout");

const moduleButtons = Array.from(document.querySelectorAll("[data-admin-module]"));
const moduleSections = Array.from(document.querySelectorAll("[data-admin-section]"));
const mobileDockButtons = Array.from(document.querySelectorAll("[data-admin-mobile-view-target]"));

let activeModule = "transport";
let selectedSupportConversation = null;


function setActiveModule(moduleName = "transport") {
  activeModule = moduleName;

  document.body.setAttribute("data-admin-module", moduleName);

  moduleButtons.forEach((button) => {
    const active = button.dataset.adminModule === moduleName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  moduleSections.forEach((section) => {
    const visible = section.dataset.adminSection === moduleName;
    section.classList.toggle("is-active", visible);
    section.toggleAttribute("hidden", !visible);
  });

  mobileDockButtons.forEach((button) => {
    const active = button.dataset.adminMobileViewTarget === moduleName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  window.dispatchEvent(
    new CustomEvent("mimi-admin:module-change", {
      detail: { module: moduleName }
    })
  );
}

function setupModuleNavigation() {
  moduleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveModule(button.dataset.adminModule || "transport");
    });
  });

  mobileDockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveModule(button.dataset.adminMobileViewTarget || "transport");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function setupDynamicHeader() {
  const header = document.querySelector(".header");
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle("is-condensed", window.scrollY > 20);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function initAdaptiveTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = () => {
    const saved = localStorage.getItem("mimi-admin-theme");
    const theme = saved || (media.matches ? "dark" : "light");

    document.documentElement.setAttribute("data-theme", theme);

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", theme === "dark" ? "#0b1220" : "#f5f7fb");
    }
  };

  applyTheme();

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", applyTheme);
  } else if (typeof media.addListener === "function") {
    media.addListener(applyTheme);
  }
}

function renderSupportInbox(conversations = []) {
  const list = document.getElementById("supportConversationList");

  if (!list) {
    console.warn("[MIMI Admin Support] No existe #supportConversationList");
    return;
  }

  if (!conversations.length) {
    list.innerHTML = `
      <div class="support-empty-state">
        Todavía no hay conversaciones.
      </div>
    `;
    return;
  }

  list.innerHTML = conversations.map((c) => `
    <button class="support-thread-item" type="button" data-conversation-id="${c.id}">
      <div class="support-thread-item-top">
        <strong>${c.subject || "Consulta de soporte"}</strong>
        <span>${c.unread_admin_count || 0}</span>
      </div>

      <div class="support-thread-item-meta">
        ${c.app_context || "sin contexto"} · ${c.participant_role || "sin rol"}
      </div>

      <div class="support-thread-item-preview">
        ${c.last_message_preview || "Sin mensajes"}
      </div>
    </button>
  `).join("");
  list.querySelectorAll("[data-conversation-id]").forEach((button) => {
  button.addEventListener("click", () => {
    const conversation = conversations.find(
      (c) => c.id === button.dataset.conversationId
    );

    openSupportConversation(conversation);
  });
});
}

function openSupportConversation(conversation) {
  const empty = document.getElementById("supportThreadEmpty");
  const panel = document.getElementById("supportThreadPanel");
  const name = document.getElementById("supportThreadName");
  const submeta = document.getElementById("supportThreadSubmeta");
  const messagesEl = document.getElementById("supportMessages");

  if (!conversation || !panel || !messagesEl) return;
  selectedSupportConversation = conversation;
  empty?.setAttribute("hidden", "true");
  panel.removeAttribute("hidden");

  if (name) {
    name.textContent = conversation.subject || "Consulta de soporte";
  }

  if (submeta) {
    submeta.textContent = `${conversation.app_context || "sin contexto"} · ${conversation.participant_role || "sin rol"}`;
  }

  const messages = conversation.svc_messages || [];

messagesEl.innerHTML = messages.length
  ? messages.map((m) => `
    <div class="support-message">
      <strong>${m.sender_role || "usuario"}</strong>
      <p>${m.body || m.message || m.content || ""}</p>
    </div>
  `).join("")
  : `<div class="support-empty-state">Esta conversación todavía no tiene mensajes.</div>`;
}
async function sendSupportReply() {
  const input = document.getElementById("supportReplyInput");
  const button = document.getElementById("supportSendReplyBtn");

  const body = input?.value?.trim();

  if (!selectedSupportConversation?.id) {
    alert("Primero seleccioná una conversación.");
    return;
  }

  if (!body) {
    alert("Escribí una respuesta.");
    return;
  }

  const session = await supabaseAdminService.refreshSessionIfNeeded();

  if (!session?.access_token) {
    alert("Sesión admin inválida.");
    return;
  }

  try {
    if (button) button.disabled = true;

    const res = await fetch(
      `${window.MIMI_ADMIN_ENV.SUPABASE_URL}/functions/v1/admin-send-support-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
       body: JSON.stringify({
          conversation_id: selectedSupportConversation.id,
         message: body
       })
      }
    );

    const data = await res.json();

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || "No se pudo enviar la respuesta.");
    }

    input.value = "";

    const refreshed = await loadSupportInbox();
    const updated = refreshed?.conversations?.find(
      (c) => c.id === selectedSupportConversation.id
    );

    if (updated) {
      openSupportConversation(updated);
    }

    console.log("[MIMI Admin Support] Respuesta enviada", data);
  } catch (err) {
    console.error("[MIMI Admin Support] Error enviando respuesta", err);
    alert(err.message || "Error enviando respuesta.");
  } finally {
    if (button) button.disabled = false;
  }
}
async function loadSupportInbox() {
  const session = await supabaseAdminService.refreshSessionIfNeeded();

  if (!session?.access_token) {
    console.warn("[MIMI Admin Support] Sin sesión admin");
    return;
  }

  const res = await fetch(
    `${window.MIMI_ADMIN_ENV.SUPABASE_URL}/functions/v1/admin-list-support-conversations`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    }
  );

  const data = await res.json();

  console.log("[MIMI Admin Support]", data);
  console.table(data.conversations || []);

  renderSupportInbox(data.conversations || []);

  return data;
}  
  
  async function bootstrapAdminShell() {
  const result = await supabaseAdminService.waitForActiveAdmin(3200);

  if (!result?.ok) {
    window.location.href = "./admin-login.html";
    return;
  }

  if (emailEl) {
    emailEl.textContent = result.user?.email || result.admin?.email || "";
  }

  if (avatarEl) {
    avatarEl.src =
      result.user?.user_metadata?.avatar_url || "../assets/icons/logo-mimi.png";

    avatarEl.onerror = () => {
      avatarEl.src = "../assets/icons/logo-mimi.png";
    };
  }
  setActiveModule("transport");
}
logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

initAdaptiveTheme();
setupDynamicHeader();
setupModuleNavigation();

document.getElementById("supportSendReplyBtn")?.addEventListener("click", sendSupportReply);

document.getElementById("supportReplyInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendSupportReply();
  }
});

bootstrapAdminShell();
