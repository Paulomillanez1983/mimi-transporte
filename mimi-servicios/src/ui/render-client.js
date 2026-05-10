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
  SERVICIO_DOMESTICO: "SD",
  LIMPIEZA: "LI",
  ELECTRICIDAD: "EL",
  PLOMERIA: "PL",
  GASISTA: "GA",
  INSTALACION_AIRE: "IA",
  REFRIGERACION: "RF",
  REPARACIONES: "RP",
  CUIDADO: "CU",
  CUIDADO_ADULTOS: "CA",
  CUIDADO_NINOS: "CN",
  ENFERMERIA: "EN",
  PSICOLOGIA: "PS",
  NUTRICION: "NU",
  KINESIOLOGIA: "KI",
  ABOGACIA: "AB",
  CONTABILIDAD: "CO",
  CLASES_PARTICULARES: "CL",
  JARDINERIA: "JA",
  PINTURA: "PI",
  CERRAJERIA: "CE",
  CARPINTERIA: "CP",
  ALBANILERIA: "AL",
  TECNICO: "TC",
  TECNICO_PC: "PC",
  TECNOLOGIA: "TG",
  PELUQUERIA: "PE",
  MANICURIA: "MA",
  MASAJISTA: "MS",
  BELLEZA: "BE",
  MUDANZAS: "MU",
  MASCOTAS: "PA",
  GOMERIA_MOVIL: "GM",
  MECANICA_MOVIL: "MM",
  HERRERIA: "HE"
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
  { code: "PSICOLOGIA", terms: ["psicologo", "psicologa", "terapia", "ansiedad", "emocional", "salud mental"] },
  { code: "NUTRICION", terms: ["nutricionista", "dieta", "alimentacion", "plan alimentario"] },
  { code: "KINESIOLOGIA", terms: ["kinesiologo", "fisio", "rehabilitacion", "lesion", "dolor muscular"] },
  { code: "ABOGACIA", terms: ["abogado", "legal", "contrato", "laboral", "alquiler"] },
  { code: "CONTABILIDAD", terms: ["contador", "impuestos", "monotributo", "afip", "facturacion"] },
  { code: "CLASES_PARTICULARES", terms: ["profesor", "clases", "apoyo escolar", "matematica", "ingles"] },
  { code: "TECNICO_PC", terms: ["pc", "computadora", "notebook", "impresora"] },
  { code: "TECNOLOGIA", terms: ["wifi", "router", "camara", "smart tv", "internet"] },
  { code: "CERRAJERIA", terms: ["llave", "cerradura", "puerta"] },
  { code: "MUDANZAS", terms: ["mudanza", "mover", "flete", "cargar"] },
  { code: "MASCOTAS", terms: ["perro", "gato", "mascota", "pasear"] },
  { code: "GOMERIA_MOVIL", terms: ["pincho", "pinchadura", "rueda", "cubierta", "neumatico", "gomero"] },
  { code: "MECANICA_MOVIL", terms: ["mecanico", "auto", "no arranca", "bateria", "motor"] },
  { code: "HERRERIA", terms: ["herrero", "herreria", "reja", "porton", "soldadura"] }
];

const pricingModelLabels = {
  HOURLY: "Por hora",
  BASE_VISIT: "Visita base",
  QUOTE: "A presupuestar",
  FIXED: "Precio cerrado",
  UNIT: "Por sesión / unidad",
  SQUARE_METER: "Por m2",
  LINEAR_METER: "Por metro lineal"
};

const nonHourlyCategoryModels = {
  GOMERIA_MOVIL: "BASE_VISIT",
  MECANICA_MOVIL: "BASE_VISIT",
  HERRERIA: "QUOTE",
  PSICOLOGIA: "UNIT",
  KINESIOLOGIA: "UNIT",
  NUTRICION: "UNIT",
  ABOGACIA: "UNIT",
  CONTABILIDAD: "UNIT",
  CLASES_PARTICULARES: "UNIT",
  MUDANZAS: "QUOTE",
  JARDINERIA: "SQUARE_METER",
  PINTURA: "SQUARE_METER"
};

const providerColors = [
  "#1a56db",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#d97706",
  "#0891b2"
];

const categoryAccentPalette = [
  { solid: "#059669", soft: "rgba(5, 150, 105, 0.16)", border: "rgba(5, 150, 105, 0.45)", text: "#047857" },
  { solid: "#2563eb", soft: "rgba(37, 99, 235, 0.15)", border: "rgba(37, 99, 235, 0.42)", text: "#1d4ed8" },
  { solid: "#7c3aed", soft: "rgba(124, 58, 237, 0.15)", border: "rgba(124, 58, 237, 0.40)", text: "#6d28d9" },
  { solid: "#db2777", soft: "rgba(219, 39, 119, 0.14)", border: "rgba(219, 39, 119, 0.38)", text: "#be185d" },
  { solid: "#d97706", soft: "rgba(217, 119, 6, 0.15)", border: "rgba(217, 119, 6, 0.42)", text: "#b45309" },
  { solid: "#0891b2", soft: "rgba(8, 145, 178, 0.15)", border: "rgba(8, 145, 178, 0.40)", text: "#0e7490" }
];

