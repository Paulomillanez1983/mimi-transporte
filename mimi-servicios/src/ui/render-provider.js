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
  CANCELLED: "Servicio cancelado"
};

const providerStatusLabels = {
  OFFLINE: "Desconectado",
  ONLINE_IDLE: "Online",
  INVITED: "Invitado",
  BOOKED_UPCOMING: "Reservado",
  EN_ROUTE: "En camino",
  ARRIVED: "Llegó",
  IN_SERVICE: "En servicio",
  PAUSED: "En pausa",
  BLOCKED: "Bloqueado"
};

const reviewStatusLabels = {
  APPROVED: "Aprobado",
  PENDING: "Pendiente",
  REJECTED: "Observado",
  NEEDS_RESUBMISSION: "Reenviar"
};

const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const pricingModelLabels = {
  HOURLY: "Por hora",
  BASE_VISIT: "Visita / diagnóstico",
  QUOTE: "A presupuestar",
  FIXED: "Precio cerrado",
  UNIT: "Por sesión / unidad",
  SQUARE_METER: "Por m2",
  LINEAR_METER: "Por metro lineal"
};

const serviceModeLabels = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
  HYBRID: "Online y presencial"
};

const locationPolicyLabels = {
  CLIENT_ADDRESS: "Domicilio del cliente",
  PROVIDER_ADDRESS: "Consultorio / base del prestador",
  ONLINE_ONLY: "Videollamada",
  FLEXIBLE: "A coordinar"
};

const categoryGroupLabels = {
  professional: "Profesionales",
  home: "Hogar y mantenimiento",
  care: "Cuidado y bienestar",
  beauty: "Belleza y personales",
  technical: "Tecnicos y movilidad",
  other: "Otros oficios"
};

function currency(value, currencyCode = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currencyCode || "ARS",
    maximumFractionDigits: 0
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) return "Ahora";

  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
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

function categoryGroup(category = {}) {
  const code = String(category.code ?? "").toUpperCase();
  if (["PSICOLOGIA", "NUTRICION", "KINESIOLOGIA", "ABOGACIA", "CONTABILIDAD", "ENFERMERIA", "CLASES_PARTICULARES"].includes(code)) {
    return "professional";
  }
  if (["LIMPIEZA", "SERVICIO_DOMESTICO", "PLOMERIA", "ELECTRICIDAD", "GASISTA", "PINTURA", "CARPINTERIA", "ALBANILERIA", "JARDINERIA", "CERRAJERIA", "HERRERIA"].includes(code)) {
    return "home";
  }
  if (["CUIDADO_ADULTOS", "CUIDADO_NINOS", "MASAJISTA", "MASCOTAS"].includes(code)) {
    return "care";
  }
  if (["BELLEZA", "MANICURIA", "PELUQUERIA"].includes(code)) {
    return "beauty";
  }
  if (["INSTALACION_AIRE", "REFRIGERACION", "TECNICO_PC", "TECNOLOGIA", "GOMERIA_MOVIL", "MECANICA_MOVIL", "MUDANZAS"].includes(code)) {
    return "technical";
  }
  return "other";
}

function sortedCategories(categories = []) {
  const order = ["professional", "home", "care", "beauty", "technical", "other"];
  return [...categories].sort((a, b) => {
    const groupDelta = order.indexOf(categoryGroup(a)) - order.indexOf(categoryGroup(b));
    if (groupDelta !== 0) return groupDelta;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es");
  });
}

function categoryById(categories = [], id = "") {
  return categories.find((category) => String(category.id) === String(id)) ?? null;
}

function recommendedDefaultsForCategory(category = {}) {
  const model = String(category.default_pricing_model || "HOURLY").toUpperCase();
  const modes = Array.isArray(category.allowed_service_modes) && category.allowed_service_modes.length
    ? category.allowed_service_modes
    : ["IN_PERSON"];
  const serviceMode = modes.includes("ONLINE") ? "ONLINE" : modes[0] || "IN_PERSON";

  return {
    pricingModel: model,
    serviceMode,
    locationPolicy: serviceMode === "ONLINE" ? "ONLINE_ONLY" : "CLIENT_ADDRESS",
    unitName: model === "UNIT" ? "sesion" : "",
    durationMinutes: model === "UNIT" ? 45 : ""
  };
}

function categoryRequirementText(category = {}) {
  const items = [];
  if (category.requires_professional_license) items.push("requiere matricula o titulo");
  if (category.requires_background_check) items.push("requiere buena conducta");
  const modes = Array.isArray(category.allowed_service_modes) ? category.allowed_service_modes : [];
  if (modes.includes("ONLINE")) items.push("admite online");
  return items.join(" · ");
}

function setBadgeCount(id, count) {
  const el = document.getElementById(id);
  if (!el) return;

  const safeCount = Math.max(0, Number(count ?? 0));
  el.textContent = String(safeCount);
  el.hidden = safeCount <= 0;
}

function initialsFromName(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "PR";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
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
  const displayName =
    state.session.userName || state.session.userEmail || "Prestador";

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? `Prestador · ${displayName}`
      : hasBackend
        ? "Prestador invitado"
        : "Modo demo";
  }

  if (authPrimaryButton) {
    authPrimaryButton.hidden = isAuthenticated;
  }

  if (authSecondaryButton) {
    authSecondaryButton.hidden = !isAuthenticated;
  }

  if (authHint) {
    authHint.textContent = isAuthenticated
      ? "Ya podés gestionar ofertas, ajustar tu setup y operar el servicio activo con tracking real."
      : hasBackend
        ? "Ingresá con Google para ver tus ofertas, pricing y estados en tiempo real."
        : "Sin credenciales de Supabase cargadas. Podés revisar la UI en modo demo.";
  }
}

