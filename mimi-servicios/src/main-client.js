import { appConfig } from "./config.js";
import { initMap, updateClientMap } from "./services/map.js";
import {
  bootstrapSession,
  createRequest,
  loadActiveRequest,
  loadCategories,
  loadClientServiceHistory,
  loadConversationForRequest,
  loadClientRequestInsights,
  loadClientPhoneStatus,
  evaluateAuthRisk,
  getServicePin,
  loadMessages,
  loadNotifications,
  registerDevice,
  resolveServiceIntent,
  searchProviders,
  sendMessage,
  startClientPhoneVerification,
  submitServiceReview,
  updateRequestStatus,
  verifyClientPhoneCode
} from "./services/service-api.js";
import {
  buscarDireccionServicio,
  guardarFeedbackGeocodingServicio,
  obtenerRecentServicePlaces,
  resolverDireccionActualServicio
} from "./services/service-geocoding.js";
import { subscribeToClientRealtime } from "./services/realtime.js";
import { playNotificationSound } from "./services/sound.js";
import {
  getSupabaseClient,
  hasProviderAuthIntent,
  hasSupabaseEnv,
  redirectAfterLoginByRole,
  signInWithGoogle,
  signOut,
  subscribeToAuthChanges
} from "./services/supabase.js";
import { getMimiPushToken } from "./services/push.js";
import {
  loadCmsBanners,
  loadCmsFaqs,
  loadCmsFeatureFlags,
  loadCmsHomeSections,
  loadCmsServiceCategories
} from "./services/pocketbase-cms.js";
import { initObservability, markPerformance } from "./services/observability.js";
import {
  patchState,
  setState,
  state,
  subscribe
} from "./state/app-state.js";
import { renderClientScreen } from "./ui/render-client.js?v=2026.05.18.4";
import { cancelPayment, createPaymentIntent, getPaymentStatus } from "./payments/payment-api.js";
import {
  detectDefaultCountry,
  loadPhoneCountries,
  normalizePhoneNumber
} from "./utils/phone-countries.js";

let addressLookupToken = 0;
let intentLookupToken = 0;
let realtimeSubscription = null;
let authSubscription = null;
let phoneCollectorAbortController = null;
let deferredClientInstallPrompt = null;

const CLIENT_ONBOARDING_KEY = "mimi_services_client_onboarding_seen";
const PWA_INSTALLED_KEY = "mimi_services_pwa_installed";
const PWA_INSTALL_DISMISSED_KEY = "mimi_services_install_dismissed_until";
const CATEGORY_USAGE_KEY = "mimi_services_category_usage_v1";

initObservability("client");
markPerformance("client_module_loaded");

let clientMapInitPromise = null;

