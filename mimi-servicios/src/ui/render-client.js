import { appConfig } from "../config.js";

const stateLabels = {
  SEARCHING: "Buscando prestador",
  PENDING_PROVIDER_RESPONSE: "Esperando respuesta",
  CHECKOUT_CREATED: "Pago preparado",
  PAYMENT_PENDING: "Pago pendiente",
  PAYMENT_APPROVED: "Pago aprobado",
  PAYMENT_REJECTED: "Pago rechazado",
  ACCEPTED: "Prestador confirmado",
  SCHEDULED: "Servicio agendado",
  PROVIDER_EN_ROUTE: "Prestador en camino",
  PROVIDER_ARRIVED: "Prestador en puerta",
  IN_PROGRESS: "Servicio en curso",
  COMPLETED: "Servicio completado",
  CANCELLED: "Servicio cancelado",
  PENDING: "Solicitud creada"
};

const categoryIcons = {
  SERVICIO_DOMESTICO: "🏠",
  LIMPIEZA: "🧹",
  ELECTRICIDAD: "💡",
  PLOMERIA: "🔧",
  GASISTA: "🔥",
  INSTALACION_AIRE: "❄️",
  REFRIGERACION: "🧊",
  REPARACIONES: "🛠️",
  CUIDADO: "🤝",
  CUIDADO_ADULTOS: "🤝",
  CUIDADO_NINOS: "🧸",
  ENFERMERIA: "➕",
  JARDINERIA: "🌿",
  PINTURA: "🎨",
  CERRAJERIA: "🔑",
  CARPINTERIA: "🪚",
  ALBANILERIA: "🧱",
  TECNICO: "💻",
  TECNICO_PC: "💻",
  TECNOLOGIA: "📶",
  PELUQUERIA: "✂️",
  MANICURIA: "💅",
  MASAJISTA: "🙌",
  BELLEZA: "✨",
  MUDANZAS: "📦",
  MASCOTAS: "🐾"
};

const POPULAR_CATEGORY_CODES = [
  "PLOMERIA",
  "ELECTRICIDAD",
  "LIMPIEZA",
  "JARDINERIA",
  "PINTURA"
];

const CATEGORY_USAGE_KEY = "mimi_services_category_usage_v1";

const guideRules = [
  { code: "PLOMERIA", terms: ["cano", "caneria", "agua", "perdida", "fuga", "griferia", "bano", "inodoro"] },
  { code: "PINTURA", terms: ["pintar", "pintura", "pared", "humedad", "techo"] },
  { code: "JARDINERIA", terms: ["pasto", "jardin", "cortar", "poda", "cesped"] },
  { code: "ELECTRICIDAD", terms: ["luz", "electricidad", "enchufe", "cable", "termica"] },
  { code: "GASISTA", terms: ["gas", "calefon", "cocina", "estufa"] },
  { code: "INSTALACION_AIRE", terms: ["aire", "split", "acondicionado", "instalar aire"] },
  { code: "CUIDADO_ADULTOS", terms: ["anciano", "adulto mayor", "cuidador", "acompanante"] },
  { code: "CUIDADO_NINOS", terms: ["nino", "nina", "ninera", "chico"] },
  { code: "TECNICO_PC", terms: ["pc", "computadora", "notebook", "impresora"] },
  { code: "TECNOLOGIA", terms: ["wifi", "router", "camara", "smart tv", "internet"] },
  { code: "CERRAJERIA", terms: ["llave", "cerradura", "puerta"] },
  { code: "MUDANZAS", terms: ["mudanza", "mover", "flete", "cargar"] },
  { code: "MASCOTAS", terms: ["perro", "gato", "mascota", "pasear"] }
];

const providerColors = [
  "#1a56db",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#0891b2"
];

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
  const parts = String(name || "Prestador")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "PR";
}

function categoryIcon(category) {
  const code = String(category?.code || category?.name || "")
    .trim()
    .toUpperCase();

  return categoryIcons[code] || "🔎";
}

function normalizeSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryMatchesQuery(category, query) {
  if (!query) return true;

  const haystack = normalizeSearch([
    category.name,
    category.code,
    category.description,
    ...(Array.isArray(category.aliases) ? category.aliases : [])
  ].join(" "));

  return haystack.includes(query);
}

function getCategoryUsage() {
  try {
    return JSON.parse(localStorage.getItem(CATEGORY_USAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function categoryGuideScore(category, query) {
  if (!query) return 0;

  const haystack = normalizeSearch([
    category.name,
    category.code,
    category.description,
    ...(Array.isArray(category.aliases) ? category.aliases : [])
  ].join(" "));

  let score = haystack.includes(query) ? 12 : 0;
  const rule = guideRules.find((item) => item.code === category.code);

  if (rule?.terms?.some((term) => query.includes(normalizeSearch(term)))) {
    score += 30;
  }

  for (const word of query.split(" ")) {
    if (word.length > 3 && haystack.includes(word)) score += 4;
  }

  return score;
}

function rankCategories(categories, query = "") {
  const usage = getCategoryUsage();

  return [...categories].sort((a, b) => {
    if (query) {
      const scoreDiff = categoryGuideScore(b, query) - categoryGuideScore(a, query);
      if (scoreDiff) return scoreDiff;
    }

    const usageDiff = Number(usage[b.id] || 0) - Number(usage[a.id] || 0);
    if (usageDiff) return usageDiff;

    const aPopular = POPULAR_CATEGORY_CODES.includes(a.code)
      ? POPULAR_CATEGORY_CODES.indexOf(a.code)
      : 999;
    const bPopular = POPULAR_CATEGORY_CODES.includes(b.code)
      ? POPULAR_CATEGORY_CODES.indexOf(b.code)
      : 999;
    if (aPopular !== bPopular) return aPopular - bPopular;

    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

function findGuideCategory(categories, query) {
  if (!query || query.length < 3) return null;

  const scored = rankCategories(categories, query)
    .map((category) => ({
      category,
      score: categoryGuideScore(category, query)
    }))
    .filter((item) => item.score >= 12);

  return scored[0]?.category || null;
}
function normalizeProvider(provider, index = 0) {
  const providerPrice = Number(provider.provider_price ?? 0);
  const totalPrice = Number(provider.total_price ?? providerPrice);
  const distance = Number(provider.distance_km ?? 1 + index * 0.8);
  const score = Number(provider.score ?? Math.max(78, 98 - index * 4));
  const rating = Number(provider.rating ?? 5);

  return {
    ...provider,
    displayName: provider.full_name || provider.name || "Prestador disponible",
    initials: provider.initials || initialsFromName(provider.full_name || provider.name),
    color: provider.color || providerColors[index % providerColors.length],
    score,
    rating,
    ratingCount: Number(provider.rating_count ?? provider.completed_services_count ?? 0),
    distance,
    eta: Number(provider.estimated_eta_min ?? 8 + index * 4),
    price: totalPrice || providerPrice,
    providerPrice,
    available: provider.accepts_immediate !== false,
    specialty:
      provider.specialty ||
      provider.svc_categories?.name ||
      provider.category_name ||
      provider.pricing_mode ||
      "Prestador MIMI Go",
    jobs: Number(provider.completed_services_count ?? provider.rating_count ?? 0),
    x: [52, 38, 65, 47, 72, 30, 80, 22, 60][index % 9],
    y: [44, 56, 35, 62, 58, 42, 48, 30, 70][index % 9]
  };
}

function starRating(rating) {
  const full = Math.max(0, Math.min(5, Math.floor(Number(rating ?? 0))));
  const half = Number(rating ?? 0) % 1 >= 0.5 ? "+" : "";
  return `
    <span class="stars" aria-label="${escapeHtml(String(rating))} estrellas">
      ${"*".repeat(full)}${half}
      <span>${escapeHtml(Number(rating || 0).toFixed(1))}</span>
    </span>
  `;
}

function providerStatusBadge(provider) {
  return `
    <span class="availability-badge ${provider.available ? "is-online" : "is-busy"}">
      <i aria-hidden="true"></i>${provider.available ? "Disponible" : "Ocupado"}
    </span>
  `;
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
  const greetingName = document.getElementById("clientGreetingName");
  const userSessionCard = document.getElementById("userSessionCard");
  const userAvatarImage = document.getElementById("userAvatarImage");
  const userSessionName = document.getElementById("userSessionName");
  const userSessionEmail = document.getElementById("userSessionEmail");

  const isAuthenticated = Boolean(state.session.userId);
  const hasBackend = state.meta.backendMode === "supabase";
  const displayName =
    state.session.userName ||
    state.session.userEmail?.split("@")[0] ||
    "Paulo";

  if (sessionChip) {
    sessionChip.textContent = isAuthenticated
      ? "Sesion activa"
      : hasBackend
        ? "Cliente"
        : "Modo demo";
  }

  if (greetingName) {
    greetingName.textContent = displayName;
  }

  if (authPrimaryButton) {
    authPrimaryButton.hidden = isAuthenticated;
    authPrimaryButton.textContent = hasBackend ? "Ingresar" : "Demo";
  }

  if (userSessionCard) {
    userSessionCard.hidden = !isAuthenticated;
  }

  if (authSecondaryButton) {
    authSecondaryButton.hidden = !isAuthenticated;
  }

  if (userSessionName) {
    userSessionName.textContent = displayName;
  }

  if (userSessionEmail) {
    userSessionEmail.textContent = state.session.userEmail || "";
  }

  if (userAvatarImage) {
    const avatar = state.session.userAvatar;
    userAvatarImage.hidden = !avatar;
    userAvatarImage.src = avatar || "";
    userAvatarImage.alt = avatar ? `Foto de ${displayName}` : "";
  }

  if (userSessionCard) {
    userSessionCard.classList.toggle("has-avatar", Boolean(state.session.userAvatar));
  }

  if (authHint) {
    authHint.textContent = isAuthenticated
      ? "Sesion lista para buscar prestadores, cotizar y seguir servicios."
      : hasBackend
        ? "Ingresa para usar solicitudes reales."
        : "Demo local activa: podes probar busqueda, seleccion y seguimiento.";
  }
}

function renderEntryState(state) {
  const enterButton = document.getElementById("enterServicesHub");
  if (!enterButton) return;

  const appVisible =
    state.ui.appEntered ||
    Boolean(state.session.userId) ||
    state.meta.backendMode !== "supabase";

  enterButton.hidden = appVisible;
}

function renderClientOnboarding(state) {
  const hero = document.getElementById("clientHero");
  const flowGuide = document.getElementById("clientFlowGuide");
  const dismissButton = document.getElementById("dismissClientOnboarding");

  if (!hero || !flowGuide || !dismissButton) return;

  const showOnboarding = Boolean(state.ui.showClientOnboarding);
  hero.classList.toggle("is-compact", !showOnboarding);
  flowGuide.hidden = !showOnboarding;
  dismissButton.hidden = !showOnboarding;
}

function renderCategories(state) {
  const container = document.getElementById("categoryGrid");
  const searchInput = document.getElementById("categorySearchInput");
  if (!container) return;

  const categories = Array.isArray(appConfig.categories)
    ? appConfig.categories
    : [];
  const query = normalizeSearch(state.ui.categorySearchTerm ?? "");
  const rankedCategories = rankCategories(categories, query);
  const filtered = query
    ? rankedCategories.filter(
        (category) =>
          categoryMatchesQuery(category, query) ||
          categoryGuideScore(category, query) > 0
      )
    : rankedCategories;
  const maxVisible = query || state.ui.showAllCategories ? filtered.length : 5;
  const visibleCategories = filtered.slice(0, maxVisible);
  const guideCategory = findGuideCategory(categories, query);

  if (searchInput && searchInput.value !== (state.ui.categorySearchTerm ?? "")) {
    searchInput.value = state.ui.categorySearchTerm ?? "";
  }

  container.innerHTML = [
    guideCategory
      ? `
        <button
          class="category-guide-card"
          data-category-id="${escapeHtml(guideCategory.id)}"
          type="button"
          title="${escapeHtml(guideCategory.description ?? guideCategory.name)}"
        >
          <span class="guide-kicker">Guia MIMI</span>
          <strong>${escapeHtml(guideCategory.name)}</strong>
          <small>${escapeHtml(guideCategory.description ?? "Servicio sugerido segun tu consulta.")}</small>
        </button>
      `
      : "",
    visibleCategories.length
      ? visibleCategories
        .map(
          (category, index) => {
            const isPopular = !query && index < 5;
            return `
            <button
              class="category-chip ${category.id === state.ui.selectedCategoryId ? "is-selected" : ""} ${isPopular ? "is-popular" : ""}"
              data-category-id="${escapeHtml(category.id)}"
              type="button"
              title="${escapeHtml(category.description ?? category.name)}"
            >
              ${isPopular ? `<em class="category-popular-badge" aria-label="Popular">🔥</em>` : ""}
              <span aria-hidden="true">${categoryIcon(category)}</span>
              <strong>${escapeHtml(category.name)}</strong>
              <small>${escapeHtml(category.description ?? "")}</small>
            </button>
          `;
          }
        )
        .join("") +
      (!query && filtered.length > maxVisible
        ? `
          <button class="category-chip category-more-chip" data-category-toggle="search" type="button">
            <span aria-hidden="true">🔎</span>
            <strong>Buscar</strong>
            <small>Ver todos</small>
          </button>
        `
        : "")
      : `
      <div class="client-empty-state">
        <strong>Sin resultados</strong>
        <span>Proba con: se rompio un cano, quiero pintar, cortar pasto o necesito cuidar a alguien.</span>
      </div>
    `
  ].join("");
}

function renderRadarMap(providers, selectedId) {
  const container = document.getElementById("clientRadarMap");
  const count = document.getElementById("radarAvailableCount");
  if (!container) return;

  const visibleProviders = providers.slice(0, 9);
  const pins = visibleProviders
    .map((provider) => {
      const isSelected = selectedId === provider.provider_id;
      return `
        <button
          class="radar-pin ${isSelected ? "is-selected" : ""}"
          type="button"
          data-provider-focus="${escapeHtml(provider.provider_id)}"
          style="--x:${provider.x}%;--y:${provider.y}%;--pin:${provider.color};"
          aria-label="${escapeHtml(provider.displayName)}"
        >
          <span>${escapeHtml(provider.initials)}</span>
          ${provider.score >= 90 ? `<b>${escapeHtml(String(Math.round(provider.score)))}%</b>` : ""}
        </button>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="radar-grid" aria-hidden="true"></div>
    <div class="radar-road is-main" aria-hidden="true"></div>
    <div class="radar-road is-cross" aria-hidden="true"></div>
    <div class="radar-park is-one" aria-hidden="true"></div>
    <div class="radar-park is-two" aria-hidden="true"></div>
    <div class="radar-radius" aria-hidden="true"></div>
    <div class="radar-user" aria-label="Tu ubicacion"><span></span></div>
    ${pins}
    <div class="radar-pill"><i></i>${visibleProviders.filter((item) => item.available).length || 0} disponibles en 15 km</div>
  `;

  if (count) {
    count.textContent = String(visibleProviders.filter((item) => item.available).length || providers.length || 0);
  }
}

function renderProviderCard(provider, selectedId) {
  const selected = selectedId === provider.provider_id;
  return `
    <article class="provider-card ${selected ? "is-selected" : ""}" data-provider-focus="${escapeHtml(provider.provider_id)}">
      <header>
        <div class="provider-avatar" style="--avatar:${provider.color};">${escapeHtml(provider.initials)}</div>
        <span class="score-badge">${escapeHtml(String(Math.round(provider.score)))}%</span>
      </header>
      <strong>${escapeHtml(provider.displayName)}</strong>
      <small>${escapeHtml(provider.specialty)}</small>
      ${starRating(provider.rating)}
      <div class="provider-card-meta">
        <span><b>${escapeHtml(String(provider.eta))} min</b>${escapeHtml(provider.distance.toFixed(1))} km</span>
        <span><small>desde</small><b>${currency(provider.price, provider.currency)}</b></span>
      </div>
      ${providerStatusBadge(provider)}
      <button class="provider-card-action" type="button" data-provider-select="${escapeHtml(provider.provider_id)}">
        Solicitar
      </button>
    </article>
  `;
}

function renderProviderRow(provider, selectedId) {
  const selected = selectedId === provider.provider_id;
  return `
    <article class="provider-row ${selected ? "is-selected" : ""}" data-provider-focus="${escapeHtml(provider.provider_id)}">
      <div class="provider-avatar is-row" style="--avatar:${provider.color};">${escapeHtml(provider.initials)}</div>
      <div class="provider-row-main">
        <div class="provider-row-title">
          <strong>${escapeHtml(provider.displayName)}</strong>
          ${provider.available ? providerStatusBadge(provider) : ""}
        </div>
        <span>${escapeHtml(provider.specialty)}</span>
        <div class="provider-row-rating">
          ${starRating(provider.rating)}
          <i></i>
          <small>${escapeHtml(String(provider.jobs))} trabajos</small>
        </div>
      </div>
      <div class="provider-row-end">
        <strong>${currency(provider.price, provider.currency)}</strong>
        <span>${escapeHtml(String(provider.eta))} min</span>
        <small>${escapeHtml(provider.distance.toFixed(1))} km</small>
      </div>
      <button class="row-chevron" type="button" data-provider-select="${escapeHtml(provider.provider_id)}" aria-label="Solicitar a ${escapeHtml(provider.displayName)}">&gt;</button>
    </article>
  `;
}

export function renderProvidersList(state) {
  const meta = document.getElementById("providersMeta");
  const list = document.getElementById("providersList");
  const carousel = document.getElementById("nearbyProvidersCarousel");
  if (!meta || !list) return;

  const providers = (Array.isArray(state.client.providers)
    ? state.client.providers
    : []
  )
    .map(normalizeProvider)
    .sort((a, b) => {
      if (a.available !== b.available) return Number(b.available) - Number(a.available);
      return a.distance - b.distance;
    });

  const selectedId =
    state.ui.selectedProviderCandidateId ||
    state.client.selectedProvider?.provider_id ||
    null;

  meta.textContent = providers.length
    ? `${providers.length} prestadores ordenados por cercania y disponibilidad`
    : state.meta.info || "Esperando busqueda";

  renderRadarMap(providers, selectedId);

  if (carousel) {
    carousel.innerHTML = providers.length
      ? providers
          .filter((provider) => provider.available)
          .map((provider) => renderProviderCard(provider, selectedId))
          .join("")
      : `
        <div class="client-empty-state is-inline">
          <strong>Busca para ver cercanos</strong>
          <span>Te vamos a mostrar ETA, precio y reputacion.</span>
        </div>
      `;
  }

  list.innerHTML = providers.length
    ? providers.map((provider) => renderProviderRow(provider, selectedId)).join("")
    : `
      <div class="client-empty-state">
        <strong>Elegi categoria y completa la direccion</strong>
        <span>Cuando busques, aparecen opciones con precio, distancia y tiempo estimado.</span>
      </div>
    `;

  renderStickyAction(state, providers);
}

export function renderRequestSummary(state) {
  const chip = document.getElementById("requestStateChip");
  const summary = document.getElementById("requestSummary");
  const timeline = document.getElementById("requestTimeline");
  const actions = document.getElementById("requestActions");

  if (!chip || !summary || !timeline || !actions) return;

  const request = state.client.activeRequest;

  chip.textContent = request
    ? stateLabels[request.status] ?? request.status
    : "Sin solicitud activa";

  if (!request) {
    summary.innerHTML = `
      <div class="summary-card">
        <strong>Tu servicio va a aparecer aca</strong>
        <span class="muted">Una vez que elijas un prestador, vas a ver precio, estado y acciones disponibles.</span>
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
          <span>Direccion</span>
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
          <span>Tipo</span>
          <strong>${escapeHtml(request.requestType ?? request.request_type ?? "IMMEDIATE")}</strong>
        </div>
      </div>
    </div>
  `;

  timeline.innerHTML = appConfig.serviceStates
    .map((status) => `
      <div class="timeline-step ${status === request.status ? "is-active" : ""}">
        <strong>${escapeHtml(stateLabels[status] ?? status)}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
    `)
    .join("");

  actions.innerHTML = [
    ["SEARCHING", "PENDING_PROVIDER_RESPONSE", "PENDING"].includes(request.status)
      ? `<button class="btn-secondary" data-request-action="cancel" type="button">Cancelar</button>`
      : "",
    ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(request.status)
      ? `<button class="btn-primary" data-open-chat="true" type="button">Abrir chat</button>`
      : "",
    request.status === "COMPLETED"
      ? `<button class="btn-secondary" data-request-action="rate" type="button">Calificar</button>`
      : ""
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
        <span class="muted">Al crear una solicitud real vas a ver el intento de pago, la comision de plataforma y el neto del prestador.</span>
      </div>
    `;
    return;
  }

  const total = payment?.total_amount ?? request.total_price ?? request.total_price_snapshot ?? 0;
  const platformFee = payment?.platform_fee ?? request.platform_fee ?? request.platform_fee_snapshot ?? 0;
  const providerAmount = payment?.provider_amount ?? request.provider_price ?? request.provider_price_snapshot ?? 0;
  const paymentStatus = payment?.status ?? "PENDING";

  container.innerHTML = `
    <article class="summary-card compact-stack">
      <strong>Resumen de pago</strong>
      <div class="summary-metrics">
        <div class="metric"><span>Precio del servicio</span><strong>${currency(providerAmount)}</strong></div>
        <div class="metric"><span>Comision MIMI</span><strong>${currency(platformFee)}</strong></div>
        <div class="metric"><span>Total a pagar</span><strong>${currency(total)}</strong></div>
        <div class="metric"><span>Moneda</span><strong>${escapeHtml(request.currency ?? payment?.currency ?? escrow?.currency ?? "ARS")}</strong></div>
      </div>
      <p class="muted">MIMI es una plataforma tecnologica de intermediacion. Los servicios son prestados por proveedores independientes. MIMI cobra una comision por uso de plataforma.</p>
      <div class="chip-row">
        <span class="inline-chip">${escapeHtml(paymentStatus)}</span>
        ${payment?.checkout_url ? `<button class="btn-primary" type="button" data-payment-action="checkout">Abrir checkout mock</button>` : ""}
        ${payment?.id ? `<button class="btn-secondary" type="button" data-payment-action="refresh">Actualizar pago</button>` : ""}
        ${["PENDING", "CHECKOUT_CREATED", "REJECTED"].includes(paymentStatus) ? `<button class="btn-secondary" type="button" data-payment-action="cancel">Cancelar pago</button>` : ""}
      </div>
    </article>
  `;
}

function renderMatchingPanel(state) {
  const container = document.getElementById("matchingPanel");
  if (!container) return;

  const candidates = state.client.insights?.candidates ?? [];
  const offers = state.client.insights?.offers ?? [];

  if (!state.client.activeRequest) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin matching aun</strong>
        <span class="muted">Cuando generes una busqueda real, mostramos ranking, ofertas y tiempos de respuesta.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${candidates.length
      ? candidates
          .slice(0, 4)
          .map((item) => `
            <article class="summary-card compact-stack">
              <strong>#${escapeHtml(String(item.rank_position ?? "-"))}</strong>
              <div class="summary-metrics">
                <div class="metric"><span>Score</span><strong>${escapeHtml(String(item.score ?? "-"))}</strong></div>
                <div class="metric"><span>Distancia</span><strong>${escapeHtml(String(item.distance_km ?? "-"))} km</strong></div>
              </div>
            </article>
          `)
          .join("")
      : `<div class="summary-card"><strong>Ranking pendiente</strong><span class="muted">El backend completara los candidatos visibles.</span></div>`}
    ${offers.length
      ? offers
          .slice(0, 4)
          .map((item) => `<article class="summary-card compact-stack"><strong>Oferta enviada</strong><span class="inline-chip">${escapeHtml(item.status ?? "PENDING")}</span></article>`)
          .join("")
      : ""}
  `;
}

function renderProviderSpotlight(state) {
  const container = document.getElementById("providerSpotlightPanel");
  if (!container) return;

  const selectedProvider = state.client.selectedProvider;
  const profile = state.client.insights?.providerProfile;
  const reviews = state.client.insights?.providerReviews ?? [];

  if (!selectedProvider && !profile) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Sin prestador elegido</strong>
        <span class="muted">Cuando confirmes una opcion, mostramos bio, categorias, pricing y ultimas reseñas.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <article class="summary-card compact-stack">
      <strong>${escapeHtml(selectedProvider?.full_name ?? "Prestador confirmado")}</strong>
      <p class="muted">${escapeHtml(profile?.bio ?? selectedProvider?.bio ?? "Perfil de prestador cargado desde MIMI Go.")}</p>
      <div class="chip-row">
        ${(reviews.length ? reviews : [{ rating: selectedProvider?.rating ?? 5, comment: "Proveedor registrado en MIMI." }])
          .slice(0, 2)
          .map((item) => `<span class="inline-chip">${escapeHtml(Number(item.rating ?? 5).toFixed(1))} / 5</span>`)
          .join("")}
      </div>
    </article>
  `;
}

function renderStickyAction(state, normalizedProviders = null) {
  const button = document.getElementById("requestNearestButton");
  if (!button) return;

  const providers =
    normalizedProviders ||
    (Array.isArray(state.client.providers)
      ? state.client.providers.map(normalizeProvider)
      : []);
  const hasSearch = providers.length > 0 && Boolean(state.meta.lastSearchAt);
  const hasDraft =
    Boolean(state.ui.selectedCategoryId) &&
    Boolean(String(state.requestDraft.address || "").trim()) &&
    Number(state.requestDraft.requestedHours || 0) > 0;
  const selectedId =
    state.ui.selectedProviderCandidateId ||
    state.client.selectedProvider?.provider_id ||
    providers[0]?.provider_id ||
    null;
  const selected = providers.find((provider) => provider.provider_id === selectedId);

  button.closest(".sticky-request-bar")?.classList.toggle(
    "is-visible",
    Boolean(hasSearch && hasDraft && selected)
  );
  button.dataset.providerSelect = selected?.provider_id || "";
  button.disabled = !(hasSearch && hasDraft && selected);
  button.classList.toggle("has-provider", Boolean(hasSearch && hasDraft && selected));
  button.innerHTML = hasSearch && hasDraft && selected
    ? `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="m22 4-10 10.01-3-3"></path>
      </svg>
      Solicitar a ${escapeHtml(selected.displayName)}
    `
    : `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="m13 2-10 12h9l-1 8 10-12h-9l1-8Z"></path>
      </svg>
      Solicitar al mas cercano
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
        .map((item) => `
          <article class="notification-card">
            <strong>${escapeHtml(item.title ?? "Notificacion")}</strong>
            <p class="muted">${escapeHtml(item.body ?? "")}</p>
            <span class="muted">${escapeHtml(formatDate(item.created_at))}</span>
          </article>
        `)
        .join("")
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
  const messages = Array.isArray(state.chat.messages)
    ? state.chat.messages
    : [];

  setBadgeCount("chatUnreadCount", state.chat.unreadCount ?? 0);

  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  chatMessages.innerHTML = messages.length
    ? messages
        .map((message) => `
          <article class="message-bubble ${message.sender_user_id === state.session.userId || message.sender_user_id === "self" ? "is-own" : ""}">
            <strong>${message.sender_user_id === state.session.userId || message.sender_user_id === "self" ? "Vos" : "Prestador"}</strong>
            <p>${escapeHtml(message.body ?? "")}</p>
            <span class="muted">${escapeHtml(formatDate(message.created_at))}</span>
          </article>
        `)
        .join("")
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
    ? stateLabels[activeRequest.status] ?? activeRequest.status
    : "Mapa en tiempo real";
}

export function renderClientScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderEntryState(state);
  renderClientOnboarding(state);
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
