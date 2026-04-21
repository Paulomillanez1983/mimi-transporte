import { appConfig } from "../config.js";

const stateLabels = {
  SEARCHING: "Buscando prestador",
  PENDING_PROVIDER_RESPONSE: "Esperando respuesta",
  ACCEPTED: "Prestador aceptado",
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
  }).format(value ?? 0);
}

function formatDate(value) {
  if (!value) return "Ahora";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function renderApp(state) {
  document.getElementById("modeSwitcher").hidden = !state.ui.appEntered;
  document.getElementById("clientScreen").hidden =
    !state.ui.appEntered || state.ui.activeMode !== "client";
  document.getElementById("providerScreen").hidden =
    !state.ui.appEntered || state.ui.activeMode !== "provider";

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.ui.activeMode);
  });

  renderCategories(state);
  renderProviders(state);
  renderRequest(state);
  renderProviderPanel(state);
  renderNotifications(state);
  renderChat(state);

  document.getElementById("mapStatus").textContent = state.client.activeRequest
    ? (stateLabels[state.client.activeRequest.status] ?? state.client.activeRequest.status)
    : "Esperando actividad";
}

function renderCategories(state) {
  const container = document.getElementById("categoryGrid");
  container.innerHTML = appConfig.categories.map((category) => `
    <button class="category-card ${category.id === state.ui.selectedCategoryId ? "is-selected" : ""}" data-category-id="${category.id}">
      <strong>${category.name}</strong>
      <span class="muted">${category.description}</span>
    </button>
  `).join("");
}

function renderProviders(state) {
  const meta = document.getElementById("providersMeta");
  const list = document.getElementById("providersList");
  const providers = state.client.providers;

  meta.textContent = providers.length
    ? `${providers.length} prestadores ordenados por score`
    : (state.meta.info || "Sin resultados");

  list.innerHTML = providers.length
    ? providers.map((provider) => `
      <article class="result-card">
        <header>
          <div>
            <strong>${provider.full_name}</strong>
            <span class="muted">${provider.rating?.toFixed?.(1) ?? provider.rating} estrellas · ${provider.rating_count} reseñas</span>
          </div>
          <strong>${currency(provider.total_price)}</strong>
        </header>
        <div class="result-meta">
          <div class="metric"><span>Prestador</span><strong>${currency(provider.provider_price)}</strong></div>
          <div class="metric"><span>Fee</span><strong>${currency(provider.fee)}</strong></div>
          <div class="metric"><span>Distancia</span><strong>${provider.distance_km} km</strong></div>
          <div class="metric"><span>ETA</span><strong>${provider.estimated_eta_min} min</strong></div>
        </div>
        <div class="action-row">
          <button class="primary-button" data-provider-select="${provider.provider_id}">Elegir</button>
        </div>
      </article>
    `).join("")
    : `<div class="summary-card"><strong>Esperando búsqueda</strong><span class="muted">Completá ubicación, tipo y duración para ver prestadores.</span></div>`;
}

function renderRequest(state) {
  const chip = document.getElementById("requestStateChip");
  const summary = document.getElementById("requestSummary");
  const timeline = document.getElementById("requestTimeline");
  const actions = document.getElementById("requestActions");
  const request = state.client.activeRequest;

  chip.textContent = request ? (stateLabels[request.status] ?? request.status) : "Sin solicitud activa";

  if (!request) {
    summary.innerHTML = `<div class="summary-card"><strong>Sin servicio activo</strong><span class="muted">Tu solicitud aparecerá acá con acciones y tracking.</span></div>`;
    timeline.innerHTML = "";
    actions.innerHTML = "";
    return;
  }

  summary.innerHTML = `
    <div class="summary-card">
      <strong>${request.providerName ?? "Prestador confirmado"}</strong>
      <div class="summary-metrics">
        <div class="metric"><span>Total</span><strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong></div>
        <div class="metric"><span>Tipo</span><strong>${request.requestType ?? request.request_type}</strong></div>
        <div class="metric"><span>Inicio</span><strong>${formatDate(request.scheduledFor ?? request.scheduled_for)}</strong></div>
        <div class="metric"><span>Duración</span><strong>${request.requestedHours ?? request.requested_hours} hs</strong></div>
      </div>
    </div>
  `;

  timeline.innerHTML = appConfig.serviceStates.map((status) => `
    <div class="timeline-step ${status === request.status ? "is-active" : ""}">
      <strong>${stateLabels[status]}</strong>
      <span class="muted">${status}</span>
    </div>
  `).join("");

  actions.innerHTML = [
    request.status === "SEARCHING" || request.status === "PENDING_PROVIDER_RESPONSE"
      ? `<button class="ghost-button" data-request-action="cancel">Cancelar</button>`
      : "",
    ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(request.status)
      ? `<button class="primary-button" data-open-chat="true">Abrir chat</button>`
      : "",
    request.status === "COMPLETED"
      ? `<button class="ghost-button" data-request-action="rate">Calificar</button>`
      : "",
  ].join("");
}