function ensureClientMap() {
  if (!clientMapInitPromise) {
    clientMapInitPromise = initMap("clientMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom)
      .catch((error) => {
        clientMapInitPromise = null;
        console.warn("[MIMI Cliente] mapa no disponible:", error?.message || error);
        return null;
      });
  }
  return clientMapInitPromise;
}

function updateClientMapWhenReady(payload) {
  ensureClientMap().then(() => updateClientMap(payload));
}

const NON_HOURLY_CATEGORY_MODELS = {
  GOMERIA_MOVIL: "BASE_VISIT",
  MECANICA_MOVIL: "BASE_VISIT",
  HERRERIA: "QUOTE",
  ABOGACIA: "QUOTE",
  CONTABILIDAD: "QUOTE",
  MUDANZAS: "QUOTE",
  JARDINERIA: "SQUARE_METER",
  PINTURA: "SQUARE_METER"
};

function sanitizeServiceRequestPayload(request = {}) {
  const clean = { ...(request ?? {}) };
  delete clean.service_pin_hash;
  delete clean.service_pin_ciphertext;
  delete clean.service_pin_attempts;
  delete clean.service_pin_locked_until;
  return clean;
}

const SERVICE_PIN_FETCH_STATUSES = new Set([
  "ACCEPTED",
  "SCHEDULED",
  "PROVIDER_EN_ROUTE",
  "PROVIDER_ARRIVED"
]);

const CLIENT_SELF_CANCEL_STATUSES = new Set([
  "SEARCHING",
  "PENDING_PROVIDER_RESPONSE",
  "PENDING",
  "ACCEPTED",
  "SCHEDULED",
  "PROVIDER_EN_ROUTE"
]);

const PAYMENT_CANCELABLE_STATUSES = new Set([
  "PENDING",
  "CHECKOUT_CREATED",
  "REJECTED"
]);

const PAYMENT_APPROVED_STATUSES = new Set([
  "APPROVED",
  "CAPTURED",
  "SETTLED"
]);

function activeRequestStatus(request = {}) {
  return String(request?.status || "").toUpperCase();
}

function canClientSelfCancelRequest(request = {}) {
  return Boolean(request?.id) && CLIENT_SELF_CANCEL_STATUSES.has(activeRequestStatus(request));
}

function canCancelPaymentLocally(payment = null) {
  return Boolean(payment?.id) && PAYMENT_CANCELABLE_STATUSES.has(String(payment?.status || "").toUpperCase());
}

function shouldFetchServicePin(request = {}) {
  return Boolean(request?.id) && SERVICE_PIN_FETCH_STATUSES.has(activeRequestStatus(request));
}

async function fetchServicePinForRequest(request, source = "hydrate") {
  if (!shouldFetchServicePin(request)) return null;

  try {
    return await getServicePin(request.id);
  } catch (error) {
    console.warn(`[MIMI] No se pudo obtener PIN de servicio (${source}):`, error);
    return null;
  }
}

async function refreshServicePinForRequest(request, source = "realtime") {
  const requestId = request?.id;

  if (!requestId) return;

  if (!shouldFetchServicePin(request)) {
    if (state.client.activeRequest?.id === requestId) {
      patchState("client.insights.servicePin", null);
    }
    return;
  }

  const servicePin = await fetchServicePinForRequest(request, source);

  if (state.client.activeRequest?.id === requestId) {
    patchState("client.insights.servicePin", servicePin);
  }
}

function openMercadoPagoCheckout(payment, source = "manual") {
  if (!payment?.checkout_url) return false;

  try {
    sessionStorage.setItem("mimigo_last_checkout_payment_id", String(payment.id || ""));
    sessionStorage.setItem("mimigo_last_checkout_source", source);
  } catch (_) {}

  window.location.assign(payment.checkout_url);
  return true;
}

const INTENT_CATEGORY_RULES = [
  { code: "PLOMERIA", terms: ["cano", "canio", "caño", "pincho un cano", "caneria", "agua", "perdida", "fuga", "gotea", "griferia", "bano", "baño", "inodoro", "pileta", "cocina", "destapar", "se rompio un cano", "se rompió un caño"] },
  { code: "PINTURA", terms: ["pintar", "pintura", "pintor", "pared", "living", "habitacion", "habitación", "humedad", "techo", "revoque", "casa", "frente", "quiero pintar"] },
  { code: "JARDINERIA", terms: ["pasto", "jardin", "jardín", "cortar el pasto", "cortar pasto", "poda", "plantas", "cesped", "césped", "patio", "maleza", "jardinero", "quiero cortar"] },
  { code: "ELECTRICIDAD", terms: ["luz", "no prende", "electricidad", "enchufe", "cable", "termica", "cortocircuito", "disyuntor", "lampara", "instalacion electrica"] },
  { code: "GASISTA", terms: ["gas", "olor a gas", "calefon", "cocina", "horno", "estufa", "termotanque", "gasista", "matriculado"] },
  { code: "INSTALACION_AIRE", terms: ["aire", "split", "acondicionado", "instalar aire", "instalacion de aire", "mantenimiento aire"] },
  { code: "REFRIGERACION", terms: ["heladera", "freezer", "frio", "no enfria", "refrigeracion", "camara frigorifica"] },
  { code: "LIMPIEZA", terms: ["limpiar", "limpieza", "mucama", "casa", "departamento", "oficina", "ordenar", "servicio domestico"] },
  { code: "CUIDADO_ADULTOS", terms: ["anciano", "adulto mayor", "cuidador", "acompanante", "familiar enfermo", "cuidar adulto", "abuelo", "abuela"] },
  { code: "CUIDADO_NINOS", terms: ["nino", "nina", "ninera", "chico", "cuidar chico", "cuidar nene", "bebes", "bebe", "hijo", "hija"] },
  { code: "ENFERMERIA", terms: ["enfermero", "enfermera", "curacion", "inyeccion", "salud", "medicacion", "familiar enfermo", "postoperatorio", "control"] },
  { code: "PSICOLOGIA", terms: ["psicologo", "psicologa", "psicologia", "terapia", "terapeuta", "ansiedad", "depresion", "panico", "angustia", "salud mental", "necesito hablar", "acompanamiento emocional"] },
  { code: "NUTRICION", terms: ["nutricionista", "nutricion", "alimentacion", "dieta", "bajar de peso", "subir de peso", "plan alimentario", "comer mejor"] },
  { code: "KINESIOLOGIA", terms: ["kinesiologo", "kinesiologia", "fisio", "fisioterapia", "rehabilitacion", "dolor muscular", "contractura", "lesion", "movilidad"] },
  { code: "ABOGACIA", terms: ["abogado", "abogada", "abogacia", "legal", "contrato", "laboral", "despido", "familia", "alquiler", "carta documento"] },
  { code: "CONTABILIDAD", terms: ["contador", "contadora", "contabilidad", "impuestos", "monotributo", "afip", "facturacion", "balances", "iva"] },
  { code: "CLASES_PARTICULARES", terms: ["profesor", "profesora", "clases", "apoyo escolar", "matematica", "ingles", "idiomas", "particular", "examen"] },
  { code: "TECNICO_PC", terms: ["pc", "computadora", "notebook", "impresora", "windows", "virus", "no enciende", "tecnico pc"] },
  { code: "TECNOLOGIA", terms: ["wifi", "router", "camara", "smart tv", "internet", "alarma", "domotica", "configurar"] },
  { code: "CERRAJERIA", terms: ["llave", "cerradura", "cerrajero", "puerta", "abrir", "trabo", "candado"] },
  { code: "MUDANZAS", terms: ["mudanza", "mover", "cargar", "flete", "traslado", "muebles", "cajas"] },
  { code: "MASCOTAS", terms: ["perro", "gato", "mascota", "pasear", "paseador", "veterinario", "cuidado mascota"] },
  { code: "GOMERIA_MOVIL", terms: ["pincho", "pinchadura", "rueda", "cubierta", "neumatico", "gomero", "gomeria", "auxilio"] },
  { code: "MECANICA_MOVIL", terms: ["mecanico", "auto", "no arranca", "bateria", "motor", "me quede tirado", "auxilio mecanico"] },
  { code: "HERRERIA", terms: ["herrero", "herreria", "reja", "porton", "soldadura", "metal", "estructura"] },
  { code: "ALBANILERIA", terms: ["albanil", "obra", "arreglo", "pared rota", "ladrillo", "cemento", "construccion"] },
  { code: "CARPINTERIA", terms: ["madera", "mueble", "puerta de madera", "carpintero", "estante", "placárd"] },
  { code: "BELLEZA", terms: ["belleza", "estetica", "maquillaje", "depilacion", "cejas"] },
  { code: "MANICURIA", terms: ["unas", "manos", "manicura", "manicuria", "esmaltado"] },
  { code: "PELUQUERIA", terms: ["pelo", "cabello", "corte", "peinado", "peluquero", "peluqueria", "color"] },
  { code: "MASAJISTA", terms: ["masaje", "contractura", "dolor de espalda", "relajante", "masajista"] }
];

function normalizeServiceIntent(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categoryIntentText(category) {
  return normalizeServiceIntent([
    category?.name,
    category?.code,
    category?.description,
    ...(Array.isArray(category?.aliases) ? category.aliases : [])
  ].join(" "));
}

function getCategoryUsage() {
  try {
    return JSON.parse(localStorage.getItem(CATEGORY_USAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function registerCategoryUsage(categoryId) {
  if (!categoryId) return;

  const usage = getCategoryUsage();
  usage[categoryId] = Number(usage[categoryId] || 0) + 1;
  localStorage.setItem(CATEGORY_USAGE_KEY, JSON.stringify(usage));
}

function findBestCategoryByIntent(rawText) {
  const query = normalizeServiceIntent(rawText);
  if (query.length < 3) return null;

  let best = null;
  let bestScore = 0;

  for (const category of appConfig.categories || []) {
    const haystack = categoryIntentText(category);
    let score = haystack.includes(query) ? 12 : 0;

    const rule = INTENT_CATEGORY_RULES.find((item) => item.code === category.code);
    if (rule?.terms?.some((term) => {
      const normalizedTerm = normalizeServiceIntent(term);
      return query.includes(normalizedTerm) || normalizedTerm.includes(query);
    })) {
      score += 34;
    }

    for (const word of query.split(" ")) {
      if (word.length > 3 && haystack.includes(word)) score += 8;
      if (word.length > 3 && rule?.terms?.some((term) => normalizeServiceIntent(term).startsWith(word))) {
        score += 10;
      }
    }

    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  return bestScore >= 12 ? best : null;
}

function selectCategoryById(categoryId, { keepSearch = true, intentResolution = undefined } = {}) {
  const nextCategory = appConfig.categories.find((category) => category.id === categoryId);
  if (!nextCategory) return false;

  const nextNeedsHours = categoryPricingModel(nextCategory) === "HOURLY";
  registerCategoryUsage(categoryId);

  setState((draft) => {
    draft.ui.selectedCategoryId = categoryId;
    draft.ui.showAllCategories = false;
    if (!keepSearch) draft.ui.categorySearchTerm = "";
    if (intentResolution !== undefined) draft.ui.intentResolution = intentResolution;
    draft.requestDraft.categoryId = categoryId;
    draft.requestDraft.requestedHours = nextNeedsHours
      ? Math.max(1, parseNumberOrFallback(draft.requestDraft.requestedHours, 2))
      : 1;
  });

  seedForm();
  return true;
}

function getSelectedCategory() {
  return appConfig.categories.find((category) => category.id === state.ui.selectedCategoryId) ?? null;
}

function categoryPricingModel(category) {
  if (!category) return "HOURLY";
  const explicit = category.default_pricing_model || category.pricing_model || category.pricingModel;
  const code = String(category.code || "").toUpperCase();
  return String(explicit || NON_HOURLY_CATEGORY_MODELS[code] || "HOURLY").toUpperCase();
}

function formatCurrency(value, currencyCode = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currencyCode || "ARS",
    maximumFractionDigits: 0
  }).format(Number(value ?? 0));
}

function textFromProvider(provider) {
  return (
    provider?.displayName ||
    provider?.public_name ||
    provider?.verified_first_name ||
    provider?.full_name ||
    provider?.name ||
    "Prestador disponible"
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function serviceModeLabel(value) {
  const mode = String(value || "").toUpperCase();
  if (mode === "ONLINE") return "Online";
  if (mode === "HYBRID") return "Online o presencial";
  if (mode === "IN_PERSON") return "Presencial";
  return "A coordinar";
}

function providerPricingModel(provider, pricing = null) {
  const selectedCategory = getSelectedCategory();
  return String(
    pricing?.pricing_model ||
    pricing?.pricingModel ||
    provider?.pricing_model ||
    provider?.pricingMode ||
    provider?.pricing_mode ||
    categoryPricingModel(selectedCategory)
  ).toUpperCase();
}

function providerUnitName(provider, pricing = null) {
  const model = providerPricingModel(provider, pricing);
  if (model === "SQUARE_METER") return "m2";
  if (model === "LINEAR_METER") return "metro lineal";
  if (model === "HOURLY") return "hora";
  const explicit = String(pricing?.unit_name || provider?.unit_name || "").trim();
  if (explicit) return explicit;
  if (model === "UNIT") return "unidad";
  return "";
}

function providerNeedsQuantity(provider, pricing = null) {
  return ["SQUARE_METER", "LINEAR_METER", "UNIT"].includes(providerPricingModel(provider, pricing));
}

function quantityCopyForProvider(provider, pricing = null) {
  const model = providerPricingModel(provider, pricing);
  if (model === "SQUARE_METER") {
    return {
      label: "Metros cuadrados aproximados",
      helper: "Ejemplo: si queres pintar una pared o ambiente, carga un estimado. Despues coordinan detalles.",
      unit: "m2",
      min: 1,
      step: 1,
      placeholder: "Ej: 20"
    };
  }
  if (model === "LINEAR_METER") {
    return {
      label: "Metros lineales aproximados",
      helper: "Carga un estimado para orientar el pedido. El prestador puede ajustar al coordinar.",
      unit: "metro lineal",
      min: 1,
      step: 1,
      placeholder: "Ej: 5"
    };
  }
  return {
    label: `Cantidad de ${providerUnitName(provider, pricing) || "unidades"}`,
    helper: "Carga una cantidad aproximada para orientar la solicitud.",
    unit: providerUnitName(provider, pricing) || "unidad",
    min: 1,
    step: 1,
    placeholder: "Ej: 1"
  };
}

function amountFromProvider(provider, pricing = null) {
  return Number(
    pricing?.provider_price ??
    provider?.provider_price ??
    provider?.unit_price ??
    provider?.price ??
    provider?.total_price ??
    0
  );
}

const MIMI_PLATFORM_FEE_PERCENT = 30;

function roundCurrencyAmount(value, currency = "ARS") {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (String(currency).toUpperCase() === "ARS") return Math.round(amount);
  return Math.round(amount * 100) / 100;
}

function buildLocalPricing(provider, { requestedHours = 1, quantity = 1, basePricing = null } = {}) {
  const model = providerPricingModel(provider, basePricing);
  const unitName = providerUnitName(provider, basePricing);
  const price = amountFromProvider(provider, basePricing);
  const currency = basePricing?.currency || provider?.currency || "ARS";
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const safeHours = Math.max(0.25, Number(requestedHours || 1));
  const isQuote = model === "QUOTE" || provider?.quote_required === true || basePricing?.quote_required === true;
  const multiplier = model === "HOURLY" ? safeHours : providerNeedsQuantity(provider, basePricing) ? safeQuantity : 1;
  const subtotal = isQuote ? 0 : roundCurrencyAmount(price * multiplier, currency);
  const platformFeePercent = Number(basePricing?.platform_fee_percent ?? provider?.platform_fee_percent ?? MIMI_PLATFORM_FEE_PERCENT);
  const platformFee = subtotal > 0 ? roundCurrencyAmount(subtotal * (platformFeePercent / 100), currency) : 0;

  return {
    eligible: true,
    provider_price: subtotal,
    unit_provider_price: price,
    platform_fee_percent: platformFeePercent,
    platform_fee: platformFee,
    total_price: subtotal + platformFee,
    client_total_amount: subtotal + platformFee,
    currency,
    offering_id: basePricing?.offering_id ?? provider?.offering_id ?? null,
    service_mode: basePricing?.service_mode ?? provider?.service_mode ?? null,
    pricing_model: model,
    unit_name: unitName || null,
    unit_quantity: providerNeedsQuantity(provider, basePricing) ? safeQuantity : null,
    session_duration_minutes:
      basePricing?.session_duration_minutes ??
      basePricing?.sessionDurationMinutes ??
      provider?.session_duration_minutes ??
      provider?.duration_minutes ??
      null,
    price_label: isQuote ? "A coordinar" : null
  };
}

function formatPricingTotal(pricing) {
  if (pricing?.price_label === "A coordinar" || String(pricing?.pricing_model || "").toUpperCase() === "QUOTE") {
    return "A coordinar";
  }
  return formatCurrency(pricing?.total_price, pricing?.currency || "ARS");
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

function upsertConfirmQuantityField(overlay, provider, pricing, onQuantityChange) {
  let container = overlay.querySelector("#confirmQuantityField");
  if (!providerNeedsQuantity(provider, pricing)) {
    container?.remove();
    return null;
  }

  if (!container) {
    container = document.createElement("label");
    container.id = "confirmQuantityField";
    container.className = "confirm-quantity-field";
    const summary = overlay.querySelector(".confirm-summary");
    summary?.insertAdjacentElement("afterend", container);
  }

  const copy = quantityCopyForProvider(provider, pricing);
  const initialQuantity = Number(pricing?.unit_quantity || 1);
  container.innerHTML = `
    <span>${copy.label}</span>
    <div>
      <input
        id="confirmUnitQuantity"
        type="number"
        inputmode="decimal"
        min="${copy.min}"
        step="${copy.step}"
        value="${initialQuantity}"
        placeholder="${copy.placeholder}"
      >
      <b>${copy.unit}</b>
    </div>
    <small>${copy.helper}</small>
  `;

  const input = container.querySelector("#confirmUnitQuantity");
  input?.addEventListener("input", () => onQuantityChange(Math.max(copy.min, Number(input.value || copy.min))));
  return input;
}

async function pricingForProviderSelection(provider, requestedHours) {
  // Preview local, source of truth server-side in svc-create-request.
  // This avoids legacy RPC pricing while keeping the local final total aligned with backend pricing.
  return buildLocalPricing(provider, { requestedHours, quantity: 1 });
}

function openRequestConfirmation(provider, initialPricing) {
  const overlay = document.getElementById("requestConfirmOverlay");
  const acceptButton = overlay?.querySelector("[data-confirm-provider='accept']");
  const cancelButton = overlay?.querySelector("[data-confirm-provider='cancel']");

  if (!overlay || !acceptButton || !cancelButton) {
    return Promise.resolve({ confirmed: window.confirm("Confirmas enviar la solicitud al prestador seleccionado?"), pricing: initialPricing });
  }

  const selectedCategory = getSelectedCategory();
  let pricing = { ...(initialPricing || {}) };
  document.getElementById("confirmProviderName").textContent = textFromProvider(provider);
  document.getElementById("confirmCategoryName").textContent = selectedCategory?.name || "Servicio";
  const compactAddress = compactServiceAddress(state.requestDraft.address);
  const confirmAddress = document.getElementById("confirmAddress");
  if (confirmAddress) {
    confirmAddress.textContent = compactAddress;
    confirmAddress.title = state.requestDraft.address || compactAddress;
  }
  const serviceMode = document.getElementById("confirmServiceMode");
  const sessionDuration = document.getElementById("confirmSessionDuration");

  acceptButton.disabled = false;
  cancelButton.disabled = false;
  acceptButton.classList.remove("is-loading");
  acceptButton.textContent = acceptButton.dataset.idleLabel || "Enviar solicitud";

  if (serviceMode) {
    serviceMode.textContent = serviceModeLabel(pricing?.service_mode || pricing?.serviceMode);
  }

  if (sessionDuration) {
    const minutes = Number(pricing?.session_duration_minutes ?? pricing?.sessionDurationMinutes ?? 0);
    sessionDuration.textContent = minutes > 0 ? `${minutes} min` : "A coordinar";
  }

  const totalEl = document.getElementById("confirmTotalPrice");
  const refreshTotal = (nextQuantity = pricing.unit_quantity || 1) => {
    pricing = buildLocalPricing(provider, {
      requestedHours: requestedHoursForCurrentCategory(),
      quantity: nextQuantity,
      basePricing: pricing
    });
    if (totalEl) totalEl.textContent = formatPricingTotal(pricing);
  };

  if (totalEl) totalEl.textContent = formatPricingTotal(pricing);
  upsertConfirmQuantityField(overlay, provider, pricing, refreshTotal);

  overlay.hidden = false;
  acceptButton.focus();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed) => {
      if (settled) return;
      settled = true;
      acceptButton.disabled = true;
      cancelButton.disabled = true;
      if (confirmed) {
        acceptButton.classList.add("is-loading");
        acceptButton.textContent = "Enviando...";
      }
      overlay.hidden = true;
      overlay.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeydown);
      resolve({ confirmed, pricing });
    };

    const onClick = (event) => {
      const action = event.target.closest("[data-confirm-provider]")?.dataset.confirmProvider;
      if (action === "accept") finish(true);
      if (action === "cancel" || event.target === overlay) finish(false);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };

    overlay.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeydown);
  });
}

function setRequestProgress({ visible = true, step = "sending", title = "", message = "", providerName = "" } = {}) {
  const overlay = document.getElementById("requestProgressOverlay");
  if (!overlay) return;

  overlay.hidden = !visible;
  if (!visible) return;

  const titleEl = document.getElementById("requestProgressTitle");
  const messageEl = document.getElementById("requestProgressMessage");
  const kickerEl = document.getElementById("requestProgressKicker");

  if (titleEl) titleEl.textContent = title || "Enviando solicitud...";
  if (messageEl) {
    messageEl.textContent = message || (
      providerName
        ? `Estamos notificando a ${providerName}.`
        : "Estamos preparando tu solicitud y notificando al prestador."
    );
  }
  if (kickerEl) kickerEl.textContent = providerName ? `Solicitud a ${providerName}` : "Solicitud en curso";

  overlay.querySelectorAll("[data-progress-step]").forEach((item) => {
    const name = item.dataset.progressStep;
    const done =
      (step === "notifying" && name === "sending") ||
      (step === "ready" && ["sending", "notifying"].includes(name));
    item.classList.toggle("is-active", name === step);
    item.classList.toggle("is-done", done);
  });
}

function hideRequestProgress() {
  setRequestProgress({ visible: false });
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function selectedCategoryNeedsHours() {
  return categoryPricingModel(getSelectedCategory()) === "HOURLY";
}

function requestedHoursForCurrentCategory() {
  return selectedCategoryNeedsHours()
    ? Math.max(1, parseNumberOrFallback(state.requestDraft.requestedHours, 2))
    : 1;
}

function hasConfirmedServiceAddress() {
  const address = String(state.requestDraft.address || "").trim();
  const lat = Number(state.requestDraft.lat);
  const lng = Number(state.requestDraft.lng);
  return address.length >= 5 && Number.isFinite(lat) && Number.isFinite(lng);
}

function requireConfirmedServiceAddress() {
  if (hasConfirmedServiceAddress()) return true;

  setState((draft) => {
    draft.client.providers = [];
    draft.ui.hasCompletedClientSearch = false;
    draft.meta.error = null;
    draft.meta.info = "Primero carga una direccion y elegi una sugerencia, o usa tu ubicacion actual.";
  });

  setClientView("home");

  window.setTimeout(() => {
    const input = document.getElementById("serviceAddressInput");
    input?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    input?.focus?.();
  }, 80);

  return false;
}

function setAiPromptVisualState(nextState, enabled = true) {
  const card = document.querySelector(".ai-prompt-card");
  if (!card) return;
  ["is-typing", "is-resolving", "is-success"].forEach((className) => {
    if (nextState !== className) card.classList.remove(className);
  });
  if (nextState) card.classList.toggle(nextState, Boolean(enabled));
}

async function resolveCategoryByBackendIntent(value) {
  const query = String(value ?? "").trim();
  const token = ++intentLookupToken;

  if (query.length < 3) {
    setAiPromptVisualState(null);
    return;
  }

  setAiPromptVisualState("is-resolving", true);

  const result = await resolveServiceIntent(query, { limit: 3 });

  if (token !== intentLookupToken || !result?.ok) {
    setAiPromptVisualState("is-resolving", false);
    return;
  }

  const categoryId = result.top_match?.category_id;

  if (categoryId && appConfig.categories.some((category) => category.id === categoryId)) {
    selectCategoryById(categoryId, {
      intentResolution: {
        query,
        topMatch: result.top_match,
        matches: Array.isArray(result.matches) ? result.matches : [],
        resolvedAt: new Date().toISOString()
      }
    });
    setAiPromptVisualState("is-success", true);
    window.setTimeout(() => setAiPromptVisualState("is-success", false), 900);
    return;
  }

  patchState("ui.intentResolution", {
    query,
    topMatch: result.top_match ?? null,
    matches: Array.isArray(result.matches) ? result.matches : [],
    resolvedAt: new Date().toISOString()
  });
  setAiPromptVisualState("is-resolving", false);
}

function scheduleBackendIntentResolution(value) {
  const token = ++intentLookupToken;

  window.setTimeout(() => {
    if (token !== intentLookupToken) return;

    resolveCategoryByBackendIntent(value).catch((error) => {
      setAiPromptVisualState("is-resolving", false);
      console.warn("[client] intent resolver unavailable", error);
    });
  }, 280);
}

function setupCategoryPlaceholderExamples() {
  const input = document.getElementById("categorySearchInput");
  // La demo typewriter controla los ejemplos. Evita dos timers pisándose.
  if (!input || input.dataset.placeholderReady === "1" || input.dataset.typewriterReady === "true") return;

  const examples = String(input.dataset.placeholderExamples || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (examples.length < 2) return;

  input.dataset.placeholderReady = "1";
  let index = Math.max(0, Math.floor(Math.random() * examples.length));

  const updatePlaceholder = () => {
    if (document.activeElement === input || input.value.trim()) return;
    input.placeholder = examples[index % examples.length];
    index += 1;
  };

  updatePlaceholder();
  window.setInterval(updatePlaceholder, 2800);
}

function exposeClientDebugApi() {
  window.MIMI = window.MIMI || {};
  window.MIMI.servicesClient = {
    mode: "client",
    getState: () => state,
    setView: (view) => setClientView(view, { behavior: "auto" }),
    openChat: () => openClientChat(),
    openSupport: () => toggleDrawer("supportDrawer", true),
    config: appConfig
  };
  window.MIMI_SERVICES_CLIENT = window.MIMI.servicesClient;
}

function currentUserId() {
  return state.session.userId ?? appConfig.demoClientUserId ?? null;
}

function currentConversationId() {
  return (
    state.client.activeConversationId ??
    state.client.activeRequest?.conversation_id ??
    null
  );
}

let infoAutoHideTimer = null;
let clientSupportConversationId = null;
const clientPendingActions = new Set();
let pendingReviewRequestId = null;
let selectedReviewRating = 5;

function setInfo(message, error = null) {
  setState((draft) => {
    draft.meta.info = message || null;
    draft.meta.error = error;
  });

  if (infoAutoHideTimer) {
    window.clearTimeout(infoAutoHideTimer);
    infoAutoHideTimer = null;
  }

  if (message && !error) {
    const messageSnapshot = message;
    infoAutoHideTimer = window.setTimeout(() => {
      setState((draft) => {
        if (draft.meta.info === messageSnapshot && !draft.meta.error) {
          draft.meta.info = null;
        }
      });
    }, 4200);
  }
}

function setButtonLoading(button, loading, loadingLabel, idleLabel = null) {
  if (!button) return;

  // Los botones con SVG interno (ej: ubicación actual) no deben perder el icono.
  // Antes se usaba textContent y eso borraba el SVG al presionar el pin.
  if (button.classList?.contains("address-locate-pin")) {
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
    button.setAttribute("aria-busy", String(loading));
    button.setAttribute(
      "aria-label",
      loading ? "Buscando tu ubicación actual" : "Usar mi ubicación actual"
    );
    button.title = loading ? "Buscando tu ubicación..." : "Usar mi ubicación actual";
    return;
  }

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = idleLabel ?? button.textContent ?? "";
  }

  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", String(loading));
  button.textContent = loading ? loadingLabel : button.dataset.idleLabel;
}

async function runClientAction(key, button, loadingLabel, idleLabel, action) {
  if (clientPendingActions.has(key)) {
    return null;
  }

  clientPendingActions.add(key);
  setButtonLoading(button, true, loadingLabel, idleLabel);

  try {
    return await action();
  } finally {
    setButtonLoading(button, false, loadingLabel, idleLabel);
    clientPendingActions.delete(key);
  }
}

function isRunningAsInstalledPwa() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  );
}

function isMobileAndroidBrowser() {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isMobile = isAndroid || /Mobi|Mobile|iPhone|iPad|iPod/i.test(ua);
  return isMobile && !isRunningAsInstalledPwa();
}

function isInstallDismissed() {
  const until = Number(localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) || 0);
  return Number.isFinite(until) && until > Date.now();
}

function dismissInstallBanner(days = 14) {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, String(until));
  setInstallButtonVisible(false);
}

