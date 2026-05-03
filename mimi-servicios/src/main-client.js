import { appConfig } from "./config.js";
import { initMap, updateClientMap } from "./services/map.js";
import {
  bootstrapSession,
  createRequest,
  loadActiveRequest,
  loadCategories,
  loadConversationForRequest,
  loadClientRequestInsights,
  loadMessages,
  loadNotifications,
  prepareRequestPricing,
  registerDevice,
  resolveServiceIntent,
  searchProviders,
  sendMessage,
  updateRequestStatus
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
  hasSupabaseEnv,
  redirectAfterLoginByRole,
  signInWithGoogle,
  signOut,
  subscribeToAuthChanges
} from "./services/supabase.js";
import {
  patchState,
  setState,
  state,
  subscribe
} from "./state/app-state.js";
import { renderClientScreen } from "./ui/render-client.js";
import { cancelPayment, createPaymentIntent, getPaymentStatus } from "./payments/payment-api.js";

let addressLookupToken = 0;
let intentLookupToken = 0;
let realtimeSubscription = null;
let authSubscription = null;

const CLIENT_ONBOARDING_KEY = "mimi_services_client_onboarding_seen";
const PWA_INSTALLED_KEY = "mimi_services_pwa_installed";
const CATEGORY_USAGE_KEY = "mimi_services_category_usage_v1";

const NON_HOURLY_CATEGORY_MODELS = {
  GOMERIA_MOVIL: "BASE_VISIT",
  MECANICA_MOVIL: "BASE_VISIT",
  HERRERIA: "QUOTE",
  MUDANZAS: "QUOTE",
  JARDINERIA: "SQUARE_METER",
  PINTURA: "SQUARE_METER"
};

