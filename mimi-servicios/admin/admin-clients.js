const clientRefreshBtn = document.getElementById("clientRefreshBtn");
const clientSearchInput = document.getElementById("clientSearchInput");
const clientPageSizeSelect = document.getElementById("clientPageSize");
const clientPrevPageBtn = document.getElementById("clientPrevPage");
const clientNextPageBtn = document.getElementById("clientNextPage");
const clientPageLabel = document.getElementById("clientPageLabel");
const clientsReviewList = document.getElementById("clientsReviewList");
const clientReviewDetail = document.getElementById("clientReviewDetail");

const clientMetrics = {
  total: document.getElementById("clientMetricTotal"),
  active: document.getElementById("clientMetricActive"),
  limited: document.getElementById("clientMetricLimited"),
  highRisk: document.getElementById("clientMetricHighRisk"),
  verification: document.getElementById("clientMetricVerification")
};

function clampClientPageSize(value) {
  const parsed = Number(value || 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(parsed, 10), 50);
}

const state = {
  clients: [],
  selectedUserId: null,
  page: 1,
  pageSize: clampClientPageSize(clientPageSizeSelect?.value || 30),
  filter: "all",
  query: "",
  pagination: { total: 0, hasMore: false },
  loading: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function initials(value) {
  const raw = String(value || "CL").trim();
  return raw
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CL";
}

function label(value) {
  const labels = {
    level_0: "Cuenta nueva",
    level_1: "Basico",
    level_2: "Reforzado",
    level_3: "Identidad OK",
    level_4: "Alta confianza",
    active: "Activa",
    limited: "Limitada",
    temporarily_blocked: "Bloqueo temporal",
    suspended: "Suspendida",
    blocked: "Bloqueada",
    approved: "Aprobada",
    requested: "Solicitada",
    submitted: "Enviada",
    processing: "Procesando",
    manual_review: "Revision manual",
    rejected: "Rechazada",
    not_started: "No iniciada"
  };
  return labels[String(value || "").toLowerCase()] || String(value || "Pendiente");
}

function badge(text, tone = "") {
  return `<span class="client-badge ${tone}">${escapeHtml(text)}</span>`;
}

async function adminFetch(functionName, body = {}) {
  const auth = await window.supabaseAdminService?.waitForActiveAdmin?.(4200);
  if (!auth?.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(
    `${window.supabaseAdminService.client.supabaseUrl}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: window.supabaseAdminService.client.supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `${functionName}_${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
}

function renderMetrics(stats = {}) {
  if (clientMetrics.total) clientMetrics.total.textContent = String(stats.total || 0);
  if (clientMetrics.active) clientMetrics.active.textContent = String(stats.active || 0);
  if (clientMetrics.limited) clientMetrics.limited.textContent = String(stats.limited || 0);
  if (clientMetrics.highRisk) clientMetrics.highRisk.textContent = String(stats.high_risk || 0);
  if (clientMetrics.verification) clientMetrics.verification.textContent = String(stats.verification || 0);
}

function statusBadges(client) {
  const badges = [];
  if (client.phone_verified) badges.push(badge("Telefono verificado", "good"));
  if (String(client.identity_verification_status).toLowerCase() === "approved") badges.push(badge("Identidad verificada", "good"));
  if (Number(client.risk_score || 0) >= 70) badges.push(badge("Riesgo alto", "danger"));
  if ((client.fraud_events || []).length) badges.push(badge("Senales antifraude", "warn"));
  if (Number(client.chargebacks_count || 0) > 0) badges.push(badge("Chargeback", "danger"));
  if (String(client.account_status || "").includes("blocked") || client.account_status === "suspended") badges.push(badge("Cuenta bloqueada", "danger"));
  if (!badges.length) badges.push(badge("Cuenta monitoreada", "dark"));
  return badges.join("");
}

function renderList() {
  if (!clientsReviewList) return;

  if (state.loading) {
    clientsReviewList.innerHTML = `<div class="financial-empty">Cargando clientes...</div>`;
    return;
  }

  if (!state.clients.length) {
    clientsReviewList.innerHTML = `<div class="financial-empty">No hay clientes para este filtro.</div>`;
    return;
  }

  clientsReviewList.innerHTML = state.clients.map((client) => {
    const active = client.user_id === state.selectedUserId ? "is-active" : "";
    const displayName = client.full_name || client.email || "Cliente";
    return `
      <article class="client-review-card ${active}" data-client-user-id="${escapeHtml(client.user_id)}" tabindex="0">
        <div class="client-review-head">
          <div class="client-avatar">${escapeHtml(initials(displayName))}</div>
          <div class="client-review-main">
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(client.email || "Sin email")}</span>
          </div>
        </div>
        <div class="client-badge-row">${statusBadges(client)}</div>
        <div class="client-review-stats">
          <span>Trust ${escapeHtml(label(client.trust_level))}</span>
          <span>Risk ${escapeHtml(client.risk_score ?? 0)}/100</span>
          <span>Pedidos ${escapeHtml(client.service_requests_count ?? 0)}</span>
          <span>Cancel. ${escapeHtml(client.cancellations_count ?? 0)}</span>
        </div>
      </article>
    `;
  }).join("");

  clientPageLabel.textContent = `Pagina ${state.page} - ${state.pagination.total || state.clients.length} clientes`;
  clientPrevPageBtn.disabled = state.page <= 1;
  clientNextPageBtn.disabled = !state.pagination.hasMore;
}

function renderDetail() {
  if (!clientReviewDetail) return;
  const client = state.clients.find((item) => item.user_id === state.selectedUserId) || state.clients[0];
  if (!client) {
    clientReviewDetail.innerHTML = `<div class="financial-empty">Selecciona un cliente para ver detalle enterprise.</div>`;
    return;
  }
  state.selectedUserId = client.user_id;
  const riskFlags = (client.risk_flags || []).slice(0, 8);
  const devices = (client.svc_user_devices || []).slice(0, 5);
  const actions = (client.customer_account_actions || []).slice(0, 6);
  const checks = (client.customer_identity_checks || []).slice(0, 4);

  clientReviewDetail.innerHTML = `
    <div class="client-review-head">
      <div class="client-avatar">${escapeHtml(initials(client.full_name || client.email))}</div>
      <div class="client-review-main">
        <strong>${escapeHtml(client.full_name || "Cliente")}</strong>
        <span>${escapeHtml(client.email || "Sin email")}</span>
      </div>
    </div>
    <div class="client-detail-badges">${statusBadges(client)}</div>
    <section class="client-detail-section">
      <h3>Identidad</h3>
      <div class="client-detail-grid">
        <div class="client-detail-stat">Telefono: ${client.phone_verified ? "verificado" : "pendiente"}</div>
        <div class="client-detail-stat">Cuenta: ${escapeHtml(label(client.account_status))}</div>
        <div class="client-detail-stat">Trust: ${escapeHtml(label(client.trust_level))}</div>
        <div class="client-detail-stat">Alta: ${escapeHtml(formatDate(client.created_at))}</div>
      </div>
    </section>
    <section class="client-detail-section">
      <h3>Riesgo y reputacion</h3>
      <div class="client-detail-grid">
        <div class="client-detail-stat">Risk score: ${escapeHtml(client.risk_score ?? 0)}/100</div>
        <div class="client-detail-stat">Reputacion: ${escapeHtml(client.reputation_score ?? 0)}/100</div>
        <div class="client-detail-stat">Pagos OK: ${escapeHtml(client.successful_payments_count ?? 0)}</div>
        <div class="client-detail-stat">Chargebacks: ${escapeHtml(client.chargebacks_count ?? 0)}</div>
      </div>
      <div class="client-badge-row">${riskFlags.length ? riskFlags.map((flag) => badge(flag, "warn")).join("") : badge("Sin flags abiertas", "good")}</div>
    </section>
    <section class="client-detail-section">
      <h3>Verificaciones</h3>
      <div class="client-detail-grid">
        <div class="client-detail-stat">Identidad: ${escapeHtml(label(client.identity_verification_status))}</div>
        <div class="client-detail-stat">Revision: ${escapeHtml(label(client.manual_review_status))}</div>
      </div>
      <div class="client-badge-row">${checks.length ? checks.map((item) => badge(`${label(item.status)} ${item.face_match_confidence ?? ""}`.trim(), "dark")).join("") : badge("Sin DNI/selfie solicitado", "")}</div>
    </section>
    <section class="client-detail-section">
      <h3>Actividad reciente</h3>
      <div class="client-badge-row">
        ${devices.length ? devices.map((item) => badge(`Device ${String(item.device_status || item.platform || "registrado").slice(0, 24)}`, "")).join("") : badge("Sin dispositivos recientes", "")}
        ${actions.length ? actions.map((item) => badge(`${label(item.action_type)} ${formatDate(item.created_at)}`, "dark")).join("") : ""}
      </div>
    </section>
    <section class="client-detail-section">
      <h3>Acciones admin</h3>
      <div class="client-detail-actions">
        <button class="primary" type="button" data-client-action="request_verification">Solicitar verificacion</button>
        <button type="button" data-client-action="limit">Limitar</button>
        <button class="danger" type="button" data-client-action="temporary_block">Bloqueo temporal</button>
        <button class="danger" type="button" data-client-action="mark_fraud">Marcar fraude</button>
        <button type="button" data-client-action="unlock">Desbloquear</button>
        <button type="button" data-client-action="reset_trust">Reset trust</button>
      </div>
    </section>
    <section class="client-detail-section">
      <h3>Nota interna</h3>
      <form class="client-notes-form" id="clientNoteForm">
        <textarea id="clientNoteInput" maxlength="1000" placeholder="Nota interna auditada"></textarea>
        <button class="support-head-btn" type="submit">Agregar nota</button>
      </form>
    </section>
  `;
}

function render() {
  renderList();
  renderDetail();
}

async function loadClients() {
  if (!clientsReviewList) return;
  state.loading = true;
  renderList();

  try {
    const data = await adminFetch("admin-list-clients", {
      page: state.page,
      page_size: state.pageSize,
      status: state.filter,
      query: state.query
    });
    state.clients = data.clients || [];
    state.pagination = data.pagination || { total: state.clients.length, hasMore: false };
    state.pageSize = clampClientPageSize(state.pagination.pageSize || state.pageSize);
    if (clientPageSizeSelect) clientPageSizeSelect.value = String(state.pageSize);
    if (!state.clients.some((item) => item.user_id === state.selectedUserId)) {
      state.selectedUserId = state.clients[0]?.user_id || null;
    }
    renderMetrics(data.stats || {});
  } catch (error) {
    console.error("[admin-clients] list failed", error);
    clientsReviewList.innerHTML = `<div class="financial-empty">No se pudo cargar Clientes. Revisar permisos TRUST/ADMIN.</div>`;
  } finally {
    state.loading = false;
    render();
  }
}

async function runClientAction(action, userId, note = "") {
  const reason =
    note ||
    window.prompt("Motivo obligatorio para auditar esta accion") ||
    "";
  if (!reason && !["unlock", "reset_trust"].includes(action)) return;

  await adminFetch("admin-client-action", {
    action,
    user_id: userId,
    reason,
    note
  });
  await loadClients();
}

function bindEvents() {
  clientRefreshBtn?.addEventListener("click", () => loadClients());
  clientPageSizeSelect?.addEventListener("change", () => {
    state.pageSize = clampClientPageSize(clientPageSizeSelect.value || 30);
    clientPageSizeSelect.value = String(state.pageSize);
    state.page = 1;
    loadClients();
  });
  clientPrevPageBtn?.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadClients();
  });
  clientNextPageBtn?.addEventListener("click", () => {
    if (!state.pagination.hasMore) return;
    state.page += 1;
    loadClients();
  });
  clientSearchInput?.addEventListener("input", () => {
    window.clearTimeout(clientSearchInput._timer);
    clientSearchInput._timer = window.setTimeout(() => {
      state.query = clientSearchInput.value.trim();
      state.page = 1;
      loadClients();
    }, 280);
  });
  document.querySelectorAll("[data-client-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-client-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
      state.filter = button.dataset.clientFilter || "all";
      state.page = 1;
      loadClients();
    });
  });
  clientsReviewList?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-client-user-id]");
    if (!card) return;
    state.selectedUserId = card.dataset.clientUserId;
    render();
  });
  clientReviewDetail?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-client-action]");
    if (!button || !state.selectedUserId) return;
    await runClientAction(button.dataset.clientAction, state.selectedUserId);
  });
  clientReviewDetail?.addEventListener("submit", async (event) => {
    if (event.target?.id !== "clientNoteForm") return;
    event.preventDefault();
    const note = document.getElementById("clientNoteInput")?.value?.trim();
    if (!note || !state.selectedUserId) return;
    await runClientAction("add_note", state.selectedUserId, note);
  });
}

bindEvents();

window.addEventListener("mimi-admin:mobile-view-change", (event) => {
  if (event.detail?.view === "clients" && !state.clients.length) loadClients();
});

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.adminMobileView === "clients") loadClients();
});