function setInstallButtonVisible(visible) {
  const installBanner = document.getElementById("mimiInstallBanner");
  const installButton = document.getElementById("installButton");
  if (!installButton && !installBanner) return;

  const shouldShow =
    Boolean(visible) &&
    Boolean(deferredClientInstallPrompt) &&
    isMobileAndroidBrowser() &&
    !isInstallDismissed() &&
    localStorage.getItem(PWA_INSTALLED_KEY) !== "true";

  if (installBanner) {
    installBanner.hidden = !shouldShow;
    installBanner.setAttribute("aria-hidden", String(!shouldShow));
  }

  if (installButton) {
    installButton.hidden = !shouldShow;
    installButton.style.display = shouldShow ? "" : "none";
    installButton.setAttribute("aria-hidden", String(!shouldShow));
  }
}

function dismissClientOnboarding() {
  localStorage.setItem(CLIENT_ONBOARDING_KEY, "1");
  patchState("ui.showClientOnboarding", false);
}

function normalizeAuthError(error, fallbackMessage) {
  if (error?.code === "AUTH_REQUIRED") {
    return "Necesitás iniciar sesión con Google para continuar.";
  }

  if (error?.message === "SERVICE_LOCATION_REQUIRED") {
    return "Necesitamos una dirección valida del servicio para buscar prestadores.";
  }

  return error?.message || fallbackMessage;
}

async function refreshClientServiceHistory() {
  if (!state.session.userId) return [];

  const history = await loadClientServiceHistory(state.session.userId).catch((error) => {
    console.warn("[MIMI Cliente] historial no disponible:", error?.message ?? error);
    return state.client.serviceHistory ?? [];
  });

  setState((draft) => {
    draft.client.serviceHistory = history;
  });

  return history;
}

function paintReviewStars() {
  document.querySelectorAll("[data-review-rating]").forEach((button) => {
    const value = Number(button.dataset.reviewRating || 0);
    const active = value <= selectedReviewRating;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function openReviewDialog(requestId) {
  const request =
    state.client.activeRequest?.id === requestId
      ? state.client.activeRequest
      : (state.client.serviceHistory ?? []).find((item) => item.id === requestId);

  if (!request?.id) {
    setInfo(null, "No encontramos el servicio para calificar.");
    return;
  }

  if (String(request.status || "").toUpperCase() !== "COMPLETED") {
    setInfo(null, "Solo podes calificar servicios completados.");
    return;
  }

  if (request.review?.stars || request.review?.rating) {
    setInfo("Este servicio ya fue calificado.");
    return;
  }

  pendingReviewRequestId = request.id;
  selectedReviewRating = 5;

  const overlay = document.getElementById("reviewOverlay");
  const title = document.getElementById("reviewServiceTitle");
  const status = document.getElementById("reviewStatusText");

  if (title) {
    const category = request.svc_categories?.name || request.category_name || "Servicio";
    title.textContent = `Calificar ${category}`;
  }
  if (status) status.textContent = "Tu calificacion ayuda a ordenar mejor MIMI. Solo estrellas, sin comentarios publicos.";

  paintReviewStars();
  if (overlay) {
    overlay.hidden = false;
    window.setTimeout(() => document.querySelector("[data-review-rating='5']")?.focus(), 0);
  }
}

function closeReviewDialog() {
  const overlay = document.getElementById("reviewOverlay");
  if (overlay) overlay.hidden = true;
  pendingReviewRequestId = null;
  selectedReviewRating = 5;
}

async function submitCurrentReview() {
  if (!pendingReviewRequestId) {
    setInfo(null, "No hay un servicio seleccionado para calificar.");
    return;
  }

  const submitButton = document.getElementById("reviewSubmitButton");

  await runClientAction(
    `submit-review:${pendingReviewRequestId}`,
    submitButton,
    "Guardando...",
    "Guardar calificacion",
    async () => {
      const result = await submitServiceReview({
        requestId: pendingReviewRequestId,
        stars: selectedReviewRating
      });

      if (result?.ok === false) {
        throw new Error(result.error || "No se pudo guardar la calificacion.");
      }

      setState((draft) => {
        const requestId = pendingReviewRequestId;
        if (draft.client.activeRequest?.id === requestId) {
          draft.client.activeRequest = null;
        }
        draft.client.selectedProvider = null;
        draft.client.serviceHistory = (draft.client.serviceHistory ?? []).map((item) =>
          item.id === requestId
            ? { ...item, review: result.review ?? { stars: selectedReviewRating, rating: selectedReviewRating } }
            : item
        );
        draft.meta.info = "Gracias. La calificacion quedo guardada en tu historial.";
        draft.meta.error = null;
      });

      closeReviewDialog();
      await refreshClientServiceHistory();
      setupRealtime(null, null);
      return result;
    }
  );
}


let mimiBackStateReady = false;
let suppressDrawerHistory = false;

function hasOpenDrawer() {
  return Boolean(document.querySelector(".drawer.is-open"));
}

function ensureMimiBackState() {
  if (mimiBackStateReady) return;
  try {
    window.history.replaceState({ ...(window.history.state || {}), mimiClient: true }, "");
    mimiBackStateReady = true;
  } catch {
    mimiBackStateReady = true;
  }
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  if (!drawer) return false;

  const open = force ?? !drawer.classList.contains("is-open");

  if (!open && drawer.contains(document.activeElement)) {
    const fallbackButton =
      id === "notificationsDrawer"
        ? document.getElementById("notificationsButton")
        : id === "chatDrawer"
          ? document.getElementById("chatButton")
          : id === "supportDrawer"
            ? document.getElementById("openSupportDrawer")
            : id === "accountDrawer"
              ? document.getElementById("userSessionCard")
              : null;

    fallbackButton?.focus?.();
  }

  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));

  const controlId =
    id === "notificationsDrawer"
      ? "notificationsButton"
      : id === "chatDrawer"
        ? "chatButton"
        : id === "supportDrawer"
          ? "openSupportDrawer"
          : id === "accountDrawer"
            ? "userSessionCard"
            : null;

  if (controlId) {
    document.getElementById(controlId)?.setAttribute("aria-expanded", String(open));
  }

  if (open) {
    drawer.removeAttribute("inert");

    if (!suppressDrawerHistory) {
      ensureMimiBackState();
      try {
        window.history.pushState({ mimiClient: true, drawerId: id }, "");
      } catch {
        // Si el navegador no permite manipular history, el drawer igual abre.
      }
    }
  } else {
    drawer.setAttribute("inert", "");
  }

  return open;
}

function closeAllDrawers() {
  ["notificationsDrawer", "chatDrawer", "supportDrawer", "accountDrawer"].forEach((id) => {
    toggleDrawer(id, false);
  });
}

function setClientView(view = "home", options = {}) {
  const safeView = String(view || "home").trim() || "home";
  const behavior = options.behavior ?? "smooth";

  document.body.dataset.clientView = safeView;

  document.querySelectorAll("[data-client-view]").forEach((button) => {
    const active = button.dataset.clientView === safeView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  const targetByView = {
    home: "clientHero",
    services: "requestSummaryPanel",
    providers: "providerResults",
    activity: "requestSummaryPanel",
    support: "supportDrawer"
  };

  if (safeView === "support") {
    toggleDrawer("supportDrawer", true);
    return;
  }

  const targetId = targetByView[safeView];
  const target = targetId ? document.getElementById(targetId) : null;

  if (target) {
    target.scrollIntoView({
      behavior,
      block: "start"
    });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}

async function openClientChat() {
  toggleDrawer("chatDrawer", true);

  if (!state.chat.messages.length && currentConversationId()) {
    const messages = await loadMessages(currentConversationId());
    patchState("chat.messages", messages);
    patchState("chat.unreadCount", 0);
  }
}

function buildDeviceId() {
  let deviceId = localStorage.getItem("mimi_services_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("mimi_services_device_id", deviceId);
  }

  return deviceId;
}

async function registerCurrentDevice({ prompt = false } = {}) {
  if (!state.session.userId) return;

  try {
    const pushToken = await getMimiPushToken({ prompt });
    await registerDevice({
      deviceId: buildDeviceId(),
      pushToken,
      platform: "web",
      notificationsEnabled: Boolean(pushToken),
      marketingOptIn: false
    });
  } catch (error) {
    console.warn("[MIMI Cliente] device registration skipped:", error?.message ?? error);
  }
}

async function ensureClientSupportConversation() {
  if (clientSupportConversationId) return clientSupportConversationId;

  const supabase = getSupabaseClient();
  const userId = state.session.userId;
  if (!supabase || !userId) {
    throw new Error("LOGIN_REQUIRED");
  }

  const { data: existing, error: existingError } = await supabase
    .from("svc_conversations")
    .select("*")
    .eq("client_user_id", userId)
    .eq("app_context", "support")
    .eq("participant_role", "client")
    .eq("status", "OPEN")
    .contains("metadata_json", { support_type: "client_admin" })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  if (existing?.[0]?.id) {
    clientSupportConversationId = existing[0].id;
    return clientSupportConversationId;
  }

  const { data: created, error: createError } = await supabase
    .from("svc_conversations")
    .insert({
      client_user_id: userId,
      provider_user_id: null,
      status: "OPEN",
      app_context: "support",
      subject: "Soporte MIMI cliente",
      participant_role: "client",
      admin_status: "abierto",
      metadata_json: {
        support_type: "client_admin",
        source: "client_app"
      }
    })
    .select("*")
    .single();

  if (createError) throw createError;

  clientSupportConversationId = created?.id ?? null;
  return clientSupportConversationId;
}

function escapeSupportHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatSupportDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (_) {
    return "";
  }
}

function renderSupportThread(messages = []) {
  const thread = document.getElementById("supportThread");
  if (!thread) return;

  thread.innerHTML = messages.length
    ? messages
        .map((message) => `
          <article class="support-message ${message.sender_user_id === state.session.userId ? "is-own" : ""}">
            <strong>${message.sender_user_id === state.session.userId ? "Vos" : "Soporte MIMI"}</strong>
            <p>${escapeSupportHtml(message.body ?? "")}</p>
            <span>${escapeSupportHtml(formatSupportDate(message.created_at))}</span>
          </article>
        `)
        .join("")
    : `
      <article class="support-message">
        <strong>Soporte MIMI</strong>
        <p>Escribi tu consulta. El equipo la va a ver desde el panel admin.</p>
        <span>Canal privado</span>
      </article>
    `;
}

function retryDeviceRegistrationAfterUserGesture() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  document.addEventListener("click", () => {
    registerCurrentDevice({ prompt: false }).catch(() => {});
  }, { once: true });
}

async function showClientForegroundNotification(title, body, data = {}) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker?.ready;
    const options = {
      body: body || "",
      icon: "./assets/icons/mimigo-client-icon-192.png",
      badge: "./assets/icons/mimigo-client-icon-32.png",
      tag: data?.tag || `mimi-client-${data?.request_id || Date.now()}`,
      renotify: true,
      data: {
        url: "./cliente.html",
        ...(data || {})
      }
    };

    if (registration?.showNotification) {
      await registration.showNotification(title || "MIMI Servicios", options);
    } else {
      new Notification(title || "MIMI Servicios", options);
    }
  } catch (error) {
    console.warn("[MIMI Cliente] foreground notification skipped:", error);
  }
}

