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
  const roleLabel = state.session.role === "provider" ? "Prestador" : "Cliente";
  const displayName = state.session.userName || state.session.userEmail || roleLabel;

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? `${roleLabel}: ${displayName}`
      : hasBackend
        ? "Invitado"
        : "Modo demo";
  }

  if (authPrimaryButton) {
    authPrimaryButton.hidden = isAuthenticated;
    authPrimaryButton.dataset.authAction = hasBackend ? "login" : "enter";
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

function renderMode(state) {
  const modeSwitcher = document.getElementById("modeSwitcher");
  const clientScreen = document.getElementById("clientScreen");
  const providerScreen = document.getElementById("providerScreen");

  const appVisible = state.ui.appEntered || Boolean(state.session.userId) || state.meta.backendMode !== "supabase";

  if (modeSwitcher) {
    modeSwitcher.hidden = !appVisible;
  }

  if (clientScreen) {
    clientScreen.hidden = !appVisible || state.ui.activeMode !== "client";
  }

  if (providerScreen) {
    providerScreen.hidden = !appVisible || state.ui.activeMode !== "provider";
  }

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.ui.activeMode);
  });

  const enterButton = document.getElementById("enterServicesHub");
  if (enterButton) {
    enterButton.hidden = appVisible;
  }
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

function renderProviders(state) {
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
      <div class="summary-card">
        <strong>Elegi la categoria y completa la ubicacion</strong>
        <span class="muted">Cuando busques, te mostramos opciones con precio, distancia y tiempo estimado.</span>
      </div>
    `;
}

function renderRequest(state) {
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
          <span>Duracion</span>
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

function renderProviderPanel(state) {
  const providerStateChip = document.getElementById("providerStateChip");
  const providerRating = document.getElementById("providerRating");
  const providerOffersCount = document.getElementById("providerOffersCount");
  const providerCompletedCount = document.getElementById("providerCompletedCount");
  const offersList = document.getElementById("offersList");
  const providerActiveService = document.getElementById("providerActiveService");
  const providerActions = document.getElementById("providerActions");

  if (!providerStateChip || !providerRating || !providerOffersCount || !providerCompletedCount || !offersList || !providerActiveService || !providerActions) {
    return;
  }

  providerStateChip.textContent = state.provider.status;
  providerRating.textContent = Number(state.provider.stats.rating ?? 5).toFixed(1);
  providerOffersCount.textContent = String(state.provider.offers?.length ?? 0);
  providerCompletedCount.textContent = String(state.provider.stats.completed ?? 0);

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === state.provider.status);
  });

  offersList.innerHTML = state.provider.offers.length
    ? state.provider.offers.map((offer) => `
      <article class="offer-card">
        <header>
          <div>
            <strong>${escapeHtml(offer.title ?? "Nueva solicitud")}</strong>
            <span class="muted">${escapeHtml(offer.address_text ?? "Ubicacion a confirmar")}</span>
          </div>
          <strong>${currency(offer.total_price_snapshot ?? 0)}</strong>
        </header>
        <div class="result-meta">
          <div class="metric">
            <span>Cliente</span>
            <strong>${escapeHtml(offer.client_name ?? "Cliente")}</strong>
          </div>
          <div class="metric">
            <span>Duracion</span>
            <strong>${escapeHtml(String(offer.requested_hours ?? 2))} hs</strong>
          </div>
        </div>
        <div class="action-row">
          <button class="btn-secondary" data-offer-action="reject" data-offer-id="${escapeHtml(offer.id)}" type="button">Rechazar</button>
          <button class="btn-primary" data-offer-action="accept" data-offer-id="${escapeHtml(offer.id)}" type="button">Aceptar</button>
        </div>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin ofertas activas</strong>
        <span class="muted">Cuando entre una solicitud te la mostramos aca en tiempo real.</span>
      </div>
    `;

  const activeService = state.provider.activeService;
  providerActiveService.innerHTML = activeService
    ? `
      <div class="summary-card">
        <strong>${escapeHtml(activeService.title ?? "Servicio activo")}</strong>
        <div class="summary-metrics">
          <div class="metric">
            <span>Estado</span>
            <strong>${escapeHtml(stateLabels[activeService.status] ?? activeService.status)}</strong>
          </div>
          <div class="metric">
            <span>Direccion</span>
            <strong>${escapeHtml(activeService.address_text ?? "Pendiente")}</strong>
          </div>
        </div>
      </div>
    `
    : `
      <div class="summary-card">
        <strong>Sin servicio activo</strong>
        <span class="muted">Acepta una oferta para habilitar las acciones operativas.</span>
      </div>
    `;

  providerActions.innerHTML = activeService
    ? [
      ["ACCEPTED", "SCHEDULED"].includes(activeService.status)
        ? `<button class="btn-primary" data-provider-flow="en-route" type="button">En camino</button>`
        : "",
      activeService.status === "PROVIDER_EN_ROUTE"
        ? `<button class="btn-primary" data-provider-flow="arrived" type="button">Llegue</button>`
        : "",
      activeService.status === "PROVIDER_ARRIVED"
        ? `<button class="btn-primary" data-provider-flow="start" type="button">Iniciar</button>`
        : "",
      activeService.status === "IN_PROGRESS"
        ? `<button class="btn-primary" data-provider-flow="complete" type="button">Completar</button>`
        : "",
      !["COMPLETED", "CANCELLED"].includes(activeService.status)
        ? `<button class="btn-secondary" data-provider-flow="chat" type="button">Chat</button>`
        : "",
    ].join("")
    : "";
}

function renderNotifications(state) {
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

function renderChat(state) {
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

  const activeService = state.provider.activeService;
  const activeRequest = state.client.activeRequest;
  const request = activeService || activeRequest;

  mapStatus.textContent = request
    ? (stateLabels[request.status] ?? request.status)
    : "Esperando actividad";
}

export function renderApp(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderMode(state);
  renderCategories(state);
  renderProviders(state);
  renderRequest(state);
  renderProviderPanel(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
