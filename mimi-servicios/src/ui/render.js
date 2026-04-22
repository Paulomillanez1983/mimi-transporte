import { appConfig } from "../../config.js";
const stateLabels = {
  SEARCHING: "Buscando prestador",
  PENDING_PROVIDER_RESPONSE: "Esperando respuesta",
  ACCEPTED: "Aceptado",
  SCHEDULED: "Programado",
  PROVIDER_EN_ROUTE: "Prestador en camino",
  PROVIDER_ARRIVED: "Prestador llegó",
  IN_PROGRESS: "Servicio en curso",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderProviderHeader(state) {
  document.getElementById("providerStateChip").textContent = state.provider.status;
  document.getElementById("providerRating").textContent = Number(state.provider.stats.rating ?? 5).toFixed(1);
  document.getElementById("providerOffersCount").textContent = String(state.provider.offers.length);
  document.getElementById("providerCompletedCount").textContent = String(state.provider.stats.completed ?? 0);

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === state.provider.status);
  });
}

function renderAuth(state) {
  const authPrimary = document.getElementById("authPrimaryButton");
  const authSecondary = document.getElementById("authSecondaryButton");
  const sessionChip = document.getElementById("sessionChip");
  const authHint = document.getElementById("authHint");
  const providerModeButton = document.querySelector('[data-mode="provider"]');

  if (sessionChip) {
    sessionChip.textContent = state.session.isAuthenticated
      ? (state.session.userName || state.session.userEmail || "Sesion activa")
      : "Invitado";
  }

  if (authHint) {
    authHint.textContent = state.session.isAuthenticated
      ? (state.session.providerId ? "Modo cliente y prestador habilitados." : "Modo cliente habilitado.")
      : "Inicia sesion para usar busquedas, solicitudes, chat y tracking reales.";
  }

  if (authPrimary) {
    authPrimary.textContent = state.session.isAuthenticated ? "Abrir app" : "Ingresar con Google";
    authPrimary.dataset.authAction = state.session.isAuthenticated ? "enter" : "login";
  }

  if (authSecondary) {
    authSecondary.hidden = !state.session.isAuthenticated;
  }

  if (providerModeButton) {
    providerModeButton.hidden = !state.session.providerId;
  }
}

function renderMeta(state) {
  const banner = document.getElementById("statusBanner");
  if (!banner) return;

  const message = state.meta.error || state.meta.info || "";
  banner.hidden = !message;
  banner.className = `status-banner ${state.meta.error ? "is-error" : "is-info"}`;
  banner.textContent = message;
}