function parseNumberOrFallback(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function syncDraftFromForm() {
  patchState(
    "requestDraft.address",
    document.getElementById("serviceAddressInput")?.value?.trim() ?? ""
  );
  patchState(
    "requestDraft.lat",
    parseNumberOrFallback(
      document.getElementById("serviceLatInput")?.value,
      state.requestDraft.lat
    )
  );
  patchState(
    "requestDraft.lng",
    parseNumberOrFallback(
      document.getElementById("serviceLngInput")?.value,
      state.requestDraft.lng
    )
  );
  patchState(
    "requestDraft.requestType",
    document.getElementById("requestTypeSelect")?.value ?? "IMMEDIATE"
  );
  patchState(
    "requestDraft.scheduledFor",
    document.getElementById("scheduledForInput")?.value ?? ""
  );
  patchState(
    "requestDraft.requestedHours",
    selectedCategoryNeedsHours()
      ? parseNumberOrFallback(document.getElementById("requestedHoursInput")?.value, 2)
      : 1
  );
}


function setRequestTypeFromButton(value) {
  const safeType = value === "SCHEDULED" ? "SCHEDULED" : "IMMEDIATE";
  const select = document.getElementById("requestTypeSelect");

  if (select) {
    select.value = safeType;
  }

  patchState("requestDraft.requestType", safeType);
  updateScheduledVisibility();
  seedForm();

  if (safeType === "SCHEDULED") {
    document.getElementById("scheduledForInput")?.focus?.();
  }
}

function changeRequestedHours(stepValue) {
  const input = document.getElementById("requestedHoursInput");
  const current = parseNumberOrFallback(input?.value, state.requestDraft.requestedHours || 2);
  const min = parseNumberOrFallback(input?.min, 1);
  const max = parseNumberOrFallback(input?.max, 8);
  const step = parseNumberOrFallback(stepValue, 0);
  const next = Math.min(max, Math.max(min, current + step));

  if (input) {
    input.value = String(next);
  }

  patchState("requestDraft.requestedHours", next);
  seedForm();
}

function normalizeCategoryForMerge(category) {
  if (!category) return null;

  const code = String(category.code || category.name || category.id || "")
    .trim()
    .toUpperCase();

  if (!code) return null;

  return {
    id: category.id,
    code,
    name: category.name || code,
    description: category.description || "",
    aliases: Array.isArray(category.aliases) ? category.aliases : [],
    search_keywords: Array.isArray(category.search_keywords) ? category.search_keywords : [],
    default_pricing_model: normalizePricingModelForCategory(category.default_pricing_model || category.pricing_model || category.pricingModel),
    requires_provider_quote: Boolean(category.requires_provider_quote),
    source: category.source || ""
  };
}

function normalizePricingModelForCategory(value) {
  const model = String(value || "").trim().toUpperCase();
  return [
    "HOURLY",
    "BASE_VISIT",
    "QUOTE",
    "FIXED",
    "UNIT",
    "SQUARE_METER",
    "LINEAR_METER"
  ].includes(model)
    ? model
    : "";
}

function mergeCategories(remoteCategories = [], localCategories = []) {
  const byCode = new Map();

  localCategories
    .map(normalizeCategoryForMerge)
    .filter(Boolean)
    .forEach((category) => byCode.set(category.code, category));

  remoteCategories
    .map(normalizeCategoryForMerge)
    .filter(Boolean)
    .forEach((category) => {
      const fallback = byCode.get(category.code) ?? {};
      byCode.set(category.code, {
        ...fallback,
        ...category,
        id: shouldKeepTransactionalCategoryId(fallback, category) ? fallback.id : category.id,
        aliases: [
          ...(Array.isArray(fallback.aliases) ? fallback.aliases : []),
          ...(Array.isArray(category.aliases) ? category.aliases : [])
        ]
      });
    });

  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function shouldKeepTransactionalCategoryId(fallback = {}, category = {}) {
  if (!fallback.id || !isUuid(fallback.id)) return false;
  if (category.source === "pocketbase_cms") return true;
  return category.id && !isUuid(category.id);
}

function rankCategoriesForClient(categories = []) {
  const usage = getCategoryUsage();
  const priority = [
    "PLOMERIA",
    "ELECTRICIDAD",
    "LIMPIEZA",
    "JARDINERIA",
    "PINTURA",
    "GASISTA",
    "INSTALACION_AIRE",
    "CUIDADO_ADULTOS",
    "PSICOLOGIA",
    "NUTRICION"
  ];

  return [...categories].sort((a, b) => {
    const usageDiff = Number(usage[b.id] || 0) - Number(usage[a.id] || 0);
    if (usageDiff) return usageDiff;

    const aPriority = priority.includes(a.code) ? priority.indexOf(a.code) : 999;
    const bPriority = priority.includes(b.code) ? priority.indexOf(b.code) : 999;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

function seedForm() {
  const addressInput = document.getElementById("serviceAddressInput");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");
  const requestedHoursInput = document.getElementById("requestedHoursInput");
  const durationCard = document.querySelector(".duration-stepper-card");
  const requestTypeSelect = document.getElementById("requestTypeSelect");
  const scheduledForInput = document.getElementById("scheduledForInput");
  const needsHours = selectedCategoryNeedsHours();

  if (addressInput) {
    addressInput.value = state.requestDraft.address || "";
  }

  if (latInput) {
    latInput.value = Number.isFinite(Number(state.requestDraft.lat))
      ? String(state.requestDraft.lat)
      : "";
  }

  if (lngInput) {
    lngInput.value = Number.isFinite(Number(state.requestDraft.lng))
      ? String(state.requestDraft.lng)
      : "";
  }

  if (requestedHoursInput) {
    requestedHoursInput.value = String(requestedHoursForCurrentCategory());
  }

  const requestedHoursValue = document.getElementById("requestedHoursValue");
  if (requestedHoursValue) {
    requestedHoursValue.textContent = String(requestedHoursForCurrentCategory());
  }

  if (durationCard) {
    durationCard.hidden = !needsHours;
    durationCard.style.display = needsHours ? "" : "none";
    durationCard.setAttribute("aria-hidden", String(!needsHours));
  }

  if (requestTypeSelect) {
    requestTypeSelect.value = state.requestDraft.requestType;
  }

  document.querySelectorAll("[data-request-type]").forEach((button) => {
    const active = button.dataset.requestType === state.requestDraft.requestType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (scheduledForInput) {
    scheduledForInput.value = state.requestDraft.scheduledFor || "";
  }
}

function updateScheduledVisibility() {
  const wrapper = document.getElementById("scheduledForWrapper");
  if (!wrapper) return;

  wrapper.hidden = state.requestDraft.requestType !== "SCHEDULED";
}

function toggleClearAddressButton() {
  const addressInput = document.getElementById("serviceAddressInput");
  const clearButton = document.getElementById("btnClearServiceAddress");

  if (!addressInput || !clearButton) return;

  clearButton.hidden = !(addressInput.value || "").trim();
}

function renderServiceAddressSuggestions(items) {
  const container = document.getElementById("serviceAddressSuggestions");
  const addressInput = document.getElementById("serviceAddressInput");

  if (!container) return;

  if (!items.length) {
    container.innerHTML = "";
    container.hidden = true;
    container._items = [];
    addressInput?.setAttribute("aria-expanded", "false");
    return;
  }

  container.innerHTML = items
    .map(
      (item, index) => `
        <button
          type="button"
          class="suggestion-item"
          data-service-suggestion-index="${index}"
          role="option"
        >
          <strong>${item.display_name || item.dirección || "Direccion"}</strong>
          <span class="muted">${item.source || item.barrio || "Sugerencia"}</span>
        </button>
      `
    )
    .join("");

  container.hidden = false;
  container._items = items;
  addressInput?.setAttribute("aria-expanded", "true");
}

async function selectServiceAddressSuggestion(index) {
  const input = document.getElementById("serviceAddressInput");
  const suggestions = document.getElementById("serviceAddressSuggestions");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");
  const item = suggestions?._items?.[index];

  if (!item || !input || !latInput || !lngInput) return;

  const rawQuery = input.value;
  const address = item.display_name || item.dirección || "";
  const lat = Number(item.lat);
  const lng = Number(item.lon ?? item.lng);

  input.value = address;
  latInput.value = String(lat);
  lngInput.value = String(lng);

  renderServiceAddressSuggestions([]);
  toggleClearAddressButton();

  patchState("requestDraft.address", address);
  patchState("requestDraft.lat", lat);
  patchState("requestDraft.lng", lng);

  updateClientMapWhenReady({
    servicePosition: { lat, lng },
    providerPosition: state.tracking.providerPosition
  });

  await guardarFeedbackGeocodingServicio(rawQuery, item);
}

async function handleServiceAddressInput(event) {
  const value = event.target.value?.trim() || "";
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");

  toggleClearAddressButton();
  patchState("requestDraft.address", value);

  if (latInput) latInput.value = "";
  if (lngInput) lngInput.value = "";

  patchState("requestDraft.lat", null);
  patchState("requestDraft.lng", null);

  if (value.length < 2) {
    renderServiceAddressSuggestions(
      value.length === 0 ? obtenerRecentServicePlaces() : []
    );
    return;
  }

  const token = ++addressLookupToken;
  const result = await buscarDireccionServicio(value);

  if (token !== addressLookupToken) return;

  renderServiceAddressSuggestions(result.resultados || []);
}

function handleClearServiceAddress() {
  const addressInput = document.getElementById("serviceAddressInput");
  const latInput = document.getElementById("serviceLatInput");
  const lngInput = document.getElementById("serviceLngInput");

  if (addressInput) addressInput.value = "";
  if (latInput) latInput.value = "";
  if (lngInput) lngInput.value = "";

  patchState("requestDraft.address", "");
  patchState("requestDraft.lat", null);
  patchState("requestDraft.lng", null);

  renderServiceAddressSuggestions([]);
  toggleClearAddressButton();
}

async function handleUseCurrentServiceLocation() {
  const button = document.getElementById("btnUseCurrentServiceLocation");

  if (!navigator.geolocation) {
    throw new Error("Tu dispositivo no permite geolocalizacion.");
  }

  setButtonLoading(button, true, "...");

  try {
    // Usamos watchPosition: el primer fix suele venir de WiFi/IP (~50-200m),
    // y los siguientes del GPS (~5-20m). Esperamos hasta que la precisión sea
    // <= 30m o pasen 15s. maximumAge:0 fuerza un fix fresco (no del cache).
    const ACCURACY_TARGET_M = 30;
    const MAX_WAIT_MS = 15000;
    const position = await new Promise((resolve, reject) => {
      let watchId = null;
      let bestPosition = null;
      let timeoutId = null;
      let resolved = false;

      const finish = (pos) => {
        if (resolved) return;
        resolved = true;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (pos) resolve(pos);
        else reject(new Error("No se pudo obtener una ubicación precisa."));
      };

      timeoutId = setTimeout(() => finish(bestPosition), MAX_WAIT_MS);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = pos;
          }
          if (pos.coords.accuracy <= ACCURACY_TARGET_M) {
            finish(pos);
          }
        },
        (err) => {
          // Si watchPosition falla y no tenemos ningún fix, devolvemos el error
          if (!bestPosition) {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolved = true;
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: MAX_WAIT_MS,
          maximumAge: 0
        }
      );
    });

    console.log(`[MIMI] GPS accuracy: ${Math.round(position.coords.accuracy)}m`);

    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const addressInput = document.getElementById("serviceAddressInput");
    const latInput = document.getElementById("serviceLatInput");
    const lngInput = document.getElementById("serviceLngInput");

    if (addressInput) addressInput.value = "Ubicando dirección...";
    if (latInput) latInput.value = String(lat);
    if (lngInput) lngInput.value = String(lng);

    patchState("requestDraft.address", "Ubicando dirección...");
    patchState("requestDraft.lat", lat);
    patchState("requestDraft.lng", lng);

    updateClientMapWhenReady({
      servicePosition: { lat, lng },
      providerPosition: state.tracking.providerPosition
    });

    const resolved = await resolverDireccionActualServicio(lat, lng, {
      bias: { lat, lng }
    });

    const displayAddress =
      resolved?.display_name ||
      resolved?.dirección ||
      "Mi ubicación actual";

    if (addressInput) addressInput.value = displayAddress;
    if (latInput) latInput.value = String(lat);
    if (lngInput) lngInput.value = String(lng);

    patchState("requestDraft.address", displayAddress);
    patchState("requestDraft.lat", lat);
    patchState("requestDraft.lng", lng);

    renderServiceAddressSuggestions([]);
    toggleClearAddressButton();
  } finally {
    setButtonLoading(button, false, "...");
  }
}

async function hydrateLiveContext(activeRequestOverride) {
  const activeRequest =
    activeRequestOverride ??
    (await loadActiveRequest({
      userId: state.session.userId,
      providerId: null
    }));

  const providerId =
    activeRequest?.accepted_provider_id ??
    activeRequest?.selected_provider_id ??
    state.client.selectedProvider?.provider_id ??
    null;

  const conversation = activeRequest?.id
    ? await loadConversationForRequest(activeRequest.id)
    : null;

  const messages = conversation?.id
    ? await loadMessages(conversation.id)
    : [];

  const insights = activeRequest?.id
    ? await loadClientRequestInsights(activeRequest.id, providerId)
    : {
        paymentIntent: null,
        escrowHold: null,
        candidates: [],
        offers: [],
        providerProfile: null,
        providerPricing: [],
        providerReviews: [],
        providerCategories: []
      };

  const servicePin = await fetchServicePinForRequest(activeRequest, "hydrate");

  setState((draft) => {
    draft.client.activeRequest = activeRequest
      ? {
          ...draft.client.activeRequest,
          ...activeRequest,
          conversation_id:
            conversation?.id ??
            draft.client.activeRequest?.conversation_id ??
            null
        }
      : null;

    draft.client.activeConversationId = conversation?.id ?? null;
    draft.client.insights = {
      ...insights,
      servicePin
    };
    draft.chat.messages = messages;
    draft.chat.unreadCount = messages.filter(
      (message) =>
        !message.read_at && message.sender_user_id !== draft.session.userId
    ).length;

    if (activeRequest?.service_lat && activeRequest?.service_lng) {
      draft.tracking.clientPosition = {
        lat: activeRequest.service_lat,
        lng: activeRequest.service_lng
      };
    }
  });

  updateClientMapWhenReady({
    servicePosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition
  });

  setupRealtime(activeRequest?.id ?? null, conversation?.id ?? null);
}

async function hydrateClientCmsRuntime() {
  const featureFlags = await loadCmsFeatureFlags();

  window.MIMI_CMS_FEATURE_FLAGS = Object.freeze({ ...featureFlags });
  setState((draft) => {
    draft.meta.cmsFeatureFlags = featureFlags;
    draft.meta.cmsFlagsLoadedAt = new Date().toISOString();
  });

  if (featureFlags.enable_dynamic_categories !== false) {
    const cmsCategories = await loadCmsServiceCategories([]);
    if (Array.isArray(cmsCategories) && cmsCategories.length) {
      appConfig.categories = rankCategoriesForClient(
        mergeCategories(cmsCategories, appConfig.categories)
      );
      setState((draft) => {
        draft.meta.cmsLoadedAt = new Date().toISOString();
      });
    }
  }

  await hydrateClientCmsVisuals(featureFlags);
}

async function hydrateClientCmsVisuals(featureFlags = {}) {
  const [banners, homeSections, faqs] = await Promise.all([
    featureFlags.enable_home_banners === false ? [] : loadCmsBanners("client"),
    loadCmsHomeSections("client"),
    featureFlags.enable_faqs === false ? [] : loadCmsFaqs("client")
  ]);

  renderClientCmsVisuals({
    banners,
    homeSections,
    faqs,
    featureFlags
  });

  setState((draft) => {
    draft.meta.cmsClientVisualsLoadedAt = new Date().toISOString();
    draft.meta.cmsClientVisuals = {
      banners: Array.isArray(banners) ? banners.length : 0,
      homeSections: Array.isArray(homeSections) ? homeSections.length : 0,
      faqs: Array.isArray(faqs) ? faqs.length : 0
    };
  });
}

function renderClientCmsVisuals({ banners = [], homeSections = [], faqs = [] } = {}) {
  const panel = document.getElementById("clientCmsPanel");
  const kicker = document.getElementById("clientCmsKicker");
  const title = document.getElementById("clientCmsTitle");
  const body = document.getElementById("clientCmsBody");
  const cta = document.getElementById("clientCmsCta");
  const faqPanel = document.getElementById("clientCmsFaqPanel");
  const faqList = document.getElementById("clientCmsFaqList");

  const primary = firstActiveCmsItem(banners) || firstActiveCmsItem(homeSections);
  const supporting = firstActiveCmsItem(homeSections);

  if (panel && primary) {
    setElementText(kicker, safeClientCmsCopy(primary.placement === "provider" ? "MIMI Partners" : "MIMI Servicios", "MIMI Servicios", 40));
    setElementText(title, safeClientCmsCopy(primary.title, "Servicios disponibles en MIMI", 120));
    setElementText(
      body,
      safeClientCmsCopy(
        primary.subtitle || primary.body || supporting?.body || supporting?.subtitle,
        "MIMI conecta tu solicitud con prestadores independientes registrados en la plataforma.",
        220
      )
    );

    const route = primary.cta_url || primary.cta_route || primary.route || supporting?.route || "";
    if (cta && route) {
      cta.hidden = false;
      cta.textContent = safeClientCmsCopy(primary.cta_label || "Ver mas", "Ver mas", 40);
      cta.onclick = () => {
        window.location.href = route;
      };
    } else if (cta) {
      cta.hidden = true;
      cta.onclick = null;
    }

    panel.hidden = false;
  } else if (panel) {
    panel.hidden = true;
  }

  if (faqPanel && faqList) {
    const safeFaqs = (Array.isArray(faqs) ? faqs : [])
      .filter((item) => item?.active !== false)
      .slice(0, 3);

    faqList.replaceChildren(...safeFaqs.map((item) => {
      const node = document.createElement("article");
      const question = document.createElement("strong");
      const answer = document.createElement("span");
      question.textContent = safeClientCmsCopy(item.question, "Pregunta frecuente", 140);
      answer.textContent = safeClientCmsCopy(item.answer, "MIMI conecta usuarios con prestadores independientes.", 220);
      node.append(question, answer);
      return node;
    }));

    faqPanel.hidden = safeFaqs.length === 0;
  }
}

function firstActiveCmsItem(items = []) {
  return (Array.isArray(items) ? items : []).find((item) => item?.active !== false) ?? null;
}

function setElementText(element, value) {
  if (element) element.textContent = value || "";
}

function textFromCms(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeClientCmsCopy(value, fallback, maxLength = 180) {
  const text = textFromCms(value, maxLength);
  if (!text) return fallback;
  if (/pocketbase|mimi\s*cms|cms|contenido visual|actualizado desde/i.test(text)) {
    return fallback;
  }
  return text
    .replace(/servicios confiables/gi, "servicios disponibles")
    .replace(/prestadores verificados/gi, "prestadores registrados")
    .replace(/prestadores confiables/gi, "prestadores disponibles")
    .replace(/confiables/gi, "disponibles")
    .replace(/verificados/gi, "registrados");
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();

  if (session.isAuthenticated && hasProviderAuthIntent()) {
    window.location.replace("./prestador.html");
    return;
  }

  let categories = [];

  try {
    categories = await loadCategories();
  } catch (error) {
    console.warn("[MIMI Go] No se pudieron cargar categorías remotas, uso fallback local.", error);
    categories = appConfig.categories ?? [];
  }

  appConfig.categories = rankCategoriesForClient(
    mergeCategories(categories, appConfig.categories)
  );

  hydrateClientCmsRuntime().catch((error) => {
    if (window.MIMI_DEBUG_CMS) {
      console.warn("[MIMI CMS] Client visual fallback", error?.message || error);
    }
  });

  if (session.isAuthenticated && session.role === "provider") {
    // mismo usuario puede usar ambos modos; no redirigimos automaticamente
  }

  setState((draft) => {
    draft.session.userId = session.userId;
    draft.session.providerId = session.providerId;
    draft.session.role = "client";
    draft.session.userEmail = session.userEmail ?? null;
    draft.session.userName = session.userName ?? null;
    draft.session.userAvatar = session.userAvatar ?? null;
    draft.meta.backendMode = session.userId
      ? "supabase"
      : hasSupabaseEnv()
        ? "supabase"
        : "mock";
    draft.ui.appEntered =
      draft.meta.backendMode === "mock" ? true : Boolean(session.userId);
    draft.ui.showClientOnboarding =
      localStorage.getItem(CLIENT_ONBOARDING_KEY) !== "1";

    if (
      appConfig.categories.length &&
      !appConfig.categories.some(
        (item) => item.id === draft.ui.selectedCategoryId
      )
    ) {
      draft.ui.selectedCategoryId = appConfig.categories[0].id;
    }
  });

  const notifications = await loadNotifications(session.userId);

  setState((draft) => {
    draft.notifications.items = notifications;
  });

  await hydrateLiveContext();
  await refreshClientServiceHistory();
  await registerCurrentDevice({ prompt: false });
  retryDeviceRegistrationAfterUserGesture();

  if (!hasSupabaseEnv()) {
    setInfo(
      "La app esta funcionando en modo demo local. Cuando cargues las credenciales, se conecta al backend real."
    );
  } else if (!session.userId) {
    setInfo(
      "Ingresa con Google para ver categorías activas, buscar prestadores y usar el flujo real."
    );
  } else {
    setInfo("Sesión iniciada correctamente.");
  }
}

function registerInstallPrompt() {
  if (isRunningAsInstalledPwa()) {
    localStorage.setItem(PWA_INSTALLED_KEY, "true");
    deferredClientInstallPrompt = null;
    setInstallButtonVisible(false);
    return;
  }

  setInstallButtonVisible(false);

  window.addEventListener("beforeinstallprompt", (event) => {
    if (isRunningAsInstalledPwa()) {
      event.preventDefault();
      setInstallButtonVisible(false);
      return;
    }

    event.preventDefault();
    deferredClientInstallPrompt = event;
    setInstallButtonVisible(true);
  });

  document.getElementById("installButton")?.addEventListener("click", async () => {
    if (isRunningAsInstalledPwa()) {
      setInstallButtonVisible(false);
      return;
    }

    const promptEvent = deferredClientInstallPrompt;
    if (!promptEvent || typeof promptEvent.prompt !== "function") {
      setInfo("Chrome todavia no habilito la instalacion. Abri el menu del navegador y elegi Instalar app o Agregar a pantalla principal.");
      deferredClientInstallPrompt = null;
      setInstallButtonVisible(false);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    deferredClientInstallPrompt = null;
    if (choice?.outcome === "accepted") {
      localStorage.setItem(PWA_INSTALLED_KEY, "true");
      setInstallButtonVisible(false);
    } else {
      dismissInstallBanner(7);
    }
  });

  document.getElementById("installDismissButton")?.addEventListener("click", () => {
    dismissInstallBanner(14);
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(PWA_INSTALLED_KEY, "true");
    deferredClientInstallPrompt = null;
    setInstallButtonVisible(false);
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
    if (isRunningAsInstalledPwa()) {
      localStorage.setItem(PWA_INSTALLED_KEY, "true");
    }
    setInstallButtonVisible(false);
  });
}

async function handleAuthPrimary() {
  if (!hasSupabaseEnv()) {
    patchState("ui.appEntered", true);
    setInfo(
      "Entraste en modo demo. Cuando cargues tus claves de Supabase se habilita el flujo real."
    );
    return;
  }

  const consent = await confirmExternalGoogleAuth();
  if (!consent) return;

  await signInWithGoogle({ mode: "client" });
}

function confirmExternalGoogleAuth() {
  const overlay = document.getElementById("authConsentOverlay");
  const continueButton = document.getElementById("authConsentContinue");
  const cancelButton = document.getElementById("authConsentCancel");
  if (!overlay || !continueButton || !cancelButton) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = (value) => {
      if (settled) return;
      settled = true;
      overlay.hidden = true;
      document.body.classList.remove("auth-consent-open");
      continueButton.removeEventListener("click", onContinue);
      cancelButton.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      window.removeEventListener("keydown", onKeyDown);
      resolve(value);
    };

    const onContinue = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (event) => {
      if (event.target === overlay) cleanup(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") cleanup(false);
    };

    continueButton.addEventListener("click", onContinue);
    cancelButton.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("auth-consent-open");
    overlay.hidden = false;
    window.setTimeout(() => continueButton.focus(), 30);
  });
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  syncDraftFromForm();

  if (!requireConfirmedServiceAddress()) return;

  if (!state.ui.selectedCategoryId && appConfig.categories?.[0]?.id) {
    patchState("ui.selectedCategoryId", appConfig.categories[0].id);
  }

  registerCategoryUsage(state.ui.selectedCategoryId);
  await ensureSelectedCategoryHasBackendId();

  if (hasSupabaseEnv() && !isUuid(state.ui.selectedCategoryId)) {
    const selectedCategory = getSelectedCategory();
    setState((draft) => {
      draft.client.providers = [];
      draft.ui.hasCompletedClientSearch = false;
      draft.meta.error = null;
      draft.meta.info = `No pudimos sincronizar ${selectedCategory?.name || "esta categoria"} con el catalogo activo. Actualiza la pantalla y volve a intentar.`;
      draft.meta.lastSearchAt = new Date().toISOString();
    });
    setClientView("providers");
    return;
  }

  const searchButton = document.getElementById("searchProvidersButton");

  if (clientPendingActions.has("search-providers")) {
    return;
  }

  clientPendingActions.add("search-providers");

  setButtonLoading(
    searchButton,
    true,
    "Buscando...",
    "Buscar prestadores"
  );

  try {
    const providers = await searchProviders(
      state.ui.selectedCategoryId,
      {
        ...state.requestDraft,
        requestedHours: requestedHoursForCurrentCategory(),
        sortMode: state.ui.providerSortMode || "recommended"
      }
    );

    setState((draft) => {
      draft.client.providers = providers;
      draft.ui.selectedProviderCandidateId =
        providers[0]?.provider_id ?? draft.ui.selectedProviderCandidateId ?? null;
      draft.ui.hasCompletedClientSearch = providers.length > 0;
      draft.meta.error = null;
      draft.meta.info = providers.length
        ? "Encontramos prestadores compatibles. Revisalos antes de enviar la solicitud."
        : "No encontramos prestadores disponibles ahora para este criterio.";
      draft.meta.lastSearchAt = new Date().toISOString();
    });

    if (providers.length) {
      setClientView("providers");
    }
  } finally {
    setButtonLoading(
      searchButton,
      false,
      "Buscando...",
      "Buscar prestadores"
    );
    clientPendingActions.delete("search-providers");
  }
}

async function ensureSelectedCategoryHasBackendId() {
  if (!hasSupabaseEnv() || isUuid(state.ui.selectedCategoryId)) {
    return getSelectedCategory();
  }

  const selectedCategory = getSelectedCategory();
  const selectedCode = selectedCategory?.code;

  if (!selectedCode) return selectedCategory;

  try {
    const remoteCategories = await loadCategories();
    appConfig.categories = rankCategoriesForClient(
      mergeCategories(remoteCategories, appConfig.categories)
    );

    const matchedCategory = appConfig.categories.find(
      (category) => category.code === selectedCode && isUuid(category.id)
    );

    if (matchedCategory?.id) {
      patchState("ui.selectedCategoryId", matchedCategory.id);
      return matchedCategory;
    }
  } catch (error) {
    console.warn("[MIMI Go] No se pudo resincronizar categoria", error);
  }

  return getSelectedCategory();
}

async function handleProviderSelection(providerId) {
  console.log("[MIMI Solicitar] step 1: clicked provider", { providerId });
  if (!requireConfirmedServiceAddress()) return false;

  const provider = state.client.providers.find(
    (item) => item.provider_id === providerId
  );

  if (!provider) {
    console.warn("[MIMI Solicitar] step 1 FAIL: provider not found in state");
    return false;
  }
  console.log("[MIMI Solicitar] step 2: provider found", {
    name: provider.name || provider.full_name,
    pricing_model: provider.pricing_model,
    quote_required: provider.quote_required,
    price: provider.price ?? provider.total_price ?? provider.provider_price
  });

  const requestedHours = requestedHoursForCurrentCategory();
  console.log("[MIMI Solicitar] step 3: calling pricing edge", { requestedHours });

  let pricing;
  try {
    pricing = await pricingForProviderSelection(provider, requestedHours);
    console.log("[MIMI Solicitar] step 3 OK: pricing received", pricing);
  } catch (err) {
    console.error("[MIMI Solicitar] step 3 FAIL: pricing error", err);
    throw err;
  }

  if (!pricing?.eligible) {
    console.warn("[MIMI Solicitar] step 3 FAIL: not eligible", { reason: pricing?.reason, pricing });
    throw new Error(
      `No se pudo confirmar el prestador: ${pricing?.reason ?? "pricing_error"}`
    );
  }

  console.log("[MIMI Solicitar] step 4: opening confirmation overlay");
  const confirmation = await openRequestConfirmation(provider, pricing);
  if (!confirmation?.confirmed) {
    console.log("[MIMI Solicitar] step 4 CANCELLED by user");
    setInfo("Solicitud no enviada. Podes revisar la categoria, direccion o elegir otro prestador.");
    return false;
  }
  const progressStartedAt = Date.now();
  const providerName = textFromProvider(provider);
  const categoryName = getSelectedCategory()?.name || "servicio";
  setRequestProgress({
    visible: true,
    step: "sending",
    title: "Enviando solicitud...",
    message: `Estamos armando la solicitud de ${categoryName} y validando los datos.`,
    providerName
  });

  const pushRegistration = registerCurrentDevice({ prompt: true }).catch(() => {});
  pricing = confirmation.pricing || pricing;
  console.log("[MIMI Solicitar] step 5: creating request");

  const request = await createRequest({
    categoryId: state.ui.selectedCategoryId,
    selectedProviderId: provider.provider_id,
    address: state.requestDraft.address,
    serviceLat: state.requestDraft.lat,
    serviceLng: state.requestDraft.lng,
    requestType: state.requestDraft.requestType,
    scheduledFor: state.requestDraft.scheduledFor || null,
    requestedHours,
    notes: state.ui.categorySearchTerm || null,
    providerPrice: pricing.provider_price,
    platformFee: pricing.platform_fee,
    totalPrice: pricing.total_price,
    currency: pricing.currency,
    offeringId: pricing.offering_id,
    serviceMode: pricing.service_mode,
    pricingModel: pricing.pricing_model,
    unitName: pricing.unit_name,
    unitQuantity: pricing.unit_quantity,
    sessionDurationMinutes: pricing.session_duration_minutes,
    priceLabel: pricing.price_label
  });
  console.log("[MIMI Solicitar] step 5 OK: request created", { request });
  setRequestProgress({
    visible: true,
    step: "notifying",
    title: "Solicitud enviada",
    message: `Estamos notificando a ${providerName} para que responda desde su panel.`,
    providerName
  });

  let paymentIntent = null;

  // Solo crear payment intent si hay un total > 0.
  // Usamos el total del REQUEST guardado (snapshot real), no el local.
  // Si la edge function lo guardó en 0 (ej: quote_required sin precio), saltamos
  // el payment intent — lo creamos después cuando se acuerde el monto.
  const totalForPayment = Number(
    request?.total_price_snapshot ??
    request?.totalPrice ??
    pricing.total_price ??
    0
  );
  if (totalForPayment > 0) {
    try {
      console.log("[MIMI Solicitar] step 6: creating payment intent", { total: totalForPayment });
      paymentIntent = await createPaymentIntent({
        serviceRequestId: request?.id ?? request?.request_id,
        contextType: "SERVICE_REQUEST"
      });
      console.log("[MIMI Solicitar] step 6 OK: payment intent created");
    } catch (error) {
      console.warn("[MIMI Go] No se pudo crear intento de pago mock/payment-agnostic.", error);
    }
  } else {
    console.log("[MIMI Solicitar] step 6 SKIPPED: precio a coordinar (total=0). Payment se crea cuando se defina el monto.");
  }

  setState((draft) => {
    draft.client.selectedProvider = provider;
    draft.client.activeRequest = {
      ...request,
      providerName,
      requestType: draft.requestDraft.requestType,
      requestedHours,
      total_price: pricing.total_price,
      offering_id: pricing.offering_id ?? null,
      service_mode: pricing.service_mode ?? null,
      pricing_model: pricing.pricing_model ?? null,
      unit_name: pricing.unit_name ?? null,
      unit_quantity: pricing.unit_quantity ?? null,
      session_duration_minutes: pricing.session_duration_minutes ?? null,
      price_label: pricing.price_label ?? null,
      conversation_id: request?.conversation_id ?? null
    };
    draft.client.insights.paymentIntent = paymentIntent;
    draft.client.insights.providerProfile = {
      bio: provider.bio ?? null,
      city: provider.city ?? null,
      province: provider.province ?? null,
      pricing_mode: provider.pricing_mode ?? null,
      accepts_immediate: provider.accepts_immediate ?? null,
      accepts_scheduled: provider.accepts_scheduled ?? null,
      max_hours_per_service: provider.maximum_hours ?? null
    };
    draft.tracking.clientPosition = {
      lat: draft.requestDraft.lat,
      lng: draft.requestDraft.lng
    };
    draft.meta.error = null;
    draft.meta.info = paymentIntent?.checkout_url
      ? "Solicitud creada. Pago requerido para confirmar. Abrilo en Mercado Pago y volve a MIMIGO para verificarlo."
      : "Solicitud creada correctamente.";
  });

  setRequestProgress({
    visible: true,
    step: "ready",
    title: "Preparando seguimiento",
    message: "Ya creamos la solicitud. Ahora abrimos el estado en vivo para que sigas la respuesta.",
    providerName
  });
  await hydrateLiveContext(request);
  setClientView("services", { behavior: "auto" });
  await delay(Math.max(360, 820 - (Date.now() - progressStartedAt)));
  hideRequestProgress();
  if (paymentIntent?.checkout_url) {
    setInfo("Pago requerido para confirmar. Te llevamos a Mercado Pago y despues volves a MIMIGO para verificarlo.");
    openMercadoPagoCheckout(paymentIntent, "request_created");
  }
  pushRegistration.catch(() => {});
  return true;
}

async function handleRequestAction(action) {
  if (action === "refresh") {
    await hydrateLiveContext();
    await refreshClientServiceHistory();
    setInfo("Estado actualizado. Si el prestador respondio, lo vas a ver aca.");
    return;
  }

  if (action === "rate") {
    const requestId = state.client.activeRequest?.id;
    if (requestId) {
      openReviewDialog(requestId);
      return;
    }
    setInfo("Elegi un servicio completado desde el historial para calificar.");
    return;
  }

  if (action !== "cancel") return;

  const requestId = state.client.activeRequest?.id;
  const payment = state.client.insights?.paymentIntent ?? null;
  console.log("[MIMI Cancel] step 1: cancel clicked", {
    requestId,
    hasActiveRequest: !!state.client.activeRequest,
    requestStatus: state.client.activeRequest?.status,
    paymentId: payment?.id,
    paymentStatus: payment?.status
  });

  if (!requestId) {
    console.warn("[MIMI Cancel] BLOCKED: no hay request activo en state.client.activeRequest");
    setInfo(null, "No hay una solicitud activa para cancelar.");
    return;
  }

  if (!canClientSelfCancelRequest(state.client.activeRequest)) {
    setInfo(null, "Esta solicitud ya no se puede cancelar desde la app. Contacta soporte para revisar el caso.");
    return;
  }

  const paymentStatus = String(payment?.status || "").toUpperCase();
  if (payment?.id && PAYMENT_APPROVED_STATUSES.has(paymentStatus)) {
    setInfo(null, "El pago ya fue confirmado. Contacta soporte para cancelar y revisar la devolucion.");
    return;
  }

  try {
    console.log("[MIMI Cancel] step 2: calling cancel edge");
    const result = await updateRequestStatus(appConfig.functions.cancelRequest, {
      request_id: requestId,
      reason: "cancelled_from_client_ui"
    });
    console.log("[MIMI Cancel] step 2 OK: cancel edge response", result);
  } catch (err) {
    console.error("[MIMI Cancel] step 2 FAIL:", err);
    setInfo(null, `No se pudo cancelar: ${err?.message || "error desconocido"}`);
    throw err;
  }

  let paymentCancelled = false;
  let paymentCancelFailed = false;
  if (canCancelPaymentLocally(payment)) {
    try {
      console.log("[MIMI Cancel] step 3: cancelling pending payment", { paymentId: payment.id });
      const updatedPayment = await cancelPayment(payment.id, "service_request_cancelled_from_client_ui");
      paymentCancelled = String(updatedPayment?.status || "").toUpperCase() === "CANCELLED";
      patchState("client.insights.paymentIntent", updatedPayment);
    } catch (paymentError) {
      paymentCancelFailed = true;
      console.warn("[MIMI Cancel] payment cancel failed:", paymentError);
      setInfo("Solicitud cancelada. No pudimos cerrar el pago pendiente automaticamente; soporte puede revisarlo.");
    }
  }

  setState((draft) => {
    if (draft.client.activeRequest) {
      draft.client.activeRequest.status = "CANCELLED";
    }
    draft.client.selectedProvider = null;
    draft.meta.info = payment?.id
      ? paymentCancelled
        ? "Solicitud y pago pendiente cancelados correctamente."
        : paymentCancelFailed
          ? "Solicitud cancelada. El pago pendiente quedo para revision."
        : "Solicitud cancelada correctamente."
      : "Solicitud cancelada correctamente.";
  });

  await hydrateLiveContext();
  console.log("[MIMI Cancel] step 4 OK: state actualizado y context refrescado");
}

function openProviderSortSheet() {
  const overlay = document.getElementById("providerSortOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  const mode = state.ui.providerSortMode || "recommended";
  overlay.querySelectorAll("[data-provider-sort]").forEach((button) => {
    const active = button.dataset.providerSort === mode;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function closeProviderSortSheet() {
  const overlay = document.getElementById("providerSortOverlay");
  if (overlay) overlay.hidden = true;
}

function selectProviderSortMode(mode) {
  const allowed = new Set(["recommended", "distance", "rating", "price"]);
  const sortMode = allowed.has(mode) ? mode : "recommended";
  patchState("ui.providerSortMode", sortMode);
  closeProviderSortSheet();
  setInfo(`Prestadores ordenados por ${
    sortMode === "distance" ? "distancia" :
    sortMode === "rating" ? "calificacion" :
    sortMode === "price" ? "precio" :
    "mejor match"
  }.`);
}

async function handlePaymentAction(action) {
  const payment = state.client.insights?.paymentIntent;

  if (!payment?.id) {
    throw new Error("No hay intento de pago activo.");
  }

  if (action === "checkout") {
    if (payment.checkout_url) {
      openMercadoPagoCheckout(payment, "payment_button");
      return;
    }

    setInfo("Pago requerido para confirmar. No encontramos el link de checkout, actualiza el estado del pago.");
    return;
  }

  if (action === "refresh") {
    const updated = await getPaymentStatus(payment.id);
    patchState("client.insights.paymentIntent", updated);
    const status = String(updated?.status || "").toUpperCase();
    if (["APPROVED", "CAPTURED", "SETTLED"].includes(status)) {
      setInfo("Pago confirmado. Mercado Pago aprobo la operacion.");
    } else if (updated?.sync_warning) {
      setInfo("Estamos verificando el pago. Conservamos el estado local hasta recibir confirmacion de Mercado Pago.");
    } else if (["REJECTED", "CANCELLED", "FAILED"].includes(status)) {
      setInfo(null, "Pago no completado. Podes volver a intentarlo desde MIMIGO.");
    } else {
      setInfo("Pago pendiente. El servicio se confirma cuando Mercado Pago informa aprobacion.");
    }
    return;
  }

  if (action === "cancel") {
    if (state.client.activeRequest?.id) {
      await handleRequestAction("cancel");
      return;
    }
    const updated = await cancelPayment(payment.id);
    patchState("client.insights.paymentIntent", updated);
  }
}

async function handlePaymentReturnFromUrl(sourceUrl = window.location.href) {
  const url = new URL(sourceUrl, window.location.origin);
  const paymentResult = String(
    url.searchParams.get("payment") ||
      url.searchParams.get("collection_status") ||
      url.searchParams.get("status") ||
      ""
  ).toLowerCase();

  const handledReturnModes = new Set([
    "payment=success",
    "payment=failure",
    "payment=pending",
    "success",
    "approved",
    "failure",
    "failed",
    "rejected",
    "pending"
  ]);
  const directMode = url.searchParams.get("payment") ? `payment=${paymentResult}` : paymentResult;
  if (!handledReturnModes.has(directMode)) return false;

  const providerPaymentId =
    url.searchParams.get("payment_id") ||
    url.searchParams.get("collection_id") ||
    url.searchParams.get("provider_payment_id") ||
    "";
  const preferenceId = url.searchParams.get("preference_id") || "";
  const localPaymentId =
    url.searchParams.get("external_reference") ||
    state.client.insights?.paymentIntent?.id ||
    "";

  if (directMode === "payment=failure" || ["failure", "failed", "rejected"].includes(paymentResult)) {
    setInfo(null, "Pago no completado. Si Mercado Pago rechazo o cancelaste el pago, podes intentarlo nuevamente.");
  } else if (directMode === "payment=pending" || paymentResult === "pending") {
    setInfo("Pago pendiente. Mercado Pago todavia esta procesando la operacion.");
  } else {
    setInfo("Estamos verificando el pago con Mercado Pago.");
  }

  if (localPaymentId) {
    try {
      const updated = await getPaymentStatus(localPaymentId, {
        providerPaymentId,
        preferenceId
      });
      patchState("client.insights.paymentIntent", updated);
      const status = String(updated?.status || "").toUpperCase();
      if (["APPROVED", "CAPTURED", "SETTLED"].includes(status)) {
        setInfo("Pago confirmado. Mercado Pago aprobo la operacion.");
      } else if (["REJECTED", "CANCELLED", "FAILED"].includes(status)) {
        setInfo(null, "Pago no completado. Podes volver a intentarlo desde MIMIGO.");
      } else if (updated?.sync_warning) {
        setInfo("Estamos verificando el pago. Seguimos mostrando el estado local hasta recibir confirmacion.");
      } else {
        setInfo("Pago pendiente. El pago todavia no esta aprobado.");
      }
    } catch (error) {
      console.warn("[MIMI Pago] no se pudo sincronizar retorno Mercado Pago:", error);
      setInfo("Estamos verificando el pago. Si no se actualiza, toca Actualizar pago en unos segundos.");
    }
  }

  ["payment", "collection_status", "status", "payment_id", "collection_id", "provider_payment_id", "preference_id", "external_reference", "merchant_order_id"].forEach((key) => {
    url.searchParams.delete(key);
  });
  history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  return true;
}


function startCategoryPlaceholderDemo() {
  const input = document.getElementById("categorySearchInput");
  const ghost = document.getElementById("aiPromptGhost");
  const label = document.getElementById("aiPromptLabel");
  if (!input || input.dataset.typewriterReady === "true") return;

  input.dataset.typewriterReady = "true";

  const labelText = String(label?.dataset.labelText || label?.textContent || "¿Qué necesitás resolver?");
  if (label) {
    label.textContent = "";
    let labelIndex = 0;
    const typeLabel = () => {
      label.textContent = labelText.slice(0, labelIndex);
      if (labelIndex < labelText.length) {
        labelIndex += 1;
        window.setTimeout(typeLabel, 95);
      }
    };
    window.setTimeout(typeLabel, 320);
  }

  const examples = String(input.dataset.placeholderExamples || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const demoExamples = [
    "Mi computadora no funciona y necesito un técnico",
    "Se me rompió un caño del baño",
    "Necesito una niñera para la tarde",
    ...examples
  ];

  const uniqueExamples = [...new Set(demoExamples)].slice(0, 9);
  if (!uniqueExamples.length) return;

  const syncGhostVisibility = () => {
    const hide = Boolean(input.value.trim()) || document.activeElement === input;
    const wrap = input.closest(".ai-prompt-input-wrap");
    wrap?.classList.toggle("has-user-text", hide);
    const hasText = Boolean(input.value.trim());
    wrap?.classList.toggle("is-typing", hasText);
    setAiPromptVisualState("is-typing", hasText);
  };

  input.addEventListener("focus", syncGhostVisibility);
  input.addEventListener("blur", syncGhostVisibility);
  input.addEventListener("input", syncGhostVisibility);

  let exampleIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const paint = (value) => {
    if (ghost) ghost.textContent = value;
    input.placeholder = ghost ? "" : value;
  };

  const tick = () => {
    if (document.activeElement === input || input.value.trim()) {
      syncGhostVisibility();
      window.setTimeout(tick, 900);
      return;
    }

    input.closest(".ai-prompt-input-wrap")?.classList.remove("has-user-text");
    const text = uniqueExamples[exampleIndex] || "";
    paint(text.slice(0, charIndex) || "Contanos... ¿qué te pasó?");

    if (!deleting && charIndex < text.length) {
      charIndex += 1;
      window.setTimeout(tick, 125);
      return;
    }

    if (!deleting && charIndex >= text.length) {
      deleting = true;
      window.setTimeout(tick, 2600);
      return;
    }

    if (deleting && charIndex > 0) {
      charIndex -= 1;
      window.setTimeout(tick, 55);
      return;
    }

    deleting = false;
    exampleIndex = (exampleIndex + 1) % uniqueExamples.length;
    paint("");
    // Pausa limpia entre un ejemplo y el siguiente: no se enciman los textos.
    window.setTimeout(tick, 1100);
  };

  tick();
}

function bindBasicControls() {
  ensureMimiBackState();
  startCategoryPlaceholderDemo();

  window.addEventListener("popstate", () => {
    if (hasOpenDrawer()) {
      suppressDrawerHistory = true;
      closeAllDrawers();
      suppressDrawerHistory = false;
      return;
    }

    setClientView("home", { behavior: "auto" });
  });

  document.querySelectorAll("[data-auth-action='login']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await handleAuthPrimary();
      } catch (error) {
        setInfo(null, normalizeAuthError(error, "No se pudo iniciar sesión."));
      }
    });
  });

  document.getElementById("authSecondaryButton")?.addEventListener("click", async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo cerrar la sesión."));
    }
  });

  document.getElementById("userSessionCard")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeAllDrawers();
    toggleDrawer("accountDrawer", true);
  });

  document.getElementById("changePhoneButton")?.addEventListener("click", async (event) => {
    event.preventDefault();
    closeAllDrawers();
    try {
      await setupPhoneCollector({ force: true });
    } catch (error) {
      setInfo(null, phoneVerificationErrorText(error));
    }
  });

  document.querySelectorAll("[data-request-type]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setRequestTypeFromButton(button.dataset.requestType);
    });
  });

  document.querySelectorAll("[data-hours-step]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      changeRequestedHours(button.dataset.hoursStep);
    });
  });

  document.getElementById("enterServicesHub")?.addEventListener("click", () => {
    patchState("ui.appEntered", true);
  });

  document.getElementById("dismissClientOnboarding")?.addEventListener("click", () => {
    dismissClientOnboarding();
  });

  document.getElementById("reviewForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await submitCurrentReview();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo guardar la calificacion."));
    }
  });

  document.getElementById("reviewOverlay")?.addEventListener("click", (event) => {
    const closeButton = event.target.closest("[data-review-close]");
    if (closeButton || event.target.id === "reviewOverlay") {
      closeReviewDialog();
      return;
    }

    const ratingButton = event.target.closest("[data-review-rating]");
    if (ratingButton) {
      selectedReviewRating = Math.max(1, Math.min(5, Number(ratingButton.dataset.reviewRating || 5)));
      paintReviewStars();
    }
  });

  document.getElementById("notificationsButton")?.addEventListener("click", () => {
    toggleDrawer("notificationsDrawer", true);
  });

  document.getElementById("chatButton")?.addEventListener("click", async () => {
    try {
      await openClientChat();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo abrir el chat."));
    }
  });

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDrawer(button.dataset.closeDrawer, false);
    });
  });

  document.getElementById("requestTypeSelect")?.addEventListener("change", () => {
    syncDraftFromForm();
    updateScheduledVisibility();
  });

  // Botón clear (×) del input IA
  document.getElementById("categorySearchClear")?.addEventListener("click", () => {
    const input = document.getElementById("categorySearchInput");
    if (input) {
      input.value = "";
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  document.getElementById("categorySearchInput")?.addEventListener("input", (event) => {
    const value = event.target.value || "";
    // Mostrar/ocultar el botón × según haya contenido
    const clearBtn = document.getElementById("categorySearchClear");
    if (clearBtn) clearBtn.hidden = !value;

    const suggestedCategory = findBestCategoryByIntent(value);

    if (suggestedCategory?.id) {
      setState((draft) => {
        const needsHours = categoryPricingModel(suggestedCategory) === "HOURLY";
        draft.ui.categorySearchTerm = value;
        draft.ui.showAllCategories = false;
        draft.ui.selectedCategoryId = suggestedCategory.id;
        draft.requestDraft.categoryId = suggestedCategory.id;
        draft.requestDraft.requestedHours = needsHours
          ? Math.max(1, parseNumberOrFallback(draft.requestDraft.requestedHours, 2))
          : 1;
        draft.ui.intentResolution = {
          query: value,
          topMatch: {
            category_id: suggestedCategory.id,
            code: suggestedCategory.code,
            confidence: 0.82
          },
          matches: [],
          resolvedAt: new Date().toISOString(),
          source: "local"
        };
      });
      seedForm();
    } else {
      setState((draft) => {
        draft.ui.categorySearchTerm = value;
        draft.ui.showAllCategories = false;
        draft.ui.intentResolution = value.trim().length >= 3 ? null : draft.ui.intentResolution;
      });
    }

    scheduleBackendIntentResolution(value);
  });

  document.getElementById("categorySearchInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const suggestedCategory = findBestCategoryByIntent(event.currentTarget.value || "");

    if (suggestedCategory?.id) {
      selectCategoryById(suggestedCategory.id, {
        intentResolution: {
          query: event.currentTarget.value || "",
          topMatch: {
            category_id: suggestedCategory.id,
            code: suggestedCategory.code,
            confidence: 0.9
          },
          matches: [],
          resolvedAt: new Date().toISOString(),
          source: "local"
        }
      });
    }

    scheduleBackendIntentResolution(event.currentTarget.value || "");

    document.getElementById("searchProvidersButton")?.focus();
  });

  document.getElementById("categoryGrid")?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-category-toggle]");
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      setState((draft) => {
        draft.ui.showAllCategories = true;
        draft.ui.categorySearchTerm = "";
      });
      seedForm();
      window.setTimeout(() => document.getElementById("categorySearchInput")?.focus(), 0);
      return;
    }

    const categoryButton = event.target.closest("[data-category-id]");
    if (!categoryButton) return;

    event.preventDefault();
    event.stopPropagation();
    selectCategoryById(categoryButton.dataset.categoryId, {
      intentResolution: null
    });
  });

  document.getElementById("serviceAddressInput")?.addEventListener("input", async (event) => {
    try {
      await handleServiceAddressInput(event);
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudieron cargar sugerencias."));
    }
  });

  document.getElementById("serviceAddressInput")?.addEventListener("focus", () => {
    if (!(document.getElementById("serviceAddressInput")?.value || "").trim()) {
      renderServiceAddressSuggestions(obtenerRecentServicePlaces());
    }
  });

  document.getElementById("btnClearServiceAddress")?.addEventListener(
    "click",
    handleClearServiceAddress
  );

  document.getElementById("btnUseCurrentServiceLocation")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const labelSpan = btn.querySelector("span");
    const originalText = labelSpan?.textContent;

    btn.classList.add("is-loading");
    if (labelSpan) labelSpan.textContent = "Buscando ubicación...";

    try {
      await handleUseCurrentServiceLocation();
      if (labelSpan) labelSpan.textContent = "Ubicación cargada ✓";
      window.setTimeout(() => {
        if (labelSpan && originalText) labelSpan.textContent = originalText;
      }, 2000);
    } catch (error) {
      setInfo(
        null,
        normalizeAuthError(error, "No pudimos obtener tu ubicación actual.")
      );
      if (labelSpan && originalText) labelSpan.textContent = originalText;
    } finally {
      btn.classList.remove("is-loading");
    }
  });

  document.getElementById("requestForm")?.addEventListener("submit", async (event) => {
    try {
      await handleSearchSubmit(event);
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo buscar prestadores."));
    }
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("chatInput");
    const body = input?.value?.trim();

    if (!body) return;

    try {
      const message = await sendMessage({
        conversationId: currentConversationId(),
        body
      });

      setState((draft) => {
        draft.chat.messages.push(message);
        draft.chat.unreadCount = 0;
      });

      input.value = "";
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo enviar el mensaje."));
    }
  });

  document.getElementById("supportForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("supportInput");
    const status = document.getElementById("supportStatusText");
    const body = input?.value?.trim();

    if (!body) return;

    if (status) status.textContent = "Enviando tu consulta...";

    try {
      const conversationId = await ensureClientSupportConversation();
      const message = await sendMessage({ conversationId, body });
      const messages = await loadMessages(conversationId);
      renderSupportThread(messages?.length ? messages : [message].filter(Boolean));
      if (status) status.textContent = "Consulta enviada al equipo MIMI. Te respondemos por este chat.";
      input.value = "";
    } catch (error) {
      if (status) {
        status.textContent = error?.message === "LOGIN_REQUIRED"
          ? "Inicia sesion para abrir un chat privado con soporte."
          : "No pudimos enviar la consulta. Proba nuevamente.";
      }
      setInfo(null, normalizeAuthError(error, "No se pudo enviar la consulta de soporte."));
    }
  });

  document.querySelector(".app-shell")?.addEventListener("click", async (event) => {
    try {
      const closeDrawerButton = event.target.closest("[data-close-drawer]");
      if (closeDrawerButton) {
        event.preventDefault();
        event.stopPropagation();
        toggleDrawer(closeDrawerButton.dataset.closeDrawer, false);
        return;
      }

      const authLogoutButton = event.target.closest("#authSecondaryButton");
      if (authLogoutButton) {
        event.preventDefault();
        await signOut();
        window.location.reload();
        return;
      }

      // BUG: body tiene data-client-view="home" como state global → closest() matcheaba
      // body para CUALQUIER click y disparaba setClientView() + return, bloqueando
      // todos los demás handlers (Solicitar, etc.). Restringimos a button/a explícitos.
      const viewButton = event.target.closest("button[data-client-view], a[data-client-view]");
      if (viewButton) {
        const view = viewButton.dataset.clientView || "home";
        setClientView(view);
        if (viewButton.dataset.action === "support") {
          closeAllDrawers();
          toggleDrawer("supportDrawer", true);
          return;
        }
        if (viewButton.closest(".drawer")) {
          closeAllDrawers();
        }
        return;
      }

      // Compatibilidad temporal con el cliente.html anterior.
      const scrollButton = event.target.closest("[data-scroll-target]");
      if (scrollButton) {
        const target = document.getElementById(scrollButton.dataset.scrollTarget);

        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

        return;
      }

      const supportButton = event.target.closest("[data-action='support']");
      if (supportButton) {
        closeAllDrawers();
        toggleDrawer("supportDrawer", true);
        return;
      }

      const chatActionButton = event.target.closest("[data-action='chat']");
      if (chatActionButton) {
        await openClientChat();
        return;
      }

      const notificationButton = event.target.closest("[data-action='notifications']");
      if (notificationButton) {
        closeAllDrawers();
        toggleDrawer("notificationsDrawer", true);
        return;
      }

      const accountButton = event.target.closest("[data-action='account']");
      if (accountButton) {
        closeAllDrawers();
        toggleDrawer("accountDrawer", true);
        return;
      }

      const categoryToggle = event.target.closest("[data-category-toggle]");
      if (categoryToggle) {
        event.preventDefault();
        event.stopPropagation();
        setState((draft) => {
          draft.ui.showAllCategories = true;
          draft.ui.categorySearchTerm = "";
        });
        seedForm();
        window.setTimeout(() => document.getElementById("categorySearchInput")?.focus(), 0);
        return;
      }

      const categoryButton = event.target.closest("[data-category-id]");
      if (categoryButton) {
        event.preventDefault();
        event.stopPropagation();
        selectCategoryById(categoryButton.dataset.categoryId, {
          intentResolution: null
        });
        return;
      }

      const requestTypeButton = event.target.closest("[data-request-type]");
      if (requestTypeButton) {
        event.preventDefault();
        setRequestTypeFromButton(requestTypeButton.dataset.requestType);
        return;
      }

      const hoursButton = event.target.closest("[data-hours-step]");
      if (hoursButton) {
        event.preventDefault();
        changeRequestedHours(hoursButton.dataset.hoursStep);
        return;
      }


      const suggestionButton = event.target.closest("[data-service-suggestion-index]");
      if (suggestionButton) {
        await selectServiceAddressSuggestion(
          Number(suggestionButton.dataset.serviceSuggestionIndex)
        );
        return;
      }

      const selectProvider = event.target.closest("[data-provider-select]");
      if (selectProvider) {
        const providerId = selectProvider.dataset.providerSelect;
        console.log("[MIMI Solicitar] click detected on Solicitar button", {
          targetTag: event.target.tagName,
          targetClass: event.target.className,
          buttonId: selectProvider.id,
          buttonText: selectProvider.textContent?.trim()?.slice(0, 50),
          providerId,
          disabled: selectProvider.disabled,
          ariaDisabled: selectProvider.getAttribute("aria-disabled")
        });
        if (!providerId) {
          console.warn("[MIMI Solicitar] BLOCKED: data-provider-select está vacío. El estado no tiene un provider seleccionado todavía.");
          setInfo(null, "Tocá primero un prestador de la lista para elegirlo.");
          return;
        }
        if (selectProvider.disabled) {
          console.warn("[MIMI Solicitar] BLOCKED: button.disabled === true");
          return;
        }
        const created = await runClientAction(
          `select-provider:${providerId}`,
          selectProvider,
          "Preparando solicitud...",
          "Solicitar",
          () => handleProviderSelection(providerId)
        );
        if (created) setClientView("services");
        return;
      }

      if (event.target.closest("#providerSortButton")) {
        event.preventDefault();
        openProviderSortSheet();
        return;
      }

      const providerSort = event.target.closest("[data-provider-sort]");
      if (providerSort) {
        event.preventDefault();
        selectProviderSortMode(providerSort.dataset.providerSort);
        return;
      }

      if (event.target.closest("[data-provider-sort-close]")) {
        event.preventDefault();
        closeProviderSortSheet();
        return;
      }

      const focusProvider = event.target.closest("[data-provider-focus]");
      if (focusProvider) {
        patchState("ui.selectedProviderCandidateId", focusProvider.dataset.providerFocus);
        return;
      }

      const requestAction = event.target.closest("[data-request-action]");
      if (requestAction) {
        await runClientAction(
          `request-action:${requestAction.dataset.requestAction}`,
          requestAction,
          requestAction.dataset.requestAction === "cancel" ? "Cancelando..." : "Procesando...",
          null,
          () => handleRequestAction(requestAction.dataset.requestAction)
        );
        return;
      }

      const historyAction = event.target.closest("[data-history-action]");
      if (historyAction) {
        const requestId = historyAction.dataset.requestId;
        if (historyAction.dataset.historyAction === "rate" && requestId) {
          openReviewDialog(requestId);
        }
        return;
      }

      const paymentAction = event.target.closest("[data-payment-action]");
      if (paymentAction) {
        await runClientAction(
          `payment-action:${paymentAction.dataset.paymentAction}`,
          paymentAction,
          "Procesando...",
          null,
          () => handlePaymentAction(paymentAction.dataset.paymentAction)
        );
        return;
      }

      if (event.target.closest("[data-open-chat]")) {
        await openClientChat();
      }
    } catch (error) {
      // Logging completo para debug — antes solo aparecía un toast genérico sin causa.
      hideRequestProgress();
      console.error("[MIMI] Click handler error:", error);
      console.error("[MIMI] Error details:", {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        stack: error?.stack
      });
      const friendlyMsg = error?.message || "No se pudo completar la accion.";
      setInfo(null, normalizeAuthError(error, friendlyMsg));
    }
  });
}
function setupRealtime(
  requestId = state.client.activeRequest?.id ?? null,
  conversationId = currentConversationId()
) {
  realtimeSubscription?.unsubscribe?.();
  realtimeSubscription = null;

  if (!state.session.userId) {
    return;
  }

  const activeStatus = String(state.client.activeRequest?.status || "").toUpperCase();
  const shouldTrackProvider = Boolean(requestId) && !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(activeStatus);

  realtimeSubscription = subscribeToClientRealtime({
    userId: state.session.userId,
    requestId,
    conversationId,
    onNotification: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.notifications.items.unshift(payload);
      });

      playNotificationSound();
      showClientForegroundNotification(payload.title, payload.body, payload.data_json);
    },
    onMessage: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        const exists = draft.chat.messages.some((msg) => msg.id === payload.id);
        if (!exists) {
          draft.chat.messages.push(payload);
        }

        if (payload.sender_user_id !== draft.session.userId) {
          draft.chat.unreadCount += 1;
        }
      });

      playNotificationSound();
    },
    onTracking: shouldTrackProvider ? ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: payload.lat,
          lng: payload.lng
        };
      });

      updateClientMapWhenReady({
        servicePosition: state.tracking.clientPosition,
        providerPosition: {
          lat: payload.lat,
          lng: payload.lng
        }
      });
    } : null,
    onRequest: ({ new: payload }) => {
      if (!payload) return;
      const safePayload = sanitizeServiceRequestPayload(payload);

      setState((draft) => {
        if (draft.client.activeRequest?.id === safePayload.id) {
          draft.client.activeRequest = {
            ...draft.client.activeRequest,
            ...safePayload
          };
        }
      });

      refreshServicePinForRequest(safePayload, "realtime_request_update");
    }
  });
}

