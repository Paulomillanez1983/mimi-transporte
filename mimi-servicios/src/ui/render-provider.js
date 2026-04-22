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

  if (!state.meta.error && !state.meta.info) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "status-banner is-info";
    return;
  }

  banner.hidden = false;
  banner.textContent = state.meta.error || state.meta.info;
  banner.className = `status-banner ${state.meta.error ? "is-error" : "is-info"}`;

  if (state.provider.activeService && !state.meta.error) {
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
  const displayName = state.session.userName || state.session.userEmail || "Prestador";

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? `Prestador: ${displayName}`
      : hasBackend
        ? "Prestador invitado"
        : "Modo demo";
  }

  if (authPrimaryButton) authPrimaryButton.hidden = isAuthenticated;
  if (authSecondaryButton) authSecondaryButton.hidden = !isAuthenticated;

  if (authHint) {
    authHint.textContent = isAuthenticated
      ? "Ya podes ver ofertas, actualizar estados y operar tu servicio activo."
      : hasBackend
        ? "Ingresa con Google para ver tus ofertas y operar en tiempo real."
        : "Sin credenciales de Supabase cargadas. Podes revisar la UI en modo demo.";
  }
}

export function renderProviderStats(state) {
  const providerStateChip = document.getElementById("providerStateChip");
  const providerRating = document.getElementById("providerRating");
  const providerOffersCount = document.getElementById("providerOffersCount");
  const providerCompletedCount = document.getElementById("providerCompletedCount");

  if (providerStateChip) providerStateChip.textContent = state.provider.status;
  if (providerRating) providerRating.textContent = Number(state.provider.stats.rating ?? 5).toFixed(1);
  if (providerOffersCount) providerOffersCount.textContent = String(state.provider.offers?.length ?? 0);
  if (providerCompletedCount) providerCompletedCount.textContent = String(state.provider.stats.completed ?? 0);

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === state.provider.status);
  });
}

export function renderOffersList(state) {
  const offersList = document.getElementById("offersList");
  if (!offersList) return;

  offersList.innerHTML = state.provider.offers.length
    ? state.provider.offers.map((offer) => `
      <article class="offer-card">
        <header>
          <div>
            <strong>${escapeHtml(offer.title ?? "Nueva solicitud")}</strong>
            <span class="muted">${escapeHtml(offer.address_text ?? offer.svc_requests?.address_text ?? "Ubicación a confirmar")}</span>
          </div>
          <strong>${currency(offer.total_price_snapshot ?? offer.svc_requests?.total_price_snapshot ?? 0)}</strong>
        </header>
        <div class="result-meta">
          <div class="metric">
            <span>Cliente</span>
            <strong>${escapeHtml(offer.client_name ?? offer.svc_requests?.client_name ?? "Cliente")}</strong>
          </div>
          <div class="metric">
            <span>Duración</span>
            <strong>${escapeHtml(String(offer.requested_hours ?? offer.svc_requests?.requested_hours ?? 2))} hs</strong>
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
}

export function renderProviderActiveService(state) {
  const providerActiveService = document.getElementById("providerActiveService");
  const providerActions = document.getElementById("providerActions");
  if (!providerActiveService || !providerActions) return;

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
            <span>Dirección</span>
            <strong>${escapeHtml(activeService.address_text ?? "Pendiente")}</strong>
          </div>
          <div class="metric">
            <span>Inicio</span>
            <strong>${escapeHtml(formatDate(activeService.scheduled_for ?? activeService.created_at))}</strong>
          </div>
          <div class="metric">
            <span>Duración</span>
            <strong>${escapeHtml(String(activeService.requested_hours ?? 2))} hs</strong>
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
        ? `<button class="btn-primary" data-provider-flow="arrived" type="button">Llegué</button>`
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
        <span class="muted">Las novedades operativas van a aparecer aca.</span>
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
        <strong>${message.sender_user_id === state.session.userId || message.sender_user_id === "self" ? "Vos" : "Cliente"}</strong>
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
  mapStatus.textContent = activeService
    ? (stateLabels[activeService.status] ?? activeService.status)
    : "Esperando actividad";
}

export function renderProviderScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderProviderStats(state);
  renderOffersList(state);
  renderProviderActiveService(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