const INTENT_CATEGORY_RULES = [
  { code: "PLOMERIA", terms: ["cano", "pincho un cano", "caneria", "agua", "perdida", "fuga", "gotea", "griferia", "bano", "inodoro", "pileta", "cocina", "destapar"] },
  { code: "PINTURA", terms: ["pintar", "pintura", "pintor", "pared", "living", "habitacion", "humedad", "techo", "revoque", "casa", "frente"] },
  { code: "JARDINERIA", terms: ["pasto", "jardin", "cortar el pasto", "poda", "plantas", "cesped", "patio", "maleza", "jardinero"] },
  { code: "ELECTRICIDAD", terms: ["luz", "no prende", "electricidad", "enchufe", "cable", "termica", "cortocircuito", "disyuntor", "lampara", "instalacion electrica"] },
  { code: "GASISTA", terms: ["gas", "olor a gas", "calefon", "cocina", "horno", "estufa", "termotanque", "gasista", "matriculado"] },
  { code: "INSTALACION_AIRE", terms: ["aire", "split", "acondicionado", "instalar aire", "instalacion de aire", "mantenimiento aire"] },
  { code: "REFRIGERACION", terms: ["heladera", "freezer", "frio", "no enfria", "refrigeracion", "camara frigorifica"] },
  { code: "LIMPIEZA", terms: ["limpiar", "limpieza", "mucama", "casa", "departamento", "oficina", "ordenar", "servicio domestico"] },
  { code: "CUIDADO_ADULTOS", terms: ["anciano", "adulto mayor", "cuidador", "acompanante", "familiar enfermo", "cuidar adulto", "abuelo", "abuela"] },
  { code: "CUIDADO_NINOS", terms: ["nino", "nina", "ninera", "chico", "cuidar chico", "cuidar nene", "bebes", "bebe", "hijo", "hija"] },
  { code: "ENFERMERIA", terms: ["enfermero", "enfermera", "curacion", "inyeccion", "salud", "medicacion", "familiar enfermo", "postoperatorio", "control"] },
  { code: "TECNICO_PC", terms: ["pc", "computadora", "notebook", "impresora", "windows", "virus", "no enciende", "tecnico pc"] },
  { code: "TECNOLOGIA", terms: ["wifi", "router", "camara", "smart tv", "internet", "alarma", "domotica", "configurar"] },
  { code: "CERRAJERIA", terms: ["llave", "cerradura", "cerrajero", "puerta", "abrir", "trabo", "candado"] },
  { code: "MUDANZAS", terms: ["mudanza", "mover", "cargar", "flete", "traslado", "muebles", "cajas"] },
  { code: "MASCOTAS", terms: ["perro", "gato", "mascota", "pasear", "paseador", "veterinario", "cuidado mascota"] },
  { code: "GOMERIA_MOVIL", terms: ["pincho", "pinchadura", "rueda", "cubierta", "neumatico", "gomero", "gomeria", "auxilio"] },
  { code: "MECANICA_MOVIL", terms: ["mecanico", "auto", "no arranca", "bateria", "motor", "me quede tirado", "auxilio mecanico"] },
  { code: "HERRERIA", terms: ["herrero", "herreria", "reja", "porton", "soldadura", "metal", "estructura"] },
  { code: "ALBANILERIA", terms: ["albanil", "obra", "arreglo", "pared rota", "ladrillo", "cemento", "construccion"] },
  { code: "CARPINTERIA", terms: ["madera", "mueble", "puerta de madera", "carpintero", "estante", "placard"] },
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
    if (rule?.terms?.some((term) => query.includes(normalizeServiceIntent(term)))) {
      score += 30;
    }

    if (query.split(" ").some((word) => word.length > 3 && haystack.includes(word))) {
      score += 8;
    }

    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  return bestScore >= 12 ? best : null;
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

function selectedCategoryNeedsHours() {
  return categoryPricingModel(getSelectedCategory()) === "HOURLY";
}

function requestedHoursForCurrentCategory() {
  return selectedCategoryNeedsHours()
    ? Math.max(1, parseNumberOrFallback(state.requestDraft.requestedHours, 2))
    : 1;
}

async function resolveCategoryByBackendIntent(value) {
  const query = String(value ?? "").trim();
  const token = ++intentLookupToken;

  if (query.length < 3) return;

  const result = await resolveServiceIntent(query, { limit: 3 });

  if (token !== intentLookupToken || !result?.ok) return;

  const categoryId = result.top_match?.category_id;

  if (categoryId && appConfig.categories.some((category) => category.id === categoryId)) {
    setState((draft) => {
      draft.ui.selectedCategoryId = categoryId;
      draft.ui.intentResolution = {
        query,
        topMatch: result.top_match,
        matches: Array.isArray(result.matches) ? result.matches : [],
        resolvedAt: new Date().toISOString()
      };
    });
    return;
  }

  patchState("ui.intentResolution", {
    query,
    topMatch: result.top_match ?? null,
    matches: Array.isArray(result.matches) ? result.matches : [],
    resolvedAt: new Date().toISOString()
  });
}

function scheduleBackendIntentResolution(value) {
  const token = ++intentLookupToken;

  window.setTimeout(() => {
    if (token !== intentLookupToken) return;

    resolveCategoryByBackendIntent(value).catch((error) => {
      console.warn("[client] intent resolver unavailable", error);
    });
  }, 280);
}

function setupCategoryPlaceholderExamples() {
  const input = document.getElementById("categorySearchInput");
  if (!input || input.dataset.placeholderReady === "1") return;

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

function setInfo(message, error = null) {
  setState((draft) => {
    draft.meta.info = message || null;
    draft.meta.error = error;
  });
}

function setButtonLoading(button, loading, loadingLabel, idleLabel = null) {
  if (!button) return;

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = idleLabel ?? button.textContent ?? "";
  }

  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.setAttribute("aria-busy", String(loading));
  button.textContent = loading ? loadingLabel : button.dataset.idleLabel;
}

function isRunningAsInstalledPwa() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  );
}