/**
 * Pide el teléfono al usuario si todavía no lo cargó.
 * Persiste en auth.users.user_metadata.phone (nativo Supabase, sin schema nuevo).
 * Skip queda guardado en localStorage para no molestar en cada login.
 */
function setupLegacyPhoneCollector() {
  const overlay = document.getElementById("phoneCollectOverlay");
  if (!overlay) return;

  const supabase = getSupabaseClient?.();
  if (!supabase) return;

  const SKIP_KEY = "mimi_services_phone_skip_until";
  const userId = state.session.userId;
  if (!userId) return; // sólo si está logueado

  // Leer phone actual del state/auth metadata
  const currentPhone =
    state.session.userPhone ||
    null;

  // Si ya tiene phone, no mostrar
  if (currentPhone) return;

  // Si el usuario apretó "Más tarde" hace menos de 24h, respetarlo
  const skipUntil = Number(localStorage.getItem(SKIP_KEY) || 0);
  if (skipUntil && Date.now() < skipUntil) return;

  // Verificar metadata de auth (puede no estar en state)
  supabase.auth.getUser().then(({ data, error }) => {
    if (error || !data?.user) return;
    const phoneFromMeta = data.user.user_metadata?.phone || data.user.phone;
    if (phoneFromMeta) {
      // Ya tiene phone — sincronizar al state y no abrir modal
      patchState("session.userPhone", phoneFromMeta);
      return;
    }
    openLegacyPhoneCollectModal(overlay, supabase);
  });
}

