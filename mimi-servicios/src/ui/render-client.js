import { appConfig } from "../config.js";

const stateLabels = {
  SEARCHING: "Buscando prestador",
  PENDING_PROVIDER_RESPONSE: "Esperando respuesta",
  ACCEPTED: "Prestador confirmado",
  SCHEDULED: "Servicio agendado",
  PROVIDER_EN_ROUTE: "Prestador en camino",
  PROVIDER_ARRIVED: "Prestador en puerta",
  IN_PROGRESS: "Servicio en curso",
  COMPLETED: "Servicio completado",
  CANCELLED: "Servicio cancelado",
};

function currency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "Ahora";

  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Ahora";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setBadgeCount(id, count) {
  const el = document.getElementById(id);
  if (!el) return;

  const safeCount = Math.max(0, Number(count ?? 0));
  el.textContent = String(safeCount);
  el.hidden = safeCount <= 0;
}

function renderStatusBanner(state) {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;

  const error = state.meta.error;
  const info = state.meta.info;

  if (!error && !info) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "status-banner is-info";
    return;
  }

  banner.hidden = false;
  banner.textContent = error || info;
  banner.className = `status-banner ${error ? "is-error" : "is-info"}`;

  if (state.client.activeRequest && !error) {
    banner.className = "status-banner is-success";
  }
}

function renderAuth(state) {
  const sessionChip = document.getElementById("sessionChip");
  const authPrimaryButton = document.getElementById("authPrimaryButton");
  const authSecondaryButton = document.getElementById("authSecondaryButton");
  const authHint = document.getElementById("authHint");

  const isAuthenticated = Boolean(state.session.userId);
  const hasBackend = state.meta.backendMode === "supabase";
  const displayName = state.session.userName || state.session.userEmail || "Cliente";

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? `Cliente: ${displayName}`
      : hasBackend
        ? "Invitado"
        : "Modo demo";
  }

  if (authPrimaryButton) {
    authPrimaryButton.hidden = isAuthenticated;
    authPrimaryButton.textContent = hasBackend ? "Ingresar" : "Entrar";
  }

  if (authSecondaryButton) {
    authSecondaryButton.hidden = !isAuthenticated;
  }

  if (authHint) {
    authHint.textContent = isAuthenticated
      ? "Ya podes buscar prestadores, crear solicitudes, chatear y seguir el servicio."
      : hasBackend
        ? "Ingresa con Google para usar busquedas, solicitudes, chat y seguimiento real."
        : "Sin credenciales de Supabase cargadas. Podes navegar la experiencia en modo demo.";
  }
}

function renderEntryState(state) {
  const enterButton = document.getElementById("enterServicesHub");
  if (!enterButton) return;

  const appVisible = state.ui.appEntered || Boolean(state.session.userId) || state.meta.backendMode !== "supabase";
  enterButton.hidden = appVisible;
}

function renderCategories(state) {
  const container = document.getElementById("categoryGrid");
  if (!container) return;

  const categories = Array.isArray(appConfig.categories) ? appConfig.categories : [];
  container.innerHTML = categories.length
    ? categories.map((category) => `
      <button
        class="category-card ${category.id === state.ui.selectedCategoryId ? "is-selected" : ""}"
        data-category-id="${escapeHtml(category.id)}"
        type="button"
      >
        <strong>${escapeHtml(category.name)}</strong>
        <span class="muted">${escapeHtml(category.description || "Servicio disponible")}</span>
      </button>
    `).join("")
    : `<div class="summary-empty"><strong>Sin categorias</strong><p>Cuando carguemos categorias del backend apareceran aca.</p></div>`;
}

export function renderProvidersList(state) {
  const meta = document.getElementById("providersMeta");
  const list = document.getElementById("providersList");
  if (!meta || !list) return;

  const providers = Array.isArray(state.client.providers) ? state.client.providers : [];
  meta.textContent = providers.length
    ? `${providers.length} prestadores ordenados por cercania y score`
    : (state.meta.info || "Esperando busqueda");

  list.innerHTML = providers.length
    ? providers.map((provider) => `
      <article class="result-card">
        <header>
          <div>
            <strong>${escapeHtml(provider.full_name || "Prestador disponible")}</strong>
            <span class="muted">
              ${escapeHtml(String(provider.rating?.toFixed?.(1) ?? provider.rating ?? "5.0"))} estrellas -
              ${escapeHtml(String(provider.rating_count ?? 0))} resenas
            </span>
          </div>
          <strong>${currency(provider.total_price)}</strong>
        </header>

        <div class="result-meta">
          <div class="metric">
            <span>Prestador</span>
            <strong>${currency(provider.provider_price)}</strong>
          </div>
          <div class="metric">
            <span>Fee</span>
            <strong>${currency(provider.fee ?? provider.platform_fee)}</strong>
          </div>
          <div class="metric">
            <span>Distancia</span>
            <strong>${escapeHtml(String(provider.distance_km ?? "-"))} km</strong>
          </div>
          <div class="metric">
            <span>ETA</span>
            <strong>${escapeHtml(String(provider.estimated_eta_min ?? "-"))} min</strong>
          </div>
        </div>

        <div class="action-row">
          <button class="btn-primary" data-provider-select="${escapeHtml(provider.provider_id)}" type="button">
            Elegir prestador
          </button>
        </div>
      </article>
    `).join("")
    : `
      <div class="client-empty-state">
        <strong>Elegi la categoria y completa la dirección</strong>
        <span class="muted">Cuando busques, te mostramos opciones con precio, distancia y tiempo estimado.</span>
      </div>
    `;
}