function renderProviderOffers(state) {
  const offersList = document.getElementById("offersList");
  const offers = state.provider.offers ?? [];

  if (!offers.length) {
    offersList.innerHTML = `
      <div class="summary-card">
        <strong>Sin ofertas activas</strong>
        <span class="muted">Cuando entre una solicitud, aparece acá en tiempo real.</span>
      </div>
    `;
    return;
  }

  offersList.innerHTML = offers.map((offer) => {
    const request = offer.request ?? offer.svc_requests ?? {};
    const deadline = offer.expires_at ? formatDate(offer.expires_at) : "Ahora";

    return `
      <article class="offer-card offer-card--highlight">
        <header>
          <div>
            <strong>${offer.title ?? "Nueva solicitud"}</strong>
            <span class="muted">${request.address_text ?? offer.address_text ?? "Ubicación a confirmar"}</span>
          </div>
          <strong>${currency(request.total_price_snapshot ?? offer.total_price_snapshot ?? 0)}</strong>
        </header>

        <div class="result-meta">
          <div class="metric"><span>Duración</span><strong>${request.requested_hours ?? offer.requested_hours ?? 2} hs</strong></div>
          <div class="metric"><span>Tipo</span><strong>${request.request_type ?? "IMMEDIATE"}</strong></div>
          <div class="metric"><span>Vence</span><strong>${deadline}</strong></div>
        </div>

        <div class="action-row">
          <button class="ghost-button" data-offer-action="reject" data-offer-id="${offer.id}">Rechazar</button>
          <button class="primary-button" data-offer-action="accept" data-offer-id="${offer.id}">Aceptar</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderProviderActiveService(state) {
  const activeService = state.provider.activeService;
  const container = document.getElementById("providerActiveService");
  const actions = document.getElementById("providerActions");

  if (!activeService) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin servicio activo</strong>
        <span class="muted">Aceptá una oferta para habilitar acciones operativas.</span>
      </div>
    `;
    actions.innerHTML = "";
    return;
  }

  const statusLabel = stateLabels[activeService.status] ?? activeService.status;

  container.innerHTML = `
    <div class="summary-card summary-card--service">
      <span class="status-chip is-strong">${statusLabel}</span>
      <strong>${activeService.title ?? "Servicio activo"}</strong>

      <div class="summary-metrics">
        <div class="metric"><span>Dirección</span><strong>${activeService.address_text ?? "Pendiente"}</strong></div>
        <div class="metric"><span>Inicio</span><strong>${formatDate(activeService.scheduled_for)}</strong></div>
        <div class="metric"><span>Total</span><strong>${currency(activeService.total_price_snapshot)}</strong></div>
      </div>
    </div>
  `;

  actions.innerHTML = [
    ["ACCEPTED", "SCHEDULED"].includes(activeService.status)
      ? `<button class="primary-button" data-provider-flow="en-route">En camino</button>`
      : "",
    activeService.status === "PROVIDER_EN_ROUTE"
      ? `<button class="primary-button" data-provider-flow="arrived">Llegué</button>`
      : "",
    activeService.status === "PROVIDER_ARRIVED"
      ? `<button class="primary-button" data-provider-flow="start">Iniciar servicio</button>`
      : "",
    activeService.status === "IN_PROGRESS"
      ? `<button class="primary-button" data-provider-flow="complete">Completar servicio</button>`
      : "",
    !["COMPLETED", "CANCELLED"].includes(activeService.status)
      ? `<button class="ghost-button" data-provider-flow="chat">Abrir chat</button>`
      : "",
  ].join("");
}

function renderCategories(state) {
  const container = document.getElementById("categoryGrid");
  const categories = state.meta.categories?.length ? state.meta.categories : appConfig.categories;

  container.innerHTML = categories.map((category) => `
    <button class="category-card ${category.id === state.ui.selectedCategoryId ? "is-selected" : ""}" data-category-id="${category.id}">
      <strong>${category.name}</strong>
      <span class="muted">${category.description}</span>
    </button>
  `).join("");
}

function renderProviders(state) {
  const meta = document.getElementById("providersMeta");
  const list = document.getElementById("providersList");
  const providers = state.client.providers ?? [];

  meta.textContent = providers.length
    ? `${providers.length} prestadores ordenados por score`
    : (state.meta.info || "Sin resultados");

  list.innerHTML = providers.length
    ? providers.map((provider) => `
      <article class="result-card">
        <header>
          <div>
            <strong>${provider.full_name}</strong>
            <span class="muted">${Number(provider.rating ?? 5).toFixed(1)} estrellas · ${provider.rating_count ?? 0} reseñas</span>
          </div>
          <strong>${currency(provider.total_price)}</strong>
        </header>
        <div class="result-meta">
          <div class="metric"><span>Prestador</span><strong>${currency(provider.provider_price)}</strong></div>
          <div class="metric"><span>Fee</span><strong>${currency(provider.fee)}</strong></div>
          <div class="metric"><span>Distancia</span><strong>${provider.distance_km ?? 0} km</strong></div>
          <div class="metric"><span>ETA</span><strong>${provider.estimated_eta_min ?? 0} min</strong></div>
        </div>
        <div class="action-row">
          <button class="primary-button" data-provider-select="${provider.provider_id}">Elegir</button>
        </div>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Esperando búsqueda</strong>
        <span class="muted">Completá ubicación, tipo y duración para ver prestadores.</span>
      </div>
    `;
}

function renderRequest(state) {
  const chip = document.getElementById("requestStateChip");
  const summary = document.getElementById("requestSummary");
  const timeline = document.getElementById("requestTimeline");
  const actions = document.getElementById("requestActions");
  const request = state.client.activeRequest;

  chip.textContent = request ? (stateLabels[request.status] ?? request.status) : "Sin solicitud activa";

  if (!request) {
    summary.innerHTML = `
      <div class="summary-card">
        <strong>Sin servicio activo</strong>
        <span class="muted">Tu solicitud aparecerá acá con acciones y tracking.</span>
      </div>
    `;
    timeline.innerHTML = "";
    actions.innerHTML = "";
    return;
  }

  summary.innerHTML = `
    <div class="summary-card">
      <strong>${state.client.selectedProvider?.full_name ?? "Solicitud enviada"}</strong>
      <div class="summary-metrics">
        <div class="metric"><span>Total</span><strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong></div>
        <div class="metric"><span>Tipo</span><strong>${request.requestType ?? request.request_type}</strong></div>
        <div class="metric"><span>Inicio</span><strong>${formatDate(request.scheduledFor ?? request.scheduled_for)}</strong></div>
        <div class="metric"><span>Duración</span><strong>${request.requestedHours ?? request.requested_hours} hs</strong></div>
      </div>
    </div>
  `;

  timeline.innerHTML = Object.values(appConfig.serviceStates).map((status) => `
    <div class="timeline-step ${status === request.status ? "is-active" : ""}">
      <strong>${stateLabels[status]}</strong>
      <span class="muted">${status}</span>
    </div>
  `).join("");

  actions.innerHTML = [
    ["SEARCHING", "PENDING_PROVIDER_RESPONSE"].includes(request.status)
      ? `<button class="ghost-button" data-request-action="cancel">Cancelar</button>`
      : "",
    ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(request.status)
      ? `<button class="primary-button" data-provider-flow="chat">Abrir chat</button>`
      : "",
  ].join("");
}

function renderNotifications(state) {
  const items = [...(state.notifications.items ?? [])]
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    .slice(0, appConfig.providerUi.notificationsMaxItems ?? 50);

  const unread = items.filter((item) => !item.read_at).length;
  document.getElementById("notificationsCount").textContent = String(unread);

  const html = items.length
    ? items.map((item) => `
      <article class="notification-card notification-card--${String(item.type ?? "").toLowerCase()}">
        <strong>${item.title}</strong>
        <p class="muted">${item.body}</p>
        <span class="muted">${formatDate(item.created_at)}</span>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin notificaciones</strong>
        <span class="muted">Todo el movimiento del servicio aparece acá.</span>
      </div>
    `;

  document.getElementById("notificationsList").innerHTML = html;
  document.getElementById("notificationsDrawerBody").innerHTML = html;
}

function renderChat(state) {
  document.getElementById("chatUnreadCount").textContent = String(state.chat.unreadCount ?? 0);

  document.getElementById("chatMessages").innerHTML = (state.chat.messages ?? []).length
    ? state.chat.messages.map((message) => {
      const isOwn = message.sender_user_id === state.session.userId;

      return `
        <article class="message-bubble ${isOwn ? "is-own" : ""}">
          <strong>${isOwn ? "Vos" : "Operador"}</strong>
          <p>${message.body}</p>
          <span class="muted">${formatDate(message.created_at)}</span>
        </article>
      `;
    }).join("")
    : `
      <div class="summary-card">
        <strong>Chat listo</strong>
        <span class="muted">Los mensajes aparecerán acá en tiempo real.</span>
      </div>
    `;
}

export function renderApp(state) {
  document.getElementById("modeSwitcher").hidden = !state.ui.appEntered;
  document.getElementById("clientScreen").hidden = !state.ui.appEntered || state.ui.activeMode !== "client";
  document.getElementById("providerScreen").hidden = !state.ui.appEntered || state.ui.activeMode !== "provider";

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.ui.activeMode);
  });

  renderAuth(state);
  renderMeta(state);
  renderCategories(state);
  renderProviders(state);
  renderRequest(state);
  renderProviderHeader(state);
  renderProviderOffers(state);
  renderProviderActiveService(state);
  renderNotifications(state);
  renderChat(state);

  document.getElementById("mapStatus").textContent = state.client.activeRequest
    ? (stateLabels[state.client.activeRequest.status] ?? state.client.activeRequest.status)
    : (state.provider.activeService
      ? (stateLabels[state.provider.activeService.status] ?? state.provider.activeService.status)
      : "Esperando actividad");
}