function setInstallButtonVisible(visible) {
  const installButton = document.getElementById("installButton");
  if (!installButton) return;

  const shouldShow = Boolean(visible) && !isRunningAsInstalledPwa();
  installButton.hidden = !shouldShow;
  installButton.style.display = shouldShow ? "" : "none";
  installButton.setAttribute("aria-hidden", String(!shouldShow));
}

function dismissClientOnboarding() {
  localStorage.setItem(CLIENT_ONBOARDING_KEY, "1");
  patchState("ui.showClientOnboarding", false);
}

function normalizeAuthError(error, fallbackMessage) {
  if (error?.code === "AUTH_REQUIRED") {
    return "Necesitas iniciar sesion con Google para continuar.";
  }

  if (error?.message === "SERVICE_LOCATION_REQUIRED") {
    return "Necesitamos una direccion valida del servicio para buscar prestadores.";
  }

  return error?.message || fallbackMessage;
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

async function registerCurrentDevice() {
  if (!state.session.userId) return;

  try {
    await registerDevice({
      deviceId: buildDeviceId(),
      pushToken: null,
      platform: "web",
      notificationsEnabled: true,
      marketingOptIn: false
    });
  } catch {
    // no-op
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
    aliases: Array.isArray(category.aliases) ? category.aliases : []
  };
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
        aliases: [
          ...(Array.isArray(fallback.aliases) ? fallback.aliases : []),
          ...(Array.isArray(category.aliases) ? category.aliases : [])
        ]
      });
    });

  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
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
    "CUIDADO_ADULTOS"
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
          <strong>${item.display_name || item.direccion || "Direccion"}</strong>
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
  const address = item.display_name || item.direccion || "";
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

  updateClientMap({
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
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });
    });

    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    const addressInput = document.getElementById("serviceAddressInput");
    const latInput = document.getElementById("serviceLatInput");
    const lngInput = document.getElementById("serviceLngInput");

    if (addressInput) addressInput.value = "Ubicando direccion...";
    if (latInput) latInput.value = String(lat);
    if (lngInput) lngInput.value = String(lng);

    patchState("requestDraft.address", "Ubicando direccion...");
    patchState("requestDraft.lat", lat);
    patchState("requestDraft.lng", lng);

    updateClientMap({
      servicePosition: { lat, lng },
      providerPosition: state.tracking.providerPosition
    });

    const resolved = await resolverDireccionActualServicio(lat, lng, {
      bias: { lat, lng }
    });

    const displayAddress =
      resolved?.display_name ||
      resolved?.direccion ||
      "Mi ubicacion actual";

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
    draft.client.insights = insights;
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

  updateClientMap({
    servicePosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition
  });

  setupRealtime(activeRequest?.id ?? null, conversation?.id ?? null);
}

async function bootstrapAsyncData() {
  const session = await bootstrapSession();
  let categories = [];

  try {
    categories = await loadCategories();
  } catch (error) {
    console.warn("[MIMI Go] No se pudieron cargar categorias remotas, uso fallback local.", error);
    categories = appConfig.categories ?? [];
  }

  appConfig.categories = rankCategoriesForClient(
    mergeCategories(categories, appConfig.categories)
  );

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
  await registerCurrentDevice();

  if (!hasSupabaseEnv()) {
    setInfo(
      "La app esta funcionando en modo demo local. Cuando cargues las credenciales, se conecta al backend real."
    );
  } else if (!session.userId) {
    setInfo(
      "Ingresa con Google para ver categorias activas, buscar prestadores y usar el flujo real."
    );
  } else {
    setInfo("Sesion iniciada correctamente.");
  }
}

