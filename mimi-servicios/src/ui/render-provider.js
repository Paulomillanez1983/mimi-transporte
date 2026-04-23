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
  const detail = state.provider.business.profile;
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

function renderProviderBusiness(state) {
  const container = document.getElementById("providerBusinessPanel");
  if (!container) return;

  const detail = state.provider.business.profile;
  const pricing = state.provider.business.pricing ?? [];
  const availability = state.provider.business.availability ?? [];
  const locationLabel = state.provider.availability?.locationLabel ?? "Sin posición tomada";
  const activeCategoryIds = new Set(
    (state.provider.categories ?? []).map((item) => item.category_id)
  );
  const categories = Array.isArray(appConfig.categories) ? appConfig.categories : [];
  const pricingByCategory = new Map(pricing.map((item) => [item.category_id, item]));
  const availabilityByDay = new Map(
    availability.map((item) => [String(item.day_of_week), item])
  );

  container.innerHTML = `
    <section class="provider-stack">
      <form class="summary-card provider-settings-form" id="providerBusinessForm">
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
              <option value="POR_HORA" ${(detail?.pricing_mode ?? "POR_HORA") === "POR_HORA" ? "selected" : ""}>Por hora</option>
              <option value="PRECIO_CERRADO" ${detail?.pricing_mode === "PRECIO_CERRADO" ? "selected" : ""}>Precio cerrado</option>
            </select>
          </label>
          <label class="input-group">
            <span>Máximo por servicio</span>
            <input name="maxHoursPerService" type="number" min="1" max="12" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
          </label>
        </div>

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

      ${renderPricing(pricing, detail)}
      ${renderAvailability(availability)}
    </section>
  `;
}

function renderProviderTrust(state) {
  const container = document.getElementById("providerTrustPanel");
  if (!container) return;

  const documents = state.provider.business.documents ?? [];
  const reviews = state.provider.business.reviews ?? [];
  const documentsSummary = state.provider.documentsSummary ?? {};
  const reviewSummary = state.provider.reviewSummary ?? {};
  const profile = state.provider.profile ?? null;
  const isApproved = Boolean(profile?.approved);
  const isBlocked = Boolean(profile?.blocked);
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
        : "Subí DNI frente, DNI dorso, selfie y comprobante de domicilio. No pedimos carnet, vehículo ni licencia para MIMI Servicios.";

  const documentOptions = [
    ["dni_front", "DNI frente"],
    ["dni_back", "DNI dorso"],
    ["selfie", "Selfie de verificación"],
    ["address_proof", "Comprobante de domicilio"],
    ["background_check", "Antecedentes / constancia"],
    ["certificate_optional", "Certificado / matrícula / curso"],
    ["work_reference_optional", "Referencia laboral"]
  ];

  const uploadFormHtml = state.session.providerId
    ? `
      <form class="provider-verification-form provider-onboarding-upload" id="providerVerificationForm">
        <div class="provider-form-grid">
          <label class="input-group">
            <span>Tipo de documento</span>
            <select name="providerDocumentType" required>
              ${documentOptions
                .map(
                  ([value, label]) =>
                    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="input-group">
            <span>Archivo</span>
            <input
              name="providerDocumentFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
            >
          </label>
        </div>
        <div class="provider-action-strip">
          <button class="btn-primary" type="submit">Subir documento</button>
        </div>
        <p class="muted">
          Formatos permitidos: JPG, PNG, WEBP o PDF. Máximo 8 MB. Se guarda en
          <strong>svc_provider_documents</strong> usando el bucket de Servicios.
        </p>
      </form>
    `
    : `
      <div class="summary-card">
        <strong>Ingresá con Google</strong>
        <span class="muted">Necesitás una sesión de prestador para subir documentos.</span>
      </div>
    `;

  const documentsHtml = documents.length
    ? `
      <div class="provider-doc-grid">
        ${documents
          .map((item) => {
            const status = String(item.review_status ?? "PENDING").toUpperCase();
            const statusLabel = reviewStatusLabels[status] ?? status;
            const fileUrl = item.file_url ?? null;

            return `
              <article class="provider-doc-card provider-doc-card--${escapeHtml(status.toLowerCase())}">
                <strong>${escapeHtml(item.document_type ?? "Documento")}</strong>
                <div class="chip-row">
                  <span class="inline-chip">${escapeHtml(statusLabel)}</span>
                  <span class="inline-chip">Actualizado ${escapeHtml(formatDate(item.updated_at ?? item.created_at))}</span>
                </div>
                ${
                  item.review_notes
                    ? `<p class="muted">${escapeHtml(item.review_notes)}</p>`
                    : `<p class="muted">Sin observaciones cargadas.</p>`
                }
                ${
                  fileUrl
                    ? `<a class="provider-doc-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Ver archivo</a>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `
    : `
      <div class="summary-card">
        <strong>Sin documentos cargados</strong>
        <span class="muted">Subí tus documentos para habilitar la revisión del equipo MIMI.</span>
      </div>
    `;

  const reviewsHtml = reviews.length
    ? `
      <div class="provider-review-grid">
        ${reviews
          .map(
            (item) => `
              <article class="provider-review-card">
                <strong>${escapeHtml(Number(item.rating ?? 5).toFixed(1))} / 5</strong>
                <p class="muted">${escapeHtml(item.comment || "Sin comentario")}</p>
                <span class="muted">${escapeHtml(formatDate(item.created_at))}</span>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : `
      <div class="summary-card">
        <strong>Sin reseñas recientes</strong>
        <span class="muted">A medida que completes servicios, las últimas reseñas van a quedar visibles acá.</span>
      </div>
    `;

  container.innerHTML = `
    <section class="provider-stack provider-onboarding-shell">
      <article class="provider-verification-card ${isApproved ? "is-approved" : "is-pending"}">
        <div class="provider-verification-head">
          <div>
            <span class="eyebrow">Verificación prestador</span>
            <h3>${escapeHtml(verificationTitle)}</h3>
            <p class="muted">${escapeHtml(verificationText)}</p>
          </div>
          <span class="provider-verification-badge">
            ${isApproved ? "✅ Aprobado" : isBlocked ? "⛔ Bloqueado" : "⏳ Pendiente"}
          </span>
        </div>

        <div class="provider-kpi-grid">
          <article class="provider-kpi-card">
            <span>Aprobados</span>
            <strong>${escapeHtml(String(documentsSummary.approved ?? 0))}</strong>
            <small>documentos</small>
          </article>
          <article class="provider-kpi-card">
            <span>Pendientes</span>
            <strong>${escapeHtml(String(documentsSummary.pending ?? 0))}</strong>
            <small>en revisión</small>
          </article>
          <article class="provider-kpi-card">
            <span>Observados</span>
            <strong>${escapeHtml(String(documentsSummary.observed ?? 0))}</strong>
            <small>para corregir</small>
          </article>
          <article class="provider-kpi-card">
            <span>Promedio</span>
            <strong>${Number(reviewSummary.average ?? 5).toFixed(1)}</strong>
            <small>${escapeHtml(String(reviewSummary.count ?? 0))} reseñas</small>
          </article>
        </div>

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
