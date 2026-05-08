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
  QUOTE: "A coordinar con el cliente",
  FIXED: "Precio cerrado por trabajo",
  HOURLY: "Por hora",
  BASE_VISIT: "Por visita",
  UNIT: "Por sesion / unidad",
  SQUARE_METER: "Por m2 / unidad",
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

const argentinaZones = {
  "Buenos Aires": ["La Plata", "Mar del Plata", "Bahia Blanca", "Tandil", "San Isidro", "Quilmes", "Moron", "Lomas de Zamora", "Avellaneda", "Lanus", "San Justo", "Merlo", "Moreno", "Pilar", "Tigre", "San Fernando", "Vicente Lopez", "Tres de Febrero", "San Martin", "Pergamino", "Junin", "Olavarria", "Necochea", "Azul", "Chivilcoy", "Campana", "Zarate", "Escobar", "Ezeiza", "Berazategui", "Florencio Varela", "Almirante Brown", "Esteban Echeverria"],
  "Catamarca": ["San Fernando del Valle de Catamarca", "Valle Viejo", "Fray Mamerto Esquiu", "Andalgala", "Belen", "Tinogasta", "Santa Maria"],
  "Chaco": ["Resistencia", "Barranqueras", "Fontana", "Presidencia Roque Saenz Pena", "Villa Angela", "Charata", "General San Martin"],
  "Chubut": ["Rawson", "Trelew", "Puerto Madryn", "Comodoro Rivadavia", "Esquel", "Sarmiento", "Gaiman"],
  "CABA": ["Ciudad Autonoma de Buenos Aires"],
  "Cordoba": ["Cordoba Capital", "Villa Carlos Paz", "Rio Cuarto", "Villa Maria", "Alta Gracia", "Carlos Paz", "San Francisco", "Rio Tercero", "Jesus Maria", "La Calera", "Bell Ville", "Marcos Juarez"],
  "Corrientes": ["Corrientes Capital", "Goya", "Paso de los Libres", "Curuzu Cuatia", "Mercedes", "Santo Tome", "Bella Vista"],
  "Entre Rios": ["Parana", "Concordia", "Gualeguaychu", "Concepcion del Uruguay", "Villaguay", "Victoria", "La Paz", "Colon"],
  "Formosa": ["Formosa Capital", "Clorinda", "Pirané", "El Colorado", "Las Lomitas", "Ingeniero Juarez"],
  "Jujuy": ["San Salvador de Jujuy", "Palpala", "Perico", "San Pedro de Jujuy", "Libertador General San Martin", "Tilcara", "Humahuaca"],
  "La Pampa": ["Santa Rosa", "General Pico", "Toay", "General Acha", "Realico", "Eduardo Castex"],
  "La Rioja": ["La Rioja Capital", "Chilecito", "Aimogasta", "Chamical", "Chepes", "Villa Union"],
  "Mendoza": ["Mendoza Capital", "Godoy Cruz", "Guaymallen", "San Rafael", "Maipu", "Las Heras", "Lujan de Cuyo", "Tunuyan", "San Martin", "Rivadavia", "Malargue"],
  "Misiones": ["Posadas", "Obera", "Eldorado", "Puerto Iguazu", "Apostoles", "Leandro N. Alem", "San Vicente"],
  "Neuquen": ["Neuquen Capital", "Plottier", "San Martin de los Andes", "Cutral Co", "Zapala", "Centenario", "Villa La Angostura", "Chos Malal"],
  "Rio Negro": ["Bariloche", "General Roca", "Viedma", "Cipolletti", "Villa Regina", "Allen", "Cinco Saltos"],
  "Salta": ["Salta Capital", "Oran", "Tartagal", "General Guemes", "Metan", "Cafayate", "Rosario de la Frontera"],
  "San Juan": ["San Juan Capital", "Rawson", "Rivadavia", "Chimbas", "Santa Lucia", "Pocito", "Caucete"],
  "San Luis": ["San Luis Capital", "Villa Mercedes", "Merlo", "La Punta", "Juana Koslay", "Justo Daract"],
  "Santa Cruz": ["Rio Gallegos", "Caleta Olivia", "Pico Truncado", "Puerto Deseado", "El Calafate", "Las Heras"],
  "Santa Fe": ["Rosario", "Santa Fe Capital", "Rafaela", "Venado Tuerto", "Santo Tome", "Reconquista", "Villa Gobernador Galvez", "Esperanza", "Casilda", "Cañada de Gomez"],
  "Santiago del Estero": ["Santiago del Estero Capital", "La Banda", "Termas de Rio Hondo", "Fernandez", "Añatuya", "Frías"],
  "Tierra del Fuego": ["Ushuaia", "Rio Grande", "Tolhuin"],
  "Tucuman": ["San Miguel de Tucuman", "Yerba Buena", "Tafi Viejo", "Banda del Rio Sali", "Concepcion", "Aguilares", "Famailla"]
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
  if (["LIMPIEZA", "LIMPIEZA_OFICINAS", "SERVICIO_DOMESTICO", "PLOMERIA", "ELECTRICIDAD", "GASISTA", "PINTURA", "CARPINTERIA", "ALBANILERIA", "REPARACIONES_HOGAR", "COLOCACION_CERAMICOS", "JARDINERIA", "CERRAJERIA", "HERRERIA"].includes(code)) {
    return "home";
  }
  if (["CUIDADO_ADULTOS", "CUIDADO_NINOS", "ACOMPANAMIENTO_DOMICILIARIO", "MASAJISTA", "MASCOTAS"].includes(code)) {
    return "care";
  }
  if (["BELLEZA", "MANICURIA", "PELUQUERIA", "PESTANAS", "MAQUILLAJE"].includes(code)) {
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
  const safeCategory = category ?? {};
  const model = String(safeCategory.default_pricing_model || "HOURLY").toUpperCase();
  const modes = Array.isArray(safeCategory.allowed_service_modes) && safeCategory.allowed_service_modes.length
    ? safeCategory.allowed_service_modes
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

function providerProfileQuality({ offerings = [], detail = null, categories = [] } = {}) {
  let score = 0;
  const tips = [];

  if (offerings.length) score += 35;
  else tips.push("Publica al menos un servicio concreto.");

  if (categories.length) score += 15;
  else tips.push("Elegi el rubro donde queres aparecer.");

  if (detail?.public_headline || detail?.bio) score += 15;
  else tips.push("Agrega un titulo o bio corta.");

  if (detail?.city || detail?.province || detail?.address_text) score += 15;
  else tips.push("Indica zona de trabajo o ciudad base.");

  if (offerings.some((item) => item.public_summary || item.description)) score += 10;
  else tips.push("Conta brevemente que incluye tu servicio.");

  if (offerings.some((item) => item.price_per_hour || item.unit_price || item.fixed_price || item.base_visit_fee || item.quote_required)) score += 10;
  else tips.push("Agrega precio de referencia o marca que requiere presupuesto.");

  const label = score >= 80 ? "Perfil bien cargado" : score >= 45 ? "Perfil basico" : "Perfil incompleto";

  return { score, label, tips: tips.slice(0, 3) };
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

function renderServiceModeOptionsForCategory(category = null, selected = "IN_PERSON") {
  const allowed = Array.isArray(category?.allowed_service_modes) && category.allowed_service_modes.length
    ? category.allowed_service_modes.map((item) => String(item).toUpperCase())
    : ["IN_PERSON"];
  const current = allowed.includes(String(selected || "").toUpperCase())
    ? String(selected || "").toUpperCase()
    : allowed[0] || "IN_PERSON";

  return allowed
    .filter((value) => serviceModeLabels[value])
    .map((value) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(serviceModeLabels[value])}</option>`)
    .join("");
}

function renderLocationPolicyOptionsForMode(serviceMode = "IN_PERSON", selected = "CLIENT_ADDRESS") {
  const mode = String(serviceMode || "IN_PERSON").toUpperCase();
  const allowed = mode === "ONLINE"
    ? ["ONLINE_ONLY"]
    : mode === "HYBRID"
      ? ["FLEXIBLE", "CLIENT_ADDRESS", "PROVIDER_ADDRESS", "ONLINE_ONLY"]
      : ["CLIENT_ADDRESS", "PROVIDER_ADDRESS", "FLEXIBLE"];
  const current = allowed.includes(String(selected || "").toUpperCase())
    ? String(selected || "").toUpperCase()
    : allowed[0];

  return allowed
    .map((value) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(locationPolicyLabels[value])}</option>`)
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
        <span>Nombre del servicio</span>
        <input name="offering:${index}:title" type="text" maxlength="90" value="${escapeHtml(offering?.title ?? "")}" placeholder="Ej: pintura interior, cuidado de adultos, manicuria">
      </label>

      <label class="input-group provider-field-wide">
        <span>Rubro seleccionado</span>
        <select name="offering:${index}:categoryId">
          <option value="">Elegilo desde las sugerencias</option>
          ${Object.entries(groupedCategories).map(([group, items]) => `
            <optgroup label="${escapeHtml(categoryGroupLabels[group] ?? group)}">
              ${items.map((category) => `
                <option value="${escapeHtml(category.id)}" ${String(currentCategoryId) === String(category.id) ? "selected" : ""}>${escapeHtml(category.name)}</option>
              `).join("")}
            </optgroup>
          `).join("")}
        </select>
        <small>${escapeHtml(requirement || "El rubro viene de las opciones que elegiste. Si falta uno, volve al primer paso y agregalo.")}</small>
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
          <span>Descripcion del servicio</span>
          <textarea name="offering:${index}:description" maxlength="220" rows="2" placeholder="Conta el alcance, que incluye, que no incluye y que necesita saber el cliente">${escapeHtml(offering?.description ?? "")}</textarea>
      </label>

      <label class="input-group provider-field-wide">
        <span>Resumen para mostrar al cliente</span>
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
  const quality = providerProfileQuality({
    offerings,
    detail,
    categories: state.provider.categories ?? []
  });
  const categories = sortedCategories(
    Array.isArray(state.appConfig?.categories) && state.appConfig.categories.length
      ? state.appConfig.categories
      : appConfig.categories
  );
  const pricingByCategory = new Map(pricing.map((item) => [item.category_id, item]));
  const selectedCategoryIds = new Set([
    ...activeCategoryIds,
    ...offerings.map((item) => item?.category_id).filter(Boolean)
  ]);
  const selectedCategories = categories.filter((category) => selectedCategoryIds.has(category.id));
  const offeringCategories = selectedCategories.length ? selectedCategories : categories;
  const selectedCategoryLabel = selectedCategories.length
    ? selectedCategories.map((category) => category.name).join(", ")
    : "Primero elegi rubros sugeridos";
  const hasSelectedRubros = selectedCategoryIds.size > 0;
  const provinceOptions = Object.keys(argentinaZones);
  const selectedProvince = String(detail?.province ?? "");
  const selectedCity = String(detail?.city ?? "");
  const cityOptions = selectedProvince && argentinaZones[selectedProvince]
    ? argentinaZones[selectedProvince]
    : [];
  const citySelectOptions = [...cityOptions];
  if (selectedCity && !citySelectOptions.includes(selectedCity)) citySelectOptions.unshift(selectedCity);
  const primaryOffering = offerings.find((item) => item?.active !== false) ?? offerings[0] ?? null;
  const primaryPrice =
    primaryOffering?.quote_required || primaryOffering?.pricing_model === "QUOTE"
      ? "A presupuestar"
      : primaryOffering?.pricing_model === "UNIT"
        ? `${currency(primaryOffering?.unit_price, primaryOffering?.currency)} / ${primaryOffering?.unit_name || "sesion"}`
        : currency(
            primaryOffering?.fixed_price ||
              primaryOffering?.base_visit_fee ||
              primaryOffering?.price_per_hour ||
              pricing[0]?.price_per_hour,
            primaryOffering?.currency || pricing[0]?.currency
          );

  const firstOffering = primaryOffering ?? null;
  const defaultCategory = selectedCategories[0] ?? categories[0] ?? null;
  const defaults = recommendedDefaultsForCategory(defaultCategory);
  const pricingModel = firstOffering?.pricing_model ?? defaults.pricingModel;
  const serviceMode = firstOffering?.service_mode ?? defaults.serviceMode;
  const locationPolicy = firstOffering?.location_policy ?? defaults.locationPolicy;
  const providerAvatarUrl = String(state.provider.profile?.avatar_url || "").trim();
  const canPreviewProviderAvatar = /^https?:\/\//i.test(providerAvatarUrl) || /^data:image\//i.test(providerAvatarUrl);

  container.innerHTML = `
    <section class="provider-stack provider-publisher-app provider-publisher-app-v3">
      <form class="provider-settings-form provider-publisher-shell provider-simple-builder" id="providerBusinessForm">
        <section class="provider-simple-hero">
          <div>
            <span class="eyebrow">Servicios</span>
            <h3>${escapeHtml(firstOffering?.title ?? "Crea tu servicio")}</h3>
            <p>Deci que haces, elegi el rubro sugerido y completa solo lo necesario para publicar.</p>
          </div>
          <div class="provider-simple-status ${offerings.length ? "is-ready" : ""}">
            <span>${offerings.length ? "Publicado" : "Pendiente"}</span>
            <strong>${escapeHtml(firstOffering ? primaryPrice : "Falta configurar")}</strong>
          </div>
        </section>

        <section class="provider-simple-card provider-photo-card">
          <div class="provider-photo-preview">
            ${canPreviewProviderAvatar
              ? `<img src="${escapeHtml(providerAvatarUrl)}" alt="Foto de perfil" loading="lazy">`
              : `<span>${escapeHtml(initialsFromName(state.provider.profile?.full_name || state.session.userName || "MIMI"))}</span>`}
          </div>
          <div>
            <strong>Foto de perfil</strong>
            <p>Opcional. Se muestra al cliente cuando solicita tu servicio.</p>
            <label class="provider-file-pill">
              <input name="providerAvatarFile" type="file" accept="image/jpeg,image/png,image/webp">
              Elegir foto
            </label>
          </div>
        </section>

        <section class="provider-simple-card provider-ai-card" data-provider-setup-step="1">
          <div class="provider-simple-card-heading">
            <span>1</span>
            <div>
              <strong>Que servicio prestas</strong>
              <small>Escribilo con tus palabras. MIMI lo ordena en rubros para que confirmes.</small>
            </div>
          </div>
          <div class="provider-ai-input-shell provider-search-box">
            <textarea name="providerAiPrompt" rows="3" maxlength="500" placeholder="Ej: soy abogado penalista, hago manicura, pinto casas">${escapeHtml(firstOffering?.description ?? "")}</textarea>
            <button class="provider-icon-action provider-mic-inside" data-provider-business-action="start-provider-dictation" type="button" aria-label="Dictar por voz" title="Dictar por voz">🎙</button>
            <button class="btn-primary provider-suggest-button" data-provider-business-action="suggest-provider-service" type="button">Buscar rubros</button>
          </div>
          <div class="provider-voice-status" id="providerVoiceStatus" hidden></div>
          <p class="provider-search-helper">Busca rubros para poder publicar. Las opciones aparecen en el panel de abajo.</p>
        </section>

        <section class="provider-ai-results-panel ${hasSelectedRubros ? "is-visible" : ""}" id="providerAiSuggestionsPanel" ${hasSelectedRubros ? "" : "hidden"} aria-live="polite">
          <div class="provider-results-title">
            <div>
              <strong>Rubros sugeridos</strong>
              <span>Elegi una o varias opciones que representen tu servicio.</span>
            </div>
          </div>
          <div class="provider-ai-empty" id="providerAiEmpty" ${hasSelectedRubros ? "hidden" : ""}>Busca un rubro para ver sugerencias reales de MIMI.</div>
          <div class="provider-ai-results-scroll">
          <div class="provider-ai-suggestions" id="providerAiSuggestions" ${hasSelectedRubros ? "" : "hidden"}>
            ${selectedCategories.length ? `
              <div class="provider-suggestions-heading">
                <strong>Rubros elegidos</strong>
                <span>Podés cambiar la selección antes de guardar.</span>
              </div>
            ` : ""}
            ${selectedCategories.map((category) => `
              <button class="provider-suggestion-card is-selected" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${escapeHtml(category.id)}" data-category-code="${escapeHtml(category.code)}" aria-pressed="true">
                <strong>${escapeHtml(category.name)}</strong>
                <span>${escapeHtml(category.description ?? "Rubro seleccionado")}</span>
              </button>
            `).join("")}
          </div>
          </div>
        </section>

        <section class="provider-simple-card provider-service-details" id="providerServiceDetails">
          <div class="provider-simple-card-heading">
            <span>2</span>
            <div>
              <strong>Datos del servicio</strong>
              <small>Esto es lo que el cliente ve antes de pedirte un servicio.</small>
            </div>
          </div>

          <input type="hidden" name="offering:0:present" value="1">
          <input type="hidden" name="offering:0:id" value="${escapeHtml(firstOffering?.id ?? "")}">
          <input type="checkbox" name="offering:0:active" checked hidden>

          <div class="provider-hidden-category-inputs" aria-hidden="true">
            ${categories.map((category) => `
              <input type="checkbox" name="categoryActive:${escapeHtml(category.id)}" ${selectedCategoryIds.has(category.id) || pricingByCategory.has(category.id) ? "checked" : ""} tabindex="-1">
            `).join("")}
          </div>

          <div class="provider-selected-summary" id="providerSelectedRubrosSummary">
            ${selectedCategories.length
              ? `Rubro seleccionado: ${escapeHtml(selectedCategories.map((category) => category.name).join(", "))}`
              : "Primero elegi un rubro sugerido para completar el servicio."}
          </div>

          <select name="offering:0:categoryId" hidden aria-hidden="true" tabindex="-1">
              <option value="">Primero elegi una card sugerida</option>
              ${categories.map((category) => `
                <option value="${escapeHtml(category.id)}" data-pricing-model="${escapeHtml(category.default_pricing_model ?? "HOURLY")}" data-service-modes="${escapeHtml((category.allowed_service_modes ?? ["IN_PERSON"]).join(","))}" ${(firstOffering?.category_id ?? selectedCategories[0]?.id ?? "") === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>
              `).join("")}
          </select>

          <label class="input-group provider-field-wide">
            <span>Nombre visible para clientes</span>
            <input name="offering:0:title" type="text" maxlength="90" value="${escapeHtml(firstOffering?.title ?? "")}" placeholder="Ej: asesoramiento penal, manicura, pintura interior">
          </label>

          <label class="input-group provider-field-wide">
            <span>Descripcion clara</span>
            <textarea name="offering:0:description" maxlength="220" rows="3" placeholder="Conta que incluye, como coordinas y que necesita saber el cliente">${escapeHtml(firstOffering?.description ?? "")}</textarea>
          </label>

          <label class="input-group provider-field-wide">
            <span>Como se vera en la card del cliente</span>
            <input name="offering:0:publicSummary" type="text" maxlength="140" value="${escapeHtml(firstOffering?.public_summary ?? "")}" placeholder="Ej: consultas online y presenciales a coordinar">
          </label>

          <div class="provider-form-grid provider-compact-grid">
            <label class="input-group">
              <span>Como cobras</span>
              <select name="offering:0:pricingModel">${renderPricingModelOptions(pricingModel)}</select>
            </label>
            <label class="input-group">
              <span>Modalidad</span>
              <select name="offering:0:serviceMode">${renderServiceModeOptionsForCategory(defaultCategory, serviceMode)}</select>
            </label>
            <label class="input-group">
              <span>Atencion</span>
              <select name="offering:0:locationPolicy">${renderLocationPolicyOptionsForMode(serviceMode, locationPolicy)}</select>
            </label>
            <label class="input-group">
              <span>Precio aproximado</span>
              <input name="offering:0:unitPrice" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.unit_price ?? ""))}" placeholder="Ej: 15000">
            </label>
            <label class="input-group">
              <span>Unidad de referencia</span>
              <input name="offering:0:unitName" type="text" maxlength="40" value="${escapeHtml(firstOffering?.unit_name ?? defaults.unitName)}" placeholder="sesion, consulta, trabajo">
            </label>
            <label class="input-group">
              <span>$/hora si aplica</span>
              <input name="offering:0:pricePerHour" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.price_per_hour ?? ""))}" placeholder="Opcional">
            </label>
            <label class="input-group">
              <span>Precio cerrado</span>
              <input name="offering:0:fixedPrice" type="number" min="0" step="100" value="${escapeHtml(String(firstOffering?.fixed_price ?? ""))}" placeholder="Opcional">
            </label>
            <label class="input-group">
              <span>Duracion estimada</span>
              <input name="offering:0:durationMinutes" type="number" min="15" max="240" step="5" value="${escapeHtml(String(firstOffering?.duration_minutes ?? defaults.durationMinutes))}" placeholder="45">
            </label>
          </div>

          <input name="offering:0:baseVisitFee" type="hidden" value="${escapeHtml(String(firstOffering?.base_visit_fee ?? ""))}">
          <input name="offering:0:minimumCharge" type="hidden" value="${escapeHtml(String(firstOffering?.minimum_charge ?? 0))}">
          <input name="offering:0:minimumHours" type="hidden" value="${escapeHtml(String(firstOffering?.minimum_hours ?? ""))}">
          <input name="offering:0:maximumHours" type="hidden" value="${escapeHtml(String(firstOffering?.maximum_hours ?? detail?.max_hours_per_service ?? 8))}">
          <label class="provider-check-item">
            <input name="offering:0:quoteRequired" type="checkbox" ${firstOffering?.quote_required ? "checked" : ""}>
            <span>Prefiero presupuestar antes de confirmar (opcional)</span>
          </label>
          <input name="offering:0:clientInstructions" type="hidden" value="${escapeHtml(firstOffering?.client_instructions ?? "")}">
        </section>

        <section class="provider-simple-card">
          <div class="provider-simple-card-heading">
            <span>3</span>
            <div>
              <strong>Tu ubicacion y zona de trabajo</strong>
              <small>No cargues horarios: estas disponible cuando te conectas.</small>
            </div>
          </div>
          <div class="provider-form-grid provider-compact-grid">
            <label class="input-group">
              <span>Provincia</span>
              <select name="providerProvince">
                <option value="">Elegi provincia</option>
                ${provinceOptions.map((province) => `<option value="${escapeHtml(province)}" data-cities="${escapeHtml((argentinaZones[province] ?? []).join("|"))}" ${selectedProvince === province ? "selected" : ""}>${escapeHtml(province)}</option>`).join("")}
              </select>
            </label>
            <label class="input-group">
              <span>Ciudad</span>
              <select name="providerCity" data-provider-city-select>
                <option value="">Primero elegi provincia</option>
                ${citySelectOptions.map((city) => `<option value="${escapeHtml(city)}" ${selectedCity === city ? "selected" : ""}>${escapeHtml(city)}</option>`).join("")}
                <option value="Otra localidad" ${selectedCity === "Otra localidad" ? "selected" : ""}>Otra localidad</option>
              </select>
            </label>
            <label class="input-group provider-field-wide">
              <span>Direccion/base aproximada</span>
              <input name="providerAddressText" type="text" maxlength="140" value="${escapeHtml(detail?.address_text ?? "")}" placeholder="Ej: barrio Centro, Nueva Cordoba o zona de referencia">
            </label>
            <label class="input-group provider-field-wide" id="providerCoverageRadiusField">
              <span>Radio de cobertura</span>
              <select name="providerCoverageRadius">
                ${[
                  ["100", "100 m"],
                  ["500", "500 m"],
                  ["1000", "1 km"],
                  ["3000", "3 km"],
                  ["5000", "5 km"],
                  ["10000", "10 km"],
                  ["15000", "15 km"],
                  ["20000", "20 km"],
                  ["25000", "25 km"]
                ].map(([value, label]) => `<option value="${value}" ${String(detail?.metadata?.coverage_radius_meters ?? "10000") === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
              <small>Para servicios online, podes atender en todo el pais.</small>
            </label>
            <label class="input-group provider-field-wide">
              <span>Nombre de pila <small style="color:#dc2626;font-weight:600">*</small></span>
              <input name="providerFirstName" type="text" maxlength="40" required value="${escapeHtml(detail?.first_name ?? "")}" placeholder="Ej: Juan, María, Paulo">
            </label>
            <div class="input-group provider-field-wide provider-avatar-uploader">
              <span>Foto de perfil <small>(visible cuando el cliente te selecciona)</small></span>
              <div class="provider-avatar-row">
                <div class="provider-avatar-preview" id="providerAvatarPreview" style="${detail?.avatar_public_url ? `background-image:url('${escapeHtml(detail.avatar_public_url)}')` : ""}">
                  ${detail?.avatar_public_url ? "" : `<span>${escapeHtml((detail?.first_name ?? "P").slice(0,1).toUpperCase())}</span>`}
                </div>
                <div class="provider-avatar-actions">
                  <input type="file" id="providerAvatarInput" accept="image/jpeg,image/png,image/webp" hidden>
                  <button class="btn-secondary" type="button" data-provider-business-action="open-avatar-picker">${detail?.avatar_public_url ? "Cambiar foto" : "Subir foto"}</button>
                  ${detail?.avatar_public_url ? `<button class="btn-link" type="button" data-provider-business-action="remove-avatar">Quitar</button>` : ""}
                </div>
              </div>
              <input type="hidden" name="providerAvatarPublicUrl" value="${escapeHtml(detail?.avatar_public_url ?? "")}">
              <small id="providerAvatarStatus" class="provider-avatar-status"></small>
            </div>
            <label class="input-group provider-field-wide">
              <span>Bio corta</span>
              <input name="providerBio" type="text" maxlength="180" value="${escapeHtml(detail?.bio ?? "")}" placeholder="Ej: abogado penalista, consultas online y presenciales">
            </label>
            <label class="input-group provider-field-wide">
              <span>Titulo, matricula o aclaracion profesional</span>
              <input name="providerPublicHeadline" type="text" maxlength="120" value="${escapeHtml(detail?.public_headline ?? "")}" placeholder="Opcional. Usalo solo si aplica.">
            </label>
            <label class="input-group provider-field-wide">
              <span>Video, sitio o sala online</span>
              <input name="providerVideoIntroUrl" type="url" maxlength="240" value="${escapeHtml(detail?.video_intro_url ?? "")}" placeholder="Opcional">
            </label>
          </div>
          <label class="input-group provider-field-wide">
            <span>Presentacion profesional</span>
            <textarea name="providerProfessionalSummary" maxlength="600" rows="3" placeholder="Explica tu alcance, experiencia y forma de coordinar sin prometer resultados">${escapeHtml(detail?.professional_summary ?? "")}</textarea>
          </label>
          <div class="provider-ai-description-tools">
            <button class="btn-secondary" data-provider-business-action="improve-provider-description" type="button">Mejorar descripcion con MIMI</button>
            <div class="provider-description-suggestion" id="providerDescriptionSuggestion" hidden></div>
          </div>
          <input name="maxHoursPerService" type="hidden" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
        </section>

        <section class="provider-simple-footer">
          <div class="provider-profile-quality provider-insight-card">
            <div>
              <span class="eyebrow">Estado privado</span>
              <h3>${escapeHtml(quality.label)}</h3>
              <p class="muted">Esto solo lo ves vos. No es ranking ni garantia publica.</p>
            </div>
            <strong>${quality.score}%</strong>
          </div>
          <label class="provider-check-item provider-terms-box">
            <input name="providerTermsAccepted" type="checkbox" required>
            <span>Acepto los <a href="../terminos.html" target="_blank" rel="noopener">Terminos para prestadores</a>. Entiendo que MIMI es una plataforma tecnologica intermediaria.</span>
          </label>
          <button class="btn-primary provider-save-button" type="submit">Guardar y publicar servicio</button>
        </section>
      </form>

      ${renderOfferingsSummary(offerings)}
    </section>
  `;
  return;

  container.innerHTML = `
    <section class="provider-stack provider-publisher-app">
      <form class="provider-settings-form provider-publisher-shell" id="providerBusinessForm">
        <section class="provider-business-hero">
          <div>
            <span class="eyebrow">Configurador guiado</span>
            <h3>Arma tu perfil de prestador</h3>
            <p class="muted">Escribi que sabes hacer. MIMI te ayuda a ordenarlo en rubros, descripcion, precio y zona sin prometer certificaciones ni garantias.</p>
          </div>
          <div class="provider-publish-summary">
            <span>${offerings.length ? "Publicado" : "Sin publicar"}</span>
            <strong>${escapeHtml(primaryOffering?.title ?? "Crea tu primer servicio")}</strong>
            <small>${escapeHtml(primaryOffering ? primaryPrice : "El cliente necesita saber que ofreces antes de verte online.")}</small>
          </div>
        </section>

        <div class="provider-setup-progress" aria-label="Progreso de configuracion">
          ${["Servicio", "Rubro", "Descripcion", "Zona", "Fotos", "Revision", "Terminos"].map((label, index) => `
            <button class="${index === 0 ? "is-active" : ""} ${index < 2 || offerings.length ? "is-done" : ""}" type="button" data-provider-business-action="provider-setup-go" data-provider-setup-target="${index + 1}">${index + 1}. ${escapeHtml(label)}</button>
          `).join("")}
        </div>

        <section class="provider-ai-card provider-step-card is-featured is-active" data-provider-setup-step="1">
          <div class="provider-step-heading">
            <span>1</span>
            <div>
              <small>Asistente MIMI</small>
              <h3>Contanos que ofrecés</h3>
            </div>
          </div>
          <p class="muted">Escribí o dictá qué trabajos hacés. MIMI lo ordena en rubros para que revises y confirmes.</p>
          <div class="provider-ai-input-shell">
            <textarea name="providerAiPrompt" rows="3" maxlength="500" placeholder="Ej: arreglo paredes, pinto, hago revoques, coloco ceramicos">${escapeHtml(offerings[0]?.description ?? "")}</textarea>
            <div class="provider-ai-controls">
              <button class="provider-icon-action" data-provider-business-action="start-provider-dictation" type="button" aria-label="Dictar por voz" title="Dictar por voz">🎙</button>
              <button class="btn-primary provider-suggest-button" data-provider-business-action="suggest-provider-service" type="button">Sugerir</button>
            </div>
          </div>
          <div class="provider-voice-status" id="providerVoiceStatus" hidden></div>
          <div class="provider-ai-empty" id="providerAiEmpty" ${hasSelectedRubros ? "hidden" : ""}>Primero escribí qué hacés. Después elegí una o varias opciones sugeridas.</div>
          <div class="provider-ai-suggestions" id="providerAiSuggestions" ${hasSelectedRubros ? "" : "hidden"}>
            ${selectedCategories.map((category) => `
              <button class="provider-suggestion-card is-selected" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${escapeHtml(category.id)}" data-category-code="${escapeHtml(category.code)}" aria-pressed="true">
                <strong>${escapeHtml(category.name)}</strong>
                <span>${escapeHtml(category.description ?? "Rubro seleccionado")}</span>
              </button>
            `).join("")}
          </div>
          <div class="provider-wizard-nav">
            <span id="providerSelectionHint">${escapeHtml(hasSelectedRubros ? selectedCategoryLabel : "Elegí al menos una sugerencia para seguir.")}</span>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button" ${hasSelectedRubros ? "" : "disabled"}>Siguiente</button>
          </div>
        </section>

        <div class="provider-help-note">
          <strong>No cargues horarios aca</strong>
          <span>Tu disponibilidad depende de estar conectado. Esta pantalla solo define que ofreces y como se entiende tu perfil.</span>
        </div>

        <section class="provider-step-card provider-profile-basics" data-provider-setup-step="2">
          <div class="provider-step-heading">
            <span>2</span>
            <div>
              <small>Perfil publico</small>
              <h3>Ahora armamos una presentación clara</h3>
            </div>
          </div>
          <div class="provider-form-grid">
          <label class="input-group">
            <span>Bio corta</span>
            <input name="providerBio" type="text" maxlength="180" value="${escapeHtml(detail?.bio ?? "")}" placeholder="Ej: trabajos de pintura, arreglos y mantenimiento del hogar">
          </label>
          <label class="input-group">
            <span>Presentación o título profesional</span>
            <input name="providerPublicHeadline" type="text" maxlength="120" value="${escapeHtml(detail?.public_headline ?? "")}" placeholder="Opcional. Usalo si aplica a tu oficio o profesión.">
            <small>Si tenés matrícula, título o habilitación relacionada, podés aclararlo sin prometer validación pública.</small>
          </label>
          <label class="input-group">
            <span>Video o sala online</span>
            <input name="providerVideoIntroUrl" type="url" maxlength="240" value="${escapeHtml(detail?.video_intro_url ?? "")}" placeholder="Link profesional, sitio o sala a coordinar">
          </label>
          <label class="input-group">
            <span>Ciudad o localidad principal</span>
            <input name="providerCity" type="text" maxlength="80" value="${escapeHtml(detail?.city ?? "")}" placeholder="Ej: Córdoba Capital" list="providerCityOptions">
          </label>
          <label class="input-group">
            <span>Provincia</span>
            <select name="providerProvince">
              <option value="">Elegí provincia</option>
              ${provinceOptions.map((province) => `<option value="${escapeHtml(province)}" ${String(detail?.province ?? "") === province ? "selected" : ""}>${escapeHtml(province)}</option>`).join("")}
            </select>
          </label>
          <label class="input-group">
            <span>Área donde podés trabajar</span>
            <input name="providerAddressText" type="text" maxlength="140" value="${escapeHtml(detail?.address_text ?? "")}" placeholder="Ej: Nueva Córdoba, Centro y zonas cercanas">
            <small>Esto ayuda a mostrar tu servicio donde corresponde. Después podés ajustar cobertura.</small>
          </label>
          <datalist id="providerCityOptions">
            ${cityOptions.map((item) => `<option value="${escapeHtml(item.city)}" label="${escapeHtml(item.province)}"></option>`).join("")}
          </datalist>
        </div>
        <label class="input-group provider-field-wide">
          <span>Resumen profesional</span>
          <textarea name="providerProfessionalSummary" maxlength="600" rows="3" placeholder="Conta tu especialidad, alcance, experiencia y como coordinas el servicio sin prometer resultados">${escapeHtml(detail?.professional_summary ?? "")}</textarea>
        </label>
        <div class="provider-ai-description-tools">
          <button class="btn-secondary" data-provider-business-action="improve-provider-description" type="button">Mejorar con MIMI</button>
          <div class="provider-description-suggestion" id="providerDescriptionSuggestion" hidden></div>
        </div>
        <input name="maxHoursPerService" type="hidden" value="${escapeHtml(String(detail?.max_hours_per_service ?? 8))}">
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card" data-provider-setup-step="3">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Etapa 3</span>
              <h3>Oficio o profesion sugerida</h3>
              <p class="muted">Podes elegir mas de una categoria si ofreces varios servicios.</p>
            </div>
          </div>
          <div class="provider-editor-grid provider-category-editor-grid">
            ${categories
              .map((category) => {
                const current = pricingByCategory.get(category.id);
                const filtered = selectedCategoryIds.size && !selectedCategoryIds.has(category.id);

                return `
                  <article class="provider-editor-card ${filtered ? "is-filtered-out" : ""}" data-category-editor-card data-category-id="${escapeHtml(category.id)}">
                    <label class="provider-check-item">
                      <input type="checkbox" name="categoryActive:${escapeHtml(category.id)}" ${selectedCategoryIds.has(category.id) || current ? "checked" : ""}>
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
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card" data-provider-setup-step="4">
          <div class="block-header compact">
            <div>
              <span class="eyebrow">Etapa 4</span>
              <h3>Que vendes y como lo cobras</h3>
              <p class="muted">MIMI solo facilita la conexion. Vos definis si cobras por hora, visita, trabajo, sesion, unidad o metro, y si atendes online, presencial o mixto.</p>
            </div>
          </div>
          <div class="provider-editor-grid">
            ${[...offerings, null]
              .map((offering, index) => renderOfferingEditorV2(offering, index, offeringCategories))
              .join("")}
          </div>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-optional-media" data-provider-setup-step="5">
          <span class="eyebrow">Etapa 5: fotos o ejemplos opcionales</span>
          <h3>Mostra tu trabajo si queres</h3>
          <p class="muted">Este paso es opcional. Podes cargar ejemplos mas adelante; no bloquea la configuracion del oficio.</p>
          <input type="file" name="providerExamples" accept="image/*" multiple>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-review-card" data-provider-setup-step="6">
          <span class="eyebrow">Etapa 6: revision final</span>
          <h3>Revisa antes de publicar</h3>
          <p class="muted">Confirma que el rubro, la descripcion, la zona y el precio representan lo que realmente ofreces. MIMI facilita la conexion entre partes; no contrata, no certifica y no garantiza servicios.</p>
          <div class="provider-profile-quality provider-insight-card">
            <div>
              <span class="eyebrow">Estado de tu perfil</span>
              <h3>${escapeHtml(quality.label)}</h3>
              <p class="muted">Esto solo lo ves vos. Sirve para saber si falta informacion para que tu perfil se entienda mejor.</p>
            </div>
            <strong>${quality.score}%</strong>
            ${quality.tips.length ? `<ul>${quality.tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul>` : ""}
          </div>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary" data-provider-business-action="provider-setup-next" type="button">Siguiente</button>
          </div>
        </section>

        <section class="provider-step-card provider-final-step" data-provider-setup-step="7">
          <span class="eyebrow">Etapa 7: terminos</span>
          <h3>Ultimo paso</h3>
          <label class="provider-check-item provider-terms-box">
            <input name="providerTermsAccepted" type="checkbox" required>
            <span>Acepto los <a href="../terminos.html" target="_blank" rel="noopener">Terminos y Condiciones para prestadores</a> y la Politica de Privacidad. Entiendo que MIMI es una plataforma tecnologica intermediaria.</span>
          </label>
          <div class="provider-wizard-nav">
            <button class="btn-secondary" data-provider-business-action="provider-setup-prev" type="button">Atras</button>
            <button class="btn-primary provider-save-button" type="submit">Guardar y publicar mi servicio</button>
          </div>
        </section>
      </form>

      ${renderOfferingsSummary(offerings)}
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