function registerInstallPrompt() {
  if (isRunningAsInstalledPwa()) {
    localStorage.setItem(PWA_INSTALLED_KEY, "true");
    patchState("ui.installPromptEvent", null);
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
    patchState("ui.installPromptEvent", event);
    setInstallButtonVisible(true);
  });

  document.getElementById("installButton")?.addEventListener("click", async () => {
    if (isRunningAsInstalledPwa()) {
      setInstallButtonVisible(false);
      return;
    }

    const promptEvent = state.ui.installPromptEvent;
    if (!promptEvent) return;

    await promptEvent.prompt();
    patchState("ui.installPromptEvent", null);
    setInstallButtonVisible(false);
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(PWA_INSTALLED_KEY, "true");
    patchState("ui.installPromptEvent", null);
    setInstallButtonVisible(false);
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
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

  await signInWithGoogle({ mode: "client" });
}

async function handleSearchSubmit(event) {
  event.preventDefault();
  syncDraftFromForm();

  if (!state.ui.selectedCategoryId && appConfig.categories?.[0]?.id) {
    patchState("ui.selectedCategoryId", appConfig.categories[0].id);
  }

  registerCategoryUsage(state.ui.selectedCategoryId);

  const searchButton = document.getElementById("searchProvidersButton");

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
        requestedHours: requestedHoursForCurrentCategory()
      }
    );

    setState((draft) => {
      draft.client.providers = providers;
      draft.ui.selectedProviderCandidateId =
        providers[0]?.provider_id ?? draft.ui.selectedProviderCandidateId ?? null;
      draft.ui.hasCompletedClientSearch = providers.length > 0;
      draft.meta.error = null;
      draft.meta.info = providers.length
        ? "Prestadores actualizados."
        : "No encontramos prestadores para este criterio.";
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
  }
}

