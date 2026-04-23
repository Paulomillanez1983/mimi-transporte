import { appConfig } from "../../config.js";

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

function providerCapabilityChips(provider) {
  return [
    provider.accepts_immediate ? "Disponible ahora" : null,
    provider.accepts_scheduled ? "Agenda futura" : null,
    provider.city || null,
    provider.province || null,
    provider.pricing_mode || null,
    provider.minimum_hours ? `Mín. ${provider.minimum_hours} hs` : null,
    provider.maximum_hours ? `Máx. ${provider.maximum_hours} hs` : null,
    provider.completed_services_count ? `${provider.completed_services_count} servicios` : null,
  ].filter(Boolean);
}

function providerSpotlightChips(profile, categories) {
  return [
    profile?.accepts_immediate ? "Toma inmediatos" : null,
    profile?.accepts_scheduled ? "Toma programados" : null,
    profile?.pricing_mode || null,
    profile?.city || null,
    profile?.province || null,
    ...((categories ?? []).map((item) => item.svc_categories?.name || item.category_id).filter(Boolean)),
  ].slice(0, 8);
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
              ${escapeHtml(String(provider.rating_count ?? 0))} reseñas
            </span>
          </div>
          <strong>${currency(provider.total_price)}</strong>
        </header>

        ${(provider.bio || provider.description)
          ? `<p class="muted">${escapeHtml(provider.bio || provider.description)}</p>`
          : ""}

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

        ${providerCapabilityChips(provider).length
          ? `
            <div class="chip-row">
              ${providerCapabilityChips(provider).map((chip) => `<span class="inline-chip">${escapeHtml(chip)}</span>`).join("")}
            </div>
          `
          : ""}

        ${(provider.next_available_at || provider.last_service_completed_at)
          ? `
            <div class="provider-facts">
              ${provider.next_available_at ? `<span class="muted">Próxima ventana: ${escapeHtml(formatDate(provider.next_available_at))}</span>` : ""}
              ${provider.last_service_completed_at ? `<span class="muted">Último cierre: ${escapeHtml(formatDate(provider.last_service_completed_at))}</span>` : ""}
            </div>
          `
          : ""}

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
          <span>Dirección</span>
          <strong>${escapeHtml(request.address_text ?? state.requestDraft.address ?? "Pendiente")}</strong>
        </div>
        <div class="metric">
          <span>Total</span>
          <strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong>
        </div>
        <div class="metric">
          <span>Prestador</span>
          <strong>${currency(request.provider_price ?? request.provider_price_snapshot ?? state.client.selectedProvider?.provider_price ?? 0)}</strong>
        </div>
        <div class="metric">
          <span>Fee plataforma</span>
          <strong>${currency(request.platform_fee ?? request.platform_fee_snapshot ?? state.client.selectedProvider?.platform_fee ?? 0)}</strong>
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
      ${request.provider_response_deadline_at
        ? `<div class="chip-row"><span class="inline-chip">Respuesta límite: ${escapeHtml(formatDate(request.provider_response_deadline_at))}</span></div>`
        : ""}
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

function renderFinancialPanel(state) {
  const container = document.getElementById("financialPanel");
  if (!container) return;

  const payment = state.client.insights?.paymentIntent;
  const escrow = state.client.insights?.escrowHold;
  const request = state.client.activeRequest;

  if (!request) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin movimiento financiero</strong>
        <span class="muted">Cuando exista una solicitud real, acá vas a ver payment intent, escrow y snapshots de cobro.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <article class="summary-card compact-stack">
      <strong>Snapshot del servicio</strong>
      <div class="summary-metrics">
        <div class="metric">
          <span>Total</span>
          <strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong>
        </div>
        <div class="metric">
          <span>Prestador</span>
          <strong>${currency(request.provider_price ?? request.provider_price_snapshot ?? state.client.selectedProvider?.provider_price ?? 0)}</strong>
        </div>
        <div class="metric">
          <span>Fee</span>
          <strong>${currency(request.platform_fee ?? request.platform_fee_snapshot ?? state.client.selectedProvider?.platform_fee ?? 0)}</strong>
        </div>
        <div class="metric">
          <span>Moneda</span>
          <strong>${escapeHtml(request.currency ?? payment?.currency ?? escrow?.currency ?? "ARS")}</strong>
        </div>
      </div>
    </article>
    <article class="summary-card compact-stack">
      <strong>Payment intent</strong>
      <div class="chip-row">
        <span class="inline-chip">${escapeHtml(payment?.status ?? "Pendiente")}</span>
        ${payment?.authorized_at ? `<span class="inline-chip">Autorizado ${escapeHtml(formatDate(payment.authorized_at))}</span>` : ""}
        ${payment?.captured_at ? `<span class="inline-chip">Capturado ${escapeHtml(formatDate(payment.captured_at))}</span>` : ""}
      </div>
      <span class="muted">${payment ? "Estado del cobro registrado en backend." : "Aún no hay payment intent asociado a esta solicitud."}</span>
    </article>
    <article class="summary-card compact-stack">
      <strong>Escrow / hold</strong>
      <div class="chip-row">
        <span class="inline-chip">${escapeHtml(escrow?.status ?? "Sin hold")}</span>
        ${escrow?.held_at ? `<span class="inline-chip">Retenido ${escapeHtml(formatDate(escrow.held_at))}</span>` : ""}
        ${escrow?.released_at ? `<span class="inline-chip">Liberado ${escapeHtml(formatDate(escrow.released_at))}</span>` : ""}
      </div>
      <span class="muted">${escrow ? `Monto retenido: ${currency(escrow.amount, escrow.currency)}` : "Todavía no hay un hold asociado a esta orden."}</span>
    </article>
  `;
}

function renderMatchingPanel(state) {
  const container = document.getElementById("matchingPanel");
  if (!container) return;

  const candidates = state.client.insights?.candidates ?? [];
  const offers = state.client.insights?.offers ?? [];
  const selectedProviderId =
    state.client.activeRequest?.accepted_provider_id ??
    state.client.activeRequest?.selected_provider_id ??
    state.client.selectedProvider?.provider_id ??
    null;

  if (!state.client.activeRequest) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin matching aún</strong>
        <span class="muted">Cuando generes una búsqueda real, vamos a mostrar ranking, ofertas enviadas y tiempos de respuesta.</span>
      </div>
    `;
    return;
  }

  const rankingHtml = candidates.length
    ? candidates.map((item) => `
      <article class="summary-card compact-stack">
        <strong>#${escapeHtml(String(item.rank_position ?? "-"))}</strong>
        <div class="summary-metrics">
          <div class="metric">
            <span>Score</span>
            <strong>${escapeHtml(String(item.score ?? "-"))}</strong>
          </div>
          <div class="metric">
            <span>Distancia</span>
            <strong>${escapeHtml(String(item.distance_km ?? "-"))} km</strong>
          </div>
          <div class="metric">
            <span>Precio</span>
            <strong>${currency(item.provider_price_snapshot ?? 0)}</strong>
          </div>
          <div class="metric">
            <span>Rating</span>
            <strong>${escapeHtml(String(item.rating_snapshot ?? "-"))}</strong>
          </div>
        </div>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin candidatos visibles</strong>
<span class="muted">Si <code>svc_request_candidates</code> se completa en backend...</span>
</div>
    `;

  const offersHtml = offers.length
    ? offers.map((item) => `
      <article class="summary-card compact-stack">
        <strong>${item.provider_id === selectedProviderId ? "Prestador elegido" : "Oferta enviada"}</strong>
        <div class="chip-row">
          <span class="inline-chip">${escapeHtml(item.status ?? "PENDING")}</span>
          ${item.sent_at ? `<span class="inline-chip">Enviada ${escapeHtml(formatDate(item.sent_at))}</span>` : ""}
          ${item.expires_at ? `<span class="inline-chip">Vence ${escapeHtml(formatDate(item.expires_at))}</span>` : ""}
        </div>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin offers registradas</strong>
        <span class="muted">Cuando el dispatch cargue "svc_request_offers", verás acá el avance del contacto con prestadores.</span>
      </div>
    `;

  container.innerHTML = `${rankingHtml}${offersHtml}`;
}

function renderProviderSpotlight(state) {
  const container = document.getElementById("providerSpotlightPanel");
  if (!container) return;

  const selectedProvider = state.client.selectedProvider;
  const profile = state.client.insights?.providerProfile;
  const pricing = state.client.insights?.providerPricing ?? [];
  const reviews = state.client.insights?.providerReviews ?? [];
  const categories = state.client.insights?.providerCategories ?? [];

  if (!selectedProvider && !profile) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin prestador elegido</strong>
        <span class="muted">Cuando confirmes una opción, acá vamos a mostrar bio, categorías, pricing y últimas reseñas.</span>
      </div>
    `;
    return;
  }

  const categoryChips = providerSpotlightChips(profile, categories);
  const pricingHtml = pricing.length
    ? pricing.map((item) => `
      <span class="inline-chip">${escapeHtml(item.svc_categories?.name ?? item.category_id ?? "Categoría")}: ${currency(item.price_per_hour, item.currency)}</span>
    `).join("")
    : `<span class="muted">Sin pricing visible todavía.</span>`;

  const reviewsHtml = reviews.length
    ? reviews.map((item) => `
      <article class="summary-card compact-stack">
        <strong>${escapeHtml(Number(item.rating ?? 5).toFixed(1))} / 5</strong>
        <p class="muted">${escapeHtml(item.comment || "Sin comentario")}</p>
      </article>
    `).join("")
    : `
      <div class="summary-card">
        <strong>Sin reseñas recientes</strong>
        <span class="muted">El backend ya soporta "svc_reviews"; se van a mostrar acá cuando existan.</span>
      </div>
    `;

  container.innerHTML = `
    <article class="summary-card compact-stack">
      <strong>${escapeHtml(selectedProvider?.full_name ?? "Prestador confirmado")}</strong>
      <p class="muted">${escapeHtml(profile?.bio ?? selectedProvider?.bio ?? "Perfil profesional cargado desde MIMI Servicios.")}</p>
      <div class="chip-row">
        ${categoryChips.map((chip) => `<span class="inline-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
    </article>
    <article class="summary-card compact-stack">
      <strong>Pricing visible</strong>
      <div class="chip-row">${pricingHtml}</div>
    </article>
    ${reviewsHtml}
  `;
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
  renderFinancialPanel(state);
  renderMatchingPanel(state);
  renderProviderSpotlight(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