function openLegacyPhoneCollectModal(overlay, supabase) {
  const form = overlay.querySelector("#phoneCollectForm");
  const input = overlay.querySelector("#phoneCollectInput");
  const status = overlay.querySelector("#phoneCollectStatus");
  const submit = overlay.querySelector("#phoneCollectSubmit");
  const skip = overlay.querySelector("#phoneCollectSkip");
  if (!form || !input || !submit || !skip) return;

  overlay.hidden = false;
  setTimeout(() => input.focus(), 200);

  const close = () => {
    overlay.hidden = true;
    form.removeEventListener("submit", onSubmit);
    skip.removeEventListener("click", onSkip);
  };

  const onSkip = () => {
    // Posponer 24 horas
    localStorage.setItem("mimi_services_phone_skip_until", String(Date.now() + 24 * 60 * 60 * 1000));
    close();
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const raw = String(input.value || "").trim();
    const cleaned = raw.replace(/\s+/g, "").replace(/-/g, "");

    // Validación: 8-20 dígitos, opcional + al inicio
    if (!/^\+?\d{8,20}$/.test(cleaned)) {
      input.classList.add("is-invalid");
      status.textContent = "Ingresá un número válido. Ej: +5493511234567";
      status.classList.remove("is-success");
      return;
    }

    input.classList.remove("is-invalid");
    submit.disabled = true;
    submit.textContent = "Guardando...";
    status.textContent = "";

    try {
      const { error } = await supabase.auth.updateUser({
        data: { phone: cleaned }
      });
      if (error) throw error;

      patchState("session.userPhone", cleaned);
      status.textContent = "✓ Teléfono guardado";
      status.classList.add("is-success");
      setTimeout(close, 800);
    } catch (err) {
      console.error("[MIMI] guardar phone:", err);
      status.textContent = err?.message || "No se pudo guardar. Intentá de nuevo.";
      submit.disabled = false;
      submit.textContent = "Guardar y continuar";
    }
  };

  form.addEventListener("submit", onSubmit);
  skip.addEventListener("click", onSkip);
}