export function renderRequestSummary(state) {
  const chip = document.getElementById("requestStateChip");
  const summary = document.getElementById("requestSummary");
  const timeline = document.getElementById("requestTimeline");
  const actions = document.getElementById("requestActions");
  if (!chip || !summary || !timeline || !actions) return;

  const request = state.client.activeRequest;
  chip.textContent = request
    ? (stateLabels[request.status] ?? request.status)
    : "Sin solicitud activa";

  if (!request) {
    summary.innerHTML = `
      <div class="summary-card">
        <strong>Tu servicio va a aparecer aca</strong>
        <span class="muted">Una vez que elijas un prestador, vas a ver el precio, el estado y las acciones disponibles.</span>
      </div>
    `;
    timeline.innerHTML = "";
    actions.innerHTML = "";
    return;
  }

  const providerName =
    request.providerName ||
    state.client.selectedProvider?.full_name ||
    "Prestador confirmado";

  summary.innerHTML = `
    <div class="summary-card">
      <strong>${escapeHtml(providerName)}</strong>
      <div class="summary-metrics">
        <div class="metric">
          <span>Total</span>
          <strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong>
        </div>
        <div class="metric">
          <span>Tipo</span>
          <strong>${escapeHtml(request.requestType ?? request.request_type ?? "IMMEDIATE")}</strong>
        </div>
        <div class="metric">
          <span>Inicio</span>
          <strong>${escapeHtml(formatDate(request.scheduledFor ?? request.scheduled_for ?? request.created_at))}</strong>
        </div>
        <div class="metric">
          <span>Duración</span>
          <strong>${escapeHtml(String(request.requestedHours ?? request.requested_hours ?? 2))} hs</strong>
        </div>
      </div>
    </div>
  `;

  timeline.innerHTML = appConfig.serviceStates.map((status) => `
    <div class="timeline-step ${status === request.status ? "is-active" : ""}">
      <strong>${escapeHtml(stateLabels[status] ?? status)}</strong>
      <span>${escapeHtml(status)}</span>
    </div>
  `).join("");

  actions.innerHTML = [
    ["SEARCHING", "PENDING_PROVIDER_RESPONSE"].includes(request.status)
      ? `<button class="btn-secondary" data-request-action="cancel" type="button">Cancelar</button>`
      : "",
    ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(request.status)
      ? `<button class="btn-primary" data-open-chat="true" type="button">Abrir chat</button>`
      : "",
    request.status === "COMPLETED"
      ? `<button class="btn-secondary" data-request-action="rate" type="button">Calificar</button>`
      : "",
  ].join("");
}

export function renderNotifications(state) {
  const items = Array.isArray(state.notifications.items) ? state.notifications.items : [];
  const unread = items.filter((item) => !item.read_at).length;

  setBadgeCount("notificationsCount", unread);

  const html = items.length
    ? items.map((item) => `
      <article class="notification-card">
        <strong>${escapeHtml(item.title ?? "Notificacion")}</strong>
        <p class="muted">${escapeHtml(item.body ?? "")}</p>
        <span class="muted">${escapeHtml(formatDate(item.created_at))}</span>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin notificaciones</strong>
        <span class="muted">Las novedades del servicio van a aparecer aca.</span>
      </div>
    `;

  const notificationsList = document.getElementById("notificationsList");
  const notificationsDrawerBody = document.getElementById("notificationsDrawerBody");

  if (notificationsList) notificationsList.innerHTML = html;
  if (notificationsDrawerBody) notificationsDrawerBody.innerHTML = html;
}

export function renderChat(state) {
  const messages = Array.isArray(state.chat.messages) ? state.chat.messages : [];
  setBadgeCount("chatUnreadCount", state.chat.unreadCount ?? 0);

  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  chatMessages.innerHTML = messages.length
    ? messages.map((message) => `
      <article class="message-bubble ${message.sender_user_id === state.session.userId || message.sender_user_id === "self" ? "is-own" : ""}">
        <strong>${message.sender_user_id === state.session.userId || message.sender_user_id === "self" ? "Vos" : "Operador"}</strong>
        <p>${escapeHtml(message.body ?? "")}</p>
        <span class="muted">${escapeHtml(formatDate(message.created_at))}</span>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Chat listo</strong>
        <span class="muted">Los mensajes del servicio van a aparecer aca en tiempo real.</span>
      </div>
    `;
}

function renderMapStatus(state) {
  const mapStatus = document.getElementById("mapStatus");
  if (!mapStatus) return;

  const activeRequest = state.client.activeRequest;
  mapStatus.textContent = activeRequest
    ? (stateLabels[activeRequest.status] ?? activeRequest.status)
    : "Esperando actividad";
}

export function renderClientScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderEntryState(state);
  renderCategories(state);
  renderProvidersList(state);
  renderRequestSummary(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