export function renderProviderStats(state) {
  const providerStateChip = document.getElementById("providerStateChip");
  const providerRating = document.getElementById("providerRating");
  const providerOffersCount = document.getElementById("providerOffersCount");
  const providerCompletedCount = document.getElementById("providerCompletedCount");

  const status = state.provider.profile?.status ?? state.provider.status;
  const reviewSummary = state.provider.reviewSummary ?? {};

  if (providerStateChip) {
    providerStateChip.textContent = providerStatusLabels[status] ?? status;
  }

  if (providerRating) {
    providerRating.textContent = Number(
      reviewSummary.average ?? state.provider.stats.rating ?? 5
    ).toFixed(1);
  }

  if (providerOffersCount) {
    providerOffersCount.textContent = String(state.provider.offers?.length ?? 0);
  }

  if (providerCompletedCount) {
    providerCompletedCount.textContent = String(state.provider.stats.completed ?? 0);
  }

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.providerStatus === status);
  });
}

export function renderOffersList(state) {
  const offersList = document.getElementById("offersList");
  if (!offersList) return;

  const offers = Array.isArray(state.provider.offers) ? state.provider.offers : [];

  offersList.innerHTML = offers.length
    ? offers
        .map((offer) => {
          const request = offer.svc_requests ?? {};

          return `
            <article class="offer-card">
              <header>
                <div>
                  <strong>${escapeHtml(offer.title ?? "Nueva solicitud")}</strong>
                  <span class="muted">${escapeHtml(offer.address_text ?? request.address_text ?? "Ubicación a confirmar")}</span>
                </div>
                <strong>${currency(offer.total_price_snapshot ?? request.total_price_snapshot ?? 0)}</strong>
              </header>

              <div class="result-meta">
                <div class="metric">
                  <span>Cliente</span>
                  <strong>${escapeHtml(offer.client_name ?? request.client_name ?? "Cliente")}</strong>
                </div>
                <div class="metric">
                  <span>Duración</span>
                  <strong>${escapeHtml(String(offer.requested_hours ?? request.requested_hours ?? 2))} hs</strong>
                </div>
                <div class="metric">
                  <span>Estado</span>
                  <strong>${escapeHtml(offer.status ?? "PENDING")}</strong>
                </div>
                <div class="metric">
                  <span>Vence</span>
                  <strong>${escapeHtml(formatDate(offer.expires_at))}</strong>
                </div>
              </div>

              <div class="action-row">
                <button
                  class="btn-secondary"
                  data-offer-action="reject"
                  data-offer-id="${escapeHtml(offer.id)}"
                  type="button"
                >
                  Rechazar
                </button>
                <button
                  class="btn-primary"
                  data-offer-action="accept"
                  data-offer-id="${escapeHtml(offer.id)}"
                  type="button"
                >
                  Aceptar
                </button>
              </div>
            </article>
          `;
        })
        .join("")
    : `
      <div class="summary-card">
        <strong>Sin ofertas activas</strong>
        <span class="muted">Cuando entre una solicitud te la mostramos acá en tiempo real.</span>
      </div>
    `;
}
export function renderProviderDashboard(state) {
  const container = document.getElementById("providerDashboardPanel");
  if (!container) return;

  const dashboard = state.provider.dashboard ?? {};

  container.innerHTML = `
    <section class="provider-kpi-grid">

      <article class="provider-kpi-card">
        <span>Ganancias</span>
        <strong>${currency(dashboard.earnings ?? 0)}</strong>
        <small>Total histórico</small>
      </article>

      <article class="provider-kpi-card">
        <span>Servicios completados</span>
        <strong>${dashboard.completed ?? 0}</strong>
        <small>Servicios</small>
      </article>

      <article class="provider-kpi-card">
        <span>Estado actual</span>
        <strong>${
          dashboard.active
            ? stateLabels[dashboard.active.status] ?? dashboard.active.status
            : "Sin servicio"
        }</strong>
        <small>Tiempo real</small>
      </article>

    </section>

    <section class="provider-history">
      <h3>Últimos servicios</h3>
      ${
        (dashboard.history ?? []).length
          ? dashboard.history
              .slice(0, 5)
              .map(
                (item) => `
                  <div class="history-item">
                    <span>${escapeHtml(item.address_text ?? "Servicio")}</span>
                    <strong>${currency(item.total_price_snapshot ?? 0)}</strong>
                  </div>
                `
              )
              .join("")
          : `<span class="muted">Sin historial aún</span>`
      }
    </section>
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
          <div class="metric">
            <span>Total</span>
            <strong>${currency(activeService.total_price_snapshot ?? activeService.total_price ?? 0)}</strong>
          </div>
          <div class="metric">
            <span>Tracking</span>
            <strong>${state.tracking.providerPosition ? "Activo" : "Pendiente"}</strong>
          </div>
        </div>
      </div>
    `
    : `
      <div class="summary-card">
        <strong>Sin servicio activo</strong>
        <span class="muted">Aceptá una oferta para habilitar las acciones operativas y el tracking del servicio.</span>
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
          : ""
      ].join("")
    : "";
}

function renderProviderProfile(state) {
  const container = document.getElementById("providerProfilePanel");
  if (!container) return;

  const profile = state.provider.profile;
  const detail = state.provider.business?.profile ?? null;
  const categories = state.provider.categories ?? [];
  const documentsSummary = state.provider.documentsSummary ?? {};
  const reviewSummary = state.provider.reviewSummary ?? {};
  const availability = state.provider.availability ?? {};

  if (!profile && !detail) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Perfil pendiente</strong>
        <span class="muted">Cuando carguemos tu información del backend, vas a ver tu bio, cobertura y modalidad de trabajo.</span>
      </div>
    `;
    return;
  }

  const displayName =
    profile?.full_name ||
    state.session.userName ||
    state.session.userEmail ||
    "Prestador";

  const location = [detail?.city, detail?.province, detail?.country_code]
    .filter(Boolean)
    .join(", ");

  const chips = [
    detail?.accepts_immediate ? "Toma inmediatos" : null,
    detail?.accepts_scheduled ? "Agenda futura" : null,
    detail?.pricing_mode || "Precio por hora",
    profile?.approved ? "Aprobado" : "En revisión",
    profile?.blocked ? "Bloqueado" : null,
    detail?.onboarding_completed ? "Onboarding completo" : "Onboarding pendiente"
  ].filter(Boolean);

  container.innerHTML = `
    <section class="provider-hero-card">
      <div class="provider-hero-head">
        <div class="provider-avatar">${escapeHtml(initialsFromName(displayName))}</div>
        <div class="provider-identity">
          <strong>${escapeHtml(displayName)}</strong>
          <span class="muted">${escapeHtml(detail?.bio ?? "Completá tu bio, cobertura y pricing para generar más confianza y mejorar conversión.")}</span>
        </div>
      </div>

      <div class="chip-row">
        ${chips.map((chip) => `<span class="inline-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>

      <div class="provider-kpi-grid">
        <article class="provider-kpi-card">
          <span>Rating</span>
          <strong>${Number(reviewSummary.average ?? state.provider.stats.rating ?? 5).toFixed(1)}</strong>
          <small>${escapeHtml(String(reviewSummary.count ?? 0))} reseñas</small>
        </article>
        <article class="provider-kpi-card">
          <span>Completados</span>
          <strong>${escapeHtml(String(state.provider.stats.completed ?? 0))}</strong>
          <small>servicios</small>
        </article>
        <article class="provider-kpi-card">
          <span>Documentos</span>
          <strong>${escapeHtml(String((documentsSummary.approved ?? 0) + (documentsSummary.pending ?? 0) + (documentsSummary.observed ?? 0)))}</strong>
          <small>${escapeHtml(String(documentsSummary.approved ?? 0))} aprobados</small>
        </article>
      </div>

      <div class="summary-metrics">
        <div class="metric">
          <span>Contacto</span>
          <strong>${escapeHtml(profile?.email ?? profile?.phone ?? "Pendiente")}</strong>
        </div>
        <div class="metric">
          <span>Cobertura</span>
          <strong>${escapeHtml(location || detail?.address_text || "Sin zona cargada")}</strong>
        </div>
        <div class="metric">
          <span>Última actividad</span>
          <strong>${escapeHtml(formatDate(availability.lastSeenAt ?? profile?.last_seen_at))}</strong>
        </div>
        <div class="metric">
          <span>Ubicación viva</span>
          <strong>${escapeHtml(availability.locationLabel ?? "Esperando geolocalización")}</strong>
        </div>
      </div>

      <div class="provider-category-strip">
        ${(categories.length
          ? categories
              .map((item) => item.svc_categories?.name ?? item.category_id)
              .filter(Boolean)
          : ["Sin categorías activas"]
        )
          .map((label) => `<span class="inline-chip">${escapeHtml(label)}</span>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderAvailability(items) {
  if (!Array.isArray(items) || !items.length) {
    return `
      <div class="summary-card">
        <strong>Disponibilidad pendiente</strong>
        <span class="muted">El backend ya soporta franjas en svc_provider_availability, pero todavía no hay horarios activos para mostrar.</span>
      </div>
    `;
  }

  return `
    <div class="provider-slot-grid">
      ${items
        .map(
          (slot) => `
            <article class="provider-slot-card">
              <strong>${escapeHtml(dayLabels[Number(slot.day_of_week)] ?? "Día")}</strong>
              <span>${escapeHtml(String(slot.start_time ?? "").slice(0, 5))} - ${escapeHtml(String(slot.end_time ?? "").slice(0, 5))}</span>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPricing(pricing, detail) {
  if (!Array.isArray(pricing) || !pricing.length) {
    return `
      <div class="summary-card">
        <strong>Tarifas pendientes</strong>
        <span class="muted">Todavía no hay registros activos en svc_provider_pricing para este prestador.</span>
      </div>
    `;
  }

  return `
    <div class="provider-pricing-grid">
      ${pricing
        .map(
          (item) => `
            <article class="provider-pricing-card">
              <strong>${escapeHtml(item.svc_categories?.name ?? item.category_id ?? "Categoría")}</strong>
              <div class="summary-metrics">
                <div class="metric">
                  <span>Hora</span>
                  <strong>${currency(item.price_per_hour, item.currency)}</strong>
                </div>
                <div class="metric">
                  <span>Rango</span>
                  <strong>${escapeHtml(String(item.minimum_hours ?? 1))} - ${escapeHtml(String(item.maximum_hours ?? detail?.max_hours_per_service ?? 8))} hs</strong>
                </div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPricingModelOptions(selected = "HOURLY") {
  const current = String(selected || "HOURLY").toUpperCase();

  return Object.entries(pricingModelLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderServiceModeOptions(selected = "IN_PERSON") {
  const current = String(selected || "IN_PERSON").toUpperCase();

  return Object.entries(serviceModeLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderLocationPolicyOptions(selected = "CLIENT_ADDRESS") {
  const current = String(selected || "CLIENT_ADDRESS").toUpperCase();

  return Object.entries(locationPolicyLabels)
    .map(([value, label]) => `
      <option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>
    `)
    .join("");
}

function renderOfferingEditor(offering = null, index = 0, categories = []) {
  const currentCategoryId = offering?.category_id ?? "";
  const pricingModel = offering?.pricing_model ?? "HOURLY";
  const serviceMode = offering?.service_mode ?? "IN_PERSON";
  const locationPolicy =
    offering?.location_policy ?? (serviceMode === "ONLINE" ? "ONLINE_ONLY" : "CLIENT_ADDRESS");
  const checked = offering ? "checked" : "";

  return `
    <article class="provider-editor-card provider-offering-card">
      <input type="hidden" name="offering:${index}:present" value="1">
      <input type="hidden" name="offering:${index}:id" value="${escapeHtml(offering?.id ?? "")}">
      <label class="provider-check-item">
        <input type="checkbox" name="offering:${index}:active" ${checked}>
        <span>${offering ? "Trabajo publicado" : "Agregar este trabajo"}</span>
      </label>
      <label class="input-group">
        <span>Servicio o trabajo</span>
        <input name="offering:${index}:title" type="text" maxlength="90" value="${escapeHtml(offering?.title ?? "")}" placeholder="Ej: Pintura de living, corte de pasto, reja a medida">
      </label>
      <label class="input-group">
        <span>Categoría</span>
        <select name="offering:${index}:categoryId">
          <option value="">Elegí una categoría</option>
          ${categories.map((category) => `
            <option value="${escapeHtml(category.id)}" ${currentCategoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>
          `).join("")}
        </select>
      </label>
      <label class="input-group">
        <span>Cómo lo cobrás</span>
        <select name="offering:${index}:pricingModel">
          ${renderPricingModelOptions(pricingModel)}
        </select>
      </label>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Modalidad</span>
          <select name="offering:${index}:serviceMode">
            ${renderServiceModeOptions(serviceMode)}
          </select>
        </label>
        <label class="input-group">
          <span>Atención</span>
          <select name="offering:${index}:locationPolicy">
            ${renderLocationPolicyOptions(locationPolicy)}
          </select>
        </label>
      </div>
      <label class="input-group">
        <span>Descripción breve</span>
        <textarea name="offering:${index}:description" maxlength="220" rows="2" placeholder="Contá qué incluye, cómo presupuestás o qué necesita saber el cliente">${escapeHtml(offering?.description ?? "")}</textarea>
      </label>
      <label class="input-group">
        <span>Resumen para la card</span>
        <input name="offering:${index}:publicSummary" type="text" maxlength="140" value="${escapeHtml(offering?.public_summary ?? "")}" placeholder="Ej: Sesiones online para ansiedad, estrés y orientación adulta">
      </label>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>$/hora</span>
          <input name="offering:${index}:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(offering?.price_per_hour ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Visita base</span>
          <input name="offering:${index}:baseVisitFee" type="number" min="0" step="100" value="${escapeHtml(String(offering?.base_visit_fee ?? ""))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Precio cerrado</span>
          <input name="offering:${index}:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.fixed_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Mínimo</span>
          <input name="offering:${index}:minimumCharge" type="number" min="0" step="100" value="${escapeHtml(String(offering?.minimum_charge ?? 0))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Unidad</span>
          <input name="offering:${index}:unitName" type="text" maxlength="40" value="${escapeHtml(offering?.unit_name ?? "")}" placeholder="sesión, clase, consulta">
        </label>
        <label class="input-group">
          <span>$/sesión o unidad</span>
          <input name="offering:${index}:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.unit_price ?? ""))}" placeholder="0">
        </label>
      </div>
      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Min hs</span>
          <input name="offering:${index}:minimumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.minimum_hours ?? ""))}" placeholder="1">
        </label>
        <label class="input-group">
          <span>Max hs</span>
          <input name="offering:${index}:maximumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.maximum_hours ?? ""))}" placeholder="8">
        </label>
        <label class="input-group">
          <span>Duración sesión</span>
          <input name="offering:${index}:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(offering?.duration_minutes ?? ""))}" placeholder="45">
        </label>
      </div>
      <label class="provider-check-item">
        <input name="offering:${index}:quoteRequired" type="checkbox" ${offering?.quote_required ? "checked" : ""}>
        <span>Requiere presupuesto antes de confirmar</span>
      </label>
      <label class="input-group">
        <span>Indicaciones para el cliente</span>
        <textarea name="offering:${index}:clientInstructions" maxlength="220" rows="2" placeholder="Ej: La videollamada se coordina por chat luego de aceptar la solicitud">${escapeHtml(offering?.client_instructions ?? "")}</textarea>
      </label>
    </article>
  `;
}

function renderOfferingsSummary(offerings = []) {
  if (!offerings.length) {
    return `
      <section class="summary-card">
        <strong>Trabajos publicados</strong>
        <p class="muted">Todavía no tenés trabajos activos. Publicá al menos una propuesta concreta para que los clientes vean modalidad, duración y precio.</p>
      </section>
    `;
  }

  return `
    <section class="summary-card">
      <div class="block-header compact">
        <div>
          <span class="eyebrow">Visible para clientes</span>
          <h3>Ofertas activas</h3>
        </div>
      </div>
      <div class="provider-pricing-grid">
        ${offerings
          .map((offering) => {
            const pricingModel = String(offering.pricing_model ?? "HOURLY").toUpperCase();
            const serviceMode = String(offering.service_mode ?? "IN_PERSON").toUpperCase();
            const locationPolicy = String(offering.location_policy ?? "CLIENT_ADDRESS").toUpperCase();
            const unitName = offering.unit_name || (pricingModel === "UNIT" ? "sesión" : "unidad");
            const amount =
              pricingModel === "UNIT"
                ? offering.unit_price
                : pricingModel === "FIXED"
                  ? offering.fixed_price
                  : pricingModel === "BASE_VISIT"
                    ? offering.base_visit_fee
                    : offering.price_per_hour;
            const priceLabel =
              pricingModel === "QUOTE"
                ? "A presupuestar"
                : pricingModel === "UNIT"
                  ? `${currency(amount, offering.currency)} / ${unitName}`
                  : `${currency(amount, offering.currency)}${pricingModel === "HOURLY" ? " / hora" : ""}`;

            return `
              <article class="provider-pricing-card">
                <strong>${escapeHtml(offering.title ?? "Trabajo publicado")}</strong>
                <p class="muted">${escapeHtml(offering.public_summary ?? offering.description ?? "Sin resumen público")}</p>
                <div class="summary-metrics">
                  <div class="metric">
                    <span>Precio</span>
                    <strong>${escapeHtml(priceLabel)}</strong>
                  </div>
                  <div class="metric">
                    <span>Modalidad</span>
                    <strong>${escapeHtml(serviceModeLabels[serviceMode] ?? serviceMode)}</strong>
                  </div>
                  <div class="metric">
                    <span>Atención</span>
                    <strong>${escapeHtml(locationPolicyLabels[locationPolicy] ?? locationPolicy)}</strong>
                  </div>
                  <div class="metric">
                    <span>Duración</span>
                    <strong>${offering.duration_minutes ? `${escapeHtml(String(offering.duration_minutes))} min` : "A coordinar"}</strong>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderOfferingEditorV2(offering = null, index = 0, categories = []) {
  const currentCategoryId = offering?.category_id ?? "";
  const currentCategory = categoryById(categories, currentCategoryId);
  const defaults = recommendedDefaultsForCategory(currentCategory);
  const pricingModel = offering?.pricing_model ?? defaults.pricingModel;
  const serviceMode = offering?.service_mode ?? defaults.serviceMode;
  const locationPolicy = offering?.location_policy ?? defaults.locationPolicy;
  const checked = offering ? "checked" : "checked";
  const groupedCategories = sortedCategories(categories).reduce((acc, category) => {
    const group = categoryGroup(category);
    if (!acc[group]) acc[group] = [];
    acc[group].push(category);
    return acc;
  }, {});
  const requirement = currentCategory ? categoryRequirementText(currentCategory) : "";

  return `
    <article class="provider-editor-card provider-offering-card provider-offering-card-v2">
      <input type="hidden" name="offering:${index}:present" value="1">
      <input type="hidden" name="offering:${index}:id" value="${escapeHtml(offering?.id ?? "")}">

      <div class="provider-offering-step">
        <span>${index + 1}</span>
        <div>
          <strong>${offering ? "Editar publicacion" : "Nueva publicacion"}</strong>
          <small>Esto es lo que despues ve el cliente en la card.</small>
        </div>
      </div>

      <label class="provider-check-item">
        <input type="checkbox" name="offering:${index}:active" ${checked}>
        <span>Publicar este servicio</span>
      </label>

      <label class="input-group provider-field-wide">
        <span>Que ofreces exactamente</span>
        <input name="offering:${index}:title" type="text" maxlength="90" value="${escapeHtml(offering?.title ?? "")}" placeholder="Ej: sesion de psicologia online, corte de pasto, unas semi">
      </label>

      <label class="input-group provider-field-wide">
        <span>Rubro donde te tienen que encontrar</span>
        <select name="offering:${index}:categoryId">
          <option value="">Elegi el rubro mas cercano</option>
          ${Object.entries(groupedCategories).map(([group, items]) => `
            <optgroup label="${escapeHtml(categoryGroupLabels[group] ?? group)}">
              ${items.map((category) => `
                <option value="${escapeHtml(category.id)}" ${String(currentCategoryId) === String(category.id) ? "selected" : ""}>${escapeHtml(category.name)}</option>
              `).join("")}
            </optgroup>
          `).join("")}
        </select>
        <small>${escapeHtml(requirement || "Si no ves tu oficio exacto, elegi el rubro mas parecido y escribi el nombre exacto arriba.")}</small>
      </label>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Como lo cobras</span>
          <select name="offering:${index}:pricingModel">
            ${renderPricingModelOptions(pricingModel)}
          </select>
        </label>
        <label class="input-group">
          <span>Modalidad</span>
          <select name="offering:${index}:serviceMode">
            ${renderServiceModeOptions(serviceMode)}
          </select>
        </label>
        <label class="input-group">
          <span>Atencion</span>
          <select name="offering:${index}:locationPolicy">
            ${renderLocationPolicyOptions(locationPolicy)}
          </select>
        </label>
      </div>

      <label class="input-group provider-field-wide">
        <span>Que incluye</span>
        <textarea name="offering:${index}:description" maxlength="220" rows="2" placeholder="Conta el alcance, que incluye, que no incluye y que necesita saber el cliente">${escapeHtml(offering?.description ?? "")}</textarea>
      </label>

      <label class="input-group provider-field-wide">
        <span>Resumen para la card</span>
        <input name="offering:${index}:publicSummary" type="text" maxlength="140" value="${escapeHtml(offering?.public_summary ?? "")}" placeholder="Ej: sesiones online para ansiedad, estres y orientacion adulta">
      </label>

      <div class="provider-price-helper">
        <strong>Precio</strong>
        <span>Completa el campo que corresponda al modelo elegido. Para psicologia o consultas, usa unidad: sesion.</span>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>$/hora</span>
          <input name="offering:${index}:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(offering?.price_per_hour ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Visita base</span>
          <input name="offering:${index}:baseVisitFee" type="number" min="0" step="100" value="${escapeHtml(String(offering?.base_visit_fee ?? ""))}" placeholder="0">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Precio cerrado</span>
          <input name="offering:${index}:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.fixed_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Minimo</span>
          <input name="offering:${index}:minimumCharge" type="number" min="0" step="100" value="${escapeHtml(String(offering?.minimum_charge ?? 0))}" placeholder="0">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Unidad</span>
          <input name="offering:${index}:unitName" type="text" maxlength="40" value="${escapeHtml(offering?.unit_name ?? defaults.unitName)}" placeholder="sesion, clase, consulta">
        </label>
        <label class="input-group">
          <span>$/sesion o unidad</span>
          <input name="offering:${index}:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(offering?.unit_price ?? ""))}" placeholder="0">
        </label>
        <label class="input-group">
          <span>Duracion</span>
          <input name="offering:${index}:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(offering?.duration_minutes ?? defaults.durationMinutes))}" placeholder="45">
        </label>
      </div>

      <div class="provider-inline-fields">
        <label class="input-group">
          <span>Min hs</span>
          <input name="offering:${index}:minimumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.minimum_hours ?? ""))}" placeholder="1">
        </label>
        <label class="input-group">
          <span>Max hs</span>
          <input name="offering:${index}:maximumHours" type="number" min="1" max="24" value="${escapeHtml(String(offering?.maximum_hours ?? ""))}" placeholder="8">
        </label>
      </div>

      <label class="provider-check-item">
        <input name="offering:${index}:quoteRequired" type="checkbox" ${offering?.quote_required ? "checked" : ""}>
        <span>Requiere presupuesto antes de confirmar</span>
      </label>

      <label class="input-group provider-field-wide">
        <span>Indicaciones para el cliente</span>
        <textarea name="offering:${index}:clientInstructions" maxlength="220" rows="2" placeholder="Ej: la videollamada se coordina por chat luego de aceptar la solicitud">${escapeHtml(offering?.client_instructions ?? "")}</textarea>
      </label>
    </article>
  `;
}

function renderProviderBusiness(state) {
  const container = document.getElementById("providerBusinessPanel");
  if (!container) return;

  const business = state.provider.business ?? {};
  const detail = business.profile ?? null;
  const pricing = business.pricing ?? [];
  const offerings = business.offerings ?? [];
  const availability = business.availability ?? [];
  const locationLabel = state.provider.availability?.locationLabel ?? "Sin posición tomada";
  const activeCategoryIds = new Set(
    (state.provider.categories ?? []).map((item) => item.category_id ?? item.id)
  );
  const categories = sortedCategories(
    Array.isArray(state.appConfig?.categories) && state.appConfig.categories.length
      ? state.appConfig.categories
      : appConfig.categories
  );
  const pricingByCategory = new Map(pricing.map((item) => [item.category_id, item]));
  const availabilityByDay = new Map(
    availability.map((item) => [String(item.day_of_week), item])
  );

  container.innerHTML = `
    <section class="provider-stack">
      <form class="summary-card provider-settings-form" id="providerBusinessForm">
        <section class="provider-inline-section provider-business-hero">
          <div>
            <span class="eyebrow">Mis servicios</span>
            <h3>Publica que vendes en MIMI</h3>
            <p class="muted">Crea tu oficio o profesion como una publicacion: psicologia online por sesion, kinesiologia a domicilio, manicuria, limpieza, corte de pasto, albanileria o cualquier servicio.</p>
          </div>
          <button class="btn-primary" data-provider-business-action="focus-offering-editor" type="button">Crear servicio</button>
        </section>
        <strong>Tarifas y disponibilidad</strong>
        <p class="muted">Este bloque se alimenta del backend real: pricing por categoría, franjas activas y refresco de ubicación para el mapa.</p>

        <div class="provider-action-strip">
          <button class="btn-primary" data-provider-business-action="refresh-location" type="button">Actualizar ubicación</button>
          <button class="btn-secondary" data-provider-business-action="focus-map" type="button">Ver mapa</button>
          <button class="btn-secondary" data-provider-business-action="refresh-workspace" type="button">Recargar panel</button>
        </div>

        <div class="summary-metrics">
          <div class="metric">
            <span>Modalidad</span>
            <strong>${escapeHtml(detail?.pricing_mode ?? "POR_HORA")}</strong>
          </div>
          <div class="metric">
            <span>Máximo por servicio</span>
            <strong>${escapeHtml(String(detail?.max_hours_per_service ?? 8))} hs</strong>
          </div>
          <div class="metric">
            <span>Posición actual</span>
            <strong>${escapeHtml(locationLabel)}</strong>
          </div>
        </div>

        <div class="provider-form-grid">
          <label class="input-group">
            <span>Bio corta</span>
            <input name="providerBio" type="text" maxlength="180" value="${escapeHtml(detail?.bio ?? "")}" placeholder="Describe en una línea tu servicio">
          </label>
          <label class="input-group">
            <span>Título público</span>
            <input name="providerPublicHeadline" type="text" maxlength="120" value="${escapeHtml(detail?.public_headline ?? "")}" placeholder="Ej: Psicóloga clínica - sesiones online">
          </label>
          <label class="input-group">
            <span>Video o sala online</span>
            <input name="providerVideoIntroUrl" type="url" maxlength="240" value="${escapeHtml(detail?.video_intro_url ?? "")}" placeholder="Link profesional, sitio o sala a coordinar">
          </label>
          <label class="input-group">
            <span>Ciudad</span>
            <input name="providerCity" type="text" maxlength="80" value="${escapeHtml(detail?.city ?? "")}" placeholder="Ciudad base">
          </label>
          <label class="input-group">
            <span>Provincia</span>
            <input name="providerProvince" type="text" maxlength="80" value="${escapeHtml(detail?.province ?? "")}" placeholder="Provincia">
          </label>
          <label class="input-group">
            <span>Dirección base</span>
            <input name="providerAddressText" type="text" maxlength="140" value="${escapeHtml(detail?.address_text ?? "")}" placeholder="Zona o dirección de referencia">
          </label>
          <label class="input-group">
            <span>Modalidad comercial</span>
            <select name="pricingMode">
              <option value="HOURLY" selected>Por hora</option>
            </select>
          </label>
          <label class="input-group">
            <span>Máximo por servicio</span>
            <input name="maxHoursPerService" type="number" min="1" max="12" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
          </label>
        </div>
        <label class="input-group">
          <span>Resumen profesional</span>
          <textarea name="providerProfessionalSummary" maxlength="600" rows="3" placeholder="Contá tu especialidad, alcance, experiencia y cómo coordinás el servicio sin prometer resultados">${escapeHtml(detail?.professional_summary ?? "")}</textarea>
        </label>

        <div class="provider-check-grid">
          <label class="provider-check-item">
            <input name="acceptsImmediate" type="checkbox" ${detail?.accepts_immediate ? "checked" : ""}>
            <span>Tomo inmediatos</span>
          </label>
          <label class="provider-check-item">
            <input name="acceptsScheduled" type="checkbox" ${(detail?.accepts_scheduled ?? true) ? "checked" : ""}>
            <span>Tomo programados</span>
          </label>
        </div>

        <section class="provider-inline-section">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Pricing</span>
              <h3>Categorías activas</h3>
            </div>
          </div>
          <div class="provider-editor-grid">
            ${categories
              .map((category) => {
                const current = pricingByCategory.get(category.id);

                return `
                  <article class="provider-editor-card">
                    <label class="provider-check-item">
                      <input type="checkbox" name="categoryActive:${escapeHtml(category.id)}" ${activeCategoryIds.has(category.id) || current ? "checked" : ""}>
                      <span>${escapeHtml(category.name)}</span>
                    </label>
                    <label class="input-group">
                      <span>Precio por hora</span>
                      <input name="price:${escapeHtml(category.id)}" type="number" min="0" step="100" value="${escapeHtml(String(current?.price_per_hour ?? ""))}" placeholder="0">
                    </label>
                    <div class="provider-inline-fields">
                      <label class="input-group">
                        <span>Min</span>
                        <input name="min:${escapeHtml(category.id)}" type="number" min="1" max="12" value="${escapeHtml(String(current?.minimum_hours ?? 1))}">
                      </label>
                      <label class="input-group">
                        <span>Max</span>
                        <input name="max:${escapeHtml(category.id)}" type="number" min="1" max="12" value="${escapeHtml(String(current?.maximum_hours ?? detail?.max_hours_per_service ?? 8))}">
                      </label>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>

        <section class="provider-inline-section">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Trabajos publicados</span>
              <h3>Qué ofrecés y cómo lo cobrás</h3>
              <p class="muted">MIMI sólo facilita la conexión. Vos definís si cobrás por hora, visita, trabajo, sesión, unidad o metro, y si atendés online, presencial o mixto.</p>
            </div>
          </div>
          <div class="provider-editor-grid">
            ${[...offerings, null]
              .map((offering, index) => renderOfferingEditorV2(offering, index, categories))
              .join("")}
          </div>
        </section>

        <section class="provider-inline-section">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Agenda</span>
              <h3>Disponibilidad semanal</h3>
            </div>
          </div>
          <div class="provider-editor-grid">
            ${dayLabels
              .map((dayLabel, index) => {
                const slot = availabilityByDay.get(String(index));

                return `
                  <article class="provider-editor-card">
                    <label class="provider-check-item">
                      <input type="checkbox" name="dayActive:${index}" ${slot ? "checked" : ""}>
                      <span>${escapeHtml(dayLabel)}</span>
                    </label>
                    <div class="provider-inline-fields">
                      <label class="input-group">
                        <span>Desde</span>
                        <input name="dayStart:${index}" type="time" value="${escapeHtml(String(slot?.start_time ?? "08:00").slice(0, 5))}">
                      </label>
                      <label class="input-group">
                        <span>Hasta</span>
                        <input name="dayEnd:${index}" type="time" value="${escapeHtml(String(slot?.end_time ?? "18:00").slice(0, 5))}">
                      </label>
                    </div>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>

        <div class="provider-action-strip">
          <button class="btn-primary" type="submit">Guardar setup comercial</button>
        </div>
      </form>

      ${renderOfferingsSummary(offerings)}
      ${renderPricing(pricing, detail)}
      ${renderAvailability(availability)}
    </section>
  `;
}

function renderProviderTrust(state) {
  const container = document.getElementById("providerTrustPanel");
  if (!container) return;

  const business = state.provider.business ?? {};
  const documents = business.documents ?? [];
  const reviews = business.reviews ?? [];
  const documentsSummary = state.provider.documentsSummary ?? {};
  const reviewSummary = state.provider.reviewSummary ?? {};
  const profile = state.provider.profile ?? null;

  const isApproved = Boolean(profile?.approved);
  const isBlocked = Boolean(profile?.blocked);
  const documentsByType = new Map();
  documents.forEach((doc) => {
    const type = String(doc.document_type ?? "").toLowerCase();
    if (type && !documentsByType.has(type)) documentsByType.set(type, doc);
  });
  const documentStatusLabel = (type) => {
    const doc = documentsByType.get(String(type).toLowerCase());
    if (!doc) {
      return isApproved && String(type).toLowerCase() !== "criminal_record_certificate"
        ? "Aprobado por admin"
        : "Pendiente";
    }
    const status = String(doc.review_status ?? "PENDING").toUpperCase();
    if (status === "APPROVED") return "Aprobado";
    if (status === "REJECTED") return "Rechazado";
    if (status === "NEEDS_RESUBMISSION") return "Reenviar";
    return "En revisión";
  };

  const totalDocs =
    Number(documentsSummary.approved ?? 0) +
    Number(documentsSummary.pending ?? 0) +
    Number(documentsSummary.observed ?? 0);

  const verificationTitle = isBlocked
    ? "Cuenta bloqueada"
    : isApproved
      ? "Verificación aprobada"
      : totalDocs > 0
        ? "Verificación en revisión"
        : "Completá tu verificación";

  const verificationText = isBlocked
    ? "Tu cuenta necesita revisión del equipo MIMI antes de operar."
    : isApproved
      ? "Tu cuenta está aprobada para operar cuando estés online."
      : totalDocs > 0
        ? "Ya recibimos tus documentos. Si alguno queda observado, vas a poder reenviarlo desde acá."
        : "Subí identidad, antecedentes y, si corresponde, matrícula o título profesional.";

  // 🔥 WIZARD PRO CORRECTO
  const uploadFormHtml = state.session.providerId
    ? `
    <div class="doc-wizard-shell">

      <div class="doc-wizard-progress">
        <strong>Verificación y habilitación</strong>
        <div class="docs-progress-bar">
          <div class="docs-progress-bar__fill" id="docProgressBar"></div>
        </div>
      </div>

      ${[
        ["dni_front", "DNI frente"],
        ["dni_back", "DNI dorso"],
        ["selfie", "Selfie"],
        ["criminal_record_certificate", "Certificado de antecedentes", "Opcional por 15 días"],
        ["professional_license", "Matrícula profesional"],
        ["degree_certificate", "Título o constancia"],
        ["address_proof", "Comprobante de domicilio"]
      ].map(([id, title, note]) => {
        const current = documentsByType.get(id);
        return `
        <div class="doc-wizard-card" data-doc="${id}">
          
          <div class="doc-wizard-card__content">
            <h3>${title}</h3>
            <p>${escapeHtml(note ?? "Tomá una foto clara o subí imagen/PDF.")}</p>
            <span class="doc-status-pill">${escapeHtml(documentStatusLabel(id))}</span>
          </div>

          <div class="doc-preview" id="preview-${id}"></div>

          <div class="doc-actions-inline--wizard" ${current ? "hidden" : ""}>
            <button type="button" class="doc-camera-btn" data-camera="${id}">
              📸 Sacar foto
            </button>

            <button type="button" class="doc-upload-btn" data-upload="${id}">
              📂 Subir archivo
            </button>

            <input type="file" class="hidden-input" data-input="${id}" accept="image/*,application/pdf" />
          </div>

          <div class="doc-status" id="status-${id}"></div>

        </div>
      `;
      }).join("")}

    </div>
    `
    : `
    <div class="summary-card">
      <strong>Ingresá con Google</strong>
      <span class="muted">Necesitás una sesión de prestador.</span>
    </div>
    `;

  const documentsHtml = documents.length
    ? documents.map(doc => `
      <div class="provider-doc-card">
        <strong>${doc.document_type}</strong>
        <span>${doc.review_status}</span>
      </div>
    `).join("")
    : `<div class="summary-card">Sin documentos cargados</div>`;

  const reviewsHtml = reviews.length
    ? reviews.map(r => `
      <div class="provider-review-card">
        <strong>${r.rating}</strong>
        <p>${r.comment}</p>
      </div>
    `).join("")
    : `<div class="summary-card">Sin reseñas</div>`;

  container.innerHTML = `
    <section class="provider-stack provider-onboarding-shell">

      <article class="provider-verification-card">
        <h3>${verificationTitle}</h3>
        <p>${verificationText}</p>

        ${uploadFormHtml}
      </article>

      ${documentsHtml}
      ${reviewsHtml}

    </section>
  `;
}
export function renderNotifications(state) {
  const items = Array.isArray(state.notifications.items)
    ? state.notifications.items
    : [];
  const unread = items.filter((item) => !item.read_at).length;

  setBadgeCount("notificationsCount", unread);

  const html = items.length
    ? items
        .map(
          (item) => `
            <article class="notification-card">
              <strong>${escapeHtml(item.title ?? "Notificación")}</strong>
              <p class="muted">${escapeHtml(item.body ?? "")}</p>
              <span class="muted">${escapeHtml(formatDate(item.created_at))}</span>
            </article>
          `
        )
        .join("")
    : `
      <div class="summary-card">
        <strong>Sin notificaciones</strong>
        <span class="muted">Las novedades operativas van a aparecer acá.</span>
      </div>
    `;

  const notificationsList = document.getElementById("notificationsList");
  const notificationsDrawerBody = document.getElementById("notificationsDrawerBody");

  if (notificationsList) notificationsList.innerHTML = html;
  if (notificationsDrawerBody) notificationsDrawerBody.innerHTML = html;
}

export function renderChat(state) {
  const messages = Array.isArray(state.chat.messages)
    ? state.chat.messages
    : [];

  setBadgeCount("chatUnreadCount", state.chat.unreadCount ?? 0);

  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  chatMessages.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message-bubble ${
              message.sender_user_id === state.session.userId ||
              message.sender_user_id === "self"
                ? "is-own"
                : ""
            }">
              <strong>${
                message.sender_user_id === state.session.userId ||
                message.sender_user_id === "self"
                  ? "Vos"
                  : "Cliente"
              }</strong>
              <p>${escapeHtml(message.body ?? "")}</p>
              <span class="muted">${escapeHtml(formatDate(message.created_at))}</span>
            </article>
          `
        )
        .join("")
    : `
      <div class="summary-card">
        <strong>Chat listo</strong>
        <span class="muted">Los mensajes del servicio van a aparecer acá en tiempo real.</span>
      </div>
    `;
}

function renderMapStatus(state) {
  const mapStatus = document.getElementById("mapStatus");
  if (!mapStatus) return;

  const activeService = state.provider.activeService;
  const providerStatus = state.provider.profile?.status ?? state.provider.status;
  const hasProviderPosition =
    Number.isFinite(Number(state.tracking.providerPosition?.lat)) &&
    Number.isFinite(Number(state.tracking.providerPosition?.lng));

  if (activeService) {
    mapStatus.textContent = stateLabels[activeService.status] ?? activeService.status;
    return;
  }

  if (providerStatus === "ONLINE_IDLE" && hasProviderPosition) {
    mapStatus.textContent = "Online con ubicación visible";
    return;
  }

  mapStatus.textContent = hasProviderPosition
    ? "Ubicación registrada"
    : "Esperando actividad";
}

export function renderProviderScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderProviderStats(state);
  renderOffersList(state);
  renderProviderActiveService(state);
  renderProviderProfile(state);
  renderProviderBusiness(state);
  renderProviderTrust(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
}