async function setupPhoneCollector(options = {}) {
  const overlay = document.getElementById("phoneCollectOverlay");
  if (!overlay || !state.session.userId || !hasSupabaseEnv()) return;

  const forceChange = options.force === true;
  const phoneStatus = await loadClientPhoneStatus();
  const profile = phoneStatus?.profile ?? null;
  const smsConfigured = phoneStatus?.sms_configured !== false;
  let risk = null;

  if (profile) {
    patchState("session.clientProfileId", profile.id ?? null);
    patchState("session.userPhone", profile.phone_number ?? null);
    patchState("session.userPhoneCountryCode", profile.country_code ?? null);
    patchState("session.userPhoneVerified", profile.phone_verified === true);
  }

  if (!forceChange) {
    risk = await evaluateAuthRisk({ actorRole: "client", purpose: "login_new_device" });
    const phoneVerified = profile?.phone_verified === true || state.session.userPhoneVerified === true;
    const trustedOrNoRisk = risk?.ok !== true || risk?.requires_otp !== true;

    if (phoneVerified && trustedOrNoRisk) {
      return;
    }
  }

  if (!smsConfigured) {
    if (forceChange) {
      throw new Error("sms_provider_not_configured");
    }
    console.warn("[MIMI Cliente] verificacion SMS pendiente de configuracion; onboarding telefonico pausado.");
    return;
  }

  await openVerifiedPhoneCollectModal(overlay, {
    forceChange,
    existingProfile: profile,
    verifyExistingDevice: !forceChange && risk?.requires_otp === true && profile?.phone_verified === true,
    required: forceChange ? false : true
  });
}