async function handleProviderSelection(providerId) {
  const provider = state.client.providers.find(
    (item) => item.provider_id === providerId
  );

  if (!provider) return;

  const requestedHours = requestedHoursForCurrentCategory();
  const pricing = await prepareRequestPricing({
    clientUserId: currentUserId(),
    categoryId: state.ui.selectedCategoryId,
    providerId: provider.provider_id,
    draft: {
      ...state.requestDraft,
      requestedHours
    }
  });

  if (!pricing?.eligible) {
    throw new Error(
      `No se pudo confirmar el prestador: ${pricing?.reason ?? "pricing_error"}`
    );
  }

  const request = await createRequest({
    categoryId: state.ui.selectedCategoryId,
    selectedProviderId: provider.provider_id,
    address: state.requestDraft.address,
    serviceLat: state.requestDraft.lat,
    serviceLng: state.requestDraft.lng,
    requestType: state.requestDraft.requestType,
    scheduledFor: state.requestDraft.scheduledFor || null,
    requestedHours,
    providerPrice: pricing.provider_price,
    platformFee: pricing.platform_fee,
    totalPrice: pricing.total_price,
    currency: pricing.currency
  });

  let paymentIntent = null;

  try {
    paymentIntent = await createPaymentIntent({
      serviceRequestId: request?.id ?? request?.request_id,
      contextType: "SERVICE_REQUEST"
    });
  } catch (error) {
    console.warn("[MIMI Go] No se pudo crear intento de pago mock/payment-agnostic.", error);
  }

  setState((draft) => {
    draft.client.selectedProvider = provider;
    draft.client.activeRequest = {
      ...request,
      providerName: provider.full_name,
      requestType: draft.requestDraft.requestType,
      requestedHours,
      total_price: pricing.total_price,
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
      ? "Solicitud creada. El intento de pago quedo preparado."
      : "Solicitud creada correctamente.";
  });

  await hydrateLiveContext(request);
}

async function handleRequestAction(action) {
  if (action !== "cancel") return;

  await updateRequestStatus(appConfig.functions.cancelRequest, {
    request_id: state.client.activeRequest?.id,
    reason: "cancelled_from_client_ui"
  });

  setState((draft) => {
    if (draft.client.activeRequest) {
      draft.client.activeRequest.status = "CANCELLED";
    }
    draft.meta.info = "Solicitud cancelada correctamente.";
  });

  await hydrateLiveContext();
}

async function handlePaymentAction(action) {
  const payment = state.client.insights?.paymentIntent;

  if (!payment?.id) {
    throw new Error("No hay intento de pago activo.");
  }

  if (action === "checkout") {
    if (payment.checkout_url) {
      window.open(payment.checkout_url, "_blank", "noopener,noreferrer");
      return;
    }

    setInfo("Checkout mock preparado. Cuando conectes el PSP real, aca redirige al checkout seguro.");
    return;
  }

  if (action === "refresh") {
    const updated = await getPaymentStatus(payment.id);
    patchState("client.insights.paymentIntent", updated);
    return;
  }

  if (action === "cancel") {
    const updated = await cancelPayment(payment.id);
    patchState("client.insights.paymentIntent", updated);
  }
}


function startCategoryPlaceholderDemo() {
  const input = document.getElementById("categorySearchInput");
  if (!input || input.dataset.typewriterReady === "true") return;

  input.dataset.typewriterReady = "true";

  const examples = String(input.dataset.placeholderExamples || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const demoExamples = [
    "Necesito ayuda para una mudanza",
    "Mi computadora no funciona",
    ...examples
  ];

  const uniqueExamples = [...new Set(demoExamples)].slice(0, 8);
  if (!uniqueExamples.length) return;

  let exampleIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = () => {
    if (document.activeElement === input || input.value.trim()) {
      window.setTimeout(tick, 900);
      return;
    }

    const text = uniqueExamples[exampleIndex] || "";
    input.placeholder = text.slice(0, charIndex) || "Contanos... ¿qué te pasó?";

    if (!deleting && charIndex < text.length) {
      charIndex += 1;
      window.setTimeout(tick, 58);
      return;
    }

    if (!deleting && charIndex >= text.length) {
      deleting = true;
      window.setTimeout(tick, 1500);
      return;
    }

    if (deleting && charIndex > 0) {
      charIndex -= 1;
      window.setTimeout(tick, 28);
      return;
    }

    deleting = false;
    exampleIndex = (exampleIndex + 1) % uniqueExamples.length;
    window.setTimeout(tick, 360);
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

  document.getElementById("authPrimaryButton")?.addEventListener("click", async () => {
    try {
      await handleAuthPrimary();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo iniciar sesion."));
    }
  });

  document.getElementById("authSecondaryButton")?.addEventListener("click", async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo cerrar la sesion."));
    }
  });

  document.getElementById("userSessionCard")?.addEventListener("click", (event) => {
    event.preventDefault();
    closeAllDrawers();
    toggleDrawer("accountDrawer", true);
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

  document.getElementById("categorySearchInput")?.addEventListener("input", (event) => {
    const value = event.target.value || "";
    const suggestedCategory = findBestCategoryByIntent(value);

    patchState("ui.categorySearchTerm", value);
    patchState("ui.showAllCategories", Boolean(value.trim()));

    if (suggestedCategory?.id) {
      setState((draft) => {
        draft.ui.selectedCategoryId = suggestedCategory.id;
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
    }

    scheduleBackendIntentResolution(value);
  });

  document.getElementById("categorySearchInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const suggestedCategory = findBestCategoryByIntent(event.currentTarget.value || "");

    if (suggestedCategory?.id) {
      registerCategoryUsage(suggestedCategory.id);
      setState((draft) => {
        draft.ui.selectedCategoryId = suggestedCategory.id;
        draft.ui.intentResolution = {
          query: event.currentTarget.value || "",
          topMatch: {
            category_id: suggestedCategory.id,
            code: suggestedCategory.code,
            confidence: 0.9
          },
          matches: [],
          resolvedAt: new Date().toISOString(),
          source: "local"
        };
      });
    }

    scheduleBackendIntentResolution(event.currentTarget.value || "");

    document.getElementById("searchProvidersButton")?.focus();
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

  document.getElementById("btnUseCurrentServiceLocation")?.addEventListener("click", async () => {
    try {
      await handleUseCurrentServiceLocation();
    } catch (error) {
      setInfo(
        null,
        normalizeAuthError(error, "No pudimos obtener tu ubicacion actual.")
      );
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
    const thread = document.getElementById("supportThread");
    const status = document.getElementById("supportStatusText");
    const body = input?.value?.trim();

    if (!body) return;

    if (thread) {
      const item = document.createElement("article");
      item.className = "support-message is-own";
      item.innerHTML = `<strong>Vos</strong><p></p><span>Enviado ahora</span>`;
      item.querySelector("p").textContent = body;
      thread.prepend(item);
    }

    if (status) {
      status.textContent = state.session.userId
        ? "Recibimos tu consulta. Cuando conectemos el endpoint de soporte cliente, saldra al panel del equipo."
        : "Tu consulta quedo preparada. Inicia sesion para asociarla a tu cuenta.";
    }

    input.value = "";
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

      const viewButton = event.target.closest("[data-client-view]");
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

      const categoryButton = event.target.closest("[data-category-id]");
      if (categoryButton) {
        event.preventDefault();
        event.stopPropagation();
        const nextCategoryId = categoryButton.dataset.categoryId;
        const nextCategory = appConfig.categories.find((category) => category.id === nextCategoryId);
        const nextNeedsHours = categoryPricingModel(nextCategory) === "HOURLY";
        registerCategoryUsage(nextCategoryId);
        setState((draft) => {
          draft.ui.selectedCategoryId = nextCategoryId;
          draft.ui.showAllCategories = false;
          draft.requestDraft.requestedHours = nextNeedsHours ? draft.requestDraft.requestedHours : 1;
        });
        seedForm();
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

      const categoryToggle = event.target.closest("[data-category-toggle]");
      if (categoryToggle) {
        event.preventDefault();
        event.stopPropagation();
        patchState("ui.showAllCategories", true);
        document.getElementById("categorySearchInput")?.focus();
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
        if (!selectProvider.dataset.providerSelect) return;
        await handleProviderSelection(selectProvider.dataset.providerSelect);
        setClientView("services");
        return;
      }

      const focusProvider = event.target.closest("[data-provider-focus]");
      if (focusProvider) {
        patchState("ui.selectedProviderCandidateId", focusProvider.dataset.providerFocus);
        return;
      }

      const requestAction = event.target.closest("[data-request-action]");
      if (requestAction) {
        await handleRequestAction(requestAction.dataset.requestAction);
        return;
      }

      const paymentAction = event.target.closest("[data-payment-action]");
      if (paymentAction) {
        await handlePaymentAction(paymentAction.dataset.paymentAction);
        return;
      }

      if (event.target.closest("[data-open-chat]")) {
        await openClientChat();
      }
    } catch (error) {
      setInfo(null, normalizeAuthError(error, "No se pudo completar la accion."));
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
    onTracking: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: payload.lat,
          lng: payload.lng
        };
      });

      updateClientMap({
        servicePosition: state.tracking.clientPosition,
        providerPosition: {
          lat: payload.lat,
          lng: payload.lng
        }
      });
    },
    onRequest: ({ new: payload }) => {
      if (!payload) return;

      setState((draft) => {
        if (draft.client.activeRequest?.id === payload.id) {
          draft.client.activeRequest = {
            ...draft.client.activeRequest,
            ...payload
          };
        }
      });
    }
  });
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
  initMap("clientMap", appConfig.mapInitialCenter, appConfig.mapInitialZoom);

// Service Worker desactivado temporalmente en Cliente.
// Evita error 404 hasta crear el SW correcto en /mimi-servicios/sw.js.
// Cuando exista el archivo, cambiar CLIENT_SW_ENABLED a true.
const CLIENT_SW_ENABLED = false;

if (CLIENT_SW_ENABLED && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch((err) => {
      console.warn("[MIMI Cliente] Service Worker no registrado:", err);
    });
}
  await bootstrapAsyncData();

  if (window.location.hash && window.location.hash.includes("access_token")) {
    history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );
  }

  setupRealtime();
  renderClientScreen(state);

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