function categoryAccent(category) {
  const key = String(category?.code || category?.id || category?.name || "MIMI");
  const sum = [...key].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return categoryAccentPalette[sum % categoryAccentPalette.length];
}

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

function compactServiceAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Direccion pendiente";

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 2) return raw;

  const zip = parts.find((part) => /\b[A-Z]?\d{4}[A-Z]{0,3}\b/i.test(part));
  let used = 1;
  let street = parts[0];

  if (/^\d+[A-Za-z]?$/.test(parts[0] || "") && parts[1]) {
    street = `${parts[0]} ${parts[1]}`;
    used = 2;
  }

  const administrative = /^(argentina|municipio|pedania|pedan[ií]a|departamento|provincia)(\b| de\b)/i;
  const locality = parts
    .slice(used)
    .find((part) => {
      if (zip && part === zip) return false;
      if (administrative.test(part)) return false;
      if (/^cordoba$/i.test(part.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return false;
      return part.length <= 42;
    });

  return [street, locality, zip]
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join(" - ");
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

function firstNameFromText(value) {
  const text = String(value ?? "")
    .replace(/@.*/, "")
    .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = text.split(" ").find(Boolean);
  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function providerDisplayName(provider) {
  return (
    firstNameFromText(provider.verified_first_name) ||
    firstNameFromText(provider.public_name) ||
    firstNameFromText(provider.display_name) ||
    firstNameFromText(provider.full_name) ||
    firstNameFromText(provider.name) ||
    "Prestador"
  );
}

function categoryIcon(category) {
  const code = String(category?.code || category?.name || "")
    .trim()
    .toUpperCase();

  return categoryIcons[code] || "SR";
}

function categoryPricingModel(category) {
  if (!category) return "HOURLY";
  const explicit = category.default_pricing_model || category.pricing_model || category.pricingModel;
  const code = String(category.code || "").toUpperCase();
  return String(explicit || nonHourlyCategoryModels[code] || "HOURLY").toUpperCase();
}

function isHourlyCategory(category) {
  return categoryPricingModel(category) === "HOURLY";
}

function pricingModelLabel(category) {
  const model = categoryPricingModel(category);
  return pricingModelLabels[model] || "Definido por el prestador";
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
    ...(Array.isArray(category.aliases) ? category.aliases : []),
    ...(Array.isArray(category.search_keywords) ? category.search_keywords : [])
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
    ...(Array.isArray(category.aliases) ? category.aliases : []),
    ...(Array.isArray(category.search_keywords) ? category.search_keywords : [])
  ].join(" "));

  let score = haystack.includes(query) ? 12 : 0;
  const rule = guideRules.find((item) => item.code === category.code);

  if (rule?.terms?.some((term) => {
    const normalizedTerm = normalizeSearch(term);
    return query.includes(normalizedTerm) || normalizedTerm.includes(query);
  })) {
    score += 30;
  }

  for (const word of query.split(" ")) {
    if (word.length > 3 && haystack.includes(word)) score += 4;
    if (word.length > 3 && rule?.terms?.some((term) => normalizeSearch(term).startsWith(word))) {
      score += 8;
    }
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

function selectedCategoryForState(state) {
  return appConfig.categories.find((category) => category.id === state.ui.selectedCategoryId) ?? null;
}

function providerMatchReason(provider, category) {
  if (provider.match_reason) return provider.match_reason;
  const categoryName = provider.category_name || provider.svc_categories?.name || category?.name || provider.specialty;
  const parts = [
    categoryName ? `Rubro: ${categoryName}` : "Coincide con tu solicitud",
    Number(provider.distance_km) ? `a ${Number(provider.distance_km).toFixed(1)} km` : null
  ].filter(Boolean);
  return parts.join(" · ");
}

function normalizePricingModel(value) {
  return String(value || "").trim().toUpperCase();
}

function providerPriceLabel(provider) {
  const price = Number(provider.price ?? provider.total_price ?? provider.provider_price ?? 0);
  const hasPrice = Number.isFinite(price) && price > 0;

  // Solo "A coordinar" si NO hay precio cargado.
  // quote_required indica que el prestador prefiere coordinar antes de confirmar,
  // pero si tiene un precio referencial cargado, lo mostramos.
  if (!hasPrice) return "A coordinar";

  const model = normalizePricingModel(provider.pricing_model || provider.pricingMode || provider.pricing_mode);
  const unit = String(provider.unit_name || "").trim();

  if (model === "SQUARE_METER") return `${currency(price, provider.currency)}/m2`;
  if (model === "LINEAR_METER") return `${currency(price, provider.currency)}/m lineal`;
  if (model === "HOURLY") return `${currency(price, provider.currency)}/hora`;
  if (model === "UNIT") return `${currency(price, provider.currency)}/${unit || "unidad"}`;
  if (model === "BASE_VISIT") return `${currency(price, provider.currency)} visita`;
  if (model === "FIXED") return `${currency(price, provider.currency)} cerrado`;

  return currency(price, provider.currency);
}

function requestStatusDescription(status) {
  const descriptions = {
    SEARCHING: "MIMI esta buscando prestadores compatibles con tu solicitud.",
    PENDING_PROVIDER_RESPONSE: "La solicitud fue enviada y esperamos respuesta del prestador.",
    PENDING: "La solicitud quedo creada y lista para ser aceptada.",
    ACCEPTED: "El prestador acepto. Ya podes seguir el avance en tiempo real.",
    SCHEDULED: "El servicio quedo programado para el horario elegido.",
    PROVIDER_EN_ROUTE: "El prestador informo que esta en camino.",
    PROVIDER_ARRIVED: "El prestador marco llegada al punto indicado.",
    IN_PROGRESS: "El servicio esta en curso.",
    COMPLETED: "El servicio fue completado.",
    CANCELLED: "La solicitud fue cancelada."
  };

  return descriptions[status] || "Seguimos actualizando el estado desde Supabase Realtime.";
}

function requestFlowStatus(status) {
  const current = String(status || "PENDING").toUpperCase();
  const order = ["created", "notified", "response", "service"];

  const activeByStatus = {
    SEARCHING: "created",
    PENDING: "notified",
    PENDING_PROVIDER_RESPONSE: "response",
    CHECKOUT_CREATED: "response",
    PAYMENT_PENDING: "response",
    PAYMENT_APPROVED: "response",
    ACCEPTED: "service",
    SCHEDULED: "service",
    PROVIDER_EN_ROUTE: "service",
    PROVIDER_ARRIVED: "service",
    IN_PROGRESS: "service",
    COMPLETED: "service",
    CANCELLED: "response"
  };

  const activeKey = activeByStatus[current] || "created";
  const activeIndex = order.indexOf(activeKey);
  return { current, order, activeKey, activeIndex };
}

function requestFlowSteps(status) {
  const flow = requestFlowStatus(status);
  const labels = {
    created: "Solicitud enviada",
    notified: "Prestador avisado",
    response: flow.current === "CANCELLED" ? "Solicitud cancelada" : "Esperando respuesta",
    service: flow.current === "COMPLETED" ? "Servicio completado" : "Servicio activo"
  };

  return flow.order.map((key, index) => ({
    key,
    label: labels[key],
    active: key === flow.activeKey,
    done: flow.current === "COMPLETED" || index < flow.activeIndex
  }));
}

function requestFlowHint(status) {
  const current = String(status || "PENDING").toUpperCase();
  const hints = {
    SEARCHING: "Estamos preparando la solicitud con los datos del servicio.",
    PENDING: "MIMI ya creo la solicitud. El prestador recibe el aviso cuando esta disponible.",
    PENDING_PROVIDER_RESPONSE: "El prestador ya fue avisado. Podes actualizar el estado o cancelar si todavia no respondio.",
    ACCEPTED: "El prestador acepto. Desde ahora el servicio queda coordinado en MIMI.",
    SCHEDULED: "El servicio quedo agendado. Te avisamos cuando cambie el estado.",
    PROVIDER_EN_ROUTE: "El prestador informo que esta en camino.",
    PROVIDER_ARRIVED: "El prestador marco llegada al domicilio indicado.",
    IN_PROGRESS: "El servicio esta en curso.",
    COMPLETED: "Servicio finalizado y registrado.",
    CANCELLED: "La solicitud fue cancelada."
  };

  return hints[current] || "MIMI mantiene el estado actualizado en tiempo real.";
}

function normalizeProvider(provider, index = 0) {
  const providerPrice = Number(provider.provider_price ?? 0);
  const totalPrice = Number(provider.total_price ?? providerPrice);
  const distance = Number(provider.distance_km ?? 1 + index * 0.8);
  const score = Number(provider.score ?? Math.max(78, 98 - index * 4));
  const rating = Number(provider.rating ?? 5);
  const displayName = providerDisplayName(provider);

  const normalized = {
    ...provider,
    displayName,
    initials: provider.initials || initialsFromName(displayName),
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

  normalized.matchReason = providerMatchReason(normalized, null);
  normalized.priceLabel = providerPriceLabel(normalized);
  return normalized;
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
      <i aria-hidden="true"></i>${provider.available ? "Online" : "Ocupado"}
    </span>
  `;
}

function providerAvatarMarkup(provider, extraClass = "") {
  const avatarUrl = String(provider.avatar_url || provider.avatar || "").trim();
  const className = `provider-avatar ${extraClass}`.trim();
  if (avatarUrl) {
    return `
      <div class="${escapeHtml(className)} has-photo" style="--avatar:${provider.color};">
        <img src="${escapeHtml(avatarUrl)}" alt="Foto de ${escapeHtml(provider.displayName)}" loading="lazy">
      </div>
    `;
  }
  return `<div class="${escapeHtml(className)}" style="--avatar:${provider.color};">${escapeHtml(provider.initials)}</div>`;
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
      ? "Sesión activa"
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
      ? "Sesión lista para buscar prestadores, cotizar y seguir servicios."
      : hasBackend
        ? "Ingresa para usar solicitudes reales."
        : "Demo local activa: podés probar búsqueda, seleccion y seguimiento.";
  }
}

function renderAccountDrawer(state) {
  const name = document.getElementById("accountDrawerName");
  const email = document.getElementById("accountDrawerEmail");
  const avatar = document.getElementById("accountDrawerAvatar");
  const lastTitle = document.getElementById("accountLastServiceTitle");
  const lastMeta = document.getElementById("accountLastServiceMeta");

  const displayName =
    state.session.userName ||
    state.session.userEmail?.split("@")[0] ||
    "Cliente";

  if (name) name.textContent = displayName;
  if (email) email.textContent = state.session.userEmail || "Sesión activa";

  if (avatar) {
    const avatarUrl = state.session.userAvatar;
    avatar.hidden = !avatarUrl;
    avatar.src = avatarUrl || "";
    avatar.alt = avatarUrl ? `Foto de ${displayName}` : "";
  }

  const request = state.client.activeRequest;

  if (!request) {
    if (lastTitle) lastTitle.textContent = "Todavía no tenes servicios recientes";
    if (lastMeta) lastMeta.textContent = "Cuando contrates uno, aparece acá.";
    return;
  }

  const status = stateLabels[request.status] ?? request.status ?? "Solicitud activa";
  const providerName =
    request.providerName ||
    state.client.selectedProvider?.full_name ||
    "Prestador pendiente";
  const address = compactServiceAddress(request.address_text || state.requestDraft.address || "Direccion pendiente");

  if (lastTitle) lastTitle.textContent = status;
  if (lastMeta) lastMeta.textContent = `${providerName} - ${address}`;
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
  const intentAssist = document.getElementById("categoryIntentAssist");
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
  // Si el usuario tipeó algo: mostrar 3 (top matches). Si pidió ampliar: todas.
  // Sin query: 5 visibles + card "Ampliar".
  const maxVisible = state.ui.showAllCategories ? filtered.length : query ? 3 : 5;
  const guideCategory = findGuideCategory(categories, query);
  const selectedCategory = categories.find((category) => category.id === state.ui.selectedCategoryId);
  let visibleCategories = filtered.slice(0, maxVisible);
  if (!state.ui.showAllCategories && selectedCategory && !visibleCategories.some((category) => category.id === selectedCategory.id)) {
    visibleCategories = [selectedCategory, ...visibleCategories].slice(0, maxVisible);
  }
  const intentResolution = state.ui.intentResolution ?? null;
  const intentTop = intentResolution?.topMatch ?? intentResolution?.top_match ?? null;
  const intentCategory = intentTop
    ? categories.find(
        (category) =>
          category.id === intentTop.category_id ||
          String(category.code || "").toUpperCase() === String(intentTop.code || "").toUpperCase()
      )
    : null;
  const assistCategory = intentCategory || guideCategory || (!query ? selectedCategory : null);
  const intentConfidence = Math.round(
    Math.max(0, Math.min(1, Number(intentTop?.confidence ?? intentTop?.score ?? 0.84))) * 100
  );

  if (searchInput && searchInput.value !== (state.ui.categorySearchTerm ?? "")) {
    searchInput.value = state.ui.categorySearchTerm ?? "";
  }

  container.classList.toggle("is-expanded", Boolean(query || state.ui.showAllCategories));

  if (intentAssist) {
    const hasQuery = Boolean(query);
    const stageCategory = assistCategory?.name || "categoria";
    const searchReady = Boolean(state.requestDraft.address && assistCategory);

    if (assistCategory) {
      const sourceLabel = intentCategory
        ? "MIMI interpreto tu solicitud y detecto"
        : guideCategory
          ? "MIMI sugiere revisar"
          : "Servicio elegido";
      intentAssist.innerHTML = `
        <div class="intent-assist-head">
          <strong>${escapeHtml(sourceLabel)} ${escapeHtml(assistCategory.name)}</strong>
          <span>${escapeHtml(pricingModelLabel(assistCategory))} segun configuracion del prestador.</span>
        </div>
        <div class="intent-steps" aria-label="Analisis de solicitud">
          <span class="${hasQuery ? "is-done" : "is-active"}">1. Interpretar</span>
          <span class="${assistCategory ? "is-done" : "is-active"}">2. Categoria</span>
          <span class="${searchReady ? "is-active" : ""}">3. Buscar compatibles</span>
        </div>
        <p>Vamos a buscar prestadores compatibles con ${escapeHtml(stageCategory)}. MIMI conecta la solicitud; el servicio lo realiza cada prestador independiente.</p>
      `;
    } else {
      intentAssist.innerHTML = `
        <div class="intent-assist-head">
          <strong>Contanos que necesitas resolver</strong>
          <span>MIMI interpreta la necesidad y sugiere el tipo de prestador.</span>
        </div>
        <div class="intent-steps" aria-label="Analisis de solicitud">
          <span class="is-active">1. Interpretar</span>
          <span>2. Categoria</span>
          <span>3. Buscar compatibles</span>
        </div>
        <p>Ejemplos: necesito un psicologo, quiero una nutricionista, se rompio un cano, busco una ninera.</p>
      `;
    }
  }

  container.innerHTML = [
    intentCategory
      ? `
        <button
          class="ai-intent-card"
          data-category-id="${escapeHtml(intentCategory.id)}"
          type="button"
          title="${escapeHtml(intentCategory.description ?? intentCategory.name)}"
        >
          <span class="ai-intent-kicker">IA MIMI</span>
          <strong>${escapeHtml(intentCategory.name)}</strong>
          <small>${escapeHtml(intentCategory.description ?? "Categoria recomendada para tu situacion.")}</small>
          <span class="ai-intent-meta">
            <b>${escapeHtml(String(intentConfidence))}% coincidencia</b>
            <i>${escapeHtml(pricingModelLabel(intentCategory))}</i>
          </span>
          <span class="ai-intent-action">Usar este servicio</span>
        </button>
      `
      : "",
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
            const accent = categoryAccent(category);
            return `
            <button
              class="category-chip ${category.id === state.ui.selectedCategoryId ? "is-selected" : ""} ${isPopular ? "is-popular" : ""}"
              data-category-id="${escapeHtml(category.id)}"
              type="button"
              title="${escapeHtml(category.description ?? category.name)}"
              style="--category-accent:${accent.solid};--category-accent-soft:${accent.soft};--category-accent-border:${accent.border};--category-accent-text:${accent.text};"
            >
              ${isPopular ? `<em class="category-popular-badge" aria-label="Popular">Top</em>` : ""}
              <span aria-hidden="true">${categoryIcon(category)}</span>
              <strong>${escapeHtml(category.name)}</strong>
              <small>${escapeHtml(category.description ?? "")}</small>
              <i>${escapeHtml(pricingModelLabel(category))}</i>
            </button>
          `;
          }
        )
        .join("") +
      (!state.ui.showAllCategories && filtered.length > maxVisible
        ? `
          <button class="category-chip category-more-chip" data-category-toggle="expand" type="button">
            <span aria-hidden="true">&#10133;</span>
            <strong>Ampliar</strong>
            <small>Ver más rubros</small>
          </button>
        `
        : "")
      : `
      <div class="client-empty-state">
        <strong>Sin resultados</strong>
        <span>Proba con: necesito un psicologo, nutricionista, se rompio un cano, quiero pintar o necesito cuidar a alguien.</span>
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
    <div class="radar-user" aria-label="Tu ubicación"><span></span></div>
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
        ${providerAvatarMarkup(provider)}
        <span class="score-badge" title="Compatibilidad con tu busqueda">${escapeHtml(String(Math.round(provider.score)))}%</span>
      </header>
      <strong>${escapeHtml(provider.displayName)}</strong>
      <small>${escapeHtml(provider.specialty)}</small>
      ${starRating(provider.rating)}
      <p class="provider-match-reason">${escapeHtml(provider.matchReason)}</p>
      <div class="provider-card-meta">
        <span><b>${escapeHtml(String(provider.eta))} min</b>${escapeHtml(provider.distance.toFixed(1))} km</span>
        <span><small>Referencia</small><b>${escapeHtml(provider.priceLabel)}</b></span>
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
      ${providerAvatarMarkup(provider, "is-row")}
      <div class="provider-row-main">
        <div class="provider-row-title">
          <strong>${escapeHtml(provider.displayName)}</strong>
          ${provider.available ? providerStatusBadge(provider) : ""}
        </div>
        <span>${escapeHtml(provider.specialty)}</span>
        <p class="provider-match-reason">${escapeHtml(provider.matchReason)}</p>
        <div class="provider-row-rating">
          ${starRating(provider.rating)}
          <i></i>
          <small>${escapeHtml(String(provider.jobs))} trabajos</small>
        </div>
      </div>
      <div class="provider-row-end">
        <strong>${escapeHtml(provider.priceLabel)}</strong>
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
  const selectedCategory = selectedCategoryForState(state);
  const hasSearched = Boolean(state.meta.lastSearchAt);
  const selectedCategoryName = selectedCategory?.name || "la categoria elegida";

  meta.textContent = providers.length
    ? `${providers.length} prestadores compatibles ordenados por cercania y disponibilidad`
    : hasSearched
      ? `Sin prestadores disponibles para ${selectedCategoryName}`
      : "Esperando busqueda";

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

  if (carousel && !providers.length) {
    carousel.innerHTML = `
      <div class="client-empty-state is-inline">
        <strong>${hasSearched ? "Sin disponibles ahora" : "Busca para ver cercanos"}</strong>
        <span>${hasSearched ? `No encontramos prestadores activos para ${escapeHtml(selectedCategoryName)} en este momento.` : "Te vamos a mostrar ETA, precio y reputacion."}</span>
      </div>
    `;
  }

  list.innerHTML = providers.length
    ? providers.map((provider) => renderProviderRow(provider, selectedId)).join("")
    : `
      <div class="client-empty-state">
        <strong>Elegi categoría y completa la dirección</strong>
        <span>Cuando busques, aparecen opciones con precio, distancia y tiempo estimado.</span>
      </div>
    `;

  if (!providers.length) {
    list.innerHTML = `
      <div class="client-empty-state">
        <strong>${hasSearched ? "No encontramos prestadores disponibles" : "Elegi categoria y completa la direccion"}</strong>
        <span>${hasSearched ? "Podes ajustar la necesidad, cambiar la zona o intentar mas tarde. Solo mostramos prestadores compatibles y disponibles." : "Cuando busques, aparecen opciones con precio, distancia y tiempo estimado."}</span>
      </div>
    `;
  }

  renderStickyAction(state, providers);
}

export function renderRequestSummary(state) {
  const chip = document.getElementById("requestStateChip");
  const summary = document.getElementById("requestSummary");
  const timeline = document.getElementById("requestTimeline");
  const actions = document.getElementById("requestActions");

  if (!chip || !summary || !timeline || !actions) return;

  const request = state.client.activeRequest;
  const currentStatus = String(request?.status || "PENDING").toUpperCase();

  chip.textContent = request
    ? stateLabels[currentStatus] ?? currentStatus
    : "Sin solicitud activa";

  if (!request) {
    summary.innerHTML = `
      <div class="summary-card">
        <strong>Tu servicio va a aparecer acá</strong>
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
  const flowSteps = requestFlowSteps(currentStatus);
  const rawAddress = request.address_text ?? state.requestDraft.address ?? "Pendiente";
  const compactAddress = compactServiceAddress(rawAddress);

  summary.innerHTML = `
    <div class="request-flow-card">
      <div class="request-flow-head">
        <strong>${escapeHtml(stateLabels[currentStatus] ?? currentStatus)}</strong>
        <span>${escapeHtml(requestFlowHint(currentStatus))}</span>
      </div>
      <div class="request-flow-steps" aria-label="Estado de la solicitud">
        ${flowSteps
          .map((step) => `
            <span class="request-flow-step ${step.active ? "is-active" : ""} ${step.done ? "is-done" : ""}">
              <i aria-hidden="true"></i>
              ${escapeHtml(step.label)}
            </span>
          `)
          .join("")}
      </div>
    </div>
    <div class="summary-card">
      <strong>${escapeHtml(providerName)}</strong>
      <div class="summary-metrics">
        <div class="metric">
          <span>Direccion</span>
          <strong title="${escapeHtml(rawAddress)}">${escapeHtml(compactAddress)}</strong>
        </div>
        <div class="metric">
          <span>Total</span>
          <strong>${currency(request.total_price ?? request.total_price_snapshot)}</strong>
        </div>
        <div class="metric">
          <span>Tipo</span>
          <strong>${escapeHtml(request.requestType ?? request.request_type ?? "IMMEDIATE")}</strong>
        </div>
      </div>
    </div>
  `;

  const statusIndex = appConfig.serviceStates.indexOf(currentStatus);
  timeline.innerHTML = appConfig.serviceStates
    .map((status, index) => `
      <div class="timeline-step ${status === currentStatus ? "is-active" : ""} ${statusIndex >= index ? "is-done" : ""}">
        <strong>${escapeHtml(stateLabels[status] ?? status)}</strong>
        <span>${escapeHtml(requestStatusDescription(status))}</span>
      </div>
    `)
    .join("");

  actions.innerHTML = [
    !["COMPLETED", "CANCELLED"].includes(currentStatus)
      ? `<button class="btn-secondary" data-request-action="refresh" type="button">Actualizar estado</button>`
      : "",
    ["SEARCHING", "PENDING_PROVIDER_RESPONSE", "PENDING"].includes(currentStatus)
      ? `<button class="btn-secondary" data-request-action="cancel" type="button">Cancelar</button>`
      : "",
    ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"].includes(currentStatus)
      ? `<button class="btn-primary" data-open-chat="true" type="button">Abrir chat</button>`
      : "",
    currentStatus === "COMPLETED"
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
        <strong>Sin detalle de pago</strong>
        <span class="muted">Cuando confirmes un servicio, vas a ver el total estimado y el detalle de pago.</span>
      </div>
    `;
    return;
  }

  const total = payment?.total_amount ?? request.total_price ?? request.total_price_snapshot ?? 0;
  const paymentStatus = payment?.status ?? "PENDING";

  container.innerHTML = `
    <details class="summary-card payment-details-card">
      <summary>
        <span>
          <strong>Total estimado</strong>
          <small>${escapeHtml(paymentStatus === "PENDING" ? "Pendiente de confirmacion" : paymentStatus)}</small>
        </span>
        <b>${currency(total)}</b>
      </summary>
      <div class="summary-metrics payment-metrics">
        <div class="metric"><span>Total a pagar</span><strong>${currency(total)}</strong></div>
        <div class="metric"><span>Moneda</span><strong>${escapeHtml(request.currency ?? payment?.currency ?? escrow?.currency ?? "ARS")}</strong></div>
        <div class="metric"><span>Estado</span><strong>${escapeHtml(paymentStatus)}</strong></div>
      </div>
      <p class="muted payment-note">Este es el total estimado para tu solicitud. El servicio lo presta un proveedor independiente.</p>
      <div class="chip-row">
        <span class="inline-chip">${escapeHtml(paymentStatus)}</span>
        ${payment?.checkout_url ? `<button class="btn-primary" type="button" data-payment-action="checkout">Abrir checkout mock</button>` : ""}
        ${payment?.id ? `<button class="btn-secondary" type="button" data-payment-action="refresh">Actualizar pago</button>` : ""}
        ${["PENDING", "CHECKOUT_CREATED", "REJECTED"].includes(paymentStatus) ? `<button class="btn-secondary" type="button" data-payment-action="cancel">Cancelar pago</button>` : ""}
      </div>
    </details>
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
        <strong>Sin busqueda activa</strong>
        <span class="muted">Cuando envies una solicitud, mostramos el avance de la busqueda y la respuesta del prestador.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    ${candidates.length
      ? candidates
          .slice(0, 2)
          .map((item) => `
            <article class="summary-card compact-stack search-progress-card">
              <strong>Prestador compatible</strong>
              <div class="summary-metrics">
                <div class="metric"><span>Cercania</span><strong>${escapeHtml(String(item.distance_km ?? "-"))} km</strong></div>
                <div class="metric"><span>Coincidencia</span><strong>${escapeHtml(String(item.score ?? "-"))}</strong></div>
              </div>
            </article>
          `)
          .join("")
      : `<div class="summary-card search-progress-card"><strong>Solicitud enviada</strong><span class="muted">Estamos esperando la respuesta del prestador seleccionado.</span></div>`}
    ${offers.length
      ? offers
          .slice(0, 2)
          .map((item) => `<article class="summary-card compact-stack"><strong>Solicitud al prestador</strong><span class="inline-chip">${escapeHtml(stateLabels[String(item.status || "").toUpperCase()] ?? item.status ?? "Enviada")}</span></article>`)
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
        <span class="muted">Cuando confirmes una opcion, mostramos perfil, calificacion y datos utiles del prestador.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <article class="summary-card compact-stack provider-spotlight-card">
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

function serviceHistoryTitle(item) {
  return (
    item.svc_categories?.name ||
    item.category_name ||
    item.provider?.full_name ||
    "Servicio MIMI"
  );
}

function serviceHistoryDate(item) {
  const value = item.completed_at || item.cancelled_at || item.updated_at || item.created_at;
  if (!value) return "Fecha no disponible";

  try {
    return new Date(value).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (_) {
    return "Fecha no disponible";
  }
}

function renderClientServiceHistory(state) {
  const container = document.getElementById("serviceHistoryPanel");
  if (!container) return;

  const history = state.client.serviceHistory ?? [];

  if (!history.length) {
    container.innerHTML = `
      <div class="summary-card">
        <strong>Todavia no hay historial</strong>
        <span class="muted">Cuando un servicio termine, queda aca y sale de la solicitud activa.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = history
    .slice(0, 8)
    .map((item) => {
      const status = String(item.status || "").toUpperCase();
      const reviewed = Boolean(item.review?.rating);
      return `
        <article class="history-service-card">
          <div>
            <strong>${escapeHtml(serviceHistoryTitle(item))}</strong>
            <span>${escapeHtml(item.provider?.full_name || "Prestador MIMI")} - ${escapeHtml(serviceHistoryDate(item))}</span>
          </div>
          <div class="history-service-meta">
            <span>${escapeHtml(stateLabels[status] ?? status)}</span>
            <b>${escapeHtml(currency(item.total_price_snapshot ?? 0, item.currency ?? "ARS"))}</b>
          </div>
          ${
            status === "COMPLETED" && !reviewed
              ? `<button class="btn-secondary" type="button" data-history-action="rate" data-request-id="${escapeHtml(item.id)}">Calificar</button>`
              : reviewed
                ? `<small class="history-review-pill">${escapeHtml(String(item.review.rating))}/5 guardado</small>`
                : ""
          }
        </article>
      `;
    })
    .join("");
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
  const selectedCategory = appConfig.categories.find((category) => category.id === state.ui.selectedCategoryId);
  const needsHours = isHourlyCategory(selectedCategory);
  const hasDraft =
    Boolean(state.ui.selectedCategoryId) &&
    Boolean(String(state.requestDraft.address || "").trim()) &&
    (!needsHours || Number(state.requestDraft.requestedHours || 0) > 0);
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

function notificationRequestId(item) {
  const rawMetadata = item?.metadata || item?.metadata_json || item?.data || item?.data_json || {};
  let metadata = rawMetadata;
  if (typeof rawMetadata === "string") {
    try {
      metadata = JSON.parse(rawMetadata);
    } catch (_) {
      metadata = {};
    }
  }
  return (
    item?.request_id ||
    item?.service_request_id ||
    item?.svc_request_id ||
    item?.request?.id ||
    metadata?.request_id ||
    metadata?.requestId ||
    metadata?.service_request_id ||
    null
  );
}

function notificationListHtml(items, emptyTitle, emptyText) {
  return items.length
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
        <strong>${escapeHtml(emptyTitle)}</strong>
        <span class="muted">${escapeHtml(emptyText)}</span>
      </div>
    `;
}

export function renderNotifications(state) {
  const items = Array.isArray(state.notifications.items)
    ? state.notifications.items
    : [];
  const unread = items.filter((item) => !item.read_at).length;
  const activeRequestId = state.client.activeRequest?.id || state.client.activeRequest?.request_id || null;
  const currentItems = activeRequestId
    ? items.filter((item) => String(notificationRequestId(item) || "") === String(activeRequestId))
    : [];

  setBadgeCount("notificationsCount", unread);

  const currentHtml = notificationListHtml(
    currentItems,
    "Sin novedades de este servicio",
    "Cuando el prestador responda o cambie el estado, aparece aca."
  );
  const drawerHtml = notificationListHtml(
    items,
    "Sin notificaciones",
    "Las novedades de tus servicios van a aparecer aca."
  );

  const notificationsList = document.getElementById("notificationsList");
  const notificationsDrawerBody = document.getElementById("notificationsDrawerBody");

  if (notificationsList) notificationsList.innerHTML = currentHtml;
  if (notificationsDrawerBody) notificationsDrawerBody.innerHTML = drawerHtml;
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
        <span class="muted">Los mensajes del servicio van a aparecer acá en tiempo real.</span>
      </div>
    `;
}

function renderMapStatus(state) {
  const mapStatus = document.getElementById("mapStatus");
  if (!mapStatus) return;

  const activeRequest = state.client.activeRequest;
  mapStatus.textContent = activeRequest
    ? `${stateLabels[activeRequest.status] ?? activeRequest.status}: ${requestStatusDescription(activeRequest.status)}`
    : "Mapa en tiempo real";
}

function liveDistanceMeters(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function liveDistanceLabel(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return "--";
  if (value < 1000) return `${Math.max(50, Math.round(value / 10) * 10)} m`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
}

function renderClientLiveNavigation(state) {
  const hud = document.getElementById("clientLiveNavigation");
  if (!hud) return;

  const request = state.client.activeRequest;
  const provider = state.tracking.providerPosition;
  const service = state.tracking.clientPosition;
  const activeStatuses = ["ACCEPTED", "PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"];
  const isVisible = Boolean(request && activeStatuses.includes(String(request.status || "").toUpperCase()));

  hud.hidden = !isVisible;
  if (!isVisible) return;

  const distance = liveDistanceMeters(provider, service);
  const eta = Number.isFinite(distance)
    ? `${Math.max(1, Math.ceil((distance / 1000 / 28) * 60))} min`
    : "--";

  const status = document.getElementById("clientLiveStatus");
  const etaEl = document.getElementById("clientLiveEta");
  const distanceEl = document.getElementById("clientLiveDistance");
  const hint = document.getElementById("clientLiveHint");

  if (status) status.textContent = stateLabels[request.status] ?? "Servicio activo";
  if (etaEl) etaEl.textContent = eta;
  if (distanceEl) distanceEl.textContent = liveDistanceLabel(distance);
  if (hint) {
    const hints = {
      ACCEPTED: "El prestador confirmo la solicitud. Cuando salga, vas a ver el trayecto.",
      PROVIDER_EN_ROUTE: "Seguimos al prestador en tiempo real hasta tu domicilio.",
      PROVIDER_ARRIVED: "El prestador llego. Coordina el inicio desde el chat.",
      IN_PROGRESS: "Servicio en curso. El seguimiento queda guardado en la solicitud."
    };
    hint.textContent = hints[request.status] || "Seguimiento en tiempo real activo.";
  }
}

function renderRequestControls(state) {
  const selectedCategory = appConfig.categories.find((category) => category.id === state.ui.selectedCategoryId);
  const needsHours = isHourlyCategory(selectedCategory);
  const durationCard = document.querySelector(".duration-stepper-card");
  const requestedHoursValue = document.getElementById("requestedHoursValue");
  const requestedHoursInput = document.getElementById("requestedHoursInput");
  const currentRequestType = state.requestDraft.requestType || "IMMEDIATE";

  if (durationCard) {
    durationCard.hidden = !needsHours;
    durationCard.style.display = needsHours ? "" : "none";
    durationCard.setAttribute("aria-hidden", String(!needsHours));
  }

  const safeHours = needsHours
    ? Math.max(1, Number(state.requestDraft.requestedHours || 2))
    : 1;

  if (requestedHoursInput) {
    requestedHoursInput.value = String(safeHours);
  }

  if (requestedHoursValue) {
    requestedHoursValue.textContent = String(safeHours);
  }

  document.querySelectorAll("[data-request-type]").forEach((button) => {
    const active = button.dataset.requestType === currentRequestType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

export function renderClientScreen(state) {
  renderStatusBanner(state);
  renderAuth(state);
  renderAccountDrawer(state);
  renderEntryState(state);
  renderClientOnboarding(state);
  renderCategories(state);
  renderProvidersList(state);
  renderRequestSummary(state);
  renderFinancialPanel(state);
  renderMatchingPanel(state);
  renderProviderSpotlight(state);
  renderClientServiceHistory(state);
  renderNotifications(state);
  renderChat(state);
  renderMapStatus(state);
  renderClientLiveNavigation(state);
  renderRequestControls(state);
}