function renderProviderPanel(state) {
  document.getElementById("providerStateChip").textContent = state.provider.status;
  document.getElementById("providerRating").textContent = state.provider.stats.rating.toFixed(1);
  document.getElementById("providerOffersCount").textContent = String(state.provider.offers.length);
  document.getElementById("providerCompletedCount").textContent = String(state.provider.stats.completed);

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === state.provider.status);
  });

  const offersList = document.getElementById("offersList");
  offersList.innerHTML = state.provider.offers.length
    ? state.provider.offers.map((offer) => `
      <article class="offer-card">
        <header>
          <div>
            <strong>${offer.title ?? "Nueva solicitud"}</strong>
            <span class="muted">${offer.address_text ?? "Ubicación a confirmar"}</span>
          </div>
          <strong>${currency(offer.total_price_snapshot ?? 0)}</strong>
        </header>
        <div class="result-meta">
          <div class="metric"><span>Cliente</span><strong>${offer.client_name ?? "Cliente"}</strong></div>
          <div class="metric"><span>Duración</span><strong>${offer.requested_hours ?? 2} hs</strong></div>
        </div>
        <div class="action-row">
          <button class="ghost-button" data-offer-action="reject" data-offer-id="${offer.id}">Rechazar</button>
          <button class="primary-button" data-offer-action="accept" data-offer-id="${offer.id}">Aceptar</button>
        </div>
      </article>
    `).join("")
    : `<div class="summary-card"><strong>Sin ofertas activas</strong><span class="muted">Cuando entre una solicitud, aparece acá en tiempo real.</span></div>`;

  const activeService = state.provider.activeService;
  document.getElementById("providerActiveService").innerHTML = activeService
    ? `
      <div class="summary-card">
        <strong>${activeService.title ?? "Servicio en curso"}</strong>
        <div class="summary-metrics">
          <div class="metric"><span>Estado</span><strong>${stateLabels[activeService.status] ?? activeService.status}</strong></div>
          <div class="metric"><span>Dirección</span><strong>${activeService.address_text ?? "Pendiente"}</strong></div>
        </div>
      </div>
    `
    : `<div class="summary-card"><strong>Sin servicio activo</strong><span class="muted">Aceptá una oferta para habilitar acciones operativas.</span></div>`;

  document.getElementById("providerActions").innerHTML = activeService
    ? [
      activeService.status === "ACCEPTED" || activeService.status === "SCHEDULED"
        ? `<button class="primary-button" data-provider-flow="en-route">En camino</button>`
        : "",
      activeService.status === "PROVIDER_EN_ROUTE"
        ? `<button class="primary-button" data-provider-flow="arrived">Llegué</button>`
        : "",
      activeService.status === "PROVIDER_ARRIVED"
        ? `<button class="primary-button" data-provider-flow="start">Iniciar</button>`
        : "",
      activeService.status === "IN_PROGRESS"
        ? `<button class="primary-button" data-provider-flow="complete">Completar</button>`
        : "",
      !["COMPLETED", "CANCELLED"].includes(activeService.status)
        ? `<button class="ghost-button" data-provider-flow="chat">Chat</button>`
        : "",
    ].join("")
    : "";
}

function renderNotifications(state) {
  const count = state.notifications.items.filter((item) => !item.read_at).length;
  document.getElementById("notificationsCount").textContent = String(count);

  const html = state.notifications.items.length
    ? state.notifications.items.map((item) => `
      <article class="notification-card">
        <strong>${item.title}</strong>
        <p class="muted">${item.body}</p>
        <span class="muted">${formatDate(item.created_at)}</span>
      </article>
    `).join("")
    : `<div class="summary-card"><strong>Sin notificaciones</strong><span class="muted">Todo el movimiento del servicio aparece acá.</span></div>`;

  document.getElementById("notificationsList").innerHTML = html;
  document.getElementById("notificationsDrawerBody").innerHTML = html;
}

function renderChat(state) {
  document.getElementById("chatUnreadCount").textContent = String(state.chat.unreadCount);

  document.getElementById("chatMessages").innerHTML = state.chat.messages.length
    ? state.chat.messages.map((message) => `
      <article class="message-bubble ${message.sender_user_id === "self" ? "is-own" : ""}">
        <strong>${message.sender_user_id === "self" ? "Vos" : "Operador"}</strong>
        <p>${message.body}</p>
        <span class="muted">${formatDate(message.created_at)}</span>
      </article>
    `).join("")
    : `<div class="summary-card"><strong>Chat listo</strong><span class="muted">Los mensajes aparecerán acá en tiempo real.</span></div>`;
}