async function openVerifiedPhoneCollectModal(
  overlay,
  { forceChange = false, existingProfile = null, verifyExistingDevice = false, required = true } = {}
) {
  const form = overlay.querySelector("#phoneCollectForm");
  const input = overlay.querySelector("#phoneCollectInput");
  const otpInput = overlay.querySelector("#phoneOtpInput");
  const status = overlay.querySelector("#phoneCollectStatus");
  const submit = overlay.querySelector("#phoneCollectSubmit");
  const closeButton = overlay.querySelector("#phoneCollectClose");
  const resendButton = overlay.querySelector("#phoneResendButton");
  const entryStep = overlay.querySelector("#phoneEntryStep");
  const otpStep = overlay.querySelector("#phoneOtpStep");
  const otpTarget = overlay.querySelector("#phoneOtpTarget");
  const stepLabel = overlay.querySelector("#phoneCollectStep");
  const title = overlay.querySelector("#phoneCollectTitle");
  const copy = overlay.querySelector("#phoneCollectCopy");
  const countryButton = overlay.querySelector("#countryPickerButton");
  const countryPanel = overlay.querySelector("#countryPickerPanel");
  const countrySearch = overlay.querySelector("#countrySearchInput");
  const countryList = overlay.querySelector("#countryList");
  const countryFlag = overlay.querySelector("#countryPickerFlag");
  const countryName = overlay.querySelector("#countryPickerName");
  const countryDial = overlay.querySelector("#countryPickerDial");

  if (!form || !input || !otpInput || !status || !submit || !entryStep || !otpStep) return;

  phoneCollectorAbortController?.abort?.();
  phoneCollectorAbortController = new AbortController();

  let countries = [];
  let selectedCountry = null;
  let currentStep = "entry";
  let pendingVerification = null;
  const canClose = forceChange || (!required && (existingProfile?.phone_verified === true || state.session.userPhoneVerified === true));

  const setStatus = (message = "", type = "neutral") => {
    status.textContent = message;
    status.dataset.state = type;
    status.classList.toggle("is-success", type === "success");
    status.classList.toggle("is-error", type === "error");
  };

  const setLoading = (loading, label) => {
    submit.disabled = Boolean(loading);
    submit.classList.toggle("is-loading", Boolean(loading));
    if (label) submit.textContent = label;
  };

  const renderSelectedCountry = () => {
    if (!selectedCountry) return;
    if (countryFlag) countryFlag.textContent = selectedCountry.flag || "";
    if (countryName) countryName.textContent = selectedCountry.name || selectedCountry.iso;
    if (countryDial) countryDial.textContent = selectedCountry.dialCode || "";
  };

  const renderCountryList = (query = "") => {
    if (!countryList) return;
    const needle = normalizeSearchText(query);
    const rows = countries
      .filter((country) => {
        if (!needle) return true;
        return (
          normalizeSearchText(country.name).includes(needle) ||
          normalizeSearchText(country.iso).includes(needle) ||
          normalizeSearchText(country.dialCode).includes(needle)
        );
      });

    countryList.innerHTML = rows.map((country) => `
      <button type="button" class="phone-country-option" data-country-iso="${escapeHtml(country.iso)}">
        <span>${escapeHtml(country.flag || "")}</span>
        <b>${escapeHtml(country.name || country.iso)}</b>
        <small>${escapeHtml(country.dialCode || "")}</small>
      </button>
    `).join("");
  };

  const setStep = (step) => {
    currentStep = step;
    const isOtp = step === "otp";
    entryStep.hidden = isOtp;
    otpStep.hidden = !isOtp;
    if (stepLabel) stepLabel.textContent = isOtp ? "Paso 2 de 2" : "Paso 1 de 2";
    if (title) {
      title.textContent = isOtp
        ? "Ingresá el código"
        : (forceChange ? "Cambiá tu número" : "Verificá tu número");
    }
    if (copy) {
      copy.textContent = isOtp
        ? "Te enviamos un SMS. El código vence pronto por seguridad."
        : (verifyExistingDevice
          ? "Detectamos un dispositivo nuevo. Confirmá tu teléfono una vez para confiar este equipo."
          : "Lo usamos para proteger tu cuenta y avisos importantes del servicio.");
    }
    submit.textContent = isOtp ? "Verificar y continuar" : "Enviar código";
    window.setTimeout(() => (isOtp ? otpInput : input).focus(), 150);
  };

  const close = (success = false) => {
    if (!success && !canClose) return;
    phoneCollectorAbortController?.abort?.();
    phoneCollectorAbortController = null;
    overlay.hidden = true;
    document.body.classList.remove("auth-consent-open");
    form.removeEventListener("submit", onSubmit);
    closeButton?.removeEventListener("click", onCloseClick);
    resendButton?.removeEventListener("click", onResend);
    countryButton?.removeEventListener("click", onCountryButtonClick);
    countrySearch?.removeEventListener("input", onCountrySearch);
    countryList?.removeEventListener("click", onCountrySelect);
  };

  const startOtp = async () => {
    const normalized = await normalizePhoneNumber(input.value, selectedCountry);
    pendingVerification = {
      phoneNumber: normalized.phoneNumber,
      countryCode: normalized.countryCode,
      countryIso: normalized.countryIso
    };

    const response = await startClientPhoneVerification({
      ...pendingVerification,
      purpose: forceChange
        ? "phone_change"
        : (verifyExistingDevice ? "login_new_device" : "signup")
    });
    if (response?.already_verified === true) {
      patchState("session.userPhone", pendingVerification.phoneNumber);
      patchState("session.userPhoneCountryCode", pendingVerification.countryCode);
      patchState("session.userPhoneVerified", true);
      setStatus("Número verificado.", "success");
      window.setTimeout(() => close(true), 450);
      return;
    }
    pendingVerification.attemptId = response?.attempt_id || response?.attemptId || null;
    if (otpTarget) otpTarget.textContent = response?.masked_phone || pendingVerification.phoneNumber;
    setStep("otp");
    setStatus("Código enviado por SMS.", "success");
  };

  const verifyOtp = async () => {
    const code = String(otpInput.value || "").replace(/\D/g, "");
    if (!/^\d{4,8}$/.test(code)) {
      otpInput.classList.add("is-invalid");
      setStatus("Ingresá el código recibido por SMS.", "error");
      return;
    }

    otpInput.classList.remove("is-invalid");
    const response = await verifyClientPhoneCode({
      attemptId: pendingVerification?.attemptId,
      phoneNumber: pendingVerification?.phoneNumber,
      code
    });
    const profile = response?.profile ?? null;

    patchState("session.clientProfileId", profile?.id ?? state.session.clientProfileId ?? null);
    patchState("session.userPhone", profile?.phone_number ?? pendingVerification?.phoneNumber ?? null);
    patchState("session.userPhoneCountryCode", profile?.country_code ?? pendingVerification?.countryCode ?? null);
    patchState("session.userPhoneVerified", true);

    setStatus("Número verificado.", "success");
    window.setTimeout(() => close(true), 450);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    input.classList.remove("is-invalid");
    otpInput.classList.remove("is-invalid");
    setStatus("");
    setLoading(true, currentStep === "otp" ? "Verificando..." : "Enviando...");

    try {
      if (currentStep === "otp") {
        await verifyOtp();
      } else {
        await startOtp();
      }
    } catch (error) {
      const target = currentStep === "otp" ? otpInput : input;
      target.classList.add("is-invalid");
      setStatus(phoneVerificationErrorText(error), "error");
    } finally {
      setLoading(false, currentStep === "otp" ? "Verificar y continuar" : "Enviar código");
    }
  };

  const onResend = async () => {
    if (!pendingVerification?.phoneNumber) {
      setStep("entry");
      return;
    }
    setStatus("");
    setLoading(true, "Reenviando...");
    try {
      await startOtp();
    } catch (error) {
      setStatus(phoneVerificationErrorText(error), "error");
    } finally {
      setLoading(false, currentStep === "otp" ? "Verificar y continuar" : "Enviar código");
    }
  };

  const onCloseClick = () => close(false);
  const onCountryButtonClick = () => {
    const expanded = countryPanel?.hidden === true;
    if (countryPanel) countryPanel.hidden = !expanded;
    countryButton?.setAttribute("aria-expanded", String(expanded));
    if (expanded) {
      renderCountryList(countrySearch?.value || "");
      window.setTimeout(() => countrySearch?.focus(), 50);
    }
  };
  const onCountrySearch = () => renderCountryList(countrySearch?.value || "");
  const onCountrySelect = (event) => {
    const option = event.target.closest?.("[data-country-iso]");
    if (!option) return;
    selectedCountry = countries.find((country) => country.iso === option.dataset.countryIso) || selectedCountry;
    renderSelectedCountry();
    if (countryPanel) countryPanel.hidden = true;
    countryButton?.setAttribute("aria-expanded", "false");
    input.focus();
  };

  countries = await loadPhoneCountries();
  selectedCountry =
    countries.find((country) => country.dialCode === existingProfile?.country_code) ||
    detectDefaultCountry(countries);
  renderSelectedCountry();
  renderCountryList();

  form.reset();
  otpStep.hidden = true;
  entryStep.hidden = false;
  setStep("entry");
  setStatus("");
  if (closeButton) closeButton.hidden = !canClose;
  if (existingProfile?.phone_number && forceChange) input.placeholder = existingProfile.phone_number;
  if (existingProfile?.phone_number && verifyExistingDevice) input.value = existingProfile.phone_number;
  if (countryPanel) countryPanel.hidden = true;

  overlay.hidden = false;
  document.body.classList.add("auth-consent-open");
  form.addEventListener("submit", onSubmit);
  closeButton?.addEventListener("click", onCloseClick);
  resendButton?.addEventListener("click", onResend);
  countryButton?.addEventListener("click", onCountryButtonClick);
  countrySearch?.addEventListener("input", onCountrySearch);
  countryList?.addEventListener("click", onCountrySelect);
  window.setTimeout(() => input.focus(), 180);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function phoneVerificationErrorText(error) {
  const code = error?.code || error?.message || error?.details?.error || "";
  if (String(code).startsWith("sms_provider_error")) {
    return "El proveedor SMS no pudo procesar el envío. Intentá nuevamente.";
  }
  const messages = {
    AUTH_REQUIRED: "Iniciá sesión para verificar tu número.",
    phone_invalid: "Ingresá un número válido con código de país.",
    phone_already_used: "Ese número ya está verificado en otra cuenta.",
    sms_provider_not_configured: "La verificación por SMS todavía no está configurada.",
    otp_recently_sent: "Ya enviamos un código hace instantes. Esperá un minuto.",
    otp_blocked: "Por seguridad bloqueamos temporalmente nuevos códigos.",
    otp_phone_hour_limited: "Demasiados códigos para este número. Probá más tarde.",
    otp_phone_day_limited: "Ese número llegó al límite diario de códigos.",
    otp_ip_day_limited: "Detectamos demasiados pedidos desde esta red.",
    otp_device_day_limited: "Este dispositivo pidió demasiados códigos hoy.",
    otp_rate_limited: "Demasiados intentos. Probá de nuevo en unos minutos.",
    phone_rate_limited: "Demasiados intentos. Probá de nuevo en unos minutos.",
    otp_invalid: "El código no coincide. Revisalo e intentá otra vez.",
    otp_attempts_exceeded: "Se agotaron los intentos. Pedí un código nuevo.",
    otp_expired_or_missing: "El código venció. Pedí uno nuevo.",
    otp_not_found_or_expired: "El código venció. Pedí uno nuevo.",
    otp_send_failed: "No pudimos enviar el SMS. Intentá nuevamente.",
    otp_verify_failed: "No pudimos validar el código. Intentá nuevamente."
  };
  return messages[code] || "No pudimos verificar el número. Intentá nuevamente.";
}

async function init() {
  exposeClientDebugApi();
  document.body.dataset.clientView = "home";
  subscribe(renderClientScreen);
  renderClientScreen(state);

  seedForm();
  toggleClearAddressButton();
  updateScheduledVisibility();
  bindBasicControls();
  setupCategoryPlaceholderExamples();
  setClientView(document.body.dataset.clientView || "home", { behavior: "auto" });
  registerInstallPrompt();
  // Mapa diferido: se inicializa bajo demanda cuando hay ubicacion o tracking.

const CLIENT_SW_ENABLED = true;

if (CLIENT_SW_ENABLED && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw-2026.js")
    .catch((err) => {
      console.warn("[MIMI Cliente] Service Worker no registrado:", err);
    });
}
  await bootstrapAsyncData();
  await handlePaymentReturnFromUrl();

  if (window.location.hash && window.location.hash.includes("access_token")) {
    history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );
  }

  setupRealtime();
  renderClientScreen(state);

  // Tras login, si el cliente no tiene teléfono cargado, pedirlo.
  await setupPhoneCollector();

  authSubscription =
    subscribeToAuthChanges?.(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        await redirectAfterLoginByRole(session);
        return;
      }

      if (event === "SIGNED_OUT") {
        window.location.href = "./cliente.html";
      }
    }) ?? null;
}

init().catch((error) => {
  setState((draft) => {
    draft.meta.error = normalizeAuthError(
      error,
      "La app cargo con fallback local. Revisa la configuracion de Supabase."
    );
    draft.meta.info = null;
  });
});

window.addEventListener("beforeunload", () => {
  realtimeSubscription?.unsubscribe?.();
  authSubscription?.unsubscribe?.();
});
