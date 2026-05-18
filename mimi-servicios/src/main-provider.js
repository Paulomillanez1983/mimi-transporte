/**
 * MIMI Servicios - Panel Prestador 2026
 * Main entry point with Uber Driver-style UX
 */

const MIMI_PROVIDER_BUILD = "2026.05.18.2";
const PARTNER_PWA_INSTALLED_KEY = "mimi_go_partner_pwa_installed";
const PARTNER_INSTALL_DISMISSED_KEY = "mimi_go_partner_install_dismissed_until";
const PARTNER_INSTALL_SESSION_KEY = "mimi_go_partner_install_shown_session";
const LEGACY_SW_PATHS = [
  "/mimi-servicios/sw-2026.js",
  "/service-worker.js",
  "/service-worker-clientes.js"
];
const PROVIDER_LEGAL_REQUIREMENT_FALLBACKS = [
  {
    document_code: "terms_providers",
    actor_type: "provider",
    accept_actor_type: "provider",
    version: "2026.1.0"
  },
  {
    document_code: "privacy_policy",
    actor_type: "all",
    accept_actor_type: "provider",
    version: "2026.1.0"
  }
];

window.MIMI_PROVIDER_BUILD = MIMI_PROVIDER_BUILD;

try {
  const previousBuild = sessionStorage.getItem("mimi_provider_build");
  const reloadFlag = `mimi_provider_reloaded_${MIMI_PROVIDER_BUILD}`;

  if (previousBuild && previousBuild !== MIMI_PROVIDER_BUILD && !sessionStorage.getItem(reloadFlag)) {
    sessionStorage.setItem(reloadFlag, "1");
    caches?.keys?.()
      ?.then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("mimi-go-partner-") || key.startsWith("mimi-servicios-provider-"))
          .map((key) => caches.delete(key))
      ))
      ?.finally(() => location.reload());
  }

  sessionStorage.setItem("mimi_provider_build", MIMI_PROVIDER_BUILD);
} catch (_) {}

import {
  initState,
  subscribe,
  actions,
  updateState,
  getDeviceId,
  STORAGE_KEYS
} from "./state/app-state.js";
import { appConfig } from "./config.js";
import {
  bootstrapSession,
  evaluateAuthRisk,
  invokeFunction,
  loadActiveRequest,
  loadCategories,
  loadConversationForRequest,
  loadMessages,
  loadOfferDetails,
  loadNotifications,
  loadOffers,
  loadProviderWorkspace,
  getProviderDashboard,
  getProviderPayoutAccount,
  approveSecurityChallenge,
  registerDevice,
  requestOtp,
  resolveServiceIntent,
  saveProviderWorkspace,
  sendMessage,
  startSecurityVerification,
  submitProviderPayoutAccount,
  touchProviderPresence,
  uploadProviderAvatar,
  uploadProviderDocument,
  signOut,
  updateProviderStatus,
  verifyOtp
  } from "./services/service-api.js?v=2026.05.18.2";
import {
  detectDefaultCountry,
  loadPhoneCountries,
  normalizePhoneNumber
} from "./utils/phone-countries.js";


import { renderProviderScreen } from "./ui/render-provider.js?v=2026.05.18.2";
import {
  clearAuthRedirectIntent,
  forceCleanSession,
  getSupabaseClient,
  signInWithGoogle
} from "./services/supabase.js?v=2026.05.14.9";
import { getMimiPushToken } from "./services/push.js";
import {
  MIMI_ACTIVE_JOB_LOCATION_INTERVAL_MS,
  MIMI_PROVIDER_HEARTBEAT_INTERVAL_MS
} from "./services/runtime-config.js";
import {
  loadCmsBanners,
  loadCmsFeatureFlags,
  loadCmsHomeSections,
  loadCmsServiceCategories
} from "./services/pocketbase-cms.js";
import { initObservability, markPerformance } from "./services/observability.js";
import {
  disconnectRealtime as disconnectManagedRealtime,
  subscribeScopedChannel
} from "./services/realtime-manager.js";
import { ensureMapLibreAssets } from "./services/map.js";
import { recordCriticalRiskEvent } from "./security/risk-events.js";

initObservability("provider");
markPerformance("provider_module_loaded");

async function removeConflictingServiceWorkers(expectedScopePath) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.getRegistrations) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scopePath = new URL(registration.scope).pathname;
        const scriptPath = new URL(
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          "",
          window.location.origin
        ).pathname;

        const isExpected = scopePath === expectedScopePath && scriptPath === "/sw-partner.js";
        const isLegacy = LEGACY_SW_PATHS.includes(scriptPath) || scopePath === "/mimi-servicios/";

        if (!isExpected && isLegacy) {
          await registration.unregister();
        }
      })
    );
  } catch (error) {
    console.warn("[MIMI GO Pro] No se pudieron limpiar service workers previos:", error);
  }
}

function normalizeProviderCategory(category = {}) {
  return {
    id: category.id,
    code: category.code,
    slug: category.slug ?? null,
    name: category.name,
    description: category.description,
    aliases: category.aliases ?? [],
    search_keywords: category.search_keywords ?? [],
    default_pricing_model: category.default_pricing_model ?? "HOURLY",
    requires_provider_quote: Boolean(category.requires_provider_quote),
    allowed_service_modes: category.allowed_service_modes ?? ["IN_PERSON"],
    requires_professional_license: Boolean(category.requires_professional_license),
    requires_background_check: Boolean(category.requires_background_check),
    source: category.source ?? null,
    discovery_status: category.discovery_status ?? null,
    auto_created: Boolean(category.auto_created)
  };
}

function categoryMergeKey(category = {}) {
  return String(category.code || category.slug || category.name || category.id || "")
    .trim()
    .toUpperCase();
}

function mergeProviderCmsCategories(baseCategories = [], cmsCategories = []) {
  const byKey = new Map();

  baseCategories
    .map(normalizeProviderCategory)
    .filter((category) => category.id && categoryMergeKey(category))
    .forEach((category) => byKey.set(categoryMergeKey(category), category));

  cmsCategories
    .filter((category) => category?.id || category?.slug || category?.name)
    .forEach((category) => {
      const key = categoryMergeKey(category);
      const existing = byKey.get(key);
      if (!existing) return;

      byKey.set(key, {
        ...existing,
        name: category.name || existing.name,
        description: category.description || existing.description,
        aliases: [
          ...(Array.isArray(existing.aliases) ? existing.aliases : []),
          ...(Array.isArray(category.aliases) ? category.aliases : [])
        ],
        source: existing.source || "supabase",
        cms_source: "pocketbase_cms",
        visual_order: Number(category.visual_order || existing.visual_order || 0)
      });
    });

  return [...byKey.values()].sort((a, b) => {
    const orderDelta = Number(a.visual_order || 0) - Number(b.visual_order || 0);
    if (orderDelta) return orderDelta;
    return String(a.name || "").localeCompare(String(b.name || ""), "es");
  });
}

function firstActiveCmsItem(items = []) {
  return (Array.isArray(items) ? items : []).find((item) => item?.active !== false) ?? null;
}

function textFromCms(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const partnerLoadingMessages = [
  {
    eyebrow: "Más libertad",
    title: "Trabajá cuando querés, donde querés.",
    body: "Organizá tus servicios desde un solo lugar."
  },
  {
    eyebrow: "Cerca tuyo",
    title: "Tus próximos clientes pueden estar cerca.",
    body: "Mostrá tu disponibilidad y prepará tu perfil."
  },
  {
    eyebrow: "Más simple",
    title: "Menos vueltas. Más oportunidades.",
    body: "MIMIGO reduce pasos para que puedas enfocarte en trabajar."
  },
  {
    eyebrow: "MIMIGO Partner",
    title: "La herramienta que menos trabajo te da para conseguir trabajo.",
    body: "Publicá, recibí solicitudes y administrá tu disponibilidad."
  },
  {
    eyebrow: "Tus servicios",
    title: "Publicá tus servicios y empezá a recibir solicitudes.",
    body: "Ordená precios, zonas y horarios con claridad."
  },
  {
    eyebrow: "Tu tiempo",
    title: "Tu tiempo vale. MIMIGO te ayuda a organizarlo.",
    body: "Tené tu panel listo para responder mejor."
  },
  {
    eyebrow: "Visibilidad",
    title: "Más visibilidad para trabajadores independientes.",
    body: "Una presencia clara ayuda a que te elijan."
  },
  {
    eyebrow: "Tu perfil",
    title: "Prepará tu perfil. Tus clientes te están esperando.",
    body: "Completá tus datos y mostrá tus servicios con confianza."
  }
];

const partnerLoadingMicrocopy = [
  "Sincronizando tu cuenta...",
  "Preparando tus servicios...",
  "Verificando tu estado...",
  "Cargando oportunidades..."
];

// ============================================
// APP CONTROLLER
// ============================================

class MimiProviderApp {
  constructor() {
    this.state = null;
    this.unsubscribe = null;
    this.map = null;
    this.markers = {};
    this.routeSourceId = "provider-service-route";
    this.routeLayerId = "provider-service-route-line";
    this.routeOutlineLayerId = "provider-service-route-outline";
    this.lastRouteFitKey = null;
    this.bottomSheet = null;
    this.offerTimer = null;
    this.trackingInterval = null;
    this.presenceHeartbeatInterval = null;
    this.partnerLoadingCarouselInterval = null;
    this.partnerLoadingRenderTimeout = null;
    this.partnerLoadingSlideIndex = 0;
    this.notificationsInterval = null;
    this.realtimeChannel = null;
    this.offerRealtimeChannel = null;
    this.notificationRealtimeChannel = null;
    this.chatRealtimeChannel = null;
    this.currentChatMode = "client";
    this.supportConversationId = null;
    this.lastRoadRouteKey = null;
    this.lastRoadRouteAt = 0;
    this.lastRoadRouteData = null;
    this.lastRouteDataKey = "";
    this.lastRouteDataAt = 0;
    this.navigationMode = false;
    this.navigationCameraFollowing = true;
    this.pendingActions = new Set();
    this.lastProviderTrackingPoint = null;
    this.lastProviderTrackingSentAt = 0;
    this.lastProviderTrackingRequestId = null;
    this.providerTrackingMinDistanceMeters = 1000;
    this.providerTrackingHeartbeatMs = MIMI_PROVIDER_HEARTBEAT_INTERVAL_MS;
    this.providerBootTimeout = null;
    this.sheetHistoryOpen = false;
    this.backGuardReady = false;
    this.allowProviderBackExit = false;
    this.providerExitConfirmResolver = null;
    this.sheetReturnTab = null;
    this.verificationReturnStep = null;
    this.installPromptSetupDone = false;
    
    // DOM Elements cache
    this.elements = {};
    
    // Touch handling for bottom sheet
    this.touchState = {
      startY: 0,
      currentY: 0,
      startHeight: 0,
      isDragging: false
    };

    this.cameraStream = null;
    this.cameraCapture = {
      documentType: null,
      blob: null,
      file: null
    };
  }
  
  /**
   * Initialize the app
   */
async init() {
  console.log("[MIMI] Initializing Provider App 2026...");

  document.body.classList.add("provider-auth-loading");
  document.body.classList.remove("provider-authenticated", "provider-auth-required");

  try {
    localStorage.setItem("mimi_services_active_mode", "provider");
    sessionStorage.setItem("mimi_services_active_mode", "provider");
  } catch (_) {}

  initState();

  this.cacheElements();
  this.showProviderBootLoader();
  this.startProviderBootTimeout();
  this.setupProviderUpdateManager();
  this.setupSecurityChallengeListeners();
  this.setupInstallPrompt();

  let earlySession = null;
  try {
    earlySession = await bootstrapSession();
  } catch (err) {
    console.warn("[MIMI] Provider early auth check failed; showing login gate:", err?.message ?? err);
  }

  if (!earlySession?.isAuthenticated) {
    actions.setSession({
      userId: null,
      providerId: null,
      userEmail: null,
      userName: null,
      userAvatar: null,
      isAuthenticated: false,
      token: null,
      expiresAt: null
    });
    this.showProviderLoginGate();
    actions.setLoading(false);
    console.log("[MIMI] Provider auth gate active");
    return;
  }

  // Cargar categorías — si la DB devuelve vacío o falla, usar el catálogo local de config.js
  clearAuthRedirectIntent();

  try {
    console.log("[MIMI] Loading categories...");
    const cats = await loadCategories();
    // Fallback: si DB devolvió 0 categorías, usar appConfig.categories (catálogo local)
    const sourceCats = (Array.isArray(cats) && cats.length > 0) ? cats : (appConfig.categories ?? []);

    const normalizedCategories = sourceCats.map(normalizeProviderCategory);

    // Sincronizar el modulo appConfig con rubros reales de Supabase/local.
    appConfig.categories = normalizedCategories;

    actions.updateState({
      appConfig: {
        categories: normalizedCategories,
        categoriesLoaded: true,
        categoriesError: null,
      },
      categories: normalizedCategories
    });
    console.log(`[MIMI] Categories loaded: ${normalizedCategories.length} items (DB: ${cats?.length ?? 0}, fallback: ${normalizedCategories.length - (cats?.length ?? 0)})`);
    this.loadProviderCmsVisuals(normalizedCategories);
  } catch (catErr) {
    console.error("[MIMI] loadCategories failed:", catErr.message);
    // En error: igual cargar el catálogo local para que la UI nunca quede vacía
    const fallbackCats = appConfig.categories ?? [];
    const normalizedFallback = fallbackCats.map(normalizeProviderCategory);
    appConfig.categories = normalizedFallback;
    actions.updateState({
      appConfig: { categories: normalizedFallback, categoriesLoaded: false, categoriesError: catErr.message },
      categories: normalizedFallback
    });
    this.loadProviderCmsVisuals(normalizedFallback);
  }

  this.cacheElements();

this.unsubscribe = subscribe((state) => {
  this.state = state;
  this.render();
});

const canBootProviderPanel = await this.loadInitialData();
  
if (!canBootProviderPanel) {
  console.log("[MIMI] Provider auth gate active");
  return;
}
  this.initUI();
  this.initMap().catch((err) => {
    console.warn("[MIMI] Map init deferred failed:", err?.message ?? err);
    this.showMapFallback();
  });

  this.setupEventListeners();
  this.setupBottomSheetGestures();
  this.checkLocationPermission();
  this.startBackgroundSync();
  this.subscribeRealtime();

  // Push notifications: si Firebase Messaging logró obtener token FCM,
  // lo registramos en svc_user_devices para que el backend pueda enviar
  // pushes cuando entre una solicitud nueva (incluso con la app cerrada).
  this.registerProviderPushToken({ prompt: false });

  console.log("[MIMI] App initialized");
}

async registerProviderPushToken({ prompt = false } = {}) {
  try {
    if (!this.state?.session?.userId) return;
    const token = await getMimiPushToken({ prompt });
    if (!token) {
      console.info("[MIMI Push] sin token, no registramos device para push");
      return;
    }
    await registerDevice({
      role: "provider",
      pushToken: token,
      notificationsEnabled: Boolean(token),
      deviceLabel: navigator.userAgentData?.platform || navigator.platform || "Web"
    });
    console.log("[MIMI Push] device registrado con FCM token");
  } catch (err) {
    console.warn("[MIMI Push] no se pudo registrar device:", err?.message ?? err);
  }
}
  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      // Header
      header: document.getElementById('header'),
      statusBadge: document.getElementById('statusBadge'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      menuButton: document.getElementById('menuButton'),
      
      // Online button
      onlineButtonContainer: document.getElementById('onlineButtonContainer'),
      goOnlineButton: document.getElementById('goOnlineButton'),
      providerGoogleLoginButton: document.getElementById('providerGoogleLoginButton'),      
      // Offer card
      offerCard: document.getElementById('offerCard'),
      offerTimer: document.getElementById('offerTimer'),
      offerService: document.getElementById('offerService'),
      offerLocation: document.getElementById('offerLocation'),
      offerClient: document.getElementById('offerClient'),
      offerPrice: document.getElementById('offerPrice'),
      offerDetails: document.getElementById('offerDetails'),
      providerPinOverlay: document.getElementById('providerPinOverlay'),
      providerPinInputs: document.getElementById('providerPinInputs'),
      providerPinStatus: document.getElementById('providerPinStatus'),
      providerPinSubmit: document.getElementById('providerPinSubmit'),
      providerPinClose: document.getElementById('providerPinClose'),
      providerPhoneOverlay: document.getElementById("providerPhoneOverlay"),
      providerPhoneForm: document.getElementById("providerPhoneForm"),
      providerPhoneInput: document.getElementById("providerPhoneInput"),
      providerPhoneCodeInput: document.getElementById("providerPhoneCodeInput"),
      providerPhoneStatus: document.getElementById("providerPhoneStatus"),
      providerPhoneSubmit: document.getElementById("providerPhoneSubmit"),
      providerPhoneClose: document.getElementById("providerPhoneClose"),
      providerPhoneResend: document.getElementById("providerPhoneResend"),
      providerPhoneChangeNumber: document.getElementById("providerPhoneChangeNumber"),
      providerPhoneSwitchAccount: document.getElementById("providerPhoneSwitchAccount"),
      providerPhoneTitle: document.getElementById("providerPhoneTitle"),
      providerPhoneCopy: document.getElementById("providerPhoneCopy"),
      providerPhoneEntryStep: document.getElementById("providerPhoneEntryStep"),
      providerPhoneOtpStep: document.getElementById("providerPhoneOtpStep"),
      providerPhoneOtpTarget: document.getElementById("providerPhoneOtpTarget"),
      providerPhoneCountryButton: document.getElementById("providerPhoneCountryButton"),
      providerPhoneCountryPanel: document.getElementById("providerPhoneCountryPanel"),
      providerPhoneCountryList: document.getElementById("providerPhoneCountryList"),
      providerPhoneCountrySearch: document.getElementById("providerPhoneCountrySearch"),
      providerPhoneCountryFlag: document.getElementById("providerPhoneCountryFlag"),
      providerPhoneCountryName: document.getElementById("providerPhoneCountryName"),
      providerPhoneCountryDial: document.getElementById("providerPhoneCountryDial"),
      providerBootLoader: document.getElementById("providerBootLoader"),
      providerBootTitle: document.getElementById("providerBootTitle"),
      providerBootSubtitle: document.getElementById("providerBootSubtitle"),
      providerBootMarketing: document.getElementById("providerBootMarketing"),
      providerBootMarketingEyebrow: document.getElementById("providerBootMarketingEyebrow"),
      providerBootMarketingTitle: document.getElementById("providerBootMarketingTitle"),
      providerBootMarketingBody: document.getElementById("providerBootMarketingBody"),
      providerBootMarketingDots: document.getElementById("providerBootMarketingDots"),
      providerBootRetry: document.getElementById("providerBootRetry"),
      acceptOffer: document.getElementById('acceptOffer'),
      rejectOffer: document.getElementById('rejectOffer'),
      cameraCaptureModal: document.getElementById("cameraCaptureModal"),
cameraVideo: document.getElementById("cameraVideo"),
cameraCanvas: document.getElementById("cameraCanvas"),
cameraStillPreview: document.getElementById("cameraStillPreview"),
cameraGuide: document.getElementById("cameraGuide"),
cameraBusyOverlay: document.getElementById("cameraBusyOverlay"),
cameraTitle: document.getElementById("cameraTitle"),
cameraHint: document.getElementById("cameraHint"),
cameraStatus: document.getElementById("cameraStatus"),
cameraCancelBtn: document.getElementById("cameraCancelBtn"),
cameraCaptureBtn: document.getElementById("cameraCaptureBtn"),
cameraRetakeBtn: document.getElementById("cameraRetakeBtn"),
cameraUseBtn: document.getElementById("cameraUseBtn"),
cameraSupportBtn: document.getElementById("cameraSupportBtn"),
dniFrontStatus: document.getElementById("dniFrontStatus"),
dniBackStatus: document.getElementById("dniBackStatus"),
selfieStatus: document.getElementById("selfieStatus"),
criminalRecordStatus: document.getElementById("criminalRecordStatus"),
verificationResultText: document.getElementById("verificationResultText"),
verificationResultList: document.getElementById("verificationResultList"),
      // Active service
      activeServiceCard: document.getElementById('activeServiceCard'),
      serviceStatusBadge: document.getElementById('serviceStatusBadge'),
      activeServiceType: document.getElementById('activeServiceType'),
      activeServiceLocation: document.getElementById('activeServiceLocation'),
      activeServiceClient: document.getElementById('activeServiceClient'),
      activeServicePayment: document.getElementById('activeServicePayment'),
      activeServiceNavigation: document.getElementById('activeServiceNavigation'),
      serviceEta: document.getElementById('serviceEta'),
      serviceDistance: document.getElementById('serviceDistance'),
      serviceNextStep: document.getElementById('serviceNextStep'),
      serviceStepList: document.getElementById('serviceStepList'),
      toggleInAppNavigation: document.getElementById('toggleInAppNavigation'),
      recenterNavigation: document.getElementById('recenterNavigation'),
      serviceNavModeLabel: document.getElementById('serviceNavModeLabel'),
      openExternalNavigation: document.getElementById('openExternalNavigation'),
      serviceActionBtn: document.getElementById('serviceActionBtn'),
      
      // Distance alert
      distanceAlert: document.getElementById('distanceAlert'),
      alertTitle: document.getElementById('alertTitle'),
      alertText: document.getElementById('alertText'),
      alertAction: document.getElementById('alertAction'),
      
      // Bottom sheet
      bottomSheet: document.getElementById('bottomSheet'),
      sheetCloseBtn: document.getElementById("sheetCloseBtn"),
      sheetHandle: document.querySelector('.sheet-handle-container'),
      sheetStatus: document.getElementById('sheetStatus'),
      sheetStatusDot: document.getElementById('sheetStatusDot'),
      sheetStatusText: document.getElementById('sheetStatusText'),
      sheetInfo: document.getElementById('sheetInfo'),
      sheetUpcoming: document.getElementById('sheetUpcoming'),
      sheetBasePrice: document.getElementById("sheetBasePrice"),
      sheetPricingMode: document.getElementById("sheetPricingMode"),
      sheetUpcomingTime: document.getElementById("sheetUpcomingTime"),
      
      // Tabs
      tabButtons: document.querySelectorAll('.tab-btn'),
      tabPanels: document.querySelectorAll('.tab-panel'),
      
      // Status toggle
      statusToggleModern: document.getElementById('statusToggleModern'),
      
      // Quick actions
      quickNotifications: document.getElementById('quickNotifications'),
      quickChat: document.getElementById('quickChat'),
      quickSupport: document.getElementById('quickSupport'),
      notificationBadge: document.getElementById('notificationBadge'),
      chatBadge: document.getElementById('chatBadge'),
      
      // Scheduled list
      scheduledList: document.getElementById('scheduledList'),
      
      // Verification
      verificationCard: document.getElementById('verificationCard'),
      verificationStatus: document.getElementById('verificationStatus'),
      verificationBtn: document.getElementById('verificationBtn'),
      
      // Services chips
      servicesChips: document.getElementById('servicesChips'),
      basePrice: document.getElementById("basePrice"),
      hourPrice: document.getElementById("hourPrice"),
      jobPrice: document.getElementById("jobPrice"),
      pricingModeHourly: document.getElementById("pricingModeHourly"),
      pricingModeJob: document.getElementById("pricingModeJob"),
      
      // Stats
      statRating: document.getElementById('statRating'),
      statCompleted: document.getElementById('statCompleted'),
      statOffers: document.getElementById('statOffers'),
      
      // Drawer
      drawerOverlay: document.getElementById('drawerOverlay'),
      sideDrawer: document.getElementById('sideDrawer'),
      drawerClose: document.getElementById('drawerClose'),
      drawerAvatar: document.getElementById('drawerAvatar'),
      drawerInitials: document.getElementById('drawerInitials'),
      drawerName: document.getElementById('drawerName'),
      drawerEmail: document.getElementById('drawerEmail'),
      drawerRating: document.getElementById('drawerRating'),
      drawerServices: document.getElementById('drawerServices'),
      drawerEarnings: document.getElementById('drawerEarnings'),
      logoutBtn: document.getElementById('logoutBtn'),
      
      // Notifications drawer
      notificationsDrawer: document.getElementById('notificationsDrawer'),
      notificationsList: document.getElementById('notificationsList'),
      markAllRead: document.getElementById('markAllRead'),
      
      // Chat drawer
      chatDrawer: document.getElementById('chatDrawer'),
      chatClose: document.getElementById('chatClose'),
      chatTitle: document.getElementById('chatTitle'),
      chatSubtitle: document.getElementById('chatSubtitle'),
      chatQuickReplies: document.getElementById('chatQuickReplies'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      chatSend: document.getElementById('chatSend'),
      providerSupportChatBtn: document.getElementById('providerSupportChatBtn'),
      
      // Modal
      verificationModal: document.getElementById('verificationModal'),
      modalClose: document.getElementById('modalClose'),
      wizardProgress: document.getElementById('wizardProgress'),
      wizardNext: document.getElementById('wizardNext'),
      wizardPrev: document.getElementById('wizardPrev'),
      providerExitOverlay: document.getElementById("providerExitOverlay"),
      providerExitCancel: document.getElementById("providerExitCancel"),
      providerExitConfirm: document.getElementById("providerExitConfirm"),
      
      // Toast
      toastContainer: document.getElementById('toastContainer'),
      
      // Install
      installBanner: document.getElementById('installBanner'),
      installBtn: document.getElementById('installBtn'),
      installDismiss: document.getElementById('installDismiss'),
      
      // Map
      mapContainer: document.getElementById('mapContainer'),
      map: document.getElementById('map'),
      mapFallback: document.getElementById('mapFallback')
    };
  }

  /**
   * Initialize UI state
   */
  initUI() {
    // Set initial bottom sheet state
    this.setBottomSheetState('peek');
    
    // Load scheduled services
    this.renderScheduledServices();
    
    // Load verification status
    this.renderVerificationStatus();
    
    // Load stats
    this.renderStats();
    this.renderServicesAndPricing();
    this.renderSheetSummary();
    renderProviderScreen(this.state);
  }

  /**
   * Initialize map
   */
async initMap() {
  console.log("[MIMI][initMap] entrando", {
    mapActual: this.map,
    maplibre: !!window.maplibregl
  });

  if (this.map) {
    console.log("[MIMI][initMap] ya existe mapa");

    setTimeout(() => {
      try {
        this.map.resize();
      } catch (_) {}
    }, 80);
    
    return;
  }

  const mapEl = document.getElementById("map");
  const mapFallback = this.elements.mapFallback;

  if (!mapEl) {
    console.warn("[MIMI][initMap] no existe #map");
    this.showMapFallback();
    return;
  }

  if (!window.maplibregl) {
    const mapLibreReady = await ensureMapLibreAssets();
    if (!mapLibreReady || !window.maplibregl) {
      console.warn("[MIMI][initMap] MapLibre no disponible");
      this.showMapFallback();
      return;
    }
  }

  if (!this.supportsWebGLMap()) {
    console.warn("[MIMI][initMap] WebGL no disponible");
    this.showMapFallback();
    return;
  }

  mapEl.hidden = false;
  mapEl.style.display = "block";
  mapEl.style.visibility = "visible";
  mapEl.style.width = "100%";
  mapEl.style.height = "100%";
  mapEl.style.minHeight = "100dvh";

  if (mapFallback) {
    mapFallback.hidden = true;
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));

  return new Promise((resolve) => {
    try {
      const esMobile = window.innerWidth <= 768;
      const temaOscuro = false;

      this.map = new maplibregl.Map({
        container: "map",
        style: temaOscuro
          ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [-64.19, -31.42],
        zoom: esMobile ? 11.8 : 12.4,
        pitch: esMobile ? 0 : 18,
        bearing: 0,
        antialias: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        renderWorldCopies: false
      });

      window.mimiProviderMap = this.map;
      window.__mimiProviderMapDebug = this.map;

      this.map.dragPan.disable();
      this.map.scrollZoom.disable();
      this.map.boxZoom.disable();
      this.map.doubleClickZoom.disable();
      this.map.touchZoomRotate.disable();
      this.map.keyboard.disable();

      const forceResize = () => {
        try {
          this.map?.resize?.();
        } catch (err) {
          console.warn("[MIMI][initMap] resize warning:", err);
        }
      };

this.map.on("load", () => {
  console.log("[MIMI][initMap] map load OK");

  actions.setMapReady(true);
  resolveMapOnce();

  setTimeout(() => {
    forceResize();
          try {
            const currentLocation = this.state?.location?.current;
            const hasCurrentLocation = this.isValidLatLng(currentLocation);
            this.map.easeTo({
              center: hasCurrentLocation
                ? [Number(currentLocation.lng), Number(currentLocation.lat)]
                : [-64.19, -31.42],
              zoom: hasCurrentLocation ? Math.max(this.map.getZoom(), 13) : (esMobile ? 11.8 : 12.4),
              duration: 500
            });
          } catch (err) {
            console.warn("[MIMI][initMap] easeTo warning:", err);
          }

          this.updateMapToCurrentPosition();

          console.log("[MIMI][initMap] listo", {
            mapExiste: !!this.map
          });

          resolve();
        }, 180);
      });

      this.map.on("error", (e) => {
        console.warn("[MIMI][initMap] map error:", e?.error || e);

        try {
          this.map?.remove?.();
        } catch (_) {}

        this.map = null;
        actions.setMapReady(false);
        this.showMapFallback();

        resolve();
      });

let mapResolved = false;

const resolveMapOnce = () => {
  if (mapResolved) return;
  mapResolved = true;
  resolve();
};

setTimeout(() => {
  if (!mapResolved && this.map) {
    console.warn("[MIMI][initMap] timeout load; contino igual");
    actions.setMapReady(true);
    forceResize();
    resolveMapOnce();
  }
}, 2500);
      
      window.addEventListener("resize", forceResize);
      window.addEventListener("orientationchange", () => {
        setTimeout(forceResize, 350);
      });

    } catch (err) {
      console.error("[MIMI][initMap] error creando mapa:", err);

      try {
        this.map?.remove?.();
      } catch (_) {}

      this.map = null;
      actions.setMapReady(false);
      this.showMapFallback();
      resolveMapOnce();
    }
  });
}
    /**
   * Check WebGL support for MapLibre
   */
  supportsWebGLMap() {
    try {
      const canvas = document.createElement("canvas");

      if (!window.WebGLRenderingContext) {
        return false;
      }

      const gl =
        canvas.getContext("webgl", { antialias: true, alpha: true }) ||
        canvas.getContext("experimental-webgl", { antialias: true, alpha: true });

      return !!gl;
    } catch (_) {
      return false;
    }
  }

  /**
   * Show map fallback
   */
  showMapFallback() {
    if (this.elements.map) {
      this.elements.map.hidden = true;
    }

    if (this.elements.mapFallback) {
      this.elements.mapFallback.hidden = false;
    }
  }

  /**
   * Update map to current position
   */
  updateMapToCurrentPosition() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        if (this.map) {
          const providerPosition = {
            lat: latitude,
            lng: longitude
          };

          const servicePosition = this.servicePositionFromState();

          this.updateProviderRouteOnMap({
            providerPosition,
            servicePosition
          });
        }

        actions.setLocation({
          lat: latitude,
          lng: longitude,
          accuracy: position.coords.accuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
          timestamp: Date.now()
        });
      },
      (error) => {
        console.warn("[MIMI] Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  applyProviderLocationSnapshot(profile = null) {
    const lat = Number(profile?.last_lat);
    const lng = Number(profile?.last_lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }

    const timestamp = profile?.last_seen_at
      ? Date.parse(profile.last_seen_at)
      : Date.now();

    const location = {
      lat,
      lng,
      accuracy: null,
      heading: null,
      speed: null,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      source: "online_snapshot"
    };

    actions.setLocation(location);

    this.updateProviderRouteOnMap({
      providerPosition: location,
      servicePosition: this.servicePositionFromState()
    });

    return true;
  }

  startPresenceHeartbeat() {
    if (this.presenceHeartbeatInterval) {
      clearInterval(this.presenceHeartbeatInterval);
    }

    this.presenceHeartbeatInterval = setInterval(async () => {
      const providerId = this.state?.session?.providerId;
      const status = String(this.state?.provider?.status ?? "").toUpperCase();

      if (!providerId || status === "OFFLINE") {
        return;
      }

      try {
        await touchProviderPresence(providerId);
      } catch (err) {
        console.warn("[MIMI] Error actualizando presencia liviana:", err);
      }
    }, MIMI_PROVIDER_HEARTBEAT_INTERVAL_MS);
  }

  stopPresenceHeartbeat() {
    if (this.presenceHeartbeatInterval) {
      clearInterval(this.presenceHeartbeatInterval);
      this.presenceHeartbeatInterval = null;
    }
  }

  servicePositionFromState() {
    const activeService = this.state?.activeService;
    const offerRequest = this.state?.activeOffer?.raw?.svc_requests ?? this.state?.activeOffer?.raw?.request ?? {};
    const offerDetails = this.state?.activeOffer?.details ?? {};

    const position = {
      lat:
        activeService?.raw?.service_lat ??
        activeService?.raw?.lat ??
        offerRequest?.service_lat ??
        offerDetails?.service_lat ??
        null,
      lng:
        activeService?.raw?.service_lng ??
        activeService?.raw?.lng ??
        offerRequest?.service_lng ??
        offerDetails?.service_lng ??
        null
    };

    return this.isValidServiceLatLng(position) ? position : { lat: null, lng: null };
  }

  isValidLatLng(position, { allowZeroZero = true } = {}) {
    const lat = Number(position?.lat);
    const lng = Number(position?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
    if (!allowZeroZero && lat === 0 && lng === 0) return false;
    return true;
  }

  isValidServiceLatLng(position) {
    return this.isValidLatLng(position, { allowZeroZero: false });
  }

  createRouteMarker(type) {
    const el = document.createElement("div");
    el.className = `provider-route-marker provider-route-marker--${type}`;
    el.innerHTML = type === "provider"
      ? '<span class="provider-route-marker-dot"></span>'
      : '<span class="provider-route-marker-pin"></span>';

    return new maplibregl.Marker({
      element: el,
      anchor: type === "provider" ? "center" : "bottom"
    });
  }

  ensureProviderRouteLayer() {
    if (!this.map?.isStyleLoaded?.()) return false;

    if (!this.map.getSource(this.routeSourceId)) {
      this.map.addSource(this.routeSourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {}
        }
      });
    }

    if (!this.map.getLayer(this.routeOutlineLayerId)) {
      this.map.addLayer({
        id: this.routeOutlineLayerId,
        type: "line",
        source: this.routeSourceId,
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.9
        },
        layout: {
          "line-cap": "round",
          "line-join": "round"
        }
      });
    }

    if (!this.map.getLayer(this.routeLayerId)) {
      this.map.addLayer({
        id: this.routeLayerId,
        type: "line",
        source: this.routeSourceId,
        paint: {
          "line-color": "#20d463",
          "line-width": 4,
          "line-opacity": 0.95
        },
        layout: {
          "line-cap": "round",
          "line-join": "round"
        }
      });
    }

    return true;
  }

  updateProviderRouteOnMap({ providerPosition, servicePosition = null }) {
    if (!this.map || !window.maplibregl) return;

    const hasProvider = this.isValidLatLng(providerPosition);
    const hasService = this.isValidServiceLatLng(servicePosition);

    if (!hasProvider && !hasService) return;

    if (!this.map.isStyleLoaded?.()) {
      this.map.once("load", () => this.updateProviderRouteOnMap({ providerPosition, servicePosition }));
      return;
    }

    if (hasProvider) {
      try {
        this.map.resize?.();
      } catch (_) {}

      const providerLngLat = [Number(providerPosition.lng), Number(providerPosition.lat)];
      if (!this.markers.provider) {
        this.markers.provider = this.createRouteMarker("provider")
          .setLngLat(providerLngLat)
          .addTo(this.map);
      } else {
        this.markers.provider.setLngLat(providerLngLat);
      }

      window.requestAnimationFrame(() => {
        if (!this.map || !this.markers.provider) return;
        this.markers.provider.setLngLat(providerLngLat);
      });
    }

    if (hasService) {
      const serviceLngLat = [Number(servicePosition.lng), Number(servicePosition.lat)];
      if (!this.markers.service) {
        this.markers.service = this.createRouteMarker("service")
          .setLngLat(serviceLngLat)
          .addTo(this.map);
      } else {
        this.markers.service.setLngLat(serviceLngLat);
      }
    } else if (this.markers.service) {
      this.markers.service.remove();
      this.markers.service = null;
    }

    const routeReady = this.ensureProviderRouteLayer();
    const routeSource = routeReady ? this.map.getSource(this.routeSourceId) : null;

    if (routeSource) {
      const coordinates = hasProvider && hasService
        ? [
            [Number(providerPosition.lng), Number(providerPosition.lat)],
            [Number(servicePosition.lng), Number(servicePosition.lat)]
          ]
        : [];
      const routeDataKey = JSON.stringify(coordinates.map((coord) => coord.map((value) => Number(value).toFixed(5))));
      const now = Date.now();

      if (routeDataKey !== this.lastRouteDataKey || now - this.lastRouteDataAt > 15000) {
        this.lastRouteDataKey = routeDataKey;
        this.lastRouteDataAt = now;
        routeSource.setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {}
        });
      }
    }

    if (hasProvider && hasService) {
      this.updateProviderNavigationPanel({ providerPosition, servicePosition });
      this.updateProviderRoadRoute({ providerPosition, servicePosition });

      const fitKey = [
        Number(providerPosition.lat).toFixed(4),
        Number(providerPosition.lng).toFixed(4),
        Number(servicePosition.lat).toFixed(4),
        Number(servicePosition.lng).toFixed(4)
      ].join(":");

      if (fitKey !== this.lastRouteFitKey) {
        this.lastRouteFitKey = fitKey;
        const bounds = new maplibregl.LngLatBounds()
          .extend([Number(providerPosition.lng), Number(providerPosition.lat)])
          .extend([Number(servicePosition.lng), Number(servicePosition.lat)]);

        this.map.fitBounds(bounds, {
          padding: { top: 112, right: 28, bottom: 280, left: 28 },
          maxZoom: 15.5,
          duration: 450
        });
      }
      return;
    }

    this.updateProviderNavigationPanel({ providerPosition, servicePosition: null });

    if (hasProvider) {
      const center = [Number(providerPosition.lng), Number(providerPosition.lat)];
      this.map.easeTo({
        center,
        zoom: Math.max(this.map.getZoom(), 13),
        duration: 350,
        essential: true
      });

      window.setTimeout(() => {
        if (!this.map || !this.markers.provider) return;
        try {
          this.map.resize?.();
          this.markers.provider.setLngLat(center);
          this.map.easeTo({
            center,
            zoom: Math.max(this.map.getZoom(), 13),
            duration: 180,
            essential: true
          });
        } catch (error) {
          console.warn("[MIMI] No se pudo recentrar marcador de prestador:", error);
        }
      }, 260);
    }
  }

  serviceRouteLabel(service) {
    const servicePosition = {
      lat: service?.raw?.service_lat ?? service?.raw?.lat ?? service?.service_lat ?? null,
      lng: service?.raw?.service_lng ?? service?.raw?.lng ?? service?.service_lng ?? null
    };

    if (this.isValidServiceLatLng(servicePosition)) {
      return "Ruta activa en el mapa";
    }

    return service?.location || "Ubicacion a confirmar";
  }

  drawProviderRouteCoordinates(coordinates = []) {
    if (!this.map || !this.ensureProviderRouteLayer()) return;
    const routeSource = this.map.getSource(this.routeSourceId);
    if (!routeSource) return;

    routeSource.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: Array.isArray(coordinates) ? coordinates : []
      },
      properties: {}
    });
  }

  distanceMetersBetween(a, b) {
    if (!this.isValidLatLng(a) || !this.isValidLatLng(b)) return null;
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const earth = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earth * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  formatRouteDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value)) return "--";
    if (value < 1000) return `${Math.max(50, Math.round(value / 10) * 10)} m`;
    return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)} km`;
  }

  formatRouteEta(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return "--";
    const minutes = Math.ceil(value / 60);
    return `${Math.max(1, minutes)} min`;
  }

  routeInstructionText(route) {
    const steps = route?.legs?.[0]?.steps ?? [];
    const step = steps.find((item) => item?.maneuver?.type && item.maneuver.type !== "depart") ?? steps[0];
    const type = step?.maneuver?.type;
    const modifier = step?.maneuver?.modifier;
    const street = step?.name ? ` por ${step.name}` : "";

    if (!type) return "Segui la ruta marcada hasta el domicilio del cliente.";

    const labels = {
      turn: modifier === "left" ? "Dobla a la izquierda" : modifier === "right" ? "Dobla a la derecha" : "Segui el giro indicado",
      new_name: "Continua",
      continue: "Continua derecho",
      merge: "Incorporate a la via",
      fork: "Toma la bifurcacion indicada",
      roundabout: "En la rotonda, toma la salida indicada",
      arrive: "Estas llegando al domicilio"
    };

    return `${labels[type] || "Segui la indicacion"}${street}.`;
  }

  routeStepItems(route) {
    const steps = route?.legs?.[0]?.steps ?? [];
    return steps
      .filter((step) => step?.maneuver?.type && step.maneuver.type !== "depart")
      .slice(0, 4)
      .map((step, index) => ({
        id: `${step?.maneuver?.type || "step"}-${index}`,
        instruction: this.routeInstructionText({ legs: [{ steps: [step] }] }),
        distance: this.formatRouteDistance(step?.distance),
        duration: this.formatRouteEta(step?.duration)
      }));
  }

  renderProviderStepList(route) {
    const list = this.elements.serviceStepList;
    if (!list) return;

    const items = this.routeStepItems(route ?? this.lastRoadRouteData);
    if (!items.length) {
      list.innerHTML = `
        <div class="service-step-item is-current">
          <b>1</b>
          <span>Segui la ruta verde hasta el domicilio del cliente.</span>
          <small>Guia activa</small>
        </div>
      `;
      return;
    }

    list.innerHTML = items
      .map((item, index) => `
        <div class="service-step-item ${index === 0 ? "is-current" : ""}">
          <b>${index + 1}</b>
          <span>${this.escapeHtml(item.instruction)}</span>
          <small>${this.escapeHtml(item.distance)} - ${this.escapeHtml(item.duration)}</small>
        </div>
      `)
      .join("");
  }

  bearingBetween(a, b) {
    if (!this.isValidLatLng(a) || !this.isValidLatLng(b)) return 0;
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const toDeg = (value) => (value * 180) / Math.PI;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  nextRoutePoint(providerPosition, route = null) {
    const coords = route?.geometry?.coordinates ?? this.lastRoadRouteData?.geometry?.coordinates ?? [];
    if (!Array.isArray(coords) || coords.length < 2) return null;

    let bestIndex = 0;
    let bestDistance = Infinity;
    coords.forEach((coord, index) => {
      const candidate = { lng: coord?.[0], lat: coord?.[1] };
      const distance = this.distanceMetersBetween(providerPosition, candidate);
      if (Number.isFinite(distance) && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const ahead = coords[Math.min(coords.length - 1, bestIndex + 6)] ?? coords[bestIndex + 1];
    return ahead ? { lng: ahead[0], lat: ahead[1] } : null;
  }

  followProviderNavigationCamera({ providerPosition, servicePosition, route = null, force = false }) {
    if (!this.map || (!this.navigationMode && !force) || !this.isValidLatLng(providerPosition)) return;

    const nextPoint = this.nextRoutePoint(providerPosition, route) || servicePosition;
    const bearing = this.isValidLatLng(nextPoint)
      ? this.bearingBetween(providerPosition, nextPoint)
      : this.map.getBearing?.() || 0;

    const now = Date.now();
    if (!force && now - (this.lastNavigationCameraAt || 0) < 2500) return;
    this.lastNavigationCameraAt = now;

    try {
      this.map.easeTo({
        center: [Number(providerPosition.lng), Number(providerPosition.lat)],
        zoom: Math.max(this.map.getZoom?.() || 0, 16.2),
        pitch: 48,
        bearing,
        padding: { top: 128, right: 36, bottom: 320, left: 36 },
        duration: force ? 520 : 850,
        easing: (t) => t * (2 - t)
      });
    } catch (error) {
      console.warn("[MIMI][provider-nav] camera follow failed:", error?.message || error);
    }
  }

  toggleInAppNavigation() {
    this.navigationMode = !this.navigationMode;
    this.navigationCameraFollowing = this.navigationMode;
    document.body.classList.toggle("provider-navigation-active", this.navigationMode);
    this.updateProviderNavigationPanel({
      providerPosition: this.state?.location?.current,
      servicePosition: this.servicePositionFromState(),
      route: this.lastRoadRouteData
    });

    if (this.navigationMode) {
      this.setBottomSheetState("collapsed");
      this.recenterNavigationCamera();
      this.showToast("Guia in-app activada", "success");
    } else {
      this.showToast("Guia in-app pausada", "info");
    }
  }

  recenterNavigationCamera() {
    const providerPosition = this.state?.location?.current;
    const servicePosition = this.servicePositionFromState();
    this.followProviderNavigationCamera({
      providerPosition,
      servicePosition,
      route: this.lastRoadRouteData,
      force: true
    });
  }

  updateProviderRoadRoute({ providerPosition, servicePosition }) {
    if (!this.isValidLatLng(providerPosition) || !this.isValidServiceLatLng(servicePosition)) return;

    const routeKey = [
      Number(providerPosition.lat).toFixed(4),
      Number(providerPosition.lng).toFixed(4),
      Number(servicePosition.lat).toFixed(4),
      Number(servicePosition.lng).toFixed(4)
    ].join(":");

    const now = Date.now();
    if (this.lastRoadRouteKey === routeKey && now - this.lastRoadRouteAt < 15000) return;

    this.lastRoadRouteKey = routeKey;
    this.lastRoadRouteAt = now;

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${Number(providerPosition.lng)},${Number(providerPosition.lat)};` +
      `${Number(servicePosition.lng)},${Number(servicePosition.lat)}` +
      `?overview=full&geometries=geojson&steps=true`;

    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const route = data?.routes?.[0];
        const coordinates = route?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        this.lastRoadRouteData = route;
        this.drawProviderRouteCoordinates(coordinates);
        this.renderProviderStepList(route);
        this.updateProviderNavigationPanel({ providerPosition, servicePosition, route });
      })
      .catch((error) => {
        console.warn("[MIMI][provider-route] road route fallback:", error?.message || error);
      });
  }

  updateProviderNavigationPanel({ providerPosition, servicePosition, route = null }) {
    const panel = this.elements.activeServiceNavigation;
    if (!panel) return;

    if (!this.state?.activeService || !this.isValidServiceLatLng(servicePosition)) {
      panel.hidden = true;
      return;
    }

    const distance = route?.distance ?? this.distanceMetersBetween(providerPosition, servicePosition);
    const durationSeconds = route?.duration ?? (distance ? (distance / 1000 / 28) * 3600 : null);
    const status = this.normalizeRequestStatus(this.state.activeService.status);

    panel.hidden = false;
    if (this.elements.serviceDistance) {
      this.elements.serviceDistance.textContent = this.formatRouteDistance(distance);
    }
    if (this.elements.serviceEta) {
      this.elements.serviceEta.textContent = this.formatRouteEta(durationSeconds);
    }
    if (this.elements.serviceNextStep) {
      const statusHints = {
        ACCEPTED: "Toca En camino cuando salgas hacia el domicilio.",
        PROVIDER_EN_ROUTE: this.routeInstructionText(route ?? this.lastRoadRouteData),
        PROVIDER_ARRIVED: "Ya estas en el domicilio. Confirma llegada o inicia el servicio.",
        IN_PROGRESS: "Servicio en curso. Finalizalo cuando termines el trabajo."
      };
      this.elements.serviceNextStep.textContent = statusHints[status] || "Ruta activa hacia el cliente.";
    }

    this.renderProviderStepList(route ?? this.lastRoadRouteData);

    if (this.elements.toggleInAppNavigation) {
      this.elements.toggleInAppNavigation.textContent = this.navigationMode ? "Pausar guia" : "Seguir en app";
      this.elements.toggleInAppNavigation.classList.toggle("is-active", this.navigationMode);
    }

    if (this.elements.serviceNavModeLabel) {
      this.elements.serviceNavModeLabel.textContent = this.navigationMode
        ? "Camara siguiendo tu ubicacion en tiempo real"
        : "Activa Seguir en app para navegar sin salir de MIMI";
    }

    if (this.navigationMode) {
      this.followProviderNavigationCamera({ providerPosition, servicePosition, route });
    }
  }

  openExternalNavigation() {
    const destination = this.servicePositionFromState();
    if (!this.isValidServiceLatLng(destination)) {
      this.showToast("Todavia no tenemos la ubicacion del cliente", "warning");
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destination.lat},${destination.lng}`)}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /**
   * Update provider marker on map
   */
updateProviderMarker(lat, lng) {
  this.updateProviderRouteOnMap({
    providerPosition: { lat, lng },
    servicePosition: null
  });
}

showProviderLoginGate() {
  const container = this.elements.onlineButtonContainer;

  document.body.classList.add("provider-auth-required");
  document.body.classList.remove("provider-auth-loading", "provider-authenticated");
  this.hideProviderBootLoader();

  if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "none";
  if (this.elements.header) this.elements.header.style.display = "none";
  if (this.elements.mapContainer) this.elements.mapContainer.style.display = "none";
  if (this.elements.offerCard) this.elements.offerCard.hidden = true;
  if (this.elements.activeServiceCard) this.elements.activeServiceCard.hidden = true;
  if (this.elements.distanceAlert) this.elements.distanceAlert.hidden = true;

  if (!container) return;

  container.classList.remove("hidden");
  container.hidden = false;

container.removeAttribute("aria-hidden");
container.style.display = "block";
container.style.position = "fixed";
container.style.inset = "0";
container.style.width = "100%";
container.style.minHeight = "100dvh";
container.style.zIndex = "99999";
container.style.padding = "0";
container.style.pointerEvents = "auto";
container.style.transform = "none";
container.style.background = "";

  container.innerHTML = `
<section class="provider-auth-shell provider-splash" aria-label="Acceso para prestadores MIMI GO">
  <div class="provider-splash-bg" aria-hidden="true">
    <span class="provider-splash-glow provider-splash-glow--main"></span>
    <span class="provider-splash-glow provider-splash-glow--low"></span>
  </div>

  <div class="provider-splash-stage">
    <div class="mimigo-logo-motion" aria-label="MIMIGO">
      <span class="mimigo-word" aria-hidden="true">
        <span class="mimigo-letter mimigo-letter--m1">M</span>
        <span class="mimigo-letter mimigo-letter--i1">I</span>
        <span class="mimigo-letter mimigo-letter--m2">M</span>
        <span class="mimigo-letter mimigo-letter--i2">I</span>
      </span>
      <span class="mimigo-go-mark" aria-hidden="true">
        <span class="mimigo-letter mimigo-letter--g">G</span>
        <span class="mimigo-letter mimigo-letter--o">O<span class="sun-glow"></span></span>
      </span>
    </div>

    <div class="provider-splash-divider" aria-hidden="true"></div>

    <p class="provider-splash-tagline" aria-label="La herramienta que menos trabajo te da para conseguir trabajo.">
      <span>La herramienta</span>
      <span>que <strong>menos trabajo</strong> te da</span>
      <span>para conseguir trabajo.</span>
      <span class="sr-only">La herramienta que menos trabajo te da para conseguir trabajo.</span>
    </p>

    <div class="provider-splash-mini-divider" aria-hidden="true">
      <span></span><i></i><span></span>
    </div>

    <div class="provider-splash-system" aria-hidden="true">
      <span class="system-particle system-particle--a"></span>
      <span class="system-particle system-particle--b"></span>
      <span class="system-particle system-particle--c"></span>
      <span class="system-particle system-particle--d"></span>
      <div class="system-orbit system-orbit--outer"></div>
      <div class="system-orbit system-orbit--middle"></div>
      <div class="system-orbit system-orbit--inner"></div>
      <div class="system-arrows">
        <svg viewBox="0 0 240 240">
          <path d="M54 116c16-45 58-72 108-62"></path>
          <path d="M168 55l13 4-10 10"></path>
          <path d="M186 124c-13 48-54 78-105 69"></path>
          <path d="M75 192l-13-5 10-9"></path>
        </svg>
      </div>
      <div class="system-core">
        <span class="system-core-ring"></span>
        <svg viewBox="0 0 24 24">
          <path d="M6.4 12.2l3.6 3.6 7.8-8.1"></path>
        </svg>
      </div>
      <div class="system-node system-node--top">
        <svg viewBox="0 0 24 24">
          <path d="M8 7V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"></path>
          <path d="M5 8h14v10H5z"></path>
          <path d="M9 12h6"></path>
        </svg>
      </div>
      <div class="system-node system-node--right">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3"></circle>
          <path d="M6.5 19c1-3 2.9-4.5 5.5-4.5s4.5 1.5 5.5 4.5"></path>
        </svg>
      </div>
      <div class="system-node system-node--bottom">
        <svg viewBox="0 0 24 24">
          <path d="M12 4l2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8z"></path>
        </svg>
      </div>
      <div class="system-node system-node--left">
        <svg viewBox="0 0 24 24">
          <path d="M20 4L4 11.2l6.8 2.3L13.2 20z"></path>
          <path d="M20 4l-9.2 9.5"></path>
        </svg>
      </div>
      <div class="system-floor"></div>
    </div>

    <p class="provider-splash-subheadline">
      Conectamos prestadores con personas<br>
      que necesitan <span>servicios reales.</span>
    </p>

    <button class="provider-auth-google google-login-primary" id="providerGoogleLoginButton" type="button">
      <span class="provider-auth-google-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.2l6.5-6.5C35.3 2.6 30 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.7c-.3 2-1.6 5-4.4 7l6.9 5.3c4-3.7 6.3-9.2 6.3-16z"/>
          <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6.1z"/>
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-6.9-5.3c-1.9 1.3-4.5 2.2-9 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
      </span>
      <span class="provider-auth-google-copy"><strong>Continuar con Google</strong></span>
    </button>

    <p class="provider-splash-security">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 10V8a5 5 0 0 1 10 0v2"></path>
        <rect x="5" y="10" width="14" height="10" rx="2"></rect>
        <path d="M12 14v2.5"></path>
      </svg>
      <span>Plataforma simple y segura<br>para los <b>prestadores.</b></span>
    </p>
  </div>
</section>
`;

  const installBanner =
    this.elements.installBanner || document.getElementById("installBanner");

  if (installBanner) {
    installBanner.hidden = true;
    installBanner.style.setProperty("display", "none", "important");
  }

  const googleButton = document.getElementById("providerGoogleLoginButton");
  if (!googleButton) return;

  googleButton.addEventListener("click", async () => {
    try {
      googleButton.disabled = true;
      document.body.classList.add("provider-auth-submitting");
      localStorage.setItem("mimi_services_active_mode", "provider");
      sessionStorage.setItem("mimi_services_active_mode", "provider");
      sessionStorage.setItem(
        "mimi_services_auth_redirect_in_progress",
        "./prestador.html"
      );

      await signInWithGoogle({ mode: "provider" });
    } catch (err) {
      googleButton.disabled = false;
      document.body.classList.remove("provider-auth-submitting");
      console.error("[MIMI] Error iniciando sesin prestador:", err);
      this.showToast("No pudimos iniciar sesin con Google", "error");
    }
  });

  this.loadProviderAuthCmsVisuals().catch((error) => {
    if (window.MIMI_DEBUG_CMS) {
      console.warn("[MIMI CMS] Provider auth fallback", error?.message || error);
    }
  });
}  

async loadProviderAuthCmsVisuals() {
  if (document.querySelector(".provider-splash")) return;

  const [featureFlags, banners, homeSections, cmsCategories] = await Promise.all([
    loadCmsFeatureFlags(),
    loadCmsBanners("provider"),
    loadCmsHomeSections("provider"),
    loadCmsServiceCategories([])
  ]);

  if (featureFlags.enable_provider_highlights === false) return;

  const banner = firstActiveCmsItem(banners);
  const section = firstActiveCmsItem(homeSections);
  const title = textFromCms(section?.title || banner?.title, 100);
  const subtitle = textFromCms(section?.subtitle || banner?.subtitle, 160);
  const body = textFromCms(section?.body || banner?.body || banner?.subtitle, 180);

  const heroTitle = document.querySelector(".provider-auth-copy h1");
  const heroSubtitle = document.querySelector(".provider-auth-copy p");
  const cardTitle = document.querySelector(".provider-auth-card-title");
  const cardSubtitle = document.querySelector(".provider-auth-card-subtitle");
  const cardCopy = document.querySelector(".provider-auth-card-copy");
  const serviceCards = [...document.querySelectorAll(".provider-auth-service")];

  if (heroTitle && title) heroTitle.textContent = title;
  if (heroSubtitle && subtitle) heroSubtitle.textContent = subtitle;
  if (cardTitle && banner?.title) cardTitle.textContent = textFromCms(banner.title, 80);
  if (cardSubtitle && banner?.subtitle) cardSubtitle.textContent = textFromCms(banner.subtitle, 120);
  if (cardCopy && body) cardCopy.textContent = body;

  const visibleCategories = (Array.isArray(cmsCategories) ? cmsCategories : [])
    .filter((item) => item?.active !== false)
    .slice(0, 3);

  visibleCategories.forEach((category, index) => {
    const card = serviceCards[index];
    if (!card) return;
    const label = card.querySelector("span");
    if (label) label.textContent = textFromCms(category.name, 30);
  });

  const totalCard = serviceCards[3];
  const totalStrong = totalCard?.querySelector("strong");
  const totalLabel = totalCard?.querySelector("span");
  if (totalStrong && cmsCategories?.length) totalStrong.textContent = `+${Math.max(0, cmsCategories.length - 3)}`;
  if (totalLabel && cmsCategories?.length) totalLabel.textContent = "rubros";
}

async loadProviderCmsVisuals(baseCategories = []) {
  const safeBase = Array.isArray(baseCategories) && baseCategories.length
    ? baseCategories
    : this.state?.appConfig?.categories ?? appConfig.categories ?? [];

  try {
    const [cmsCategories, featureFlags, banners, homeSections] = await Promise.all([
      loadCmsServiceCategories([]),
      loadCmsFeatureFlags(),
      loadCmsBanners("provider"),
      loadCmsHomeSections("provider")
    ]);

    const mergedCategories = featureFlags.enable_dynamic_categories === false
      ? safeBase
      : mergeProviderCmsCategories(safeBase, cmsCategories);
    if (mergedCategories.length) {
      appConfig.categories = mergedCategories;
    }

    window.MIMI_CMS_FEATURE_FLAGS = Object.freeze({ ...featureFlags });

    actions.updateState({
      appConfig: {
        categories: mergedCategories.length ? mergedCategories : safeBase,
        categoriesLoaded: true,
        categoriesError: null
      },
      categories: mergedCategories.length ? mergedCategories : safeBase,
      meta: {
        ...(this.state?.meta ?? {}),
        cmsFeatureFlags: featureFlags,
        cmsLoadedAt: new Date().toISOString(),
        cmsProviderCategoriesEnriched: Boolean(cmsCategories?.length),
        cmsProviderVisuals: {
          banners: Array.isArray(banners) ? banners.length : 0,
          homeSections: Array.isArray(homeSections) ? homeSections.length : 0
        }
      }
    });
  } catch (error) {
    if (window.MIMI_DEBUG_CMS) {
      console.warn("[MIMI CMS] Provider fallback", error?.message || error);
    }
  }
}
  
renderDrawerProfile() {
  const session = this.state?.session ?? {};
  const profile = this.state?.provider?.profile ?? {};

  const name =
    profile.full_name ||
    session.userName ||
    session.userEmail ||
    "Prestador MIMI";

  const email =
    profile.email ||
    session.userEmail ||
    "Sin email conectado";

  const avatar =
    profile.avatar_url ||
    session.userAvatar ||
    null;

  const initials = String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "PR";

  if (this.elements.drawerName) {
    this.elements.drawerName.textContent = name;
  }

  if (this.elements.drawerEmail) {
    this.elements.drawerEmail.textContent = email;
  }

  if (this.elements.drawerInitials) {
    this.elements.drawerInitials.textContent = initials;
  }

  if (this.elements.drawerAvatar) {
    if (avatar) {
      this.elements.drawerAvatar.style.backgroundImage = `url("${avatar}")`;
      this.elements.drawerAvatar.style.backgroundSize = "cover";
      this.elements.drawerAvatar.style.backgroundPosition = "center";
      this.elements.drawerInitials.style.display = "none";
    } else {
      this.elements.drawerAvatar.style.backgroundImage = "";
      this.elements.drawerInitials.style.display = "";
    }
  }

  if (this.elements.drawerRating) {
    this.elements.drawerRating.textContent = Number(
      this.state?.provider?.stats?.rating ?? 0
    ).toFixed(1);
  }

  if (this.elements.drawerServices) {
    this.elements.drawerServices.textContent = String(
      this.state?.provider?.stats?.completedServices ?? 0
    );
  }

  if (this.elements.drawerEarnings) {
    this.elements.drawerEarnings.textContent = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(Number(this.state?.provider?.stats?.earnings ?? 0));
  }
}

dismissInstallBanner(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const banner =
    this.elements.installBanner ||
    document.getElementById("installBanner");

  if (banner) {
    banner.hidden = true;
    banner.style.setProperty("display", "none", "important");
    banner.style.opacity = "0";
    banner.style.pointerEvents = "none";
    banner.setAttribute("aria-hidden", "true");
  }

  try {
    localStorage.removeItem(PARTNER_INSTALL_DISMISSED_KEY);
  } catch (_) {}
}

showProviderBootLoader({ title = "Preparando tu panel", subtitle = "Sincronizando tu cuenta, tus servicios y tu estado de verificación.", error = false } = {}) {
  const loader = this.elements.providerBootLoader;
  if (!loader) return;

  loader.hidden = false;
  loader.removeAttribute("aria-hidden");
  loader.dataset.state = error ? "error" : "loading";

  if (this.elements.providerBootTitle) this.elements.providerBootTitle.textContent = title;
  if (this.elements.providerBootSubtitle) this.elements.providerBootSubtitle.textContent = subtitle;
  if (this.elements.providerBootRetry) {
    this.elements.providerBootRetry.hidden = !error;
    this.elements.providerBootRetry.onclick = () => window.location.reload();
  }

  if (this.elements.providerBootMarketing) {
    this.elements.providerBootMarketing.hidden = Boolean(error);
  }

  if (error) {
    this.stopPartnerLoadingCarousel();
  } else {
    this.startPartnerLoadingCarousel();
  }
}

hideProviderBootLoader() {
  this.clearProviderBootTimeout();
  this.stopPartnerLoadingCarousel();

  const loader = this.elements.providerBootLoader;
  if (!loader) return;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
}

renderPartnerLoadingMarketing(index = 0) {
  const slides = partnerLoadingMessages;
  const slide = slides[index % slides.length] || slides[0];
  const microcopy = partnerLoadingMicrocopy[index % partnerLoadingMicrocopy.length] || "";
  const marketing = this.elements.providerBootMarketing;
  if (!marketing || !slide) return;

  marketing.classList.remove("is-visible");
  marketing.hidden = false;

  if (this.partnerLoadingRenderTimeout) {
    window.clearTimeout(this.partnerLoadingRenderTimeout);
  }

  const applySlide = () => {
    this.partnerLoadingRenderTimeout = null;
    if (!document.body.classList.contains("provider-auth-loading") || this.elements.providerBootLoader?.hidden) return;
    if (this.elements.providerBootMarketingEyebrow) this.elements.providerBootMarketingEyebrow.textContent = slide.eyebrow;
    if (this.elements.providerBootMarketingTitle) this.elements.providerBootMarketingTitle.textContent = slide.title;
    if (this.elements.providerBootMarketingBody) this.elements.providerBootMarketingBody.textContent = slide.body;
    if (this.elements.providerBootSubtitle) this.elements.providerBootSubtitle.textContent = microcopy;

    if (this.elements.providerBootMarketingDots) {
      this.elements.providerBootMarketingDots.innerHTML = slides
        .map((_, dotIndex) => `<span class="${dotIndex === index % slides.length ? "is-active" : ""}"></span>`)
        .join("");
    }

    marketing.classList.add("is-visible");
  };

  applySlide();
}

startPartnerLoadingCarousel() {
  const loader = this.elements.providerBootLoader;
  if (!loader || loader.hidden) return;

  this.stopPartnerLoadingCarousel();
  this.partnerLoadingSlideIndex = this.partnerLoadingSlideIndex || 0;
  this.renderPartnerLoadingMarketing(this.partnerLoadingSlideIndex);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  if (reducedMotion) return;

  this.partnerLoadingCarouselInterval = window.setInterval(() => {
    if (!document.body.classList.contains("provider-auth-loading") || loader.hidden) {
      this.stopPartnerLoadingCarousel();
      return;
    }

    this.partnerLoadingSlideIndex = (this.partnerLoadingSlideIndex + 1) % partnerLoadingMessages.length;
    this.renderPartnerLoadingMarketing(this.partnerLoadingSlideIndex);
  }, 3200);
}

stopPartnerLoadingCarousel() {
  if (this.partnerLoadingCarouselInterval) {
    window.clearInterval(this.partnerLoadingCarouselInterval);
    this.partnerLoadingCarouselInterval = null;
  }

  if (this.partnerLoadingRenderTimeout) {
    window.clearTimeout(this.partnerLoadingRenderTimeout);
    this.partnerLoadingRenderTimeout = null;
  }
}

startProviderBootTimeout() {
  this.clearProviderBootTimeout();

  this.providerBootTimeout = window.setTimeout(() => {
    if (!document.body.classList.contains("provider-auth-loading")) return;

    this.showProviderBootLoader({
      title: "Seguimos preparando tu panel",
      subtitle: "La conexión está tardando más de lo normal. Podés esperar unos segundos o reintentar.",
      error: true
    });
  }, 14000);
}

clearProviderBootTimeout() {
  if (!this.providerBootTimeout) return;

  window.clearTimeout(this.providerBootTimeout);
  this.providerBootTimeout = null;
}
  
  /**
   * Load real provider session/workspace from Supabase.
   * This replaces every previous demo fallback with backend-driven state.
   */
async loadInitialData() {
  try {
    actions.setLoading(true);
    actions.clearError?.();

    const session = await bootstrapSession();

    actions.setSession({
      userId: session?.userId ?? null,
      providerId: session?.providerId ?? null,
      userEmail: session?.userEmail ?? null,
      userName: session?.userName ?? session?.userEmail ?? null,
      userAvatar: session?.userAvatar ?? null,
      isAuthenticated: Boolean(session?.isAuthenticated),
      token: session?.token ?? null,
      expiresAt: session?.expiresAt ?? null
    });

    if (!session?.isAuthenticated) {
      document.body.classList.remove("provider-auth-loading", "provider-authenticated");
      document.body.classList.add("provider-auth-required");

      this.showProviderLoginGate();
      return false;
    }

    document.body.classList.add("provider-auth-loading");
    document.body.classList.remove("provider-auth-required", "provider-authenticated");
    this.showProviderBootLoader();

    if (this.elements.onlineButtonContainer) {
      this.elements.onlineButtonContainer.hidden = true;
      this.elements.onlineButtonContainer.classList.add("hidden");
      this.elements.onlineButtonContainer.style.display = "none";
      this.elements.onlineButtonContainer.innerHTML = "";
    }

    if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "none";
    if (this.elements.header) this.elements.header.style.display = "none";
    if (this.elements.mapContainer) this.elements.mapContainer.style.display = "none";
    
    if (!session?.providerId) {
      this.showToast("No se encontr un perfil de prestador para esta cuenta", "error");
      this.showProviderLoginGate();
      return false;
    }

const [categories, workspace, notifications, offers, activeRequest, payoutAccountResult] = await Promise.all([
  // Reusar categorías ya cargadas en init(); si están vacías, recargar
  (this.state?.appConfig?.categories?.length
    ? Promise.resolve(this.state.appConfig.categories)
    : loadCategories()),
  loadProviderWorkspace(session.providerId),
  loadNotifications(session.userId),
  loadOffers(session.providerId),
  loadActiveRequest({ providerId: session.providerId }),
  getProviderPayoutAccount()
]);

if (Array.isArray(categories) && categories.length) {
  const normalizedCategories = categories.map(normalizeProviderCategory);
  actions.updateState({
    appConfig: {
      categories: normalizedCategories
    }
  });
}
setTimeout(async () => {
  try {
    const freshDashboard = await getProviderDashboard(session.providerId);

    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        dashboard: freshDashboard,
        payoutAccount: payoutAccountResult?.account ?? this.state?.provider?.payoutAccount ?? null
      }
    });
  } catch (err) {
    console.warn("[MIMI] Dashboard diferido no disponible:", err);
  }
}, 800);    
    this.applyWorkspaceToState(workspace);

    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        payoutAccount: payoutAccountResult?.account ?? null,
        offers: this.filterUsableOffers(offers)
      }
    });

    actions.updateState({
      notifications: {
        items: this.normalizeNotifications(notifications),
        unreadCount: (notifications ?? []).filter((item) => !item.read_at).length
      }
    });

    const firstOffer = this.filterUsableOffers(offers)[0] ?? null;
    if (firstOffer) {
      actions.setActiveOffer(this.normalizeOfferForState(firstOffer));
    } else {
      actions.clearActiveOffer();
    }

    if (activeRequest) {
      actions.setActiveService(this.normalizeServiceForState(activeRequest));
      this.subscribeActiveRequestRealtime(activeRequest.id);
    } else {
      actions.clearActiveService();
      this.stopLocationTracking();
      disconnectManagedRealtime("provider-app:job:");
    }

    this.renderDrawerProfile();
    this.hideProviderBootLoader();

    document.body.classList.remove("provider-auth-loading", "provider-auth-required");
    document.body.classList.add("provider-authenticated");
    this.ensureProviderBackGuard();
    this.checkProviderAppVersion();

    if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "";
    if (this.elements.header) this.elements.header.style.display = "";
    if (this.elements.mapContainer) this.elements.mapContainer.style.display = "";

    if (
      this.elements.installBanner &&
      localStorage.getItem(PARTNER_PWA_INSTALLED_KEY) !== "true" &&
      !this.isRunningAsInstalledPwa()
    ) {
      this.showInstallBanner({ sessionEntry: true });
    } else {
      this.hideInstallBanner();
    }

    window.setTimeout(() => {
      this.setupProviderPhoneTrust().catch((err) => {
        console.warn("[MIMI Provider] phone trust skipped:", err?.message ?? err);
      });
    }, 0);

    return true;
  } catch (err) {
    console.error("[MIMI] Error cargando datos iniciales:", err);

    actions.setError?.(err?.message ?? "No pudimos cargar tu panel de prestador");
    this.showToast("No pudimos cargar tus datos reales", "error");

    document.body.classList.add("provider-auth-loading");
    document.body.classList.remove("provider-authenticated", "provider-auth-required");
    this.showProviderBootLoader({
      title: "No pudimos cargar tu panel",
      subtitle: "Revisá tu conexión e intentá nuevamente. Si el problema sigue, volvé a iniciar sesión.",
      error: true
    });

    return false;
  } finally {
    actions.setLoading(false);
  }
}

async setupProviderPhoneTrust({ forceChange = false } = {}) {
  const overlay = this.elements.providerPhoneOverlay;
  if (!overlay || !this.state?.session?.userId) return;

  const risk = await evaluateAuthRisk({
    actorRole: "provider",
    purpose: forceChange ? "phone_change" : "login_new_device"
  });

  if (!risk?.ok) return;

  if (risk.sms_configured === false) {
    console.warn("[MIMI Provider] Twilio Verify no configurado; no se bloquea el panel.");
    if (forceChange) this.showToast("La verificación todavía no está configurada", "warning");
    return;
  }

  if (!forceChange && risk.requires_otp !== true) return;

  await this.openProviderPhoneTrustModal({
    forceChange,
    existingProfile: risk.profile ?? null,
    verifyExistingDevice: !forceChange && risk.profile?.phone_verified === true,
    required: true
  });
}

async openProviderPhoneTrustModal({ forceChange = false, existingProfile = null, verifyExistingDevice = false, required = true } = {}) {
  const {
    providerPhoneOverlay: overlay,
    providerPhoneForm: form,
    providerPhoneInput: phoneInput,
    providerPhoneCodeInput: codeInput,
    providerPhoneStatus: status,
    providerPhoneSubmit: submit,
    providerPhoneClose: closeButton,
    providerPhoneResend: resendButton,
    providerPhoneChangeNumber: changeNumberButton,
    providerPhoneSwitchAccount: switchAccountButton,
    providerPhoneTitle: title,
    providerPhoneCopy: copy,
    providerPhoneEntryStep: entryStep,
    providerPhoneOtpStep: otpStep,
    providerPhoneOtpTarget: otpTarget,
    providerPhoneCountryButton: countryButton,
    providerPhoneCountryPanel: countryPanel,
    providerPhoneCountryList: countryList,
    providerPhoneCountrySearch: countrySearch,
    providerPhoneCountryFlag: countryFlag,
    providerPhoneCountryName: countryName,
    providerPhoneCountryDial: countryDial
  } = this.elements;

  if (!overlay || !form || !phoneInput || !codeInput || !status || !submit || !entryStep || !otpStep) return;

  let countries = await loadPhoneCountries();
  let selectedCountry =
    countries.find((country) => country.dialCode === existingProfile?.phone_country_code) ||
    countries.find((country) => country.dialCode === existingProfile?.country_code) ||
    detectDefaultCountry(countries);
  let pendingVerification = null;
  let currentStep = "entry";
  let resendTimer = null;
  let resendCooldownRemaining = 0;
  const canClose = forceChange || !required;

  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const setStatus = (message = "", type = "neutral") => {
    status.textContent = message;
    status.dataset.state = type;
  };

  const setLoading = (loading, label) => {
    submit.disabled = Boolean(loading);
    submit.classList.toggle("is-loading", Boolean(loading));
    submit.setAttribute("aria-busy", String(Boolean(loading)));
    if (label) submit.textContent = label;
  };

  const otpDeliveryMessage = (response = {}) => (
    response?.channel === "sms" || response?.fallback === true
      ? "No pudimos enviarlo por WhatsApp. Te enviamos un SMS de respaldo."
      : "Te enviamos un código por WhatsApp."
  );

  const fallbackActions = document.createElement("div");
  fallbackActions.className = "provider-phone-fallback-actions";
  fallbackActions.hidden = true;
  status.insertAdjacentElement("afterend", fallbackActions);

  const isFallbackRequired = (response = {}) => (
    response?.status === "fallback_required" ||
    response?.reason === "whatsapp_not_enabled" ||
    response?.code === "whatsapp_channel_disabled" ||
    response?.error === "whatsapp_channel_disabled"
  );

  const fallbackCopy = (response = {}) => (
    response?.message ||
    "WhatsApp todavia no esta disponible para esta verificacion. Podes continuar por otro metodo."
  );

  const fallbackList = (response = {}) => {
    const list = response?.available_fallbacks || response?.fallbacks || [];
    return Array.isArray(list) ? list : [];
  };

  const clearFallbackOptions = () => {
    fallbackActions.hidden = true;
    fallbackActions.innerHTML = "";
  };

  const renderFallbackOptions = (response = {}) => {
    const methods = fallbackList(response);
    const smsAvailable = response?.sms_available === true || methods.includes("sms");
    const emailAvailable = response?.email_available === true || methods.includes("email");

    fallbackActions.innerHTML = `
      <p>Podes seguir sin esperar la habilitacion de WhatsApp.</p>
      <div class="provider-phone-fallback-row">
        ${emailAvailable ? `<button type="button" class="provider-phone-fallback-btn is-secondary" data-provider-phone-fallback="email">Verificar por email</button>` : ""}
        ${smsAvailable ? `<button type="button" class="provider-phone-fallback-btn is-primary" data-provider-phone-fallback="sms">Enviar SMS</button>` : ""}
        <button type="button" class="provider-phone-fallback-btn is-ghost" data-provider-phone-fallback="whatsapp">Intentar WhatsApp de nuevo</button>
      </div>
    `;
    fallbackActions.hidden = false;
  };

  const updateResendButton = () => {
    if (!resendButton) return;

    const coolingDown = resendCooldownRemaining > 0;
    resendButton.disabled = coolingDown;
    resendButton.textContent = coolingDown
      ? `Enviar otro código (${resendCooldownRemaining}s)`
      : "Enviar otro código";
  };

  const clearResendCooldown = () => {
    if (resendTimer) window.clearInterval(resendTimer);
    resendTimer = null;
    resendCooldownRemaining = 0;
    updateResendButton();
  };

  const startResendCooldown = (seconds = 45) => {
    clearResendCooldown();
    resendCooldownRemaining = seconds;
    updateResendButton();

    resendTimer = window.setInterval(() => {
      resendCooldownRemaining -= 1;
      if (resendCooldownRemaining <= 0) {
        clearResendCooldown();
        return;
      }
      updateResendButton();
    }, 1000);
  };

  const renderCountry = () => {
    if (!selectedCountry) return;
    if (countryFlag) countryFlag.textContent = selectedCountry.flag || "";
    if (countryName) countryName.textContent = selectedCountry.name || selectedCountry.iso;
    if (countryDial) countryDial.textContent = selectedCountry.dialCode || "";
  };

  const renderCountryList = (query = "") => {
    if (!countryList) return;
    const needle = normalize(query);
    const rows = countries
      .filter((country) => !needle ||
        normalize(country.name).includes(needle) ||
        normalize(country.iso).includes(needle) ||
        normalize(country.dialCode).includes(needle));

    countryList.innerHTML = rows.map((country) => `
      <button type="button" data-provider-phone-country="${this.escapeHtml(country.iso)}">
        <span>${this.escapeHtml(country.flag || "")}</span>
        <b>${this.escapeHtml(country.name || country.iso)}</b>
        <small>${this.escapeHtml(country.dialCode || "")}</small>
      </button>
    `).join("");
  };

  const setStep = (step) => {
    currentStep = step;
    const isOtp = step === "otp";
    const target = otpTarget?.textContent || "tu teléfono";

    overlay.dataset.step = step;
    entryStep.hidden = isOtp;
    otpStep.hidden = !isOtp;
    entryStep.style.display = isOtp ? "none" : "";
    otpStep.style.display = isOtp ? "" : "none";
    if (resendButton) resendButton.hidden = !isOtp;
    if (changeNumberButton) changeNumberButton.hidden = !isOtp;
    if (title) title.textContent = isOtp ? "Ingresá el código" : "Verificá tu teléfono";
    if (copy) {
      copy.textContent = isOtp
        ? `Te enviamos un código por WhatsApp al ${target}.`
        : "Usamos este número para proteger tu cuenta y validar dispositivos nuevos.";
    }
    submit.textContent = isOtp ? "Verificar y continuar" : "Enviar código";
    submit.textContent = isOtp ? "Verificar código" : "Enviar código";
    window.setTimeout(() => (isOtp ? codeInput : phoneInput).focus(), 120);
  };

  const close = (success = false) => {
    if (!success && !canClose) return;
    overlay.hidden = true;
    document.body.classList.remove("provider-phone-open");
    clearResendCooldown();
    form.removeEventListener("submit", onSubmit);
    closeButton?.removeEventListener("click", onClose);
    resendButton?.removeEventListener("click", onResend);
    fallbackActions.removeEventListener("click", onFallbackAction);
    fallbackActions.remove();
    changeNumberButton?.removeEventListener("click", onChangeNumber);
    switchAccountButton?.removeEventListener("click", onSwitchAccount);
    countryButton?.removeEventListener("click", onCountryButton);
    countrySearch?.removeEventListener("input", onCountrySearch);
    countryList?.removeEventListener("click", onCountrySelect);
  };

  const startOtp = async (channel = "whatsapp") => {
    clearFallbackOptions();
    const rawDigits = String(phoneInput.value || "").replace(/\D/g, "");
    if (rawDigits.length < 8) {
      phoneInput.classList.add("is-invalid");
      setStatus("Ingresá un teléfono válido antes de pedir el código.", "error");
      return;
    }

    phoneInput.classList.remove("is-invalid");
    const normalized = await normalizePhoneNumber(phoneInput.value, selectedCountry);
    pendingVerification = {
      phoneNumber: normalized.phoneNumber,
      countryCode: normalized.countryCode,
      countryIso: normalized.countryIso
    };

    const response = await requestOtp({
      actorRole: "provider",
      purpose: forceChange
        ? "phone_change"
        : (verifyExistingDevice ? "login_new_device" : "signup"),
      channel,
      ...pendingVerification
    });

    if (isFallbackRequired(response)) {
      renderFallbackOptions(response);
      setStatus(fallbackCopy(response), "neutral");
      return;
    }

    if (response?.already_trusted === true) {
      setStatus("Dispositivo confiable.", "success");
      window.setTimeout(() => close(true), 400);
      return;
    }

    pendingVerification.attemptId = response?.attempt_id || response?.attemptId || null;
    pendingVerification.channel = response?.channel || "whatsapp";
    pendingVerification.fallback = response?.fallback === true;
    if (otpTarget) otpTarget.textContent = response?.masked_phone || pendingVerification.phoneNumber;
    setStep("otp");
    if (copy) copy.textContent = otpDeliveryMessage(response);
    startResendCooldown(45);
    setStatus(otpDeliveryMessage(response), "success");
  };

  const verifyProviderOtp = async () => {
    const code = String(codeInput.value || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      setStatus("Ingresá el código de 6 dígitos recibido por WhatsApp o SMS.", "error");
      codeInput.classList.add("is-invalid");
      return;
    }

    codeInput.classList.remove("is-invalid");
    await verifyOtp({
      actorRole: "provider",
      attemptId: pendingVerification?.attemptId,
      phoneNumber: pendingVerification?.phoneNumber,
      code
    });
    setStatus("Teléfono verificado. Este dispositivo queda confiable.", "success");
    this.showToast("Teléfono verificado", "success");
    window.setTimeout(() => close(true), 500);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus("");
    setLoading(true, currentStep === "otp" ? "Verificando..." : "Enviando...");
    try {
      if (currentStep === "otp") {
        await verifyProviderOtp();
      } else {
        await startOtp();
      }
    } catch (error) {
      const fallbackResponse = error?.details || { code: error?.code || error?.message };
      if (currentStep !== "otp" && isFallbackRequired(fallbackResponse)) {
        renderFallbackOptions(fallbackResponse);
        setStatus(fallbackCopy(fallbackResponse), "neutral");
      } else {
        setStatus(this.phoneVerificationErrorText(error), "error");
      }
    } finally {
      setLoading(false, currentStep === "otp" ? "Verificar y continuar" : "Enviar código");
    }
  };

  const onFallbackAction = async (event) => {
    const button = event.target.closest?.("[data-provider-phone-fallback]");
    if (!button) return;
    const method = button.dataset.providerPhoneFallback;
    setLoading(true, method === "sms" ? "Enviando SMS..." : method === "email" ? "Enviando email..." : "Reintentando...");
    try {
      if (method === "sms") {
        setStatus("Te vamos a enviar un codigo por SMS. Usalo si no podes verificar por WhatsApp.", "neutral");
        await startOtp("sms");
        return;
      }
      if (method === "email") {
        const result = await startSecurityVerification({
          actorRole: "provider",
          purpose: verifyExistingDevice ? "login_new_device" : "phone_verification",
          preferredChannel: "email"
        });
        setStatus(
          result?.channel === "email"
            ? "Te enviamos una verificacion por email para proteger tu cuenta. Para validar este telefono, usa WhatsApp o SMS."
            : "No pudimos enviar el email ahora. Proba por SMS o intenta nuevamente.",
          result?.channel === "email" ? "success" : "neutral"
        );
        return;
      }
      await startOtp("whatsapp");
    } catch (error) {
      const fallbackResponse = error?.details || { code: error?.code || error?.message };
      if (isFallbackRequired(fallbackResponse)) {
        renderFallbackOptions(fallbackResponse);
        setStatus(fallbackCopy(fallbackResponse), "neutral");
      } else {
        setStatus(this.phoneVerificationErrorText(error), "error");
      }
    } finally {
      setLoading(false, currentStep === "otp" ? "Verificar y continuar" : "Enviar codigo");
    }
  };

  const onClose = () => close(false);
  const onResend = async () => {
    if (resendCooldownRemaining > 0) return;
    if (!pendingVerification?.phoneNumber) {
      setStep("entry");
      return;
    }
    setLoading(true, "Reenviando...");
    try {
      await startOtp(pendingVerification?.channel || "whatsapp");
    } catch (error) {
      const fallbackResponse = error?.details || { code: error?.code || error?.message };
      if (isFallbackRequired(fallbackResponse)) {
        renderFallbackOptions(fallbackResponse);
        setStatus(fallbackCopy(fallbackResponse), "neutral");
      } else {
        setStatus(this.phoneVerificationErrorText(error), "error");
      }
    } finally {
      setLoading(false, currentStep === "otp" ? "Verificar y continuar" : "Enviar código");
    }
  };
  const onChangeNumber = () => {
    pendingVerification = null;
    codeInput.value = "";
    codeInput.classList.remove("is-invalid");
    phoneInput.classList.remove("is-invalid");
    clearResendCooldown();
    setStatus("");
    setStep("entry");
  };
  const onSwitchAccount = () => {
    this.confirmProviderAccountSwitch();
  };
  const onCountryButton = () => {
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
    const option = event.target.closest?.("[data-provider-phone-country]");
    if (!option) return;
    selectedCountry = countries.find((country) => country.iso === option.dataset.providerPhoneCountry) || selectedCountry;
    renderCountry();
    if (countryPanel) countryPanel.hidden = true;
    countryButton?.setAttribute("aria-expanded", "false");
    phoneInput.focus();
  };

  form.reset();
  setStatus("");
  setStep("entry");
  renderCountry();
  renderCountryList();
  if (closeButton) closeButton.hidden = !canClose;
  if (resendButton) resendButton.hidden = true;
  if (changeNumberButton) changeNumberButton.hidden = true;
  if (existingProfile?.phone_number && forceChange) phoneInput.placeholder = existingProfile.phone_number;
  if (existingProfile?.phone_number && verifyExistingDevice) phoneInput.value = existingProfile.phone_number;
  if (countryPanel) countryPanel.hidden = true;

  overlay.hidden = false;
  document.body.classList.add("provider-phone-open");
  form.addEventListener("submit", onSubmit);
  closeButton?.addEventListener("click", onClose);
  resendButton?.addEventListener("click", onResend);
  fallbackActions.addEventListener("click", onFallbackAction);
  changeNumberButton?.addEventListener("click", onChangeNumber);
  switchAccountButton?.addEventListener("click", onSwitchAccount);
  countryButton?.addEventListener("click", onCountryButton);
  countrySearch?.addEventListener("input", onCountrySearch);
  countryList?.addEventListener("click", onCountrySelect);
  window.setTimeout(() => phoneInput.focus(), 160);
}

phoneVerificationErrorText(error) {
  const code = error?.code || error?.message || error;
  const map = {
    phone_invalid: "Ingresá un número válido con código de país.",
    phone_already_used: "Ese número ya está verificado en otra cuenta.",
    sms_provider_not_configured: "No pudimos verificarte en este momento. Proba mas tarde o contacta soporte.",
    whatsapp_channel_disabled: "WhatsApp todavia no esta disponible para esta verificacion. Podes continuar por otro metodo.",
    sms_channel_disabled: "SMS todavia no esta disponible. Proba por email o intenta mas tarde.",
    sms_recipient_unverified: "No pudimos enviar el código a este número. Contactá soporte si el problema continúa.",
    sms_provider_error: "No pudimos enviar el código por WhatsApp ni por SMS. Revisá el número e intentá nuevamente.",
    otp_provider_timeout: "La verificación tardó demasiado. Intentá nuevamente.",
    otp_rate_limited: "Demasiados intentos. Probá de nuevo en unos minutos.",
    otp_recently_sent: "Ya enviamos un código hace instantes. Esperá un minuto.",
    otp_phone_hour_limited: "Demasiados códigos para este número. Probá más tarde.",
    otp_phone_day_limited: "Ese número llegó al límite diario de códigos.",
    otp_ip_day_limited: "Detectamos demasiados pedidos desde esta red.",
    otp_device_day_limited: "Este dispositivo pidió demasiados códigos hoy.",
    otp_invalid: "El código no coincide. Revisalo e intentá otra vez.",
    otp_attempts_exceeded: "Se agotaron los intentos. Pedí un código nuevo.",
    otp_not_found_or_expired: "El código venció. Pedí uno nuevo.",
    auth_risk_blocked: "Por seguridad bloqueamos temporalmente esta acción."
  };
  if (String(code || "").startsWith("sms_provider_error")) return map.sms_provider_error;
  return map[code] || "No pudimos verificar el teléfono. Intentá nuevamente.";
}

  applyWorkspaceToState(workspace = {}) {
    const profile = workspace.profile ?? null;
    const documents = Array.isArray(workspace.documents) ? workspace.documents : [];
    const categories = Array.isArray(workspace.categories) ? workspace.categories : [];
    const pricingRows = Array.isArray(workspace.pricing) ? workspace.pricing : [];
    const offerings = Array.isArray(workspace.offerings) ? workspace.offerings : [];
    const availability = Array.isArray(workspace.availability) ? workspace.availability : [];
    const reviews = Array.isArray(workspace.reviews) ? workspace.reviews : [];

    const approvedDocs = documents.filter((doc) => this.normalizeReviewStatus(doc.review_status) === "APPROVED").length;
    const rejectedDocs = documents.filter((doc) => ["REJECTED", "NEEDS_RESUBMISSION"].includes(this.normalizeReviewStatus(doc.review_status))).length;
    const pendingDocs = documents.filter((doc) => !["APPROVED", "REJECTED", "NEEDS_RESUBMISSION"].includes(this.normalizeReviewStatus(doc.review_status))).length;
    const uploadedRequiredDocs = new Set(
      documents
        .map((doc) => String(doc.document_type ?? "").toLowerCase())
        .filter((type) => ["dni_front", "dni_back", "selfie"].includes(type))
    );

    const isVerified = Boolean(profile?.approved) && rejectedDocs === 0;
    const verificationStatus = isVerified
      ? "approved"
      : rejectedDocs > 0
        ? "rejected"
        : pendingDocs > 0 || documents.length > 0
          ? "in_review"
          : "pending";

    const firstPricing = pricingRows[0] ?? null;

    actions.updateState({
      provider: {
        status: profile?.status ?? "OFFLINE",
        isVerified,
        verificationStatus,
        verificationProgress: isVerified ? 100 : Math.round((uploadedRequiredDocs.size / 3) * 80),
        profile,
        categories: categories.map((item) => ({
          id: item.category_id ?? item.id,
          name: item.svc_categories?.name ?? item.name ?? "Servicio",
          code: item.svc_categories?.code ?? item.code ?? null,
          description: item.svc_categories?.description ?? item.description ?? ""
        })),
        pricing: {
          basePrice: Number(firstPricing?.price_per_hour ?? 0),
          hourlyRate: Number(firstPricing?.price_per_hour ?? 0),
          jobRate: Number(offerings.find((item) => item.fixed_price > 0)?.fixed_price ?? 0) || null,
          mode: offerings.some((item) => item.pricing_model && item.pricing_model !== "HOURLY") ? "flexible" : "hourly"
        },
        business: {
          profile: workspace.profileDetail ?? null,
          pricing: pricingRows,
          offerings,
          availability,
          documents,
          reviews,
          legalAcceptances: Array.isArray(workspace.legalAcceptances) ? workspace.legalAcceptances : []
        },
stats: {
  rating: Number(profile?.rating_avg ?? 0),
  completedServices: Number(workspace.completedCount ?? 0),
  totalOffers: Number(workspace.offersCount ?? 0),
  earnings: Number(workspace.earningsTotal ?? 0)
},
        documents: {
          approved: approvedDocs,
          pending: pendingDocs,
          rejected: rejectedDocs,
          items: documents
        }
      }
    });
  }

  normalizeReviewStatus(value) {
    return String(value ?? "PENDING").trim().toUpperCase();
  }

  sanitizeServicePayload(service = {}) {
    const clean = { ...(service ?? {}) };
    delete clean.service_pin_hash;
    delete clean.service_pin_ciphertext;
    delete clean.service_pin_attempts;
    delete clean.service_pin_locked_until;
    return clean;
  }

  normalizeServiceForState(service = {}) {
    const safeService = this.sanitizeServicePayload(service);
    const details = this.extractServiceDetails(safeService);
    return {
      id: safeService.id ?? safeService.request_id ?? crypto.randomUUID?.() ?? String(Date.now()),
      requestId: safeService.request_id ?? safeService.id ?? null,
      status: this.normalizeRequestStatus(safeService.status),
      serviceType:
        details.category_name ??
        safeService.service_type ??
        safeService.category_name ??
        safeService.title ??
        safeService.svc_categories?.name ??
        "Servicio",
      clientName:
        safeService.client_name ??
        safeService.client?.full_name ??
        safeService.svc_clients?.full_name ??
        "Cliente",
      clientAvatar: safeService.client_avatar ?? safeService.client?.avatar_url ?? null,
      location: safeService.address_text ?? safeService.location ?? "Ubicacin a confirmar",
      address: safeService.address_text ?? null,
      price:
        Number(details.provider_price ?? safeService.provider_price_snapshot ?? safeService.provider_amount ?? 0),
      payment: safeService.payment ?? null,
      paymentStatus: this.normalizePaymentStatus(safeService.payment_status ?? safeService.payment?.status ?? "PENDING"),
      details,
      scheduledFor: safeService.scheduled_for ?? null,
      startedAt: safeService.started_at ?? null,
      conversationId: safeService.conversation_id ?? null,
      raw: safeService
    };
  }

  extractServiceDetails(requestOrOffer = {}) {
    const request = requestOrOffer?.svc_requests ?? requestOrOffer?.request ?? requestOrOffer;
    const metadata = request?.metadata_json ?? requestOrOffer?.metadata_json ?? {};
    const details = metadata?.service_details ?? requestOrOffer?.service_details ?? {};
    return details && typeof details === "object" ? details : {};
  }

  formatMoney(value, currency = "ARS") {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  }

  normalizePaymentStatus(status = "PENDING") {
    return String(status || "PENDING").trim().toUpperCase();
  }

  providerPaymentStatusLabel(status = "PENDING") {
    const normalized = this.normalizePaymentStatus(status);
    if (["APPROVED", "CAPTURED", "SETTLED"].includes(normalized)) return "Pago confirmado";
    return "Pago pendiente";
  }

  distanceKmBetween(latA, lngA, latB, lngB) {
    const aLat = Number(latA);
    const aLng = Number(lngA);
    const bLat = Number(latB);
    const bLng = Number(lngB);
    if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
    const toRad = (value) => (value * Math.PI) / 180;
    const earthKm = 6371;
    const deltaLat = toRad(bLat - aLat);
    const deltaLng = toRad(bLng - aLng);
    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const h =
      sinLat * sinLat +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLng * sinLng;
    return earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  routeLabelForOffer(offer = {}) {
    const origin = this.state?.location?.current ?? {};
    const request = offer.raw?.svc_requests ?? offer.raw?.request ?? {};
    const details = offer.details ?? {};
    const lat = request.service_lat ?? details.service_lat;
    const lng = request.service_lng ?? details.service_lng;
    const distance = this.distanceKmBetween(origin.lat, origin.lng, lat, lng);
    if (distance !== null) {
      const text = distance < 1
        ? `${Math.max(100, Math.round(distance * 1000 / 50) * 50)} m`
        : `${distance.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`;
      return `Ruta marcada en el mapa · ${text}`;
    }
    return "Domicilio marcado en el mapa";
  }

  buildServiceDetailRows(offer = {}) {
    const request = offer.svc_requests ?? offer.request ?? {};
    const details = this.extractServiceDetails(offer);
    const rows = [];
    const pricingModel = String(details.pricing_model || "").toUpperCase();
    const quantity = Number(details.unit_quantity || 0);
    const unitName = details.unit_name || "";
    const unitPrice = Number(details.unit_price || 0);
    const providerAmount = Number(details.provider_price ?? request.provider_price_snapshot ?? offer.provider_price_snapshot ?? 0);
    const currency = details.currency || request.currency || "ARS";
    const paymentStatus = this.normalizePaymentStatus(offer.payment_status ?? offer.payment?.status ?? request.payment_status ?? request.payment?.status ?? "PENDING");

    if (quantity > 0 && unitName) {
      rows.push({
        label: "Cantidad",
        value: `${quantity.toLocaleString("es-AR")} ${unitName}`
      });
    } else if (pricingModel === "HOURLY" && Number(request.requested_hours || details.requested_hours || 0) > 0) {
      rows.push({
        label: "Tiempo estimado",
        value: `${Number(request.requested_hours || details.requested_hours)} hs`
      });
    }

    if (unitPrice > 0 && unitName) {
      rows.push({
        label: "Precio publicado",
        value: `${this.formatMoney(unitPrice, currency)} / ${unitName}`
      });
    }

    if (providerAmount > 0) {
      rows.push({ label: "Tu precio", value: this.formatMoney(providerAmount, currency) });
    } else {
      rows.push({ label: "Precio", value: "A coordinar" });
    }

    rows.push({ label: "Pago", value: this.providerPaymentStatusLabel(paymentStatus) });

    const notes = String(details.client_notes || request.notes || "").trim();
    if (notes) {
      rows.push({
        label: "Detalle del cliente",
        value: notes.split("\n")[0]
      });
    }

    return rows.slice(0, 5);
  }

  normalizeOfferForState(offer = {}) {
    const request = offer.svc_requests ?? offer.request ?? {};
    const details = this.extractServiceDetails(offer);
    const detailRows = this.buildServiceDetailRows(offer);
    const providerAmount = Number(details.provider_price ?? offer.provider_price_snapshot ?? request.provider_price_snapshot ?? 0);
    const displayAmount = providerAmount;

    return {
      id: offer.id,
      requestId: offer.request_id ?? request.id ?? null,
      serviceType:
        details.category_name ??
        details.offering_title ??
        offer.title ??
        request.title ??
        request.category_name ??
        request.svc_categories?.name ??
        "Servicio",
      clientName: offer.client_name ?? request.client_name ?? "Cliente",
      location: offer.address_text ?? request.address_text ?? "Ubicacin a confirmar",
      price: displayAmount,
      priceLabel: displayAmount > 0 ? `Tu precio ${this.formatMoney(displayAmount, details.currency || request.currency || "ARS")}` : "Precio a coordinar",
      payment: offer.payment ?? null,
      paymentStatus: this.normalizePaymentStatus(offer.payment_status ?? offer.payment?.status ?? "PENDING"),
      detailRows,
      details,
      mode: request.request_type ?? "IMMEDIATE",
      expiresAt: offer.expires_at ?? null,
      createdAt: offer.created_at ?? new Date().toISOString(),
      raw: offer
    };
  }

  isUsableOffer(offer = {}) {
    const status = String(offer.status ?? "").trim().toUpperCase();
    if (status && status !== "PENDING" && status !== "PENDING_PROVIDER_RESPONSE") {
      return false;
    }

    const expiresAt = offer.expires_at ?? offer.expiresAt ?? null;
    if (expiresAt) {
      const expiresAtMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return false;
      }
    }

    const providerId = this.state?.session?.providerId;
    if (providerId && offer.provider_id && String(offer.provider_id) !== String(providerId)) {
      return false;
    }

    return Boolean(offer.id);
  }

  filterUsableOffers(offers = []) {
    return (Array.isArray(offers) ? offers : []).filter((offer) => this.isUsableOffer(offer));
  }

  normalizeNotifications(items = []) {
    return (items ?? []).map((item) => ({
      id: item.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      title: item.title ?? "Nueva notificacion",
      text: item.body ?? item.message ?? "",
      timestamp: item.created_at ?? new Date().toISOString(),
      unread: !item.read_at,
      icon: item.icon ?? "",
      raw: item
    }));
  }

  notificationData(item = {}) {
    const raw = item.raw || item;
    return raw?.data_json || raw?.data || {};
  }

  isKycReviewNotification(item = {}) {
    const raw = item.raw || item;
    const data = this.notificationData(item);
    const action = String(data?.action || "").toLowerCase();
    return raw?.type === "PROVIDER_KYC_REVIEW" ||
      data?.type === "PROVIDER_KYC_REVIEW" ||
      ["needs_resubmission", "request_document_correction", "reject", "block", "approve"].includes(action);
  }

  latestKycAdminNotice() {
    const items = this.state?.notifications?.items || [];
    return items
      .filter((item) => this.isKycReviewNotification(item))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] || null;
  }

  playNotificationSound(kind = "info") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const context = this.notificationAudioContext || new AudioContext();
      this.notificationAudioContext = context;
      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === "kyc" ? 0.12 : 0.07, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      gain.connect(context.destination);

      [660, kind === "kyc" ? 880 : 740].forEach((frequency, index) => {
        const osc = context.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequency, now + index * 0.12);
        osc.connect(gain);
        osc.start(now + index * 0.12);
        osc.stop(now + 0.36 + index * 0.08);
      });
    } catch (error) {
      if (window.MIMI_DEBUG_NOTIFICATIONS) console.warn("[MIMI] notification sound skipped:", error);
    }
  }

  showKycRealtimeAlert(item) {
    const message = item?.text || "El equipo MIMI dejo una observacion sobre tu verificacion.";
    this.showToast(`${item?.title || "Verificacion"}: ${message}`, "warning");
    this.playNotificationSound("kyc");
    this.renderKycAdminNotice();

    const card = this.elements.verificationCard;
    if (card) {
      card.classList.add("kyc-attention-pulse");
      window.setTimeout(() => card.classList.remove("kyc-attention-pulse"), 1800);
    }
  }

  renderKycAdminNotice() {
    const card = this.elements.verificationCard;
    if (!card) return;

    let notice = card.querySelector("[data-kyc-admin-notice]");
    const item = this.latestKycAdminNotice();
    const data = item ? this.notificationData(item) : {};
    const action = String(data?.action || "").toLowerCase();
    const status = String(this.state?.provider?.verificationStatus || "").toLowerCase();
    const needsAttention =
      item &&
      (status === "rejected" ||
        ["needs_resubmission", "request_document_correction", "reject", "block"].includes(action));

    if (!needsAttention) {
      notice?.remove();
      return;
    }

    if (!notice) {
      notice = document.createElement("section");
      notice.setAttribute("data-kyc-admin-notice", "");
      notice.className = "kyc-admin-notice";
      card.appendChild(notice);
    }

    const severity = ["reject", "block"].includes(action) ? "danger" : "warning";
    notice.className = `kyc-admin-notice ${severity}`;
    notice.innerHTML = `
      <div>
        <strong>${this.escapeHtml(item.title || "Observacion de verificacion")}</strong>
        <span>${this.escapeHtml(item.text || "El equipo MIMI dejo una observacion sobre tu verificacion.")}</span>
      </div>
      <div class="kyc-admin-notice-actions">
        <button type="button" data-kyc-notice-action="review">Revisar</button>
        <button type="button" data-kyc-notice-action="support">Soporte</button>
      </div>
    `;

    notice.querySelector('[data-kyc-notice-action="review"]')?.addEventListener("click", () => {
      actions.openModal("verification");
      this.showVerificationEntry(true);
    });

    notice.querySelector('[data-kyc-notice-action="support"]')?.addEventListener("click", () => {
      actions.closeModal();
      const supportPanel = document.getElementById("providerSupportPanel");
      supportPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      this.showToast("Escribinos a soporte y mencionanos tu verificacion.", "info");
    });
  }

  normalizeRequestStatus(status) {
    const value = String(status ?? "").trim().toUpperCase();
    const aliases = {
      EN_ROUTE: "PROVIDER_EN_ROUTE",
      ARRIVED: "PROVIDER_ARRIVED",
      STARTED: "IN_PROGRESS"
    };

    return aliases[value] ?? value;
  }

  async applyServiceTransition(functionName, nextProviderStatus, successMessage, payload = {}) {
    const service = this.state?.activeService;
    if (!service?.requestId) return;

    const response = await invokeFunction(functionName, {
      request_id: service.requestId,
      ...payload
    });

    const updatedService = response?.service ?? response?.request ?? response?.data ?? null;

    if (updatedService) {
      actions.setActiveService(this.normalizeServiceForState(updatedService));
      this.subscribeActiveRequestRealtime(updatedService.id ?? updatedService.request_id);
    }

    if (nextProviderStatus) {
      actions.setProviderStatus(nextProviderStatus);
    }

    this.showToast(successMessage, "success");
  }

  subscribeActiveRequestRealtime(requestId = this.activeServiceRequestId()) {
    const supabase = getSupabaseClient();
    if (!supabase?.channel || !requestId) return;

    disconnectManagedRealtime("provider-app:job:");

    this.activeRequestRealtimeChannel = subscribeScopedChannel(
      `provider-app:job:${requestId}:state`,
      (count) => supabase
        .channel(`provider-job:${requestId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "svc_requests",
            filter: `id=eq.${requestId}`
          },
          count((payload) => this.onActiveRequestChange(payload))
        )
        .subscribe((status) => {
          if (window.MIMI_DEBUG_REALTIME) console.log("[MIMI] Active request realtime:", status);
        }),
      { critical: true }
    );
  }

  onActiveRequestChange(payload) {
    const row = payload?.new;
    if (!row?.id) return;

    const status = this.normalizeRequestStatus(row.status);
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(status)) {
      actions.clearActiveService();
      this.stopLocationTracking();
      disconnectManagedRealtime("provider-app:job:");
      return;
    }

    actions.setActiveService(this.normalizeServiceForState(row));

    if (status === "IN_PROGRESS") {
      this.stopLocationTracking();
      actions.setProviderStatus("IN_SERVICE");
    }
  }

  async resyncActiveService(reason = "manual") {
    const providerId = this.state?.session?.providerId;
    if (!providerId) return null;

    try {
      const activeRequest = await loadActiveRequest({ providerId });
      if (activeRequest) {
        actions.setActiveService(this.normalizeServiceForState(activeRequest));
        this.subscribeActiveRequestRealtime(activeRequest.id);
      } else {
        actions.clearActiveService();
        this.stopLocationTracking();
        disconnectManagedRealtime("provider-app:job:");
      }

      if (window.MIMI_DEBUG_LIFECYCLE) {
        console.info("[MIMI lifecycle] resync", {
          reason,
          requestId: activeRequest?.id ?? null,
          status: activeRequest?.status ?? null
        });
      }

      return activeRequest;
    } catch (error) {
      console.warn("[MIMI lifecycle] resync failed", { reason, error });
      return null;
    }
  }

  requestServicePin() {
    const value = window.prompt("Ingresá el código de 4 dígitos que te brinda el cliente para iniciar el servicio.");
    const pin = String(value || "").replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(pin)) {
      this.showToast("Necesitamos un PIN de 4 dígitos para iniciar.", "error");
      return null;
    }
    return pin;
  }

  requestServicePinDialog() {
    const overlay = this.elements.providerPinOverlay;
    const inputs = Array.from(this.elements.providerPinInputs?.querySelectorAll("input") || []);
    const submit = this.elements.providerPinSubmit;
    const close = this.elements.providerPinClose;
    const status = this.elements.providerPinStatus;

    if (!overlay || !inputs.length || !submit) {
      this.showToast("No pudimos abrir el validador de codigo. Reintenta en unos segundos.", "error");
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        overlay.hidden = true;
        document.body.classList.remove("provider-pin-open");
        submit.removeEventListener("click", onSubmit);
        close?.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlayClick);
        window.removeEventListener("keydown", onEscape);
        inputs.forEach((input) => {
          input.removeEventListener("input", onInput);
          input.removeEventListener("keydown", onKeyDown);
        });
      };
      const pinValue = () => inputs.map((input) => input.value.replace(/\D/g, "")).join("");
      const setStatus = (message = "") => {
        if (status) status.textContent = message;
      };
      const onCancel = () => {
        cleanup();
        resolve(null);
      };
      const onSubmit = () => {
        const pin = pinValue();
        if (!/^\d{4}$/.test(pin)) {
          setStatus("Completa los 4 digitos para validar el servicio.");
          inputs.find((input) => !input.value)?.focus();
          return;
        }
        cleanup();
        resolve(pin);
      };
      const onOverlayClick = (event) => {
        if (event.target === overlay) onCancel();
      };
      const onEscape = (event) => {
        if (event.key === "Escape") onCancel();
      };
      const onInput = (event) => {
        const input = event.currentTarget;
        input.value = input.value.replace(/\D/g, "").slice(0, 1);
        setStatus("");
        if (input.value) inputs[inputs.indexOf(input) + 1]?.focus();
      };
      const onKeyDown = (event) => {
        const index = inputs.indexOf(event.currentTarget);
        if (event.key === "Backspace" && !event.currentTarget.value && index > 0) {
          inputs[index - 1]?.focus();
        }
        if (event.key === "Enter") onSubmit();
      };

      inputs.forEach((input) => {
        input.value = "";
        input.addEventListener("input", onInput);
        input.addEventListener("keydown", onKeyDown);
      });
      submit.addEventListener("click", onSubmit);
      close?.addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlayClick);
      window.addEventListener("keydown", onEscape);
      setStatus("");
      document.body.classList.add("provider-pin-open");
      overlay.hidden = false;
      window.setTimeout(() => inputs[0]?.focus(), 30);
    });
  }

  setButtonBusy(button, busy, label = null) {
    if (!button) return;

    if (busy) {
      if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
      button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${label || "Procesando..."}</span>`;
      return;
    }

    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    if (button.dataset.idleHtml) {
      button.innerHTML = button.dataset.idleHtml;
      delete button.dataset.idleHtml;
    }
  }

  async runProviderAction(key, button, loadingLabel, action) {
    if (this.pendingActions.has(key)) {
      return null;
    }

    this.pendingActions.add(key);
    this.setButtonBusy(button, true, loadingLabel);

    try {
      return await action();
    } finally {
      this.setButtonBusy(button, false);
      this.pendingActions.delete(key);
    }
  }

  setStatusToggleBusy(busy, targetStatus = null) {
    const buttons = this.elements.statusToggleModern?.querySelectorAll(".toggle-option") ?? [];
    buttons.forEach((button) => {
      button.disabled = Boolean(busy);
      button.classList.toggle("is-status-updating", Boolean(busy));
      button.setAttribute("aria-disabled", busy ? "true" : "false");
      if (busy && targetStatus && button.dataset.status === targetStatus) {
        button.classList.add("is-loading");
        button.setAttribute("aria-busy", "true");
      } else {
        button.classList.remove("is-loading");
        button.removeAttribute("aria-busy");
      }
    });

    document.body.classList.toggle("provider-status-updating", Boolean(busy));
  }

  openProviderSection(section) {
    const route = {
      profile: { tab: "account", target: "providerProfilePanel" },
      documents: { tab: "account", target: "providerTrustPanel" },
      services: { tab: "pricing", target: "providerBusinessPanel" },
      earnings: { tab: "wallet", target: "providerPayoutAccountPanel" },
      settings: { tab: "pricing", target: "providerBusinessPanel" },
      support: { tab: "account", target: "providerSupportPanel" }
    }[section] ?? { tab: "account", target: null };

    this.captureSheetReturnTab();
    this.switchTab(route.tab);
    this.setBottomSheetState("expanded");
    actions.closeDrawer();
    this.syncOnlineButtonVisibility();

    window.requestAnimationFrame(() => {
      const target = route.target ? document.getElementById(route.target) : null;
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });

    if (section === "earnings") {
      this.refreshProviderPayoutAccount({ silent: true });
    }
  }

  documentByType(type) {
    const docs = this.state?.provider?.documents?.items ?? [];
    const target = String(type || "").toLowerCase();
    return docs.find((doc) => String(doc.document_type || "").toLowerCase() === target) ?? null;
  }

  updateVerificationResultScreen() {
    const accountApproved = Boolean(this.state?.provider?.profile?.approved);
    const required = [
      ["dni_front", "DNI frente", "Obligatorio"],
      ["dni_back", "DNI dorso", "Obligatorio"],
      ["selfie", "Selfie", "Obligatorio"],
      ["criminal_record_certificate", "Antecedentes penales", "Opcional por 15 días"]
    ];

    const statusLabel = (status) => {
      const value = String(status || "PENDING").toUpperCase();
      if (value === "APPROVED") return "Aprobado";
      if (value === "REJECTED") return "Rechazado";
      if (value === "NEEDS_RESUBMISSION") return "Requiere reenvío";
      return "En revisión";
    };

    if (this.elements.verificationResultText) {
      const status = this.state?.provider?.verificationStatus;
      this.elements.verificationResultText.textContent =
        status === "approved"
          ? "Tu verificación está aprobada."
          : status === "rejected"
            ? "Hay documentos que necesitan corrección."
            : "Recibimos tus documentos. La revisión queda pendiente del equipo MIMI.";
    }

    if (this.elements.verificationResultList) {
      this.elements.verificationResultList.innerHTML = required
        .map(([type, title, rule]) => {
          const doc = this.documentByType(type);
          const meta = this.verificationDocumentMeta(type, doc, accountApproved);
          const tag = meta.actionable ? "button" : "article";
          return `
            <${tag}
              class="verification-result-item ${meta.className}"
              ${meta.actionable ? `type="button" data-verification-doc="${type}" aria-label="${meta.actionLabel}"` : ""}
            >
              <div>
                <strong>${title}</strong>
                <span>${rule}</span>
              </div>
              <span>${meta.label}</span>
            </${tag}>
          `;
        })
        .join("");
    }
  }

  verificationDocumentMeta(type, doc, accountApproved = false) {
    if (!doc) {
      const approvedByAdmin = accountApproved && type !== "criminal_record_certificate";
      return {
        label: approvedByAdmin ? "Aprobado por admin" : "Pendiente",
        className: approvedByAdmin ? "is-approved" : "missing-doc is-actionable",
        actionable: !approvedByAdmin,
        actionLabel: `Cargar ${this.verificationDocumentTitle(type)}`
      };
    }

    const status = String(doc.review_status || "PENDING").toUpperCase();
    if (status === "APPROVED") {
      return { label: "Aprobado", className: "has-doc is-approved", actionable: false };
    }
    if (status === "REJECTED") {
      return {
        label: "Corregir",
        className: "has-doc is-rejected is-actionable",
        actionable: true,
        actionLabel: `Corregir ${this.verificationDocumentTitle(type)}`
      };
    }
    if (status === "NEEDS_RESUBMISSION") {
      return {
        label: "Reenviar",
        className: "has-doc is-rejected is-actionable",
        actionable: true,
        actionLabel: `Reenviar ${this.verificationDocumentTitle(type)}`
      };
    }
    return { label: "En revisión", className: "has-doc is-review", actionable: false };
  }

  verificationDocumentTitle(type) {
    return {
      dni_front: "DNI frente",
      dni_back: "DNI dorso",
      selfie: "selfie",
      criminal_record_certificate: "antecedentes penales"
    }[type] || "documento";
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Online button
    this.elements.goOnlineButton?.addEventListener('click', (event) => {
      this.runProviderAction(
        "go-online",
        event.currentTarget,
        "Conectando...",
        () => this.handleGoOnline()
      );
    });

    // Menu button
    this.elements.menuButton?.addEventListener('click', () => {
      actions.toggleDrawer();
    });

    // Drawer close
    this.elements.drawerClose?.addEventListener('click', () => {
      actions.closeDrawer();
    });

    this.elements.drawerOverlay?.addEventListener('click', () => {
      actions.closeDrawer();
    });

    // Tab buttons
this.elements.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    const isSameTab =
      btn.classList.contains("active") &&
      this.elements.bottomSheet?.classList.contains("expanded");

    if (isSameTab) {
      this.setBottomSheetState("peek");
      this.restoreSheetReturnTab();
      return;
    }

    this.captureSheetReturnTab();
    this.switchTab(tab);
    this.setBottomSheetState("expanded");
    if (tab === "wallet") {
      this.refreshProviderPayoutAccount({ silent: true });
    }
  });
});

    this.elements.sheetCloseBtn?.addEventListener("click", () => {
      this.closeExpandedSheet({ fromHistory: false });
    });

    window.addEventListener("popstate", (event) => {
      if (this.handleProviderBackStep()) {
        return;
      }

      if (
        this.isBottomSheetExpanded() ||
        event.state?.mimiProviderSheet === "expanded" ||
        this.sheetHistoryOpen
      ) {
        this.closeExpandedSheet({ fromHistory: true });
        return;
      }

      this.handleProviderBackExit();
    });
    // Status toggle
    this.elements.statusToggleModern?.addEventListener('click', (e) => {
      const option = e.target.closest('.toggle-option');
      if (option) {
        const status = option.dataset.status;
        this.runProviderAction(
          "status-toggle",
          option,
          status === "ONLINE_IDLE" ? "Conectando..." : "Desconectando...",
          () => this.handleStatusToggle(status)
        );
      }
    });

    // Quick actions
    this.elements.quickNotifications?.addEventListener('click', () => {
      actions.toggleNotifications();
    });

    this.elements.quickChat?.addEventListener('click', () => {
      this.openClientChat();
    });

    this.elements.quickSupport?.addEventListener('click', () => {
      this.openProviderSupportChat();
    });

    this.elements.providerSupportChatBtn?.addEventListener('click', () => {
      this.openProviderSupportChat();
    });

    // Notification drawer
    this.elements.markAllRead?.addEventListener('click', () => {
      actions.markNotificationsRead();
      this.showToast('Notificaciones marcadas como ledas', 'success');
    });

    // Chat
    this.elements.chatClose?.addEventListener('click', () => {
      actions.closeChat();
    });

    this.elements.chatSend?.addEventListener('click', () => {
      this.sendChatMessage();
    });

    this.elements.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendChatMessage();
      }
    });

    this.elements.chatQuickReplies?.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-chat-quick]');
      if (!button) return;
      if (this.elements.chatInput) this.elements.chatInput.value = button.dataset.chatQuick || "";
      this.sendChatMessage();
    });

    this.elements.openExternalNavigation?.addEventListener('click', () => {
      this.openExternalNavigation();
    });

    this.elements.toggleInAppNavigation?.addEventListener('click', () => {
      this.toggleInAppNavigation();
    });

    this.elements.recenterNavigation?.addEventListener('click', () => {
      this.recenterNavigationCamera();
    });

    // Offer actions
    this.elements.acceptOffer?.addEventListener('click', (event) => {
      this.runProviderAction(
        "accept-offer",
        event.currentTarget,
        "Aceptando...",
        () => this.handleAcceptOffer()
      );
    });

    this.elements.rejectOffer?.addEventListener('click', (event) => {
      this.runProviderAction(
        "reject-offer",
        event.currentTarget,
        "Rechazando...",
        () => this.handleRejectOffer()
      );
    });

    // Service action
    this.elements.serviceActionBtn?.addEventListener('click', (event) => {
      this.runProviderAction(
        "service-action",
        event.currentTarget,
        "Actualizando...",
        () => this.handleServiceAction()
      );
    });

// Verification
this.elements.verificationBtn?.addEventListener('click', () => {
  actions.openModal("verification");
  this.showVerificationEntry();
});
    // Modal
    this.elements.modalClose?.addEventListener('click', () => {
      actions.closeModal();
    });

    this.elements.wizardNext?.addEventListener('click', () => {
      this.handleWizardNext();
    });

    this.elements.wizardPrev?.addEventListener('click', () => {
      this.handleWizardPrev();
    });

    this.elements.verificationResultList?.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-verification-doc]");
      if (!button) return;
      this.openVerificationDocumentStep(button.dataset.verificationDoc);
    });

    this.elements.providerExitCancel?.addEventListener("click", () => {
      this.resolveProviderExitConfirm(false);
    });

    this.elements.providerExitConfirm?.addEventListener("click", () => {
      this.resolveProviderExitConfirm(true);
    });

    this.elements.providerExitOverlay?.addEventListener("click", (event) => {
      if (event.target === this.elements.providerExitOverlay) {
        this.resolveProviderExitConfirm(false);
      }
    });

    // Logout
    this.elements.logoutBtn?.addEventListener('click', () => {
      this.handleLogout();
    });

    // Install banner
    this.elements.installBtn?.addEventListener('click', () => {
      this.handleInstall();
    });

this.elements.installDismiss?.addEventListener("click", (event) => {
  this.dismissInstallBanner(event);
});

document.addEventListener("click", (event) => {
  if (event.target?.closest?.("#installDismiss")) {
    this.dismissInstallBanner(event);
  }
});    
    // Drawer links
    document.getElementById('linkProfile')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("profile");
    });

    document.getElementById('linkDocuments')?.addEventListener('click', (e) => {
      e.preventDefault();
      actions.openModal("verification");
      this.showVerificationEntry(true);
      this.openProviderSection("documents");
    });

    document.getElementById('linkServices')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("services");
    });

    document.getElementById('linkEarnings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("earnings");
    });

    document.addEventListener("submit", (event) => {
      const form = event.target?.closest?.("#providerPayoutAccountForm");
      if (!form) return;
      this.handleProviderPayoutAccountSubmit(event);
    });

    document.addEventListener("click", (event) => {
      const refreshButton = event.target?.closest?.("[data-provider-wallet-refresh]");
      if (!refreshButton) return;
      event.preventDefault();
      this.refreshProviderPayoutAccount();
    });

    document.getElementById('linkSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("settings");
    });

    document.getElementById("linkPhoneTrust")?.addEventListener("click", async (e) => {
      e.preventDefault();
      actions.closeDrawer();
      await this.setupProviderPhoneTrust({ forceChange: true });
    });

    document.getElementById('linkSupport')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("support");
    });

document.querySelectorAll("[data-camera-doc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    this.openCameraCapture(btn.dataset.cameraDoc);
  });
});

document.addEventListener("click", (event) => {
  const cameraButton = event.target?.closest?.("[data-camera]");
  if (cameraButton) {
    this.openCameraCapture(cameraButton.dataset.camera);
    return;
  }

  const uploadButton = event.target?.closest?.("[data-upload]");
  if (!uploadButton) return;

  const input = document.querySelector(`[data-input="${uploadButton.dataset.upload}"]`);
  input?.click();
});

document.addEventListener("change", (event) => {
  const input = event.target?.matches?.("[data-input]") ? event.target : null;
  if (!input?.files?.length) return;

  this.uploadVerificationFile(input.dataset.input, input.files[0], input);
});

this.elements.cameraCancelBtn?.addEventListener("click", () => {
  this.closeCameraCapture();
});

this.elements.cameraCaptureBtn?.addEventListener("click", () => {
  this.captureCameraFrame();
});

this.elements.cameraRetakeBtn?.addEventListener("click", () => {
  this.resetCameraPreview();
});

this.elements.cameraUseBtn?.addEventListener("click", () => {
  this.confirmCameraCapture();
});

this.elements.cameraSupportBtn?.addEventListener("click", () => {
  this.closeCameraCapture();
  this.openProviderSupportChat();
});

document.addEventListener("submit", (event) => {
  if (event.target?.id === "providerBusinessForm") {
    this.handleProviderBusinessSubmit(event);
  }
});

document.addEventListener("click", (event) => {
  const actionButton = event.target?.closest?.("[data-provider-business-action]");
  if (actionButton) {
    this.handleProviderBusinessAction(actionButton.dataset.providerBusinessAction, actionButton);
  }

  const flowButton = event.target?.closest?.("[data-provider-flow]");
  if (flowButton?.dataset.providerFlow === "chat") {
    this.openClientChat();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;

  // Avatar uploader: cuando el usuario elige un archivo, lo subimos
  if (target?.id === "providerAvatarInput") {
    const file = target.files?.[0];
    if (file) this.handleProviderAvatarUpload(file);
    return;
  }

  if (target?.matches?.("[name='offering:0:categoryId'], [name='offering:0:serviceMode']")) {
    this.applyProviderCategoryUiRules(target.closest("form"));
  }
  if (target?.matches?.("[name='offering:0:pricingModel']")) {
    target.dataset.touched = "1";
    this.applyProviderCategoryUiRules(target.closest("form"));
  }
  if (target?.matches?.("[name='providerProvince']")) {
    this.updateProviderCityOptions(target);
  }
  if (target?.matches?.("[name='providerLegalGateAccepted']")) {
    const gate = target.closest("[data-provider-legal-gate]");
    const button = gate?.querySelector?.("[data-provider-business-action='accept-provider-legal-gate']");
    if (button) button.disabled = !target.checked;
  }
});
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.state?.ui.drawerOpen) actions.closeDrawer();
        if (this.state?.ui.notificationDrawerOpen) actions.closeNotifications();
        if (this.state?.ui.chatDrawerOpen) actions.closeChat();
        if (this.state?.ui.modalOpen) actions.closeModal();
      }
    });

    // Visibility change (background/foreground)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.onAppForeground();
      } else {
        this.onAppBackground();
      }
    });

    // Online/offline
    window.addEventListener('online', () => {
      this.showToast('Conexin restaurada', 'success');
    });

    window.addEventListener('offline', () => {
      this.showToast('Sin conexin - modo offline', 'warning');
    });
  }

  /**
   * Setup bottom sheet gestures
   */
  setupBottomSheetGestures() {
    const handle = this.elements.sheetHandle;
    const sheet = this.elements.bottomSheet;
    
    if (!handle || !sheet) return;

    const onTouchStart = (e) => {
      this.touchState.isDragging = true;
      this.touchState.startY = e.touches?.[0]?.clientY || e.clientY;
      this.touchState.startHeight = sheet.offsetHeight;
      sheet.style.transition = 'none';
    };

    const onTouchMove = (e) => {
      if (!this.touchState.isDragging) return;
      
      const clientY = e.touches?.[0]?.clientY || e.clientY;
      const delta = this.touchState.startY - clientY;
      
      // Determine direction and update sheet position
      if (delta > 50) {
        // Dragging up
        sheet.classList.add('expanded');
        sheet.classList.remove('collapsed');
        document.body.dataset.providerSheet = "expanded";
        this.syncOnlineButtonVisibility();
      } else if (delta < -50) {
        // Dragging down
        if (sheet.classList.contains('expanded')) {
          sheet.classList.remove('expanded');
          document.body.dataset.providerSheet = "peek";
        } else {
          sheet.classList.add('collapsed');
          document.body.dataset.providerSheet = "collapsed";
        }
        this.syncOnlineButtonVisibility();
      }
    };

    const onTouchEnd = () => {
      this.touchState.isDragging = false;
      sheet.style.transition = '';
      document.body.dataset.providerSheet = sheet.classList.contains("expanded")
        ? "expanded"
        : sheet.classList.contains("collapsed")
          ? "collapsed"
          : "peek";
      this.syncOnlineButtonVisibility();
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('mousedown', onTouchStart);
    
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('mousemove', onTouchMove);
    
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('mouseup', onTouchEnd);
  }

  /**
   * Set bottom sheet state
   */
  setBottomSheetState(state) {
    const sheet = this.elements.bottomSheet;
    if (!sheet) return;

    sheet.classList.remove('collapsed', 'expanded');
    document.body.dataset.providerSheet = state;
    
    switch (state) {
      case 'collapsed':
        sheet.classList.add('collapsed');
        break;
      case 'peek':
        // Default state
        break;
      case 'expanded':
        sheet.classList.add('expanded');
        break;
    }
    
    actions.setBottomSheetState(state);
    this.syncOnlineButtonVisibility();
    this.syncSheetHistory(state);
  }

  isBottomSheetExpanded() {
    return (
      document.body.dataset.providerSheet === "expanded" ||
      this.elements.bottomSheet?.classList.contains("expanded") ||
      this.state?.ui?.bottomSheetState === "expanded"
    );
  }

  closeExpandedSheet({ fromHistory = false } = {}) {
    if (!this.elements.bottomSheet) return;

    this.setBottomSheetState("peek");
    this.restoreSheetReturnTab();
    if (this.elements.sheetContent) this.elements.sheetContent.scrollTop = 0;
    this.sheetHistoryOpen = false;

    if (!fromHistory && history.state?.mimiProviderSheet === "expanded") {
      try {
        const nextState = { ...(history.state || {}) };
        delete nextState.mimiProviderSheet;
        history.replaceState(nextState, "", window.location.href);
      } catch (_) {
        history.replaceState({ ...(history.state || {}), mimiProviderSheet: null }, "", window.location.href);
      }
    }
  }

  currentProviderTab() {
    return document.body.dataset.providerTab || this.state?.ui?.activeTab || "now";
  }

  captureSheetReturnTab() {
    this.sheetReturnTab = this.currentProviderTab() || "now";
  }

  restoreSheetReturnTab() {
    const targetTab = this.sheetReturnTab || "now";
    this.sheetReturnTab = null;

    if (targetTab && targetTab !== this.currentProviderTab()) {
      this.switchTab(targetTab);
    }
  }

  syncSheetHistory(state) {
    if (state === "expanded") {
      if (!this.sheetHistoryOpen && history.state?.mimiProviderSheet !== "expanded") {
        try {
          history.pushState({ ...(history.state || {}), mimiProviderSheet: "expanded" }, "", window.location.href);
          this.sheetHistoryOpen = true;
        } catch (_) {
          this.sheetHistoryOpen = false;
        }
      }
      return;
    }

    if (state !== "expanded") {
      this.sheetHistoryOpen = false;
    }
  }

  ensureProviderBackGuard() {
    if (this.backGuardReady || !window.history?.pushState) return;

    try {
      history.replaceState(
        { ...(history.state || {}), mimiProviderRoot: true },
        "",
        window.location.href
      );
      history.pushState(
        { ...(history.state || {}), mimiProviderBackGuard: true },
        "",
        window.location.href
      );
      this.backGuardReady = true;
    } catch (_) {
      this.backGuardReady = false;
    }
  }

  async handleProviderBackExit() {
    if (this.allowProviderBackExit || !document.body.classList.contains("provider-authenticated")) {
      return;
    }

    this.setProviderExitDialogText({
      kicker: "Cuenta de prestador",
      title: "Cerrar sesion",
      message: "Vamos a cerrar la sesion actual y volver al login de Prestador para que puedas entrar con otra cuenta Google.",
      cancel: "Seguir conectado",
      confirm: "Cerrar sesion"
    });
    const wantsLogout = await this.showProviderExitConfirm();
    if (wantsLogout) {
      await this.abortProviderAuthAttempt();
      return;
    }

    this.backGuardReady = false;
    this.ensureProviderBackGuard();
  }

  showProviderExitConfirm() {
    const overlay = this.elements.providerExitOverlay;
    if (!overlay) {
      return Promise.resolve(window.confirm("Cerrar sesión de MIMIGO Prestadores?"));
    }

    overlay.hidden = false;
    overlay.removeAttribute("aria-hidden");
    document.body.classList.add("provider-exit-open");
    window.setTimeout(() => this.elements.providerExitCancel?.focus?.(), 30);

    return new Promise((resolve) => {
      this.providerExitConfirmResolver = resolve;
    });
  }

  setProviderExitDialogText({ kicker, title, message, cancel, confirm } = {}) {
    const overlay = this.elements.providerExitOverlay;
    if (!overlay) return;

    const kickerEl = overlay.querySelector(".provider-exit-kicker");
    const titleEl = overlay.querySelector("#providerExitTitle");
    const messageEl = overlay.querySelector("p");

    if (kickerEl && kicker) kickerEl.textContent = kicker;
    if (titleEl && title) titleEl.textContent = title;
    if (messageEl && message) messageEl.textContent = message;
    if (this.elements.providerExitCancel && cancel) this.elements.providerExitCancel.textContent = cancel;
    if (this.elements.providerExitConfirm && confirm) this.elements.providerExitConfirm.textContent = confirm;
  }

  resolveProviderExitConfirm(value) {
    const overlay = this.elements.providerExitOverlay;
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("provider-exit-open");

    const resolver = this.providerExitConfirmResolver;
    this.providerExitConfirmResolver = null;
    resolver?.(Boolean(value));
  }

  handleProviderBackStep() {
    if (this.elements.providerExitOverlay && !this.elements.providerExitOverlay.hidden) {
      this.resolveProviderExitConfirm(false);
      this.rearmProviderBackGuard();
      return true;
    }

    if (this.elements.providerPhoneOverlay && !this.elements.providerPhoneOverlay.hidden) {
      this.confirmProviderAccountSwitch();
      this.rearmProviderBackGuard();
      return true;
    }

    const verificationOpen = this.elements.verificationModal && !this.elements.verificationModal.hidden;
    const activeVerificationStep = document.querySelector(".wizard-step.active");
    const activeStepNumber = Number(activeVerificationStep?.id?.replace("step", "") || 0);

    if (verificationOpen && this.verificationReturnStep && activeStepNumber !== this.verificationReturnStep) {
      this.showWizardStep(this.verificationReturnStep);
      this.verificationReturnStep = null;
      this.rearmProviderBackGuard();
      return true;
    }

    if (verificationOpen || this.state?.ui?.modalOpen) {
      actions.closeModal();
      this.verificationReturnStep = null;
      this.rearmProviderBackGuard();
      return true;
    }

    if (this.state?.ui?.drawerOpen) {
      actions.closeDrawer();
      if (this.isBottomSheetExpanded()) {
        this.closeExpandedSheet({ fromHistory: true });
      }
      this.rearmProviderBackGuard();
      return true;
    }

    if (this.state?.ui?.notificationDrawerOpen) {
      actions.closeNotifications();
      this.syncOnlineButtonVisibility();
      this.rearmProviderBackGuard();
      return true;
    }

    if (this.state?.ui?.chatDrawerOpen) {
      actions.closeChat();
      this.syncOnlineButtonVisibility();
      this.rearmProviderBackGuard();
      return true;
    }

    return false;
  }

  rearmProviderBackGuard() {
    this.backGuardReady = false;
    this.ensureProviderBackGuard();
  }

  async confirmProviderAccountSwitch() {
    this.setProviderExitDialogText({
      kicker: "Cambiar cuenta Google",
      title: "¿Querés salir de esta cuenta?",
      message: "Vamos a cerrar este intento de registro y volver al login de Prestador para que elijas otra cuenta Google.",
      cancel: "Seguir verificando",
      confirm: "Cambiar cuenta"
    });
    const confirmed = await this.showProviderExitConfirm();

    if (!confirmed) {
      this.rearmProviderBackGuard();
      return false;
    }

    await this.abortProviderAuthAttempt();
    return true;
  }

  async abortProviderAuthAttempt() {
    try {
      this.stopLocationTracking();
      this.stopPresenceHeartbeat();
    } catch (_) {}

    try {
      await signOut();
    } catch (error) {
      console.warn("[MIMI Provider] No se pudo cerrar Supabase antes de cambiar cuenta:", error?.message ?? error);
    } finally {
      try {
        forceCleanSession("provider");
        clearAuthRedirectIntent();
        sessionStorage.setItem("mimi_services_active_mode", "provider");
        localStorage.setItem("mimi_services_active_mode", "provider");
      } catch (_) {}
    }

    this.resolveProviderExitConfirm(false);
    this.state = null;
    this.allowProviderBackExit = false;
    this.backGuardReady = false;

    if (this.elements.providerPhoneOverlay) {
      this.elements.providerPhoneOverlay.hidden = true;
    }

    document.body.classList.remove(
      "provider-phone-open",
      "provider-auth-loading",
      "provider-authenticated",
      "provider-auth-submitting",
      "provider-exit-open"
    );
    document.body.classList.add("provider-auth-required");

    if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "none";
    if (this.elements.header) this.elements.header.style.display = "none";
    if (this.elements.mapContainer) this.elements.mapContainer.style.display = "none";

    this.showProviderLoginGate();

    try {
      history.replaceState({ mimiProviderLogin: true }, "", "/prestador");
    } catch (_) {}

    return true;
  }

  /**
   * Switch tab
   */
  switchTab(tab) {
    document.body.dataset.providerTab = tab;

    // Update buttons
    this.elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update panels
    this.elements.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });
    
    actions.setTab(tab);
    this.syncOnlineButtonVisibility();
  }

  syncOnlineButtonVisibility() {
    const container = this.elements.onlineButtonContainer;
    if (!container || document.body.classList.contains("provider-auth-required")) return;

    const hasContextScreenOpen =
      this.isBottomSheetExpanded() ||
      Boolean(this.state?.ui?.drawerOpen) ||
      Boolean(this.state?.ui?.notificationDrawerOpen) ||
      Boolean(this.state?.ui?.chatDrawerOpen) ||
      Boolean(this.state?.ui?.modalOpen) ||
      (this.elements.providerPinOverlay && !this.elements.providerPinOverlay.hidden) ||
      (this.elements.providerPhoneOverlay && !this.elements.providerPhoneOverlay.hidden) ||
      (this.elements.providerExitOverlay && !this.elements.providerExitOverlay.hidden);

    document.body.classList.toggle("provider-drawer-open", Boolean(this.state?.ui?.drawerOpen));
    document.body.classList.toggle(
      "provider-overlay-open",
      Boolean(
        this.state?.ui?.notificationDrawerOpen ||
        this.state?.ui?.chatDrawerOpen ||
        this.state?.ui?.modalOpen ||
        (this.elements.providerPinOverlay && !this.elements.providerPinOverlay.hidden) ||
        (this.elements.providerPhoneOverlay && !this.elements.providerPhoneOverlay.hidden) ||
        (this.elements.providerExitOverlay && !this.elements.providerExitOverlay.hidden)
      )
    );

    const isHidden =
      container.hidden ||
      container.classList.contains("hidden") ||
      hasContextScreenOpen ||
      this.state?.provider?.status !== "OFFLINE" ||
      Boolean(this.state?.activeService) ||
      Boolean(this.state?.activeOffer);

    container.classList.toggle("provider-online-context-hidden", Boolean(hasContextScreenOpen));
    container.setAttribute("aria-hidden", String(Boolean(isHidden)));
  }

  /**
   * Handle go online button
   */
async handleGoOnline() {
if (!this.state?.provider.isVerified) {
  this.showToast("Necesitas completar tu verificacion primero", "warning");
  actions.openModal("verification");
  setTimeout(() => this.showVerificationEntry(true), 50);

  return;
}
if (!this.providerHasPublishedService()) {
  this.showToast("Primero publica que servicio ofreces y cuanto cobras", "warning");
  this.openProviderBusinessSetup();
  return;
}
  const providerId = this.state?.session?.providerId;
if (!providerId) {
  this.showToast("Actualizando tu perfil de prestador...", "info");

  await this.loadInitialData();

  const refreshedProviderId = this.state?.session?.providerId;

  if (!refreshedProviderId) {
    this.showToast("No pudimos crear o cargar tu perfil. Cerr sesin e ingres nuevamente como prestador.", "error");
    return;
  }

  actions.openModal("verification");
  this.showWizardStep(1);
  return;
}
  const pushRegistration = this.registerProviderPushToken({ prompt: true }).catch(() => {});
  const previousStatus = this.state?.provider?.status ?? "OFFLINE";
  const previousProfile = this.state?.provider?.profile ?? null;
  try {
    actions.setLoading(true);
    this.setStatusToggleBusy(true, "ONLINE_IDLE");

    const profile = await updateProviderStatus(providerId, "ONLINE_IDLE");

    actions.setProfile(profile);
    actions.setProviderStatus(profile?.status ?? "ONLINE_IDLE");
    actions.setBottomSheetState("peek");
    this.stopLocationTracking();
    this.applyProviderLocationSnapshot(profile);
    this.startPresenceHeartbeat();
    pushRegistration.catch(() => {});

    this.showToast("Ests online. Usamos tu ubicacion actual como referencia.", "success");
  } catch (err) {
    console.error("[MIMI] Error poniendo online:", err);
    actions.setProfile(previousProfile);
    actions.setProviderStatus(previousProfile?.status ?? previousStatus);
    this.showToast("No pudimos ponerte online. Volvimos al ultimo estado confirmado.", "error");
  } finally {
    this.setStatusToggleBusy(false);
    actions.setLoading(false);
  }
}
  /**
   * Handle status toggle
   */
async handleStatusToggle(status) {
  const previousStatus = this.state?.provider?.status ?? "OFFLINE";
  const previousProfile = this.state?.provider?.profile ?? null;

  if (previousStatus === status) {
    return;
  }

  if (status === "ONLINE_IDLE" && !this.state?.provider.isVerified) {
    this.showToast("Necesitas completar tu verificacion", "warning");
    actions.openModal("verification");
    setTimeout(() => this.showVerificationEntry(true), 50);
    return;
  }

  if (status === "ONLINE_IDLE" && !this.providerHasPublishedService()) {
    this.showToast("Primero publica al menos un servicio", "warning");
    this.openProviderBusinessSetup();
    return;
  }

  const providerId = this.state?.session?.providerId;
  if (!providerId) {
    this.showToast("No se encontr tu perfil de prestador", "error");
    return;
  }

  const pushRegistration = status === "ONLINE_IDLE"
    ? this.registerProviderPushToken({ prompt: true }).catch(() => {})
    : Promise.resolve();

  try {
    actions.setLoading(true);
    this.setStatusToggleBusy(true, status);

    const profile = await updateProviderStatus(providerId, status);

    actions.setProfile(profile);
    actions.setProviderStatus(profile?.status ?? status);

    if (status === "ONLINE_IDLE") {
      this.stopLocationTracking();
      this.applyProviderLocationSnapshot(profile);
      this.startPresenceHeartbeat();
      pushRegistration.catch(() => {});
      this.showToast("Ests online. Tu ubicacion se actualizo una vez.", "success");
    } else {
      this.showToast("Ests offline", "info");
      this.stopLocationTracking();
      this.stopPresenceHeartbeat();
    }
  } catch (err) {
    console.error("[MIMI] Error cambiando disponibilidad:", err);
    actions.setProfile(previousProfile);
    actions.setProviderStatus(previousProfile?.status ?? previousStatus);
    this.showToast("No pudimos actualizar tu estado. Volvimos al ultimo estado confirmado.", "error");
  } finally {
    this.setStatusToggleBusy(false);
    actions.setLoading(false);
  }
}

providerHasPublishedService() {
  const offerings = this.state?.provider?.business?.offerings ?? [];
  return Array.isArray(offerings) && offerings.some((item) => item?.active !== false && item?.title && item?.category_id);
}

openProviderBusinessSetup() {
  this.switchTab("pricing");
  this.setBottomSheetState("expanded");

  setTimeout(() => {
    const target =
      document.querySelector("#providerBusinessPanel .provider-offering-card-v2 input[name$=':title']") ??
      document.getElementById("providerBusinessPanel");

    target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    target?.focus?.({ preventScroll: true });
  }, 80);
}

collectProviderBusinessPayload(form) {
  const data = new FormData(form);
  const categories = [];
  const pricing = [];
  const offerings = [];
  const availability = [];

  // Recolectar IDs de offerings que el form está editando ahora.
  const formOfferingIds = new Set();
  for (let i = 0; data.has(`offering:${i}:present`); i++) {
    const idValue = String(data.get(`offering:${i}:id`) ?? "").trim();
    if (idValue) formOfferingIds.add(idValue);
  }

  // Preservar offerings activos del provider que NO están en el form.
  // Sin esto, el upsert con onConflict:"id" desactiva todos los que no
  // vengan en el payload (porque saveProviderWorkspace primero pone active=false
  // a TODOS los offerings del provider antes de re-activar los del payload).
  const existingOfferings = this.state?.provider?.business?.offerings ?? [];
  for (const existing of existingOfferings) {
    if (!existing?.id || existing.active === false) continue;
    if (formOfferingIds.has(String(existing.id))) continue;
    // Este offering no está en el form → preservarlo tal cual está en BD
    offerings.push({
      id: existing.id,
      categoryId: existing.category_id,
      title: existing.title ?? "",
      description: existing.description ?? "",
      pricingModel: existing.pricing_model ?? "HOURLY",
      serviceMode: existing.service_mode ?? "IN_PERSON",
      locationPolicy: existing.location_policy ?? "CLIENT_ADDRESS",
      publicSummary: existing.public_summary ?? "",
      pricePerHour: existing.price_per_hour ?? "",
      baseVisitFee: existing.base_visit_fee ?? "",
      fixedPrice: existing.fixed_price ?? "",
      unitName: existing.unit_name ?? "",
      unitPrice: existing.unit_price ?? "",
      minimumCharge: existing.minimum_charge ?? 0,
      minimumHours: existing.minimum_hours ?? "",
      maximumHours: existing.maximum_hours ?? "",
      durationMinutes: existing.duration_minutes ?? "",
      clientInstructions: existing.client_instructions ?? "",
      quoteRequired: Boolean(existing.quote_required),
      metadata: existing.metadata ?? {}
    });
  }

  for (let index = 0; data.has(`offering:${index}:present`); index += 1) {
    if (!data.has(`offering:${index}:active`)) continue;

    const title = String(data.get(`offering:${index}:title`) ?? "").trim();
    const categoryId = String(data.get(`offering:${index}:categoryId`) ?? "").trim();

    if (!title || !categoryId) continue;

    offerings.push({
      id: String(data.get(`offering:${index}:id`) ?? "").trim() || null,
      categoryId,
      title,
      description: data.get(`offering:${index}:description`) ?? "",
      pricingModel: data.get(`offering:${index}:pricingModel`) ?? "HOURLY",
      serviceMode: data.get(`offering:${index}:serviceMode`) ?? "IN_PERSON",
      locationPolicy: data.get(`offering:${index}:locationPolicy`) ?? "CLIENT_ADDRESS",
      publicSummary: data.get(`offering:${index}:publicSummary`) ?? "",
      pricePerHour: data.get(`offering:${index}:pricePerHour`) ?? "",
      baseVisitFee: data.get(`offering:${index}:baseVisitFee`) ?? "",
      fixedPrice: data.get(`offering:${index}:fixedPrice`) ?? "",
      unitName: data.get(`offering:${index}:unitName`) ?? "",
      unitPrice: data.get(`offering:${index}:unitPrice`) ?? "",
      minimumCharge: data.get(`offering:${index}:minimumCharge`) ?? 0,
      minimumHours: data.get(`offering:${index}:minimumHours`) ?? "",
      maximumHours: data.get(`offering:${index}:maximumHours`) ?? "",
      durationMinutes: data.get(`offering:${index}:durationMinutes`) ?? "",
      clientInstructions: data.get(`offering:${index}:clientInstructions`) ?? "",
      quoteRequired: data.has(`offering:${index}:quoteRequired`),
      metadata: {
        coverage_radius_meters: Number(data.get("providerCoverageRadius") ?? 0) || null
      }
    });
  }

const availableCategories = this.getProviderCategories();

for (const category of availableCategories) {
  const categoryId = category.id;
    if (!categoryId || !data.has(`categoryActive:${categoryId}`)) continue;

    const offeringReference = offerings
      .filter((item) => item.categoryId === categoryId)
      .map((item) =>
        Number(
          item.pricePerHour ||
            item.baseVisitFee ||
            item.fixedPrice ||
            item.unitPrice ||
            item.minimumCharge ||
            0
        )
      )
      .find((value) => Number.isFinite(value) && value > 0);
    const pricePerHour = Number(data.get(`price:${categoryId}`) || offeringReference || 0);
    const minimumHours = Number(data.get(`min:${categoryId}`) ?? 1);
    const maximumHours = Number(
      data.get(`max:${categoryId}`) ??
        data.get("maxHoursPerService") ??
        8
    );

    categories.push({ categoryId });
    pricing.push({
      categoryId,
      currency: "ARS",
      pricePerHour,
      minimumHours,
      maximumHours
    });
  }

  for (const offering of offerings) {
    if (categories.some((item) => item.categoryId === offering.categoryId)) continue;

    const referencePrice = Number(
      offering.pricePerHour ||
        offering.baseVisitFee ||
        offering.fixedPrice ||
        offering.unitPrice ||
        offering.minimumCharge ||
        0
    );

    categories.push({ categoryId: offering.categoryId });
    pricing.push({
      categoryId: offering.categoryId,
      currency: "ARS",
      pricePerHour: referencePrice,
      minimumHours: Number(offering.minimumHours || 1),
      maximumHours: Number(offering.maximumHours || data.get("maxHoursPerService") || 8)
    });
  }

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    if (!data.has(`dayActive:${dayOfWeek}`)) continue;

    availability.push({
      dayOfWeek,
      startTime: data.get(`dayStart:${dayOfWeek}`) || "08:00",
      endTime: data.get(`dayEnd:${dayOfWeek}`) || "18:00",
      active: true
    });
  }

  return {
    firstName: data.get("providerFirstName") ?? "",
    bio: data.get("providerBio") ?? "",
    publicHeadline: data.get("providerPublicHeadline") ?? "",
    professionalSummary: data.get("providerProfessionalSummary") ?? "",
    videoIntroUrl: data.get("providerVideoIntroUrl") ?? "",
    city: data.get("providerCity") ?? "",
    province: data.get("providerProvince") ?? "",
    addressText: data.get("providerAddressText") ?? "",
    coverageRadiusMeters: Number(data.get("providerCoverageRadius") ?? 0) || null,
    pricingMode: "HOURLY",
    acceptsImmediate: true,
    acceptsScheduled: true,
    maxHoursPerService: Number(data.get("maxHoursPerService") ?? 8),
    categories,
    pricing,
    offerings,
    availability
  };
}

async handleProviderBusinessSubmit(event) {
  event.preventDefault();

  const providerId = this.state?.session?.providerId;
  if (!providerId) {
    this.showToast("No se encontro tu perfil de prestador", "error");
    return;
  }

  const payload = this.collectProviderBusinessPayload(event.target);

  if (!payload.categories.length) {
    this.showToast("Elegi al menos una profesion o categoria", "warning");
    return;
  }

  const hasInvalidPricing = payload.pricing.some((item) => {
    const hasReferencePrice = Number.isFinite(item.pricePerHour) && item.pricePerHour > 0;
    const hasQuoteOffering = payload.offerings.some((offering) => {
      return (
        offering.categoryId === item.categoryId &&
        (String(offering.pricingModel || "").toUpperCase() === "QUOTE" || offering.quoteRequired)
      );
    });

    return !hasReferencePrice && !hasQuoteOffering;
  });

  if (hasInvalidPricing) {
    this.showToast("Cada rubro necesita un precio de referencia o marcar que requiere presupuesto", "warning");
    return;
  }

  if (payload.offerings.some((item) => !item.title || !item.categoryId)) {
    this.showToast("Revisa los trabajos publicados: falta titulo o categoria", "warning");
    return;
  }

  if (!this.isProviderLegalAccepted()) {
    this.showToast("Aceptá las condiciones legales antes de publicar servicios", "warning");
    return;
  }

  try {
    actions.setLoading(true);
    const avatarFile = event.target?.querySelector?.("[name='providerAvatarFile']")?.files?.[0] ?? null;
    if (avatarFile) {
      await uploadProviderAvatar({ providerId, file: avatarFile });
    }
    const wasEditing = Boolean(this.state?.provider?.editingOfferingId);
    const workspace = await saveProviderWorkspace(providerId, payload);
    this.applyWorkspaceToState(workspace);

    // Si estábamos editando, limpiar el editingOfferingId para no quedar pegados
    // a ese offering en próximos renders (sino el form siempre lo precargaría).
    if (wasEditing) {
      actions.updateState({
        provider: { ...this.state.provider, editingOfferingId: null }
      });
    }

    this.switchTab("now");
    this.setBottomSheetState("peek");
    renderProviderScreen(this.state);
    this.renderServicesAndPricing();
    this.renderSheetSummary();
    this.showToast(wasEditing ? "Servicio actualizado correctamente." : "Servicio publicado. Ya podés ponerte online.", "success");
  } catch (err) {
    console.error("[MIMI] Error guardando setup comercial:", err);
    this.showToast(err?.message ?? "No pudimos guardar tus servicios", "error");
  } finally {
    actions.setLoading(false);
  }
}

getProviderLegalRequirements() {
  const requirements = this.state?.provider?.business?.legalRequirements;
  const source = Array.isArray(requirements) && requirements.length
    ? requirements
    : PROVIDER_LEGAL_REQUIREMENT_FALLBACKS;

  return source
    .map((item) => {
      const code = item.document_code || item.code;
      if (!code || !item.version) return null;

      return {
        document_code: code,
        actor_type: item.accept_actor_type || (item.actor_type === "all" ? "provider" : item.actor_type || "provider"),
        version: String(item.version)
      };
    })
    .filter(Boolean);
}

isProviderLegalRequirementAccepted(requirement = {}) {
  const acceptances = this.state?.provider?.business?.legalAcceptances ?? [];
  const expectedActor = requirement.actor_type || "provider";

  return acceptances.some((acceptance) =>
    acceptance?.document_code === requirement.document_code &&
    acceptance?.document_version === requirement.version &&
    (!acceptance?.actor_type || acceptance.actor_type === expectedActor) &&
    acceptance?.accepted_at
  );
}

isProviderLegalAccepted() {
  const documents = this.getProviderLegalRequirements();
  return documents.length > 0 && documents.every((documentPayload) =>
    this.isProviderLegalRequirementAccepted(documentPayload)
  );
}

async acceptProviderTerms() {
  const userId = this.state?.session?.userId;
  if (!userId) throw new Error("No se encontro la sesion del prestador");

  const documents = this.getProviderLegalRequirements();
  const savedAcceptances = [];

  for (const documentPayload of documents) {
    if (this.isProviderLegalRequirementAccepted(documentPayload)) continue;

    try {
      const response = await invokeFunction("accept-legal-document", {
        ...documentPayload,
        acceptance_method: "checkbox_cta",
        source: "prestador_app",
        route: window.location.pathname || "/prestador",
        device_id: getDeviceId()
      });
      if (response?.ok !== true) {
        throw new Error(response?.error || "legal_acceptance_not_saved");
      }
      if (response.acceptance) savedAcceptances.push(response.acceptance);
    } catch (err) {
      console.error("[MIMI] No se pudo registrar aceptacion legal", {
        document: documentPayload.document_code,
        message: err?.message ?? err
      });
      throw new Error("No pudimos guardar la aceptacion legal. Reintenta en unos segundos.");
    }
  }

  if (savedAcceptances.length) {
    const current = this.state?.provider?.business?.legalAcceptances ?? [];
    actions.updateState({
      provider: {
        ...this.state.provider,
        business: {
          ...this.state.provider.business,
          legalAcceptances: [...savedAcceptances, ...current]
        }
      }
    });
  }

  return savedAcceptances;
}

async handleProviderLegalGateAccept(source = null) {
  const gate = source?.closest?.("[data-provider-legal-gate]");
  const checkbox = gate?.querySelector?.("[name='providerLegalGateAccepted']");

  if (!checkbox?.checked) {
    this.showToast("Marcá la aceptación legal para continuar", "warning");
    checkbox?.focus?.();
    return;
  }

  const originalText = source?.textContent ?? "Aceptar y continuar";
  if (source) {
    source.disabled = true;
    source.textContent = "Registrando...";
  }

  try {
    await this.acceptProviderTerms();
    const providerId = this.state?.session?.providerId;
    if (providerId) {
      const workspace = await loadProviderWorkspace(providerId);
      this.applyWorkspaceToState(workspace);
    }
    renderProviderScreen(this.state);
    this.renderServicesAndPricing();
    this.renderSheetSummary();
    this.showToast("Condiciones aceptadas. Ya podés configurar tus servicios.", "success");
  } catch (err) {
    this.showToast(err?.message ?? "No pudimos verificar tu aceptación legal. Intentá nuevamente.", "error");
    if (source) {
      source.disabled = false;
      source.textContent = originalText;
    }
  }
}

async handleProviderBusinessAction(action, source = null) {
  if (action === "accept-provider-legal-gate") {
    await this.handleProviderLegalGateAccept(source);
    return;
  }

  if (action === "provider-setup-next" || action === "provider-setup-prev" || action === "provider-setup-go") {
    this.moveProviderSetupStep(action, source);
    return;
  }

  if (action === "toggle-provider-suggestion") {
    this.toggleProviderSuggestion(source);
    return;
  }

  if (action === "start-provider-dictation") {
    this.startProviderDictation(source);
    return;
  }

  if (action === "improve-provider-description") {
    this.improveProviderDescription(source);
    return;
  }

  if (action === "use-provider-description") {
    this.useProviderDescription(source);
    return;
  }

  if (action === "hide-provider-description") {
    const box = source?.closest?.(".provider-description-suggestion");
    if (box) box.hidden = true;
    return;
  }

  if (action === "focus-offering-editor") {
    this.openProviderBusinessSetup();
    return;
  }

  if (action === "suggest-provider-service") {
    await this.handleProviderServiceSuggestion();
    return;
  }

  if (action === "open-avatar-picker") {
    document.getElementById("providerAvatarInput")?.click();
    return;
  }

  if (action === "remove-avatar") {
    await this.handleProviderAvatarRemove();
    return;
  }

  if (action === "edit-offering") {
    const offeringId = source?.dataset?.offeringId;
    if (!offeringId) return;

    // Verificar que el offering exista en el state actual
    const offerings = this.state?.provider?.business?.offerings ?? [];
    const target = offerings.find((o) => o?.id === offeringId);
    if (!target) {
      this.showToast("No encontré ese servicio. Recargá la página.", "error");
      console.warn("[MIMI Edit] offering no encontrado:", offeringId, "ofertas disponibles:", offerings.map((o) => o?.id));
      return;
    }
    console.log("[MIMI Edit] editando offering:", { id: offeringId, title: target.title, pricing_model: target.pricing_model });

    // 1) Marcar que estamos editando este offering en el state global
    actions.updateState({
      provider: {
        ...this.state.provider,
        editingOfferingId: offeringId,
      },
    });

    // 2) Cambiar a la pestaña "Servicios" — el panel se llama internamente "pricing"
    //    (data-tab="pricing" en el HTML, NO "services" — nombre histórico).
    this.switchTab("pricing");

    // 3) Re-render con el state actualizado (editingOfferingId define qué offering
    //    se carga como firstOffering en el form).
    renderProviderScreen(this.state);
    this.renderServicesAndPricing();

    // 4) Scroll y foco al form, después del layout
    window.setTimeout(() => {
      const form = document.getElementById("providerBusinessForm");
      if (!form) {
        console.warn("[MIMI Edit] providerBusinessForm no apareció en DOM");
        return;
      }
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      const titleInput = form.querySelector("[name='offering:0:title']");
      titleInput?.focus({ preventScroll: true });
      // Verificar que el form tiene los datos del offering
      const loadedId = form.querySelector("[name='offering:0:id']")?.value;
      console.log("[MIMI Edit] form cargado con offering id =", loadedId, "(esperado:", offeringId + ")");
      if (loadedId !== offeringId) {
        console.warn("[MIMI Edit] el form NO precargó el offering correcto. State:", this.state?.provider?.editingOfferingId);
      }
    }, 250);

    this.showToast(`Editando "${target.title || "servicio"}". Modificá y guardá.`, "info");
    return;
  }

  if (action === "delete-offering") {
    const offeringId = source?.dataset?.offeringId;
    if (!offeringId) return;
    if (!window.confirm("¿Eliminar este servicio? El cliente ya no podrá solicitarlo.")) return;
    await this.handleProviderOfferingDelete(offeringId);
    return;
  }

  if (action === "refresh-location") {
    this.updateMapToCurrentPosition();
    this.showToast("Ubicacion actualizada", "success");
    return;
  }

  if (action === "focus-map") {
    this.setBottomSheetState("collapsed");
    setTimeout(() => this.map?.resize?.(), 80);
    return;
  }

  if (action === "refresh-workspace") {
    const providerId = this.state?.session?.providerId;
    if (!providerId) return;

    try {
      actions.setLoading(true);
      const workspace = await loadProviderWorkspace(providerId);
      this.applyWorkspaceToState(workspace);
      renderProviderScreen(this.state);
      this.showToast("Panel recargado", "success");
    } catch (err) {
      console.error("[MIMI] Error recargando panel:", err);
      this.showToast("No pudimos recargar el panel", "error");
    } finally {
      actions.setLoading(false);
    }
  }
}

moveProviderSetupStep(action, source = null) {
  const form = document.getElementById("providerBusinessForm");
  if (!form) return;

  const steps = [...form.querySelectorAll("[data-provider-setup-step]")];
  if (!steps.length) return;

  const activeStep = form.querySelector("[data-provider-setup-step].is-active") ?? steps[0];
  const current = Number(activeStep.dataset.providerSetupStep ?? 1);
  if (action === "provider-setup-next" && current === 1 && !this.providerSetupSelectedCategoryIds(form).length) {
    this.showToast("Primero elegi al menos un rubro sugerido", "warning");
    return;
  }

  const target = action === "provider-setup-go"
    ? Number(source?.dataset?.providerSetupTarget ?? current)
    : current + (action === "provider-setup-next" ? 1 : -1);
  const next = Math.min(Math.max(target, 1), steps.length);

  steps.forEach((step) => {
    step.classList.toggle("is-active", Number(step.dataset.providerSetupStep) === next);
  });

  form.querySelectorAll("[data-provider-setup-target]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.providerSetupTarget) === next);
  });

  const nextStep = form.querySelector(`[data-provider-setup-step="${next}"]`);
  nextStep?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

getProviderCategories() {
  const categories =
    this.state?.appConfig?.categories ??
    this.state?.categories ??
    [];

  return Array.isArray(categories) ? categories.filter((item) => item?.id) : [];
}

updateProviderCityOptions(provinceSelect) {
  const form = provinceSelect?.closest?.("form");
  const citySelect = form?.querySelector?.("[name='providerCity']");
  if (!citySelect) return;

  const selectedOption = provinceSelect.selectedOptions?.[0];
  const cities = String(selectedOption?.dataset?.cities ?? "")
    .split("|")
    .map((city) => city.trim())
    .filter(Boolean);
  const current = citySelect.value;
  citySelect.innerHTML = [
    `<option value="">${cities.length ? "Elegi ciudad" : "Primero elegi provincia"}</option>`,
    ...cities.map((city) => `<option value="${this.escapeHtml(city)}">${this.escapeHtml(city)}</option>`),
    `<option value="Otra localidad">Otra localidad</option>`
  ].join("");
  if (cities.includes(current) || current === "Otra localidad") {
    citySelect.value = current;
  }
}

providerSetupSelectedCategoryIds(form = document.getElementById("providerBusinessForm")) {
  if (!form) return [];

  return [...form.querySelectorAll("[data-provider-suggestion-card].is-selected")]
    .map((item) => item.dataset.categoryId)
    .filter(Boolean);
}

syncProviderSelectedCategories(form = document.getElementById("providerBusinessForm")) {
  if (!form) return;

  const selectedIds = this.providerSetupSelectedCategoryIds(form);
  const selectedSet = new Set(selectedIds.map(String));
  const categories = this.getProviderCategories();
  const categoriesById = new Map(categories.map((category) => [String(category.id), category]));

  form.querySelectorAll("[name^='categoryActive:']").forEach((input) => {
    const categoryId = String(input.name).replace("categoryActive:", "");
    input.checked = selectedSet.has(categoryId);
  });

  form.querySelectorAll("[data-category-editor-card]").forEach((card) => {
    const visible = !selectedSet.size || selectedSet.has(String(card.dataset.categoryId));
    card.classList.toggle("is-filtered-out", !visible);
  });

  const firstSelected = selectedIds[0] ?? "";
  const firstIndex = this.firstEditableOfferingIndex(form);
  const categorySelect = form.querySelector(`[name='offering:${firstIndex}:categoryId']`);
  const activeInput = form.querySelector(`[name='offering:${firstIndex}:active']`);
  if (categorySelect && firstSelected) {
    if (![...categorySelect.options].some((option) => option.value === firstSelected)) {
      const selectedCard = form.querySelector(`[data-provider-suggestion-card][data-category-id="${CSS.escape(firstSelected)}"]`);
      const option = document.createElement("option");
      option.value = firstSelected;
      option.textContent = selectedCard?.querySelector("strong")?.textContent?.trim() || "Rubro sugerido";
      categorySelect.appendChild(option);
    }
    categorySelect.value = firstSelected;
  }
  if (activeInput && firstSelected) activeInput.checked = true;

  const selectedCategories = selectedIds
    .map((id) => categoriesById.get(String(id)) ?? {
      id,
      name: form.querySelector(`[data-provider-suggestion-card][data-category-id="${CSS.escape(String(id))}"] strong`)?.textContent?.trim() || "Rubro sugerido"
    })
    .filter(Boolean);
  const summary = form.querySelector("#providerSelectedRubrosSummary");
  if (summary) {
    summary.textContent = selectedCategories.length
      ? `Rubro seleccionado: ${selectedCategories.map((category) => category.name).join(", ")}`
      : "Primero elegi un rubro sugerido para completar el servicio.";
  }

  const titleInput = form.querySelector(`[name='offering:${firstIndex}:title']`);
  if (titleInput && firstSelected && !titleInput.value.trim()) {
    titleInput.value = selectedCategories[0]?.name ?? "";
  }

  this.applyProviderCategoryUiRules(form);

  const nextButton = form.querySelector("[data-provider-setup-step='1'] [data-provider-business-action='provider-setup-next']");
  if (nextButton) nextButton.disabled = !selectedIds.length;

  const selectedNames = [...form.querySelectorAll("[data-provider-suggestion-card].is-selected strong")]
    .map((item) => item.textContent.trim())
    .filter(Boolean);
  const hint = form.querySelector("#providerSelectionHint");
  if (hint) {
    hint.textContent = selectedNames.length
      ? `Elegiste: ${selectedNames.join(", ")}`
      : "Elegi al menos una sugerencia para seguir.";
  }
}

applyProviderCategoryUiRules(form = document.getElementById("providerBusinessForm")) {
  if (!form) return;

  const categorySelect = form.querySelector("[name='offering:0:categoryId']");
  const serviceModeSelect = form.querySelector("[name='offering:0:serviceMode']");
  const locationPolicySelect = form.querySelector("[name='offering:0:locationPolicy']");
  const pricingModelSelect = form.querySelector("[name='offering:0:pricingModel']");
  const unitNameInput = form.querySelector("[name='offering:0:unitName']");
  const coverageField = form.querySelector("#providerCoverageRadiusField");
  if (!categorySelect || !serviceModeSelect || !locationPolicySelect) return;

  const selectedOption = categorySelect.selectedOptions?.[0];
  const allowedModes = String(selectedOption?.dataset?.serviceModes || "IN_PERSON")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const safeModes = allowedModes.length ? allowedModes : ["IN_PERSON"];
  const modeLabels = {
    IN_PERSON: "Presencial",
    ONLINE: "Online",
    HYBRID: "Online y presencial"
  };
  const pricingModel = String(selectedOption?.dataset?.pricingModel || "").toUpperCase();

  const currentMode = safeModes.includes(serviceModeSelect.value) ? serviceModeSelect.value : safeModes[0];
  serviceModeSelect.innerHTML = safeModes
    .filter((mode) => modeLabels[mode])
    .map((mode) => `<option value="${mode}" ${mode === currentMode ? "selected" : ""}>${modeLabels[mode]}</option>`)
    .join("");

  if (pricingModel && pricingModelSelect && !pricingModelSelect.dataset.touched) {
    pricingModelSelect.value = pricingModel;
  }

  const policyLabels = {
    CLIENT_ADDRESS: "Domicilio del cliente",
    PROVIDER_ADDRESS: "Base del prestador",
    ONLINE_ONLY: "Videollamada",
    FLEXIBLE: "A coordinar"
  };
  const selectedMode = serviceModeSelect.value || currentMode;
  const policies = selectedMode === "ONLINE"
    ? ["ONLINE_ONLY"]
    : selectedMode === "HYBRID"
      ? ["FLEXIBLE", "CLIENT_ADDRESS", "PROVIDER_ADDRESS", "ONLINE_ONLY"]
      : ["CLIENT_ADDRESS", "PROVIDER_ADDRESS", "FLEXIBLE"];
  const currentPolicy = policies.includes(locationPolicySelect.value) ? locationPolicySelect.value : policies[0];

  locationPolicySelect.innerHTML = policies
    .map((policy) => `<option value="${policy}" ${policy === currentPolicy ? "selected" : ""}>${policyLabels[policy]}</option>`)
    .join("");

  if (unitNameInput && !unitNameInput.value.trim()) {
    const unitByModel = {
      QUOTE: "",
      FIXED: "trabajo",
      HOURLY: "hora",
      BASE_VISIT: "visita",
      UNIT: "sesion",
      SQUARE_METER: "m2",
      LINEAR_METER: "metro"
    };
    unitNameInput.value = unitByModel[String(pricingModelSelect?.value || "").toUpperCase()] ?? "";
  }

  if (coverageField) {
    const onlineOnly = serviceModeSelect.value === "ONLINE" || locationPolicySelect.value === "ONLINE_ONLY";
    coverageField.classList.toggle("is-online-only", onlineOnly);
    coverageField.querySelector("select")?.toggleAttribute("required", !onlineOnly);
  }
}

renderProviderSuggestionCards(form, matches, text, { fallback = false } = {}) {
  const panel = form?.querySelector?.("#providerAiSuggestionsPanel");
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");
  const emptyBox = form?.querySelector?.("#providerAiEmpty");
  if (!panel || !suggestionBox) return false;

  const cards = (matches ?? []).slice(0, 5).map((item) => {
    const categoryId = item.category_id ?? item.id ?? "";
    const code = item.code ?? "";
    const description = item.description ?? this.providerSuggestionReason(text, item);
    const isDynamic = item.auto_created || item.discovery_status === "auto";
    const modes = Array.isArray(item.allowed_service_modes) && item.allowed_service_modes.length
      ? item.allowed_service_modes
      : ["IN_PERSON"];
    const modeLabel = modes.includes("ONLINE")
      ? "Online"
      : modes.includes("HYBRID")
        ? "Online y presencial"
        : "Presencial";
    const badge = isDynamic ? "Nuevo rubro sugerido por MIMI" : "Rubro existente";

    return `
      <button class="provider-suggestion-card" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${this.escapeHtml(categoryId)}" data-category-code="${this.escapeHtml(code)}" aria-pressed="false">
        <strong>${this.escapeHtml(item.name ?? "Servicio sugerido")}</strong>
        <span>${this.escapeHtml(description)}</span>
        <em>${this.escapeHtml(modeLabel)}</em>
        <small>${this.escapeHtml(badge)}</small>
      </button>
    `;
  }).join("");

  suggestionBox.innerHTML = cards
    ? `
      <div class="provider-suggestions-heading">
        <strong>Opciones sugeridas</strong>
        <span>Elegí una o varias. Después tocá Siguiente.</span>
      </div>
      ${cards}
    `
    : "";
  panel.hidden = false;
  panel.removeAttribute("hidden");
  panel.classList.add("is-visible");
  suggestionBox.hidden = false;
  suggestionBox.removeAttribute("hidden");
  suggestionBox.classList.toggle("has-suggestions", Boolean(cards));
  suggestionBox.setAttribute("aria-live", "polite");

  if (emptyBox) {
    emptyBox.hidden = true;
    emptyBox.setAttribute("hidden", "");
  }

  this.syncProviderSelectedCategories(form);

  window.setTimeout(() => {
    const visibleCards = suggestionBox.querySelectorAll("[data-provider-suggestion-card]");
    if (cards && !visibleCards.length) {
      console.warn("[MIMI] Provider suggestions render diagnostic", {
        matches: matches?.length ?? 0,
        panelVisible: !panel.hidden,
        suggestionHtml: suggestionBox.innerHTML.length
      });
      this.showProviderSuggestionEmpty(form, "Recibimos sugerencias, pero no pudimos mostrarlas. Proba de nuevo en unos segundos.");
    }
  }, 0);

  if (!fallback && cards) {
    this.revealProviderSuggestions(form);
  }

  return Boolean(cards);
}

revealProviderSuggestions(form = document.getElementById("providerBusinessForm")) {
  const panel = form?.querySelector?.("#providerAiSuggestionsPanel");

  window.setTimeout(() => {
    this.scrollElementIntoView(panel, { block: "start" });
  }, 80);
}

showProviderSuggestionEmpty(form, message) {
  const panel = form?.querySelector?.("#providerAiSuggestionsPanel");
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");
  const emptyBox = form?.querySelector?.("#providerAiEmpty");

  if (panel) {
    panel.hidden = false;
    panel.removeAttribute("hidden");
    panel.classList.add("is-visible");
  }
  if (suggestionBox) {
    suggestionBox.innerHTML = "";
    suggestionBox.hidden = true;
    suggestionBox.classList.remove("has-suggestions", "is-searching");
  }
  if (emptyBox) {
    emptyBox.hidden = false;
    emptyBox.removeAttribute("hidden");
    emptyBox.textContent = message;
  }
  this.revealProviderSuggestions(form);
}

scrollElementIntoView(target, { block = "center" } = {}) {
  if (!target) return;

  const scrollParent = this.findScrollableParent(target);
  if (!scrollParent || scrollParent === document.documentElement || scrollParent === document.body) {
    target.scrollIntoView?.({ behavior: "smooth", block, inline: "nearest" });
    return;
  }

  const parentRect = scrollParent.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const offset = block === "start"
    ? targetRect.top - parentRect.top - 18
    : targetRect.top - parentRect.top - (parentRect.height / 2) + (targetRect.height / 2);
  scrollParent.scrollTo({
    top: scrollParent.scrollTop + offset,
    behavior: "smooth"
  });
}

findScrollableParent(element) {
  let node = element?.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const overflow = `${style.overflowY} ${style.overflow}`;
    if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight + 8) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

toggleProviderSuggestion(source = null) {
  const card = source?.closest?.("[data-provider-suggestion-card]");
  if (!card) return;

  card.classList.toggle("is-selected");
  card.setAttribute("aria-pressed", card.classList.contains("is-selected") ? "true" : "false");
  this.syncProviderSelectedCategories(card.closest("form"));

  if (card.classList.contains("is-selected")) {
    this.showToast("Rubro elegido. Completa los datos del servicio.", "success");
    this.revealProviderServiceDetails(card.closest("form"));
  }
}

revealProviderServiceDetails(form = document.getElementById("providerBusinessForm")) {
  window.setTimeout(() => {
    const details = form?.querySelector?.("#providerServiceDetails");
    const title = form?.querySelector?.("[name='offering:0:title']");
    this.scrollElementIntoView(details, { block: "start" });
    title?.focus?.({ preventScroll: true });
  }, 120);
}

async handleProviderOfferingDelete(offeringId) {
  const providerId = this.state?.session?.providerId;
  if (!providerId || !offeringId) return;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Sin conexión con Supabase");

    // Soft-delete: marcamos active=false para no perder histórico de requests asociados
    const { error } = await supabase
      .from("svc_provider_service_offerings")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", offeringId)
      .eq("provider_id", providerId);

    if (error) throw error;

    // Refrescar workspace para que desaparezca de la UI
    const workspace = await loadProviderWorkspace(providerId);
    this.applyWorkspaceToState(workspace);
    renderProviderScreen(this.state);
    this.showToast("Servicio eliminado.", "success");
  } catch (error) {
    console.error("[MIMI] delete offering error:", error);
    this.showToast(`No se pudo eliminar: ${error?.message || "error"}`, "error");
  }
}

async handleProviderAvatarUpload(file) {
  const status = document.getElementById("providerAvatarStatus");
  const preview = document.getElementById("providerAvatarPreview");
  const hiddenUrl = document.querySelector("[name='providerAvatarPublicUrl']");
  const providerId = this.state?.session?.providerId;

  if (!file) return;
  if (!providerId) {
    if (status) status.textContent = "Tenés que iniciar sesión antes de subir foto.";
    return;
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    if (status) status.textContent = "Formato no soportado. Subí JPG, PNG o WEBP.";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    if (status) status.textContent = "La imagen supera 5 MB. Reducila antes de subir.";
    return;
  }

  if (status) status.textContent = "Subiendo foto...";

  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("No hay conexión con Supabase");

    const ext = file.type === "image/png" ? "png" : (file.type === "image/webp" ? "webp" : "jpg");
    const path = `${providerId}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("provider-avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("provider-avatars").getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) throw new Error("No se pudo obtener la URL pública");

    // Persistir en svc_provider_profiles
    const { error: updateError } = await supabase
      .from("svc_provider_profiles")
      .upsert(
        { provider_id: providerId, avatar_public_url: publicUrl, updated_at: new Date().toISOString() },
        { onConflict: "provider_id" }
      );
    if (updateError) throw updateError;

    // Actualizar UI sin recargar — el preview es un div con <img> o <span>.
    // Reemplazamos por un <img> con la URL nueva.
    if (preview) {
      preview.innerHTML = `<img src="${publicUrl}" alt="Foto de perfil" loading="lazy">`;
    }
    if (hiddenUrl) hiddenUrl.value = publicUrl;

    // Sincronizar con el state para que próximos renders muestren la nueva foto
    if (this.state?.provider?.business?.profile) {
      this.state.provider.business.profile.avatar_public_url = publicUrl;
    }
    actions.updateState({
      provider: {
        ...this.state.provider,
        business: {
          ...(this.state.provider?.business ?? {}),
          profile: {
            ...(this.state.provider?.business?.profile ?? {}),
            avatar_public_url: publicUrl,
          },
        },
      },
    });

    if (status) status.textContent = "Foto actualizada.";
    this.showToast("Foto de perfil actualizada.", "success");
  } catch (error) {
    console.error("[MIMI] avatar upload error:", error);
    if (status) status.textContent = `No se pudo subir la foto: ${error?.message || "error desconocido"}`;
  }
}

async handleProviderAvatarRemove() {
  const status = document.getElementById("providerAvatarStatus");
  const preview = document.getElementById("providerAvatarPreview");
  const hiddenUrl = document.querySelector("[name='providerAvatarPublicUrl']");
  const providerId = this.state?.session?.providerId;
  if (!providerId) return;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Sin conexión con Supabase");

    const { error: updateError } = await supabase
      .from("svc_provider_profiles")
      .upsert(
        { provider_id: providerId, avatar_public_url: null, updated_at: new Date().toISOString() },
        { onConflict: "provider_id" }
      );
    if (updateError) throw updateError;

    // Reemplazar preview por iniciales
    if (preview) {
      const initial = ((this.state?.provider?.business?.profile?.first_name ||
                        this.state?.session?.userName ||
                        "P").slice(0, 1)).toUpperCase();
      preview.innerHTML = `<span>${initial}</span>`;
    }
    if (hiddenUrl) hiddenUrl.value = "";

    // Sincronizar state
    actions.updateState({
      provider: {
        ...this.state.provider,
        business: {
          ...(this.state.provider?.business ?? {}),
          profile: {
            ...(this.state.provider?.business?.profile ?? {}),
            avatar_public_url: null,
          },
        },
      },
    });

    if (status) status.textContent = "Foto eliminada.";
    this.showToast("Foto de perfil eliminada.", "info");
  } catch (error) {
    console.error("[MIMI] avatar remove error:", error);
    if (status) status.textContent = `No se pudo eliminar: ${error?.message || "error desconocido"}`;
  }
}

async handleProviderServiceSuggestion() {
  const form =
    [...document.querySelectorAll("#providerBusinessForm")]
      .find((item) => item.offsetParent !== null) ??
    document.getElementById("providerBusinessForm");
  const promptInput = form?.querySelector?.("[name='providerAiPrompt']");
  const text = String(promptInput?.value ?? "").trim();
  const trigger = form?.querySelector?.("[data-provider-business-action='suggest-provider-service']");
  const emptyBox = form?.querySelector?.("#providerAiEmpty");

  if (text.length < 8) {
    this.showToast("Contanos un poco mas que trabajos haces", "warning");
    promptInput?.focus?.();
    return;
  }

  const firstIndex = this.firstEditableOfferingIndex(form);
  const titleInput = form?.querySelector?.(`[name='offering:${firstIndex}:title']`);
  const summaryInput = form?.querySelector?.(`[name='offering:${firstIndex}:publicSummary']`);
  const descriptionInput = form?.querySelector?.(`[name='offering:${firstIndex}:description']`);
  const panel = form?.querySelector?.("#providerAiSuggestionsPanel");
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");
  let provisionalTimer = null;

  try {
    this.setButtonBusy(trigger, true, "Buscando...");
    promptInput?.blur?.();
    if (panel) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
      panel.classList.add("is-visible");
    }
    if (suggestionBox) {
      suggestionBox.hidden = false;
      suggestionBox.removeAttribute("hidden");
      suggestionBox.classList.add("has-suggestions", "is-searching");
      suggestionBox.innerHTML = `
        <div class="provider-suggestions-loading">
          <span class="button-spinner" aria-hidden="true"></span>
          <strong>Buscando rubros compatibles...</strong>
        </div>
      `;
      this.scrollElementIntoView(panel ?? suggestionBox, { block: "start" });
    }
    if (emptyBox) {
      emptyBox.hidden = true;
      emptyBox.setAttribute("hidden", "");
    }
    provisionalTimer = window.setTimeout(() => {
      const provisionalMatches = this.localProviderCategorySuggestions(text);
      if (!provisionalMatches.length) return;
      this.renderProviderSuggestionCards(form, provisionalMatches, text, { fallback: true });
    }, 1200);
    const result = await resolveServiceIntent(text, { limit: 5 });
    if (provisionalTimer) {
      window.clearTimeout(provisionalTimer);
      provisionalTimer = null;
    }
    const matches = this.mergeProviderCategorySuggestions(
      Array.isArray(result?.matches) ? result.matches : [],
      this.localProviderCategorySuggestions(text)
    );
    const top = matches[0] ?? null;

    if (!top) {
      this.showProviderSuggestionEmpty(
        form,
        "No encontramos un rubro claro. Proba describirlo con mas detalle, por ejemplo: pinto casas, hago electricidad domiciliaria, cuido adultos mayores."
      );
      this.showToast("No encontramos una coincidencia clara. Proba con mas detalle.", "info");
      return;
    }

    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = top.name ?? this.providerTitleFromPrompt(text, top.name);
    }
    if (summaryInput && !summaryInput.value.trim()) {
      summaryInput.value = `${top.name}: ${text}`.slice(0, 140);
    }
    if (descriptionInput && !descriptionInput.value.trim()) {
      descriptionInput.value = text.slice(0, 220);
    }

    this.renderProviderSuggestionCards(form, matches, text);
  } catch (err) {
    console.warn("[MIMI] Sugerencia provider fallback:", err);
    const matches = this.localProviderCategorySuggestions(text);
    if (!matches.length) {
      this.showProviderSuggestionEmpty(form, "No encontramos un rubro claro. Proba describirlo con mas detalle, por ejemplo: pinto casas, hago electricidad domiciliaria, cuido adultos mayores.");
      this.showToast("No pudimos sugerir rubros ahora. Proba con mas detalle.", "info");
      return;
    }
    this.renderProviderSuggestionCards(form, matches, text, { fallback: true });
    this.showToast("Usamos sugerencias locales. Elegi una o varias.", "info");
  } finally {
    if (provisionalTimer) window.clearTimeout(provisionalTimer);
    suggestionBox?.classList?.remove("is-searching");
    this.setButtonBusy(trigger, false);
  }
}

firstEditableOfferingIndex(form) {
  if (!form) return 0;

  for (let index = 0; form.querySelector(`[name='offering:${index}:present']`); index += 1) {
    const id = form.querySelector(`[name='offering:${index}:id']`)?.value;
    if (!id) return index;
  }

  return 0;
}

mergeProviderCategorySuggestions(...groups) {
  const categories = this.getProviderCategories();
  const byCode = new Map(categories.map((category) => [String(category.code ?? "").toUpperCase(), category]));
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  const merged = new Map();

  for (const group of groups) {
    for (const raw of group ?? []) {
      const category =
        byId.get(String(raw.category_id ?? raw.id ?? "")) ??
        byCode.get(String(raw.code ?? "").toUpperCase()) ??
        raw;
      const id = category?.id ?? raw.category_id ?? raw.id;
      if (!id) continue;

      const previous = merged.get(String(id));
      const score = Number(raw.score ?? 0) + Number(raw.localScore ?? 0);
      if (!previous || score > Number(previous.score ?? 0)) {
        merged.set(String(id), {
          ...category,
          ...raw,
          id,
          category_id: id,
          name: category?.name ?? raw.name,
          code: category?.code ?? raw.code,
          description: category?.description ?? raw.description,
          score
        });
      }
    }
  }

  return [...merged.values()]
    .filter((item) => item.category_id || item.id)
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .slice(0, 6);
}

providerIntentBlueprints() {
  return [
    {
      codes: ["PINTURA", "ALBANILERIA", "REPARACIONES_HOGAR", "COLOCACION_CERAMICOS"],
      terms: ["pinto", "pintar", "pintura", "pared", "paredes", "revoque", "revoques", "ceramico", "ceramicos", "arreglo paredes", "albanil", "albanileria"]
    },
    {
      codes: ["CUIDADO_NINOS", "CUIDADO_ADULTOS", "ACOMPANAMIENTO_DOMICILIARIO"],
      terms: ["cuido", "cuidar", "ninos", "niños", "chicos", "bebe", "adultos", "adultos mayores", "ancianos", "acompanamiento", "domiciliario"]
    },
    {
      codes: ["LIMPIEZA", "LIMPIEZA_OFICINAS", "SERVICIO_DOMESTICO"],
      terms: ["limpieza", "limpio", "limpiar", "casas", "casa", "oficinas", "oficina", "departamento", "domestico"]
    },
    {
      codes: ["ELECTRICIDAD"],
      terms: ["electricista", "electricidad", "instalaciones", "instalacion", "arreglos", "enchufe", "termica", "disyuntor", "cableado"]
    },
    {
      codes: ["BELLEZA", "MANICURIA", "PESTANAS", "MAQUILLAJE"],
      terms: ["unas", "uñas", "manicura", "manicuria", "esmaltado", "pestanas", "pestañas", "maquillaje", "makeup", "belleza"]
    }
  ];
}

localProviderCategorySuggestions(text) {
  const normalized = this.normalizeText(text);
  const categories = this.getProviderCategories();
  const stopWords = new Set(["soy", "hago", "hacer", "ofrezco", "brindo", "servicio", "servicios", "trabajo", "trabajos", "de", "del", "la", "el", "los", "las", "un", "una", "y", "en", "para", "por", "con", "a"]);
  const tokens = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));
  const variants = new Set(tokens);
  tokens.forEach((word) => {
    if (word.endsWith("es") && word.length > 4) variants.add(word.slice(0, -2));
    if (word.endsWith("s") && word.length > 4) variants.add(word.slice(0, -1));
    if (word.endsWith("or") && word.length > 4) variants.add(`${word}a`);
    if (word.length >= 5) variants.add(word.slice(0, 4));
  });

  const keywordMatches = categories
    .map((category) => {
      const haystack = this.normalizeText([
        category.name,
        category.code,
        category.description,
        ...(category.aliases ?? []),
        ...(category.search_keywords ?? [])
      ].join(" "));
      let score = 0;
      variants.forEach((word) => {
        if (haystack.includes(word)) score += 10;
        if (haystack.split(" ").some((item) => item.startsWith(word) || word.startsWith(item))) score += 3;
      });

      return { ...category, category_id: category.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return this.mergeProviderCategorySuggestions(keywordMatches);
}

providerSuggestionReason(text, item = {}) {
  const name = item.name ?? "este rubro";
  return `Puede coincidir con lo que describiste para ${name}. Revisalo antes de confirmar.`;
}

startProviderDictation(source = null) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const form = source?.closest?.("form") ?? document.getElementById("providerBusinessForm");
  const input = form?.querySelector?.("[name='providerAiPrompt']");
  const status = document.getElementById("providerVoiceStatus");

  if (!SpeechRecognition || !input) {
    if (status) {
      status.hidden = false;
      status.textContent = "Tu navegador no permite dictado por voz. Podes escribirlo.";
    }
    this.showToast("Tu navegador no permite dictado por voz. Podes escribirlo.", "info");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "es-AR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  if (status) {
    status.hidden = false;
    status.textContent = "Escuchando...";
  }
  this.setButtonBusy(source, true, "Escuchando");

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript ?? "";
    input.value = [input.value, transcript].filter(Boolean).join(" ").trim();
    input.focus();
    if (status) status.textContent = "Listo. Revisá el texto y tocá Sugerir.";
  };

  recognition.onerror = () => {
    if (status) status.textContent = "No pudimos escuchar bien. Podes escribirlo.";
    this.showToast("No pudimos escuchar bien. Podes escribirlo.", "warning");
  };

  recognition.onend = () => {
    this.setButtonBusy(source, false);
  };

  recognition.start();
}

improveProviderDescription(source = null) {
  const form = source?.closest?.("form") ?? document.getElementById("providerBusinessForm");
  const prompt = String(form?.querySelector?.("[name='providerAiPrompt']")?.value ?? "").trim();
  const bio = String(form?.querySelector?.("[name='providerBio']")?.value ?? "").trim();
  const summary = form?.querySelector?.("[name='providerProfessionalSummary']");
  const selectedNames = [...form.querySelectorAll("[data-provider-suggestion-card].is-selected strong")]
    .map((item) => item.textContent.trim())
    .filter(Boolean);
  const base = String(summary?.value || bio || prompt).trim();

  if (!base && !prompt) {
    this.showToast("Primero escribi que servicio ofreces", "warning");
    return;
  }

  const intro = selectedNames.length
    ? `Ofrezco servicios relacionados con ${selectedNames.join(", ")}.`
    : "Ofrezco servicios a coordinar con cada cliente.";
  const body = base || prompt;
  const improved = `${intro} ${body}. Coordino previamente el alcance, la modalidad y los detalles necesarios para realizar el servicio de forma clara.`
    .replace(/\s+/g, " ")
    .slice(0, 600);
  const box = document.getElementById("providerDescriptionSuggestion");

  if (box) {
    box.hidden = false;
    box.innerHTML = `
      <strong>Propuesta de MIMI</strong>
      <p>${this.escapeHtml(improved)}</p>
      <div class="provider-description-actions">
        <button class="btn-primary" type="button" data-provider-business-action="use-provider-description" data-description="${this.escapeHtml(improved)}">Usar esta descripcion</button>
        <button class="btn-secondary" type="button" data-provider-business-action="hide-provider-description">Editar manualmente</button>
      </div>
    `;
  }

  this.showToast("MIMI preparo una descripcion editable.", "success");
}

useProviderDescription(source = null) {
  const description = source?.dataset?.description ?? "";
  const form = source?.closest?.("form") ?? document.getElementById("providerBusinessForm");
  const summary = form?.querySelector?.("[name='providerProfessionalSummary']");
  if (summary && description) {
    summary.value = description;
    summary.focus();
    this.showToast("Descripcion aplicada. Podes editarla antes de guardar.", "success");
  }
}

providerTitleFromPrompt(text, categoryName = "Servicio") {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 70) return clean;
  return `${categoryName} - ${clean.slice(0, 54).trim()}`;
}

normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
  /**
   * Start location tracking
   */
startLocationTracking() {
  if (!navigator.geolocation) return;

  actions.setTracking(true);

  if (this.trackingInterval) {
    clearInterval(this.trackingInterval);
  }

  this.updateMapToCurrentPosition();

  this.trackingInterval = setInterval(async () => {
    this.updateMapToCurrentPosition();

    const loc = this.state?.location?.current;
    const service = this.state?.activeService;

    if (!loc || !service?.requestId) return;

    if (String(this.lastProviderTrackingRequestId || "") !== String(service.requestId)) {
      this.lastProviderTrackingRequestId = service.requestId;
      this.lastProviderTrackingPoint = null;
      this.lastProviderTrackingSentAt = 0;
    }

    const now = Date.now();
    const movedMeters = this.lastProviderTrackingPoint
      ? this.distanceMetersBetween(this.lastProviderTrackingPoint, loc)
      : Infinity;
    const movedEnough =
      !Number.isFinite(movedMeters) ||
      movedMeters >= this.providerTrackingMinDistanceMeters;
    const heartbeatDue =
      now - this.lastProviderTrackingSentAt >= this.providerTrackingHeartbeatMs;

    if (!movedEnough && !heartbeatDue) return;

    try {
      await invokeFunction("svc-track-location", {
        request_id: service.requestId,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy ?? null,
        heading: loc.heading ?? null,
        speed: loc.speed ?? null
      });
      this.lastProviderTrackingPoint = { lat: loc.lat, lng: loc.lng };
      this.lastProviderTrackingSentAt = now;
    } catch (err) {
      console.warn("[MIMI] Error tracking location:", err);
    }
  }, MIMI_ACTIVE_JOB_LOCATION_INTERVAL_MS);
}
  /**
   * Stop location tracking
   */
  stopLocationTracking() {
    actions.setTracking(false);
    
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    this.lastProviderTrackingPoint = null;
    this.lastProviderTrackingSentAt = 0;
    this.lastProviderTrackingRequestId = null;
  }

  /**
   * Check location permission
   */
  async checkLocationPermission() {
    if (!navigator.permissions) return;
    
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      actions.setLocationPermission(result.state);
      
      result.addEventListener('change', () => {
        actions.setLocationPermission(result.state);
      });
    } catch (error) {
      console.warn('[MIMI] Permission check error:', error);
    }
  }

  /**
   * Handle accept offer
   */
  async handleAcceptOffer() {
    const offer = this.state?.activeOffer;
    if (!offer) return;

    try {
      actions.setLoading(true);
      this.showToast("Aceptando solicitud...", "info");

      const response = await invokeFunction("svc-provider-respond-offer", {
        offer_id: offer.id,
        accepted: true
      });

      let service = response?.service ?? response?.request ?? response?.data ?? null;

      if (!service) {
        throw new Error("La funcin no devolvi response.service");
      }

      const requestType = String(service.request_type ?? offer.mode ?? "IMMEDIATE").toUpperCase();
      const isImmediate = requestType !== "SCHEDULED";

      actions.setActiveService(this.normalizeServiceForState(service));
      actions.clearActiveOffer();
      actions.setProviderStatus(isImmediate ? "EN_ROUTE" : "BOOKED_UPCOMING");

      if (isImmediate) {
        this.showToast("Solicitud aceptada. Activando ruta...", "success");
        const enRoute = await invokeFunction("svc-provider-en-route", {
          request_id: service.id ?? service.request_id
        });
        service = enRoute?.service ?? enRoute?.request ?? service;
        actions.setActiveService(this.normalizeServiceForState(service));
      }

      this.subscribeActiveRequestRealtime(service.id ?? service.request_id);

      if (this.offerTimer) {
        clearInterval(this.offerTimer);
        this.offerTimer = null;
      }

      if (isImmediate) {
        this.startLocationTracking();
        this.showToast("Servicio aceptado. Ruta iniciada.", "success");
      } else {
        this.showToast("Servicio programado aceptado.", "success");
      }
    } catch (err) {
      console.error("[MIMI] Error accepting offer:", err);
      this.showToast("Error aceptando servicio", "error");
    } finally {
      actions.setLoading(false);
    }
  }

  /**
   * Handle reject offer
   */
  async handleRejectOffer() {
    const offer = this.state?.activeOffer;

    try {
      this.showToast("Rechazando solicitud...", "info");
      if (offer?.id) {
        await invokeFunction("svc-provider-respond-offer", {
          offer_id: offer.id,
          accepted: false
        });
      }

      actions.clearActiveOffer();
      this.showToast("Oferta rechazada", "info");
    } catch (err) {
      console.error("[MIMI] Error rejecting offer:", err);
      this.showToast("No pudimos rechazar la oferta", "error");
    } finally {
      if (this.offerTimer) {
        clearInterval(this.offerTimer);
        this.offerTimer = null;
      }
    }
  }

  /**
   * Handle service action button
   */
  async handleServiceAction() {
    const service = this.state?.activeService;
    if (!service) return;

    try {
      actions.setLoading(true);

      switch (this.normalizeRequestStatus(service.status)) {
        case "ACCEPTED":
        case "SCHEDULED":
          await this.applyServiceTransition(
            "svc-provider-en-route",
            "EN_ROUTE",
            "Vas en camino"
          );
          break;

        case "PROVIDER_EN_ROUTE":
          await this.applyServiceTransition(
            "svc-provider-arrived",
            "ARRIVED",
            "Llegaste al domicilio"
          );
          break;

        case "PROVIDER_ARRIVED":
          {
            const pin = await this.requestServicePinDialog();
            if (!pin) break;
          await this.applyServiceTransition(
            "svc-start-service",
            "IN_SERVICE",
            "Servicio iniciado",
            { pin }
          );
          this.stopLocationTracking();
          break;
          }

        case "IN_PROGRESS": {
        const response = await invokeFunction("svc-complete-service", {
            request_id: service.requestId
          });

          const updatedService = response?.service ?? response?.request ?? response?.data ?? null;
          if (updatedService && this.normalizeRequestStatus(updatedService.status) !== "COMPLETED") {
            actions.setActiveService(this.normalizeServiceForState(updatedService));
          } else {
          actions.clearActiveService();
          }

          actions.setProviderStatus("ONLINE_IDLE");
          this.stopLocationTracking();
          this.startPresenceHeartbeat();
          this.showToast("Servicio completado", "success");
          break;
        }

        default:
          console.warn("[MIMI] Estado de servicio no manejado:", service.status);
      }
    } catch (err) {
      console.error("[MIMI] Error updating service:", err);
      const code = String(err?.code || err?.message || "");
      if (
        code.includes("request_id_invalid") ||
        code.includes("invalid_request_status") ||
        code.includes("request_forbidden") ||
        code.includes("pin_already_used")
      ) {
        await this.resyncActiveService(`lifecycle_error:${code}`);
      }

      const message =
        code.includes("request_id_invalid")
          ? "No pudimos identificar esta solicitud. Actualizamos el estado desde el backend."
          : code.includes("pin_incorrect")
          ? "El codigo no coincide. Pedile al cliente que lo revise e intenta de nuevo."
          : code.includes("pin_temporarily_locked")
            ? "Hay demasiados intentos incorrectos. Espera unos minutos antes de volver a probar."
            : code.includes("pin_expired")
              ? "El codigo vencio. Actualiza el servicio o contacta a soporte."
              : code.includes("pin_not_ready")
                ? "El codigo todavia no esta disponible para esta solicitud."
                : code.includes("pin_already_used")
                  ? "Este codigo ya fue usado. Actualizamos el estado del servicio."
                  : code.includes("invalid_request_status")
                    ? "El estado del servicio cambio. Actualiza la pantalla e intenta de nuevo."
                    : code.includes("request_forbidden")
                      ? "Esta solicitud no corresponde a tu perfil de prestador."
                : "No pudimos actualizar el servicio. Revisa la conexion e intenta otra vez.";
      this.showToast(message, "error");
    } finally {
      actions.setLoading(false);
    }
  }

  activeServiceRequestId() {
    const service = this.state?.activeService;
    return service?.requestId ?? service?.request_id ?? service?.id ?? null;
  }

  async openClientChat() {
    const conversationId = await this.ensureClientConversation();
    if (!conversationId) return;

    this.setChatMode("client");
    await this.loadChatThread(conversationId);
  }

  async ensureClientConversation() {
    const service = this.state?.activeService;
    const requestId = this.activeServiceRequestId();

    if (!service || !requestId) {
      this.showToast("El chat se habilita cuando tenes un servicio activo", "warning");
      return null;
    }

    if (service.conversationId) {
      return service.conversationId;
    }

    if (this.currentChatMode !== "support" && this.state?.chat?.conversationId) {
      return this.state.chat.conversationId;
    }

    try {
      const conversation = await loadConversationForRequest(requestId);
      if (!conversation?.id) {
        this.showToast("La conversacion todavia no esta creada para este servicio", "warning");
        return null;
      }

      const nextService = {
        ...service,
        conversationId: conversation.id,
        raw: {
          ...(service.raw ?? {}),
          conversation_id: conversation.id
        }
      };

      actions.setActiveService(nextService);
      updateState({
        chat: {
          conversationId: conversation.id
        },
        client: {
          activeConversationId: conversation.id
        }
      });

      return conversation.id;
    } catch (error) {
      console.error("[MIMI][provider-chat] conversation load failed:", error);
      this.showToast("No pudimos abrir el chat del servicio", "error");
      return null;
    }
  }

  async openProviderSupportChat() {
    this.openProviderSection("support");
    this.setChatMode("support");
    updateState({
      chat: {
        conversationId: this.supportConversationId ?? null,
        messages: this.supportConversationId ? (this.state?.chat?.messages ?? []) : [],
        unreadCount: 0
      },
      ui: {
        chatDrawerOpen: true
      }
    });
    this.renderChat();

    const conversationId = await this.ensureProviderSupportConversation();
    if (!conversationId) return;

    await this.loadChatThread(conversationId);
  }

  async ensureProviderSupportConversation() {
    if (this.supportConversationId) return this.supportConversationId;

    const supabase = getSupabaseClient();
    const userId = this.state?.session?.userId;
    if (!supabase || !userId) {
      this.showToast("Inicia sesion para hablar con soporte", "warning");
      return null;
    }

    try {
      const { data: existing, error: existingError } = await supabase
        .from("svc_conversations")
        .select("*")
        .eq("client_user_id", userId)
        .eq("app_context", "support")
        .eq("participant_role", "provider")
        .eq("status", "OPEN")
        .contains("metadata_json", { support_type: "provider_admin" })
        .order("updated_at", { ascending: false })
        .limit(1);

      if (existingError) throw existingError;

      if (existing?.[0]?.id) {
        this.supportConversationId = existing[0].id;
        return existing[0].id;
      }

      const { data: created, error: createError } = await supabase
        .from("svc_conversations")
        .insert({
          client_user_id: userId,
          provider_user_id: null,
          status: "OPEN",
          app_context: "support",
          subject: "Soporte MIMI prestador",
          participant_role: "provider",
          admin_status: "abierto",
          metadata_json: {
            support_type: "provider_admin",
            provider_id: this.state?.session?.providerId ?? null,
            source: "provider_app"
          }
        })
        .select("*")
        .single();

      if (createError) throw createError;

      this.supportConversationId = created?.id ?? null;
      return this.supportConversationId;
    } catch (error) {
      console.error("[MIMI][provider-support] conversation failed:", error);
      this.showToast("No pudimos abrir soporte dentro de la app", "error");
      return null;
    }
  }

  setChatMode(mode) {
    this.currentChatMode = mode;
    if (this.elements.chatDrawer) this.elements.chatDrawer.dataset.mode = mode;

    const isSupport = mode === "support";
    if (this.elements.chatTitle) {
      this.elements.chatTitle.textContent = isSupport ? "Soporte MIMI" : "Chat con cliente";
    }
    if (this.elements.chatSubtitle) {
      this.elements.chatSubtitle.textContent = isSupport
        ? "Canal privado con soporte/admin. Queda registrado para seguimiento."
        : "Conversacion segura vinculada a tu servicio activo.";
    }
    if (this.elements.chatQuickReplies) {
      this.elements.chatQuickReplies.hidden = isSupport;
    }
    if (this.elements.chatInput) {
      this.elements.chatInput.placeholder = isSupport
        ? "Contanos que necesitas resolver..."
        : "Escribi un mensaje al cliente...";
    }
  }

  async loadChatThread(conversationId) {
    try {
      const messages = await loadMessages(conversationId);
      updateState({
        chat: {
          conversationId,
          messages: Array.isArray(messages) ? messages : [],
          unreadCount: 0
        },
        ui: {
          chatDrawerOpen: true
        }
      });

      this.subscribeChatMessages(conversationId);
      this.renderChatMessages();
    } catch (error) {
      console.error("[MIMI][provider-chat] messages load failed:", error);
      this.showToast("No pudimos cargar los mensajes", "error");
    }
  }

  subscribeChatMessages(conversationId) {
    const supabase = getSupabaseClient();
    if (!supabase || !conversationId) return;

    if (this.chatRealtimeChannel) {
      supabase.removeChannel(this.chatRealtimeChannel);
      this.chatRealtimeChannel = null;
    }

    this.chatRealtimeChannel = supabase
      .channel(`provider-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const message = payload.new ?? payload.old;
          if (!message?.id) return;
          this.upsertChatMessage(message);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[MIMI][provider-chat] realtime channel error");
        }
      });
  }

  upsertChatMessage(message) {
    const current = Array.isArray(this.state?.chat?.messages) ? this.state.chat.messages : [];
    const exists = current.some((item) => item.id === message.id);
    const messages = exists
      ? current.map((item) => (item.id === message.id ? { ...item, ...message } : item))
      : [...current, message];

    updateState({
      chat: {
        conversationId: message.conversation_id ?? this.state?.chat?.conversationId ?? null,
        messages,
        unreadCount: messages.filter(
          (item) => !item.read_at && item.sender_user_id !== this.state?.session?.userId
        ).length
      }
    });

    this.renderChatMessages();
  }

  /**
   * Send chat message
   */
  async sendChatMessage() {
    const input = this.elements.chatInput;
    const text = input?.value.trim();
    if (!text) return;

    let conversationId = this.state?.chat?.conversationId;
    if (!conversationId) {
      conversationId = this.currentChatMode === "support"
        ? await this.ensureProviderSupportConversation()
        : await this.ensureClientConversation();
    }

    if (!conversationId) return;

    this.setButtonBusy(this.elements.chatSend, true, "");

    try {
      const message = await sendMessage({ conversationId, body: text });
      input.value = "";
      if (message?.id) this.upsertChatMessage(message);
    } catch (error) {
      console.error("[MIMI][provider-chat] send failed:", error);
      this.showToast("No pudimos enviar el mensaje", "error");
    } finally {
      this.setButtonBusy(this.elements.chatSend, false);
    }
  }

  /**
   * Render chat messages
   */
  renderChatMessages() {
    const container = this.elements.chatMessages;
    if (!container) return;

    const messages = this.state?.chat?.messages || [];

    if (!messages.length) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <strong>${this.currentChatMode === "support" ? "Soporte listo para ayudarte" : "Todavia no hay mensajes"}</strong>
          <span>${this.currentChatMode === "support" ? "Escribi tu consulta y un operador/admin podra verla." : "Usa el chat solo para coordinar este servicio activo."}</span>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map((msg) => {
      const outgoing = msg.sender_user_id === this.state?.session?.userId || msg.type === "outgoing";
      const body = msg.body ?? msg.text ?? "";
      const timestamp = msg.created_at ?? msg.timestamp ?? Date.now();
      return `
        <div class="chat-message ${outgoing ? "outgoing" : "incoming"}">
          <span>${this.escapeHtml(body)}</span>
          <div class="chat-message-time">
            ${new Date(timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  /**
   * Render scheduled services
   */
  renderScheduledServices() {
    const container = this.elements.scheduledList;
    if (!container) return;

    const services = this.state?.scheduledServices || [];
    
    if (services.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No tenes servicios programados</p>
        </div>
      `;
      return;
    }

    container.innerHTML = services.map(service => `
      <div class="scheduled-item" data-id="${service.id}">
        <div class="scheduled-time">
          ${new Date(service.scheduledFor).toLocaleString('es-AR', { 
            weekday: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
        <div class="scheduled-service">${service.serviceType}</div>
        <div class="scheduled-location">${service.location}</div>
        <div class="scheduled-meta">
          <span class="scheduled-price">$${service.price?.toLocaleString('es-AR') || 'A convenir'}</span>
          <span class="scheduled-distance">${service.distance || ''}</span>
        </div>
        <div class="scheduled-actions">
          <button class="scheduled-btn" onclick="app.showServiceDetail('${service.id}')">Ver detalle</button>
          <button class="scheduled-btn primary" onclick="app.prepareService('${service.id}')">Preparar</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render verification status
   */
renderVerificationStatus() {
  const status = this.state?.provider.verificationStatus;
  const card = this.elements.verificationCard;
  const statusEl = this.elements.verificationStatus;
  const btn = this.elements.verificationBtn;
  const accountApproved = Boolean(this.state?.provider?.profile?.approved);
  
  if (!card || !statusEl || !btn) return;

  card.classList.toggle("verified", status === "approved");

  if (status === "approved") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Verificado</span>';
    btn.textContent = "Ver documentos";
  } else if (status === "in_review") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">En revisión</span>';
    btn.textContent = "Ver estado";
  } else if (status === "rejected") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Requiere corrección</span>';
    btn.textContent = "Ver observaciones";
  } else {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Pendiente</span>';
    btn.textContent = "Completar ahora";
  }

  const setStepStatus = (element, type, fallback) => {
    if (!element) return;
    const doc = this.documentByType(type);
    const missingLabel =
      accountApproved && type !== "criminal_record_certificate"
        ? "Aprobado por admin"
        : fallback;
    element.textContent = doc
      ? `Recibido - ${this.normalizeReviewStatus(doc.review_status) === "APPROVED" ? "aprobado" : "en revisión"}`
      : missingLabel;
  };

  setStepStatus(this.elements.dniFrontStatus, "dni_front", "Pendiente");
  setStepStatus(this.elements.dniBackStatus, "dni_back", "Pendiente");
  setStepStatus(this.elements.selfieStatus, "selfie", "Pendiente");
  setStepStatus(this.elements.criminalRecordStatus, "criminal_record_certificate", "Opcional por 15 días");
}
  /**
   * Render stats
   */
  renderStats() {
    const stats = this.state?.provider.stats;
    if (!stats) return;

    if (this.elements.statRating) {
      this.elements.statRating.textContent = (Number(stats.rating ?? 0) || 0).toFixed(1);
    }
    if (this.elements.statCompleted) {
      this.elements.statCompleted.textContent = stats.completedServices;
    }
    if (this.elements.statOffers) {
      this.elements.statOffers.textContent = stats.totalOffers;
    }
    
    // Drawer stats
    if (this.elements.drawerRating) {
      this.elements.drawerRating.textContent = (Number(stats.rating ?? 0) || 0).toFixed(1);
    }
    if (this.elements.drawerServices) {
      this.elements.drawerServices.textContent = stats.completedServices;
    }
if (this.elements.drawerEarnings) {
  const dashboardEarnings = this.state?.provider?.dashboard?.earnings ?? stats.earnings ?? 0;
  this.elements.drawerEarnings.textContent = `$${Number(dashboardEarnings).toLocaleString("es-AR")}`;
}
  }
renderServicesAndPricing() {
  const categories = this.state?.provider?.categories ?? [];
  const pricing = this.state?.provider?.pricing ?? {};
  const offerings = this.state?.provider?.business?.offerings ?? [];
  const primaryOffering = Array.isArray(offerings)
    ? offerings.find((item) => item?.active !== false) ?? offerings[0] ?? null
    : null;
  const money = (value) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "";

    return `$${amount.toLocaleString("es-AR")}`;
  };
  const offeringPrice = (offering) => {
    if (!offering) return "";

    const model = String(offering.pricing_model ?? "HOURLY").toUpperCase();
    if (model === "QUOTE" || offering.quote_required) return "A presupuestar";
    if (model === "UNIT") {
      const amount = money(offering.unit_price);
      return amount ? `${amount} / ${offering.unit_name || "sesion"}` : "";
    }
    if (model === "FIXED") return money(offering.fixed_price);
    if (model === "BASE_VISIT") {
      const amount = money(offering.base_visit_fee);
      return amount ? `${amount} visita` : "";
    }

    const amount = money(offering.price_per_hour ?? pricing.hourlyRate);
    return amount ? `${amount} / hora` : "";
  };

  if (this.elements.servicesChips) {
    // Mostrar OFFERINGS reales (no solo categorías) con botones de gestión.
    const activeOfferings = (this.state?.provider?.business?.offerings ?? [])
      .filter((o) => o?.active !== false);

    if (!activeOfferings.length) {
      this.elements.servicesChips.innerHTML = `
        <p class="muted">Todavía no publicaste servicios. Andá a la pestaña <b>Servicios</b> para crear el primero.</p>
      `;
    } else {
      this.elements.servicesChips.innerHTML = activeOfferings
        .map((offering) => {
          const model = String(offering.pricing_model ?? "HOURLY").toUpperCase();
          const amount =
            model === "FIXED" ? offering.fixed_price :
            model === "BASE_VISIT" ? offering.base_visit_fee :
            ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(model) ? offering.unit_price :
            offering.price_per_hour;
          const priceText = !amount || amount <= 0
            ? "A coordinar"
            : model === "SQUARE_METER" ? `$${Number(amount).toLocaleString("es-AR")} / m²`
            : model === "LINEAR_METER" ? `$${Number(amount).toLocaleString("es-AR")} / m`
            : model === "UNIT" ? `$${Number(amount).toLocaleString("es-AR")} / ${offering.unit_name || "sesión"}`
            : model === "BASE_VISIT" ? `$${Number(amount).toLocaleString("es-AR")} visita`
            : model === "FIXED" ? `$${Number(amount).toLocaleString("es-AR")} cerrado`
            : `$${Number(amount).toLocaleString("es-AR")} / hora`;

          const offeringId = String(offering.id ?? "");
          return `
            <article class="provider-service-mini-card">
              <div class="provider-service-mini-info">
                <strong>${this.escapeHtml(offering.title || "Servicio")}</strong>
                <span>${this.escapeHtml(priceText)}</span>
              </div>
              <div class="provider-service-mini-actions">
                <button type="button" class="btn-secondary" data-provider-business-action="edit-offering" data-offering-id="${this.escapeHtml(offeringId)}">Editar</button>
                <button type="button" class="btn-link-danger" data-provider-business-action="delete-offering" data-offering-id="${this.escapeHtml(offeringId)}">Eliminar</button>
              </div>
            </article>
          `;
        })
        .join("");
    }
  }

  if (this.elements.basePrice) {
    this.elements.basePrice.textContent = primaryOffering?.title || "Sin configurar";
  }

  if (this.elements.hourPrice) {
    this.elements.hourPrice.textContent = offeringPrice(primaryOffering) || "Sin configurar";
  }

  if (this.elements.jobPrice) {
    this.elements.jobPrice.textContent =
      pricing.jobRate > 0
        ? `$${Number(pricing.jobRate).toLocaleString("es-AR")}`
        : "A configurar";
  }

  if (this.elements.pricingModeHourly) {
    this.elements.pricingModeHourly.checked = pricing.mode !== "job";
  }

  if (this.elements.pricingModeJob) {
    this.elements.pricingModeJob.checked = pricing.mode === "job";
  }
}
renderSheetSummary() {
  const provider = this.state?.provider ?? {};
  const pricing = provider.pricing ?? {};
  const offerings = provider.business?.offerings ?? [];
  const primaryOffering = Array.isArray(offerings)
    ? offerings.find((item) => item?.active !== false) ?? offerings[0] ?? null
    : null;

  const money = (value) => {
    const amount = Number(value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "";

    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(amount);
  };

  const basePrice = pricing.basePrice || pricing.hourlyRate || 0;

  if (this.elements.sheetBasePrice) {
    this.elements.sheetBasePrice.textContent = primaryOffering?.title
      ? primaryOffering.title
      : `Base ${money(basePrice)}`;
  }

  if (this.elements.sheetPricingMode) {
    const model = String(primaryOffering?.pricing_model ?? "").toUpperCase();
    this.elements.sheetPricingMode.textContent =
      model === "UNIT"
        ? `Por ${primaryOffering?.unit_name || "sesion"}`
        : model === "QUOTE"
          ? "A presupuestar"
          : pricing.mode === "job"
            ? "Por trabajo"
            : "Por hora";
  }

  if (this.elements.sheetUpcomingTime) {
    const nextService = this.state?.scheduledServices?.[0] ?? null;
    this.elements.sheetUpcomingTime.textContent = nextService?.scheduledFor
      ? new Date(nextService.scheduledFor).toLocaleString("es-AR", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit"
        })
      : "Sin agenda";
  }
}    



  /**
   * Main render function
   */
render() {
  if (!this.state) return;

  this.renderHeader();
  this.renderOnlineButton();
  this.renderOfferCard();
  this.renderActiveService();
  this.renderBottomSheet();
  this.renderDrawer();
  this.renderNotifications();
  this.renderChat();
  this.renderModal();
  renderProviderScreen(this.state);
  this.renderServicesAndPricing();
  this.renderSheetSummary();
  this.renderDrawerProfile();
  this.renderKycAdminNotice();
}
  /**
   * Render header
   */
  renderHeader() {
    const status = this.state.provider.status;
    const isOnline = status !== 'OFFLINE';

    // Status badge
    if (this.elements.statusBadge) {
      this.elements.statusBadge.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      this.elements.statusBadge.classList.toggle('online', isOnline);
    }

    // Status dot
    if (this.elements.statusDot) {
      this.elements.statusDot.classList.toggle('online', isOnline);
    }

    // Status text
    if (this.elements.statusText) {
      const statusLabels = {
        'OFFLINE': 'Desconectado',
        'ONLINE_IDLE': 'Online - Esperando',
        'INVITED': 'Nueva oferta',
        'BOOKED_UPCOMING': 'Servicio reservado',
        'EN_ROUTE': 'En camino',
        'ARRIVED': 'En destino',
        'IN_SERVICE': 'En servicio'
      };
      this.elements.statusText.textContent = statusLabels[status] || 'Desconectado';
    }
  }
restoreProviderOnlineButton() {
  const container = this.elements.onlineButtonContainer;
  if (!container) return;

  const hasNormalButton = Boolean(container.querySelector("#goOnlineButton"));

  if (!hasNormalButton) {
    container.innerHTML = `
      <button class="online-button" id="goOnlineButton" type="button">
        <span class="online-button-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </span>
        <span class="online-button-text">Ponerme en línea</span>
        <span class="online-button-subtext">Para recibir servicios</span>
      </button>
    `;

    this.elements.goOnlineButton = document.getElementById("goOnlineButton");

    this.elements.goOnlineButton?.addEventListener("click", () => {
      this.handleGoOnline();
    });
  }

  container.removeAttribute("style");
  container.hidden = false;
  container.classList.remove("hidden", "provider-online-context-hidden");

  container.style.position = "";
  container.style.inset = "";
  container.style.left = "";
  container.style.top = "";
  container.style.right = "";
  container.style.bottom = "";
  container.style.transform = "";
  container.style.width = "";
  container.style.minHeight = "";
  container.style.zIndex = "";
  container.style.background = "";
  container.style.display = "";
  container.style.placeItems = "";
  container.style.opacity = "1";
  container.style.visibility = "visible";
  container.style.pointerEvents = "auto";
  this.syncOnlineButtonVisibility();
}
  
  /**
   * Render online button
   */
renderOnlineButton() {
  const container = this.elements.onlineButtonContainer;
  if (!container) return;

  const status = this.state?.provider?.status ?? "OFFLINE";
  const hasActiveService = Boolean(this.state?.activeService);
  const hasActiveOffer = Boolean(this.state?.activeOffer);
  const isAuthenticated = Boolean(this.state?.session?.isAuthenticated);

  const hasLoginButton = Boolean(
    document.getElementById("providerGoogleLoginButton")
  );

  if (!isAuthenticated && hasLoginButton) {
    container.hidden = false;
    container.classList.remove("hidden");
    container.style.display = "grid";
    container.style.visibility = "visible";
    container.style.opacity = "1";
    container.style.pointerEvents = "auto";
    return;
  }

  if (isAuthenticated) {
    this.restoreProviderOnlineButton();
  }

  const shouldShow =
    isAuthenticated &&
    status === "OFFLINE" &&
    !hasActiveService &&
    !hasActiveOffer;

  container.hidden = false;
  container.classList.toggle("hidden", !shouldShow);
  container.classList.remove("provider-online-context-hidden");
  container.setAttribute("aria-hidden", String(!shouldShow));

  if (shouldShow) {
    container.hidden = false;
    container.style.display = "";
    container.style.opacity = "1";
    container.style.visibility = "visible";
    container.style.pointerEvents = "auto";
  }
}  
  /**
   * Render offer card
   */
  renderOfferCard() {
    const offer = this.state.activeOffer;
    
    if (!offer) {
      if (this.elements.offerCard) this.elements.offerCard.hidden = true;
      return;
    }

    if (!this.isUsableOffer({ ...offer.raw, id: offer.id, expires_at: offer.expiresAt })) {
      actions.clearActiveOffer();
      if (this.elements.offerCard) this.elements.offerCard.hidden = true;
      return;
    }

    if (this.elements.offerCard) {
      this.elements.offerCard.hidden = false;
      if (!this.offerHasDisplayDetails(offer)) {
        this.ensureActiveOfferDetails();
      }
      
      if (this.elements.offerService) {
        this.elements.offerService.textContent = offer.serviceType;
      }
      if (this.elements.offerLocation) {
        this.elements.offerLocation.textContent = this.routeLabelForOffer(offer);
      }
      if (this.elements.offerClient) {
        this.elements.offerClient.textContent = `Cliente: ${offer.clientName}`;
      }
      if (this.elements.offerPrice) {
        this.elements.offerPrice.textContent = offer.priceLabel || (offer.price
          ? this.formatMoney(offer.price, offer.details?.currency || "ARS")
          : 'Precio a convenir');
      }
      if (this.elements.offerDetails) {
        const rows = Array.isArray(offer.detailRows) ? offer.detailRows : [];
        this.elements.offerDetails.innerHTML = rows.length
          ? rows
              .map((row) => `
                <div class="offer-detail-pill">
                  <span>${this.escapeHtml(row.label)}</span>
                  <strong>${this.escapeHtml(row.value)}</strong>
                </div>
              `)
              .join("")
          : "";
      }
    }

    this.updateMapToCurrentPosition();

    // Start countdown timer
    this.startOfferTimer(offer);
  }

  /**
   * Start offer timer
   */
  startOfferTimer(offer) {
    if (this.offerTimer) {
      clearInterval(this.offerTimer);
    }

    const updateTimer = () => {
      if (!this.state?.activeOffer) {
        clearInterval(this.offerTimer);
        return;
      }

      const expiresAt = new Date(offer.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));

      if (this.elements.offerTimer) {
        this.elements.offerTimer.textContent = `${remaining}s`;
      }

      if (remaining <= 0) {
        actions.clearActiveOffer();
        clearInterval(this.offerTimer);
        this.showToast('La oferta expir', 'warning');
      }
    };

    updateTimer();
    this.offerTimer = setInterval(updateTimer, 1000);
  }

  /**
   * Render active service
   */
  renderActiveService() {
    const service = this.state.activeService;
    const serviceStatus = this.normalizeRequestStatus(service?.status);
    
    if (!service) {
      if (this.elements.activeServiceCard) this.elements.activeServiceCard.hidden = true;
      return;
    }

    if (this.elements.activeServiceCard) {
      this.elements.activeServiceCard.hidden = false;
      
      // Status badge
      const statusLabels = {
        'ACCEPTED': 'Aceptado',
        'PROVIDER_EN_ROUTE': 'En camino',
        'PROVIDER_ARRIVED': 'Llegaste',
        'IN_PROGRESS': 'En curso'
      };
      
      if (this.elements.serviceStatusBadge) {
        this.elements.serviceStatusBadge.textContent = statusLabels[serviceStatus] || serviceStatus || service.status;
      }
      
      if (this.elements.activeServiceType) {
        this.elements.activeServiceType.textContent = service.serviceType;
      }
      if (this.elements.activeServiceLocation) {
        this.elements.activeServiceLocation.textContent = this.serviceRouteLabel(service);
      }
      if (this.elements.activeServiceClient) {
        this.elements.activeServiceClient.textContent = service.clientName;
      }
      if (this.elements.activeServicePayment) {
        this.elements.activeServicePayment.textContent = this.providerPaymentStatusLabel(service.paymentStatus ?? service.payment?.status);
      }
      
      // Button text
      const buttonLabels = {
        'ACCEPTED': 'Llegue al domicilio',
        'PROVIDER_EN_ROUTE': 'Llegue al domicilio',
        'PROVIDER_ARRIVED': 'Iniciar servicio',
        'IN_PROGRESS': 'Finalizar servicio'
      };
      
      if (this.elements.serviceActionBtn) {
        this.elements.serviceActionBtn.textContent = buttonLabels[serviceStatus] || 'Accion';
      }
    }

    this.updateProviderNavigationPanel({
      providerPosition: this.state?.location?.current,
      servicePosition: this.servicePositionFromState(),
      route: this.lastRoadRouteData
    });
  }

  /**
   * Render bottom sheet
   */
  renderBottomSheet() {
    const isOnline = this.state.provider.status !== 'OFFLINE';
    
    // Sheet status
    if (this.elements.sheetStatusDot) {
      this.elements.sheetStatusDot.classList.toggle('online', isOnline);
      this.elements.sheetStatusDot.classList.toggle('offline', !isOnline);
    }
    
    if (this.elements.sheetStatusText) {
      this.elements.sheetStatusText.textContent = isOnline ? 'Online' : 'Offline';
    }

    // Status toggle
    this.elements.statusToggleModern?.querySelectorAll('.toggle-option').forEach(btn => {
      btn.classList.toggle('active', 
        (btn.dataset.status === 'ONLINE_IDLE' && isOnline) ||
        (btn.dataset.status === 'OFFLINE' && !isOnline)
      );
    });

    // Badges
    if (this.elements.notificationBadge) {
      this.elements.notificationBadge.textContent = this.state.notifications.unreadCount;
      this.elements.notificationBadge.hidden = this.state.notifications.unreadCount === 0;
    }
    
    if (this.elements.chatBadge) {
      this.elements.chatBadge.textContent = this.state.chat.unreadCount;
      this.elements.chatBadge.hidden = this.state.chat.unreadCount === 0;
    }
  }

  /**
   * Render drawer
   */
renderDrawer() {
  const isOpen = this.state.ui.drawerOpen;

  if (this.elements.sideDrawer) {
    if (!isOpen && this.elements.sideDrawer.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    this.elements.sideDrawer.classList.toggle("open", isOpen);
    this.elements.sideDrawer.setAttribute("aria-hidden", String(!isOpen));

    if (isOpen) {
      this.elements.sideDrawer.removeAttribute("inert");
    } else {
      this.elements.sideDrawer.setAttribute("inert", "");
    }
  }

  if (this.elements.drawerOverlay) {
    this.elements.drawerOverlay.hidden = !isOpen;
  }

const profile = this.state.provider.profile ?? {};
const name =
  profile.full_name ||
  this.state.session.userName ||
  this.state.session.userEmail ||
  "Prestador";

const email =
  profile.email ||
  this.state.session.userEmail ||
  "Sin email";

if (this.elements.drawerName) {
  this.elements.drawerName.textContent = name;
}

if (this.elements.drawerEmail) {
  this.elements.drawerEmail.textContent = email;
}

if (this.elements.drawerInitials) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  this.elements.drawerInitials.textContent = initials || "PR";
}
  if (this.state.session.userName && this.elements.drawerInitials) {
    const initials = this.state.session.userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    this.elements.drawerInitials.textContent = initials;
  }
}
  /**
   * Render notifications
   */
  renderNotifications() {
    const isOpen = this.state.ui.notificationDrawerOpen;
    
    if (this.elements.notificationsDrawer) {
      this.elements.notificationsDrawer.classList.toggle('open', isOpen);
      this.elements.notificationsDrawer.setAttribute('aria-hidden', !isOpen);
    }

    // Render list
    const items = this.state.notifications.items || [];
    if (this.elements.notificationsList) {
      if (items.length === 0) {
        this.elements.notificationsList.innerHTML = `
          <div class="empty-state">
            <p>No tenes notificaciones</p>
          </div>
        `;
      } else {
        this.elements.notificationsList.innerHTML = items.map(item => `
          <div class="notification-item ${item.unread ? 'unread' : ''}">
            <div class="notification-icon">${item.icon || ''}</div>
            <div class="notification-content">
              <div class="notification-title">${item.title}</div>
              <div class="notification-text">${item.text}</div>
              <div class="notification-time">${new Date(item.timestamp).toLocaleString('es-AR')}</div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  /**
   * Render chat
   */
  renderChat() {
    const isOpen = this.state.ui.chatDrawerOpen;
    
    if (this.elements.chatDrawer) {
      this.elements.chatDrawer.classList.toggle('open', isOpen);
      this.elements.chatDrawer.setAttribute('aria-hidden', !isOpen);
    }

    if (isOpen) {
      this.renderChatMessages();
    }
  }

  /**
   * Render modal
   */
  renderModal() {
    const isOpen = this.state.ui.modalOpen;
    const modal = this.state.ui.currentModal;
    
    if (this.elements.verificationModal) {
      this.elements.verificationModal.hidden = !isOpen || modal !== 'verification';
      if (isOpen && modal === "verification") {
        this.renderVerificationStatus();
        this.updateVerificationResultScreen();
      }
    }
  }
  subscribeRealtime() {
    try {
      const supabase = getSupabaseClient();
      const userId = this.state?.session?.userId;
      const providerId = this.state?.session?.providerId;

      if (!supabase?.channel || (!userId && !providerId)) {
        console.warn("[MIMI] Supabase realtime client/session not available");
        return;
      }

      disconnectManagedRealtime("provider-app:");
      this.notificationRealtimeChannel?.unsubscribe?.();
      this.offerRealtimeChannel?.unsubscribe?.();
      this.realtimeChannel?.unsubscribe?.();

      if (userId) {
        this.notificationRealtimeChannel = subscribeScopedChannel(
          `provider-app:notifications:${userId}`,
          (count) => supabase
          .channel(`provider:${providerId || userId}:notifications`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "svc_notifications",
              filter: `user_id=eq.${userId}`
            },
            count((payload) => this.onNotification(payload))
          )
          .subscribe((status) => {
            if (window.MIMI_DEBUG_REALTIME) console.log("[MIMI] Notifications realtime:", status);
          }),
          { pauseWhenHidden: true }
        );
      }

      if (providerId) {
        this.offerRealtimeChannel = subscribeScopedChannel(
          `provider-app:provider:${providerId}:inbox`,
          (count) => supabase
          .channel(`provider:${providerId}:inbox`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "svc_request_offers",
              filter: `provider_id=eq.${providerId}`
            },
            count((payload) => this.onOfferChange(payload))
          )
          .subscribe((status) => {
            if (window.MIMI_DEBUG_REALTIME) console.log("[MIMI] Offers realtime:", status);
          }),
          { critical: true }
        );
      }

      const activeRequestId = this.activeServiceRequestId();
      if (activeRequestId) {
        this.subscribeActiveRequestRealtime(activeRequestId);
      }
    } catch (err) {
      console.error("[MIMI] Realtime error:", err);
    }
  }

  onNotification(payload) {
    const notif = payload?.new;
    if (!notif) return;

    const normalized = this.normalizeNotifications([notif])[0];
    actions.addNotification(normalized);

    if (this.isKycReviewNotification(normalized)) {
      this.showKycRealtimeAlert(normalized);
    } else {
      this.showToast(normalized.title || "Nueva notificacion", "info");
      this.playNotificationSound("info");
    }

    this.showForegroundNotification(normalized.title, normalized.text, notif.data_json);
  }

  async showForegroundNotification(title, body, data = {}) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker?.ready;
      const options = {
        body: body || "",
        icon: "./assets/icons/mimigo-partners-icon-192.png",
        badge: "./assets/icons/mimigo-partners-icon-32.png",
        tag: `mimi-service-${data?.request_id || data?.offer_id || Date.now()}`,
        renotify: true,
        data: {
          ...(data || {}),
          url: data?.url || "/mimi-servicios/prestador"
        }
      };

      if (registration?.showNotification) {
        await registration.showNotification(title || "MIMI Servicios", options);
      } else {
        new Notification(title || "MIMI Servicios", options);
      }
    } catch (error) {
      console.warn("[MIMI] foreground notification skipped:", error);
    }
  }

  async hydrateOfferForDisplay(row) {
    if (!row?.id) return row;

    try {
      const detailed = await loadOfferDetails(row.id);
      return detailed || row;
    } catch (error) {
      console.warn("[MIMI] no pudimos cargar el detalle completo de la oferta:", error);
      return row;
    }
  }

  offerHasDisplayDetails(offer = {}) {
    const normalized = offer.details ? offer : this.normalizeOfferForState(offer);
    return Boolean(
      normalized.serviceType &&
      normalized.serviceType !== "Servicio" &&
      (Number(normalized.price || 0) > 0 || (normalized.detailRows || []).some((row) => row?.label !== "Precio"))
    );
  }

  async ensureActiveOfferDetails() {
    const offer = this.state?.activeOffer;
    if (!offer?.id || this.offerHasDisplayDetails(offer)) return;

    try {
      const detailed = await loadOfferDetails(offer.id);
      if (detailed && this.isUsableOffer(detailed)) {
        actions.setActiveOffer(this.normalizeOfferForState(detailed));
      }
    } catch (error) {
      console.warn("[MIMI] no pudimos refrescar detalle de oferta activa:", error);
    }
  }

  async onOfferChange(payload) {
    const eventType = payload?.eventType;
    const row = payload?.new ?? payload?.old;
    if (!row) return;

    const status = String(row.status ?? "").toUpperCase();

    if (eventType === "DELETE" || ["EXPIRED", "REJECTED", "CANCELLED", "ACCEPTED_BY_OTHER"].includes(status)) {
      if (this.state?.activeOffer?.id === row.id) {
        actions.clearActiveOffer();
      }
      actions.updateState({
        provider: {
          ...(this.state?.provider ?? {}),
          offers: (this.state?.provider?.offers ?? []).filter((item) => item.id !== row.id)
        }
      });
      return;
    }

    if (["PENDING", "PENDING_PROVIDER_RESPONSE"].includes(status) && this.isUsableOffer(row)) {
      const detailedOffer = await this.hydrateOfferForDisplay(row);
      if (!this.isUsableOffer(detailedOffer)) return;
      actions.setActiveOffer(this.normalizeOfferForState(detailedOffer));
      actions.updateState({
        provider: {
          ...(this.state?.provider ?? {}),
          offers: [
            detailedOffer,
            ...(this.state?.provider?.offers ?? []).filter((item) => item.id !== detailedOffer.id)
          ]
        }
      });
      actions.setProviderStatus("INVITED");
      this.showToast("Nueva solicitud disponible", "info");
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = this.elements.toastContainer;
    if (!container) return;

    const normalized = String(message ?? "").trim();
    if (!normalized) return;

    const duplicate = [...container.querySelectorAll(".toast")].find(
      (item) => item.dataset.message === normalized
    );

    if (duplicate) {
      duplicate.remove();
    }

    while (container.children.length >= 2) {
      container.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.message = normalized;
    toast.textContent = normalized;
    
    container.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

providerPayoutErrorMessage(code) {
  const value = String(code || "").trim();
  const messages = {
    AUTH_REQUIRED: "Inicia sesion para configurar tu Wallet.",
    PROVIDER_NOT_FOUND: "No encontramos tu perfil de prestador.",
    CBU_REQUIRED: "Carga un CBU valido.",
    CVU_REQUIRED: "Carga un CVU valido.",
    ALIAS_REQUIRED: "Carga un alias valido.",
    CBU_INVALID_LENGTH: "El CBU debe tener 22 digitos.",
    CVU_INVALID_LENGTH: "El CVU debe tener 22 digitos.",
    BANK_ACCOUNT_IDENTIFIER_REQUIRED: "Carga CBU, CVU o alias para identificar la cuenta.",
    PAYOUT_ACCOUNT_TYPE_INVALID: "Selecciona un tipo de cuenta valido.",
    PAYOUT_ACCOUNT_HASH_SALT_MISSING: "Wallet no disponible: falta configuracion segura del backend.",
    PAYOUT_ACCOUNT_ENCRYPTION_KEY_MISSING: "Falta configurar cifrado para datos de cobro.",
    payout_account_unavailable: "No pudimos recuperar tus datos de Wallet."
  };
  return messages[value] || "No pudimos procesar tus datos de Wallet.";
}

async refreshProviderPayoutAccount({ silent = false } = {}) {
  const actionKey = "provider-payout-account-refresh";
  if (this.pendingActions.has(actionKey)) return;

  if (!this.state?.session?.isAuthenticated) {
    if (!silent) this.showToast("Inicia sesion para ver tu Wallet.", "warning");
    return;
  }

  this.pendingActions.add(actionKey);
  actions.updateState({
    provider: {
      ...(this.state?.provider ?? {}),
      walletLoading: true,
      payoutAccountError: null
    }
  });

  try {
    const result = await getProviderPayoutAccount();
    const errorCode = result?.ok === false ? result?.error : null;
    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        payoutAccount: result?.account ?? null,
        walletLoading: false,
        payoutAccountError: errorCode ? this.providerPayoutErrorMessage(errorCode) : null
      }
    });

    if (!silent && !errorCode) {
      this.showToast("Wallet actualizada.", "success");
    }
  } catch (error) {
    const code = error?.details?.error || error?.code || error?.message;
    const message = this.providerPayoutErrorMessage(code);
    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        walletLoading: false,
        payoutAccountError: message
      }
    });
    if (!silent) this.showToast(message, "error");
    console.warn("[MIMI] No pudimos refrescar datos de cobro:", error);
  } finally {
    this.pendingActions.delete(actionKey);
  }
}

async handleProviderPayoutAccountSubmit(event) {
  event.preventDefault();
  const form = event.target?.closest?.("#providerPayoutAccountForm");
  if (!form) return;

  if (!this.state?.session?.isAuthenticated) {
    this.showToast("Inicia sesion para configurar tu Wallet.", "warning");
    return;
  }

  const actionKey = "provider-payout-account-submit";
  if (this.pendingActions.has(actionKey)) return;

  const submitButton = form?.querySelector?.("button[type='submit']");
  const originalLabel = submitButton?.textContent;
  const formData = new FormData(form);
  const accountType = String(formData.get("account_type") || "cbu").trim().toLowerCase();
  const cbu = String(formData.get("cbu") || "").replace(/\D/g, "");
  const cvu = String(formData.get("cvu") || "").replace(/\D/g, "");
  const alias = String(formData.get("alias") || "").trim().toLowerCase();
  const changeReason = String(formData.get("change_reason") || "").trim();
  const focusField = (name) => form.querySelector(`[name='${name}']`)?.focus?.();

  if (!["cbu", "cvu", "alias", "bank_account"].includes(accountType)) {
    this.showToast("Selecciona un tipo de cuenta valido.", "warning");
    focusField("account_type");
    return;
  }

  if (accountType === "cbu" && cbu.length !== 22) {
    this.showToast("El CBU debe tener 22 digitos.", "warning");
    focusField("cbu");
    return;
  }

  if (accountType === "cvu" && cvu.length !== 22) {
    this.showToast("El CVU debe tener 22 digitos.", "warning");
    focusField("cvu");
    return;
  }

  if (accountType === "alias" && alias.length < 6) {
    this.showToast("El alias debe tener al menos 6 caracteres.", "warning");
    focusField("alias");
    return;
  }

  if (accountType === "bank_account") {
    if (!cbu && !cvu && alias.length < 6) {
      this.showToast("Carga CBU, CVU o alias para identificar la cuenta.", "warning");
      focusField("cbu");
      return;
    }
    if (cbu && cbu.length !== 22) {
      this.showToast("El CBU debe tener 22 digitos.", "warning");
      focusField("cbu");
      return;
    }
    if (cvu && cvu.length !== 22) {
      this.showToast("El CVU debe tener 22 digitos.", "warning");
      focusField("cvu");
      return;
    }
  }

  if (changeReason.length < 10) {
    this.showToast("Agrega un motivo breve para auditar el cambio.", "warning");
    focusField("change_reason");
    return;
  }

  this.pendingActions.add(actionKey);
  actions.updateState({
    provider: {
      ...(this.state?.provider ?? {}),
      walletLoading: true,
      payoutAccountError: null
    }
  });

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando...";
    }

    recordCriticalRiskEvent("provider_change_bank_account", {
      actorRole: "provider",
      source: "provider_wallet_form",
      providerId: this.state?.session?.providerId ?? null,
      accountType,
      hasCbu: Boolean(cbu),
      hasCvu: Boolean(cvu),
      hasAlias: Boolean(alias)
    });

    const result = await submitProviderPayoutAccount({
      account_type: accountType,
      cbu,
      cvu,
      alias,
      bank_name: formData.get("bank_name"),
      holder_name: formData.get("holder_name"),
      holder_tax_id: formData.get("holder_tax_id"),
      change_reason: changeReason
    });

    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        payoutAccount: result?.account ?? null,
        walletLoading: false,
        payoutAccountError: null
      }
    });

    this.showToast("Datos de cobro enviados a revision.", "success");
    form.reset();
  } catch (error) {
    console.error("[MIMI] Error enviando datos de cobro:", error);
    const code = error?.details?.error || error?.code || error?.message;
    const message = this.providerPayoutErrorMessage(code);
    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        walletLoading: false,
        payoutAccountError: message
      }
    });
    this.showToast(message, "error");
  } finally {
    this.pendingActions.delete(actionKey);
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel || "Enviar a revision";
    }
  }
}

async handleSecurityChallengeAction(sourceUrl = window.location.href) {
  let url;
  try {
    url = new URL(sourceUrl, window.location.origin);
  } catch (_) {
    return false;
  }

  const challengeId = url.searchParams.get("auth_challenge");
  const action = url.searchParams.get("auth_action") || "open";
  if (!challengeId) return false;

  if (action !== "approve" && action !== "reject") {
    this.showToast("Abrimos MIMIGO para confirmar tu acceso.", "info");
    return true;
  }

  try {
    await approveSecurityChallenge({
      role: "provider",
      challengeId,
      action
    });
    this.showToast(action === "approve" ? "Acceso aprobado en este dispositivo." : "Acceso rechazado.", action === "approve" ? "success" : "warning");
  } catch (error) {
    this.showToast(error?.message || "No pudimos confirmar esta verificacion.", "error");
  } finally {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("auth_challenge");
    cleanUrl.searchParams.delete("auth_action");
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }

  return true;
}

setupSecurityChallengeListeners() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "AUTH_CHALLENGE_ACTION" && event.data?.url) {
        this.handleSecurityChallengeAction(event.data.url);
      }
    });
  }

  this.handleSecurityChallengeAction();
}

/**
 * Setup install prompt
 */
isRunningAsInstalledPwa() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.navigator?.standalone === true
  );
}

isMobileAndroidBrowser() {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isMobile = isAndroid || /Mobi|Mobile|iPhone|iPad|iPod/i.test(ua);
  return isMobile && !this.isRunningAsInstalledPwa();
}

isInstallDismissed() {
  return false;
}

hideInstallBanner() {
  if (!this.elements?.installBanner) return;

  this.elements.installBanner.hidden = true;
  this.elements.installBanner.style.setProperty("display", "none", "important");
  this.elements.installBanner.style.opacity = "0";
  this.elements.installBanner.style.pointerEvents = "none";
  this.elements.installBanner.setAttribute("aria-hidden", "true");
}

ensureProviderUpdateBanner() {
  let banner = document.getElementById("mimiProviderUpdateBanner");
  if (banner) return banner;

  banner = document.createElement("section");
  banner.id = "mimiProviderUpdateBanner";
  banner.className = "provider-update-banner";
  banner.hidden = true;
  banner.setAttribute("aria-hidden", "true");
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <div class="provider-update-copy">
      <strong>Nueva versión disponible</strong>
      <span>Actualizá MIMIGO Prestadores para ver las mejoras.</span>
    </div>
    <button class="provider-update-cta" id="mimiProviderUpdateButton" type="button">Actualizar</button>
  `;
  document.body.appendChild(banner);
  document.getElementById("mimiProviderUpdateButton")?.addEventListener("click", () => {
    this.applyProviderUpdate();
  });
  return banner;
}

showProviderUpdateBanner({ critical = false } = {}) {
  const banner = this.ensureProviderUpdateBanner();
  banner.hidden = false;
  banner.dataset.critical = String(Boolean(critical));
  banner.setAttribute("aria-hidden", "false");

  const title = banner.querySelector("strong");
  const copy = banner.querySelector("span");
  if (title) title.textContent = critical ? "Actualización necesaria" : "Nueva versión disponible";
  if (copy) {
    copy.textContent = critical
      ? "Necesitamos actualizar MIMIGO Prestadores para continuar."
      : "Actualizá MIMIGO Prestadores para ver las mejoras.";
  }
}

async cleanupProviderCachesForUpdate() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("mimi-go-partner-") || key.startsWith("mimi-servicios-provider-"))
      .map((key) => caches.delete(key))
  );
}

async applyProviderUpdate() {
  const button = document.getElementById("mimiProviderUpdateButton");
  const banner = document.getElementById("mimiProviderUpdateBanner");
  if (button) {
    button.disabled = true;
    button.textContent = "Actualizando...";
  }

  if (banner) {
    banner.dataset.updating = "true";
  }

  try {
    sessionStorage.setItem("mimi_provider_apply_update", "1");
    const registration = await navigator.serviceWorker?.getRegistration?.("/prestador");
    await registration?.update?.();
    const worker = registration?.waiting || registration?.installing || registration?.active;
    worker?.postMessage?.({ type: "SKIP_WAITING" });
    await this.cleanupProviderCachesForUpdate();
  } catch (error) {
    console.warn("[MIMI Provider] No se pudo preparar actualización:", error);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("provider_refresh", String(Date.now()));
    window.location.replace(url.toString());
  }
}

compareBuildVersions(a, b) {
  const left = String(a || "").split(".").map((part) => Number(part) || 0);
  const right = String(b || "").split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async checkProviderAppVersion() {
  if (appConfig.securityFlags?.ENABLE_UPDATE_BANNER === false) return;
  try {
    const response = await fetch(`/app-version.json?app=provider&t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) return;
    const payload = await response.json();
    const remote = payload?.provider;
    const remoteVersion = String(remote?.version || "");
    if (remoteVersion && remoteVersion !== MIMI_PROVIDER_BUILD) {
      const minSupported = String(remote?.min_supported_version || "");
      const forceUpdate = Boolean(
        appConfig.securityFlags?.ENABLE_FORCE_UPDATE ||
        (remote?.force_update && minSupported && this.compareBuildVersions(MIMI_PROVIDER_BUILD, minSupported) < 0)
      );
      this.showProviderUpdateBanner({ critical: forceUpdate || Boolean(remote?.critical) });
    } else {
      const banner = document.getElementById("mimiProviderUpdateBanner");
      if (banner) {
        banner.hidden = true;
        banner.setAttribute("aria-hidden", "true");
        banner.dataset.updating = "false";
      }
    }
  } catch (error) {
    console.warn("[MIMI Provider] No se pudo revisar versión:", error);
  }
}

setupProviderUpdateManager() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("app_update") === "1") {
      url.searchParams.delete("app_update");
      window.history.replaceState({}, "", url.toString());
      setTimeout(() => this.applyProviderUpdate(), 250);
    }
  } catch (_) {}

  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("mimi_provider_apply_update") !== "1") return;
      if (refreshing) return;
      refreshing = true;
      sessionStorage.removeItem("mimi_provider_apply_update");
      window.location.reload();
    });
  }

  window.addEventListener("focus", () => {
    this.checkProviderAppVersion();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") this.checkProviderAppVersion();
  });

  window.setInterval(() => this.checkProviderAppVersion(), 10 * 60 * 1000);
}

showInstallBanner({ sessionEntry = false } = {}) {
  const banner = this.elements?.installBanner;
  if (!banner || this.isRunningAsInstalledPwa()) return;

  const hasInstallPrompt = Boolean(this.deferredInstallPrompt || window.deferredInstallPrompt);
  const shouldShow =
    this.isMobileAndroidBrowser() &&
    localStorage.getItem(PARTNER_PWA_INSTALLED_KEY) !== "true" &&
    !this.isInstallDismissed() &&
    hasInstallPrompt;

  if (!shouldShow) {
    this.hideInstallBanner();
    return;
  }

  if (sessionEntry) {
    sessionStorage.setItem(PARTNER_INSTALL_SESSION_KEY, "1");
  }

  const text = banner.querySelector(".install-text");
  if (text) {
    text.textContent = "Instalá la app de prestadores para abrir tu panel más rápido";
  }

  if (this.elements.installBtn) {
    this.elements.installBtn.textContent = "Instalar app";
  }

  banner.hidden = false;
  banner.style.setProperty("display", "grid", "important");
  banner.style.opacity = "1";
  banner.style.pointerEvents = "auto";
  banner.removeAttribute("aria-hidden");
  banner.setAttribute("aria-hidden", "false");
}

setupInstallPrompt() {
  if (this.installPromptSetupDone) return;
  this.installPromptSetupDone = true;

  if (this.isRunningAsInstalledPwa()) {
    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;
    localStorage.setItem(PARTNER_PWA_INSTALLED_KEY, "true");
    this.hideInstallBanner();
    return;
  }

  try {
    localStorage.removeItem(PARTNER_PWA_INSTALLED_KEY);
  } catch (_) {}

  this.hideInstallBanner();

  window.addEventListener("beforeinstallprompt", (e) => {
    if (this.isRunningAsInstalledPwa()) {
      e.preventDefault();
      this.hideInstallBanner();
      return;
    }

    e.preventDefault();

    this.deferredInstallPrompt = e;
    window.deferredInstallPrompt = e;
    this.showInstallBanner({ sessionEntry: true });
    console.log("[MIMI] PWA install prompt listo");
  });

  window.addEventListener("appinstalled", () => {
    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;
    localStorage.setItem(PARTNER_PWA_INSTALLED_KEY, "true");

    if (this.elements.installBanner) {
      this.hideInstallBanner();
    }

    this.showToast("App instalada correctamente", "success");
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
    if (this.isRunningAsInstalledPwa()) {
      localStorage.setItem(PARTNER_PWA_INSTALLED_KEY, "true");
      this.hideInstallBanner();
    } else if (this.deferredInstallPrompt || window.deferredInstallPrompt) {
      try {
        localStorage.removeItem(PARTNER_PWA_INSTALLED_KEY);
      } catch (_) {}
      this.showInstallBanner({ sessionEntry: false });
    }
  });
}

/**
 * Handle install
 */
async handleInstall() {
  if (this.isRunningAsInstalledPwa()) {
    this.hideInstallBanner();
    return;
  }

  const promptEvent =
    this.deferredInstallPrompt ||
    window.deferredInstallPrompt ||
    null;

  if (!promptEvent || typeof promptEvent.prompt !== "function") {
    this.showToast("Chrome todavía no habilitó la instalación. Probá de nuevo en unos segundos.", "info");
    console.warn("[MIMI] No hay beforeinstallprompt guardado");
    this.hideInstallBanner();
    return;
  }

  try {
    await promptEvent.prompt();

    const choice = await promptEvent.userChoice;
    console.log("[MIMI] PWA install choice:", choice);

    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;

    if (this.elements.installBanner) {
      this.hideInstallBanner();
    }

    if (choice?.outcome === "accepted") {
      localStorage.setItem(PARTNER_PWA_INSTALLED_KEY, "true");
      this.showToast("Instalando app...", "success");
    } else {
      this.showToast("Instalación cancelada", "info");
      try {
        localStorage.removeItem(PARTNER_INSTALL_DISMISSED_KEY);
      } catch (_) {}
    }
  } catch (err) {
    console.error("[MIMI] Error instalando PWA:", err);
    this.showToast("No pudimos abrir la instalación", "error");
  }
}
  
  /**
   * Start background sync
   */
  startBackgroundSync() {
// Produccin: las ofertas llegan por realtime / backend.
// No simulamos ofertas locales.

    
    // Check distance alerts for scheduled services
    setInterval(() => {
      this.checkDistanceAlerts();
    }, 60000);
  }



  /**
   * Check distance alerts
   */
  checkDistanceAlerts() {
    const scheduled = this.state?.scheduledServices || [];
    const now = Date.now();
    
    scheduled.forEach(service => {
      const serviceTime = new Date(service.scheduledFor).getTime();
      const timeUntil = serviceTime - now;
      
      // If service is within 1 hour
      if (timeUntil > 0 && timeUntil < 60 * 60 * 1000) {
        this.showDistanceAlert(service);
      }
    });
  }

  /**
   * Show distance alert
   */
  showDistanceAlert(service) {
    if (this.elements.distanceAlert) {
      this.elements.distanceAlert.hidden = false;
      
      if (this.elements.alertTitle) {
        this.elements.alertTitle.textContent = 'Servicio prximo';
      }
      if (this.elements.alertText) {
        this.elements.alertText.textContent = `${service.serviceType}  ${new Date(service.scheduledFor).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }

    // Auto hide after 10 seconds
    setTimeout(() => {
      if (this.elements.distanceAlert) {
        this.elements.distanceAlert.hidden = true;
      }
    }, 10000);
  }

  /**
   * On app foreground
   */
  onAppForeground() {
    console.log('[MIMI] App in foreground');
    
    // Refresh location
    this.updateMapToCurrentPosition();
    
    // Check if offer expired
    if (this.state?.activeOffer && !isOfferValid(this.state.activeOffer)) {
      actions.clearActiveOffer();
    }
  }

  /**
   * On app background
   */
  onAppBackground() {
    console.log('[MIMI] App in background');
    // State is persisted automatically
  }

  /**
   * Handle logout
   */
async handleLogout() {
  try {
    this.stopLocationTracking();
    this.stopPresenceHeartbeat();
    disconnectManagedRealtime("provider-app:");
    this.notificationRealtimeChannel?.unsubscribe?.();
    this.offerRealtimeChannel?.unsubscribe?.();
    this.realtimeChannel?.unsubscribe?.();
    await signOut();

    this.state = null;
    this.map = null;
    this.notificationRealtimeChannel = null;
    this.offerRealtimeChannel = null;
    this.realtimeChannel = null;

    try {
      forceCleanSession("provider");
      clearAuthRedirectIntent();
      sessionStorage.setItem("mimi_services_active_mode", "provider");
      localStorage.setItem("mimi_services_active_mode", "provider");
      localStorage.removeItem("mimi_provider_session");
      localStorage.removeItem("mimi_provider_active_service");
      localStorage.removeItem("mimi_provider_offer");
    } catch (_) {}

    document.body.classList.remove(
      "provider-phone-open",
      "provider-auth-loading",
      "provider-authenticated",
      "provider-auth-submitting",
      "provider-exit-open"
    );

    document.body.classList.add("provider-auth-required");
    if (this.elements.providerPhoneOverlay) this.elements.providerPhoneOverlay.hidden = true;
    if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "none";
    if (this.elements.header) this.elements.header.style.display = "none";
    if (this.elements.mapContainer) this.elements.mapContainer.style.display = "none";

    this.showProviderLoginGate();
    history.replaceState({ mimiProviderLogin: true }, "", "/prestador");
  } catch (err) {
    console.error("[MIMI] logout error:", err);
    this.showToast("No pudimos cerrar sesion", "error");
  }
}
setCameraStatus(message, state = "info") {
  if (!this.elements.cameraStatus) return;
  this.elements.cameraStatus.textContent = message;
  this.elements.cameraStatus.dataset.state = state;
}

showCameraSupportAction(show = true) {
  if (this.elements.cameraSupportBtn) {
    this.elements.cameraSupportBtn.hidden = !show;
  }
}

providerCameraConstraints(isSelfie) {
  return {
    audio: false,
    video: {
      facingMode: isSelfie ? { ideal: "user" } : { ideal: "environment" },
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      aspectRatio: { ideal: isSelfie ? 3 / 4 : 16 / 9 },
      frameRate: { ideal: 30, max: 30 }
    }
  };
}

providerCameraFallbackConstraints(isSelfie) {
  return {
    audio: false,
    video: {
      facingMode: isSelfie ? "user" : { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
}

getObjectFitCoverCrop(video, targetWidth, targetHeight) {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) return null;

  if (sourceRatio > targetRatio) {
    const width = Math.round(sourceHeight * targetRatio);
    return { sx: Math.round((sourceWidth - width) / 2), sy: 0, sw: width, sh: sourceHeight };
  }

  const height = Math.round(sourceWidth / targetRatio);
  return { sx: 0, sy: Math.round((sourceHeight - height) / 2), sw: sourceWidth, sh: height };
}

analyzeCapturedCanvas(canvas) {
  const width = canvas.width || 0;
  const height = canvas.height || 0;

  if (width < 720 || height < 720) {
    return { ok: false, message: "La camara entrego una imagen muy chica. Proba con mejor luz o desde Chrome." };
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const sampleWidth = Math.min(96, width);
  const sampleHeight = Math.min(96, height);
  const image = ctx.getImageData(
    Math.floor((width - sampleWidth) / 2),
    Math.floor((height - sampleHeight) / 2),
    sampleWidth,
    sampleHeight
  );
  let brightness = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    brightness += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
  }

  brightness = brightness / (image.data.length / 4);

  if (brightness < 38) {
    return { ok: false, message: "La foto esta muy oscura. Busca mas luz de frente y repetila." };
  }

  if (brightness > 238) {
    return { ok: false, message: "Hay demasiada luz directa. Evita reflejos fuertes y repetila." };
  }

  return { ok: true, message: "Listo para capturar" };
}

  async openCameraCapture(documentType) {
  const providerId = this.state?.session?.providerId;

  if (!providerId) {
    this.showToast("No se encontr tu perfil de prestador", "error");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    this.showToast("Tu navegador no permite cmara. Prob desde Chrome o instal la PWA.", "error");
    return;
  }

  const isSelfie = documentType === "selfie";
  const isDniBack = documentType === "dni_back";

  this.cameraCapture = { documentType, blob: null, file: null, previewUrl: null, uploading: false };

  if (this.elements.cameraTitle) {
    this.elements.cameraTitle.textContent = isSelfie
      ? "Selfie de verificación"
      : isDniBack
        ? "DNI dorso"
        : "DNI frente";
  }

  if (this.elements.cameraHint) {
    this.elements.cameraHint.textContent = isSelfie
      ? "Centrate dentro de la silueta, con buena luz."
      : isDniBack
        ? "Ubicá el dorso del DNI dentro del rectángulo."
        : "Ubicá el frente del DNI dentro del rectángulo.";
  }

  this.elements.cameraGuide?.classList.toggle("selfie", isSelfie);
  this.elements.cameraGuide?.classList.toggle("dni", !isSelfie);

  this.resetCameraPreview();

  try {
    this.elements.cameraCaptureModal.hidden = false;
    this.elements.cameraCaptureModal.style.display = "block";
    this.elements.cameraCaptureModal.style.zIndex = "999999";

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia(this.providerCameraConstraints(isSelfie));
    } catch (highResError) {
      console.warn("[MIMI][KYC] Camara alta resolucion no disponible, usando fallback:", highResError?.name || highResError?.message);
      this.cameraStream = await navigator.mediaDevices.getUserMedia(this.providerCameraFallbackConstraints(isSelfie));
    }

const video = this.elements.cameraVideo;

video.setAttribute("playsinline", "");
video.setAttribute("webkit-playsinline", "");
video.muted = true;
video.autoplay = true;
video.srcObject = this.cameraStream;

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("camera_metadata_timeout")), 7000);
  video.onloadedmetadata = () => {
    clearTimeout(timeout);
    resolve();
  };
});

await video.play();
    this.setCameraStatus(isSelfie ? "Centrate dentro de la silueta. Buena luz." : "Ubica el documento completo dentro de la guia.", "success");
  } catch (err) {
    console.error("[MIMI] Error abriendo cmara:", err);
    this.closeCameraCapture();
    this.showToast("No pudimos abrir la cmara. Revis permisos del navegador.", "error");
    this.openProviderSection("support");
  }
}
captureCameraFrame() {
  const video = this.elements.cameraVideo;
  const canvas = this.elements.cameraCanvas;
  const captureButton = this.elements.cameraCaptureBtn;

  if (!video || !canvas || !video.videoWidth) {
    this.showToast("La cmara todava no est lista", "warning");
    return;
  }

  this.setButtonBusy(captureButton, true, "Capturando...");
  if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = false;
  if (this.elements.cameraStatus) this.elements.cameraStatus.textContent = "Capturando imagen...";

  const wrapRect = video.getBoundingClientRect();
  const targetWidth = Math.min(1600, Math.max(720, Math.round(wrapRect.width * window.devicePixelRatio)));
  const targetHeight = Math.min(2000, Math.max(720, Math.round(wrapRect.height * window.devicePixelRatio)));
  const crop = this.getObjectFitCoverCrop(video, targetWidth, targetHeight);

  if (!crop) {
    this.setButtonBusy(captureButton, false);
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
    this.showToast("No pudimos leer el encuadre de la camara", "error");
    return;
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, targetWidth, targetHeight);

  const analysis = this.analyzeCapturedCanvas(canvas);
  if (!analysis.ok) {
    this.setButtonBusy(captureButton, false);
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
    this.setCameraStatus(analysis.message, "warning");
    this.showToast(analysis.message, "warning");
    return;
  }

  canvas.toBlob((blob) => {
    if (!blob || blob.size < 10 * 1024) {
      this.setButtonBusy(captureButton, false);
      if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
      this.showToast("No pudimos capturar una imagen valida", "error");
      return;
    }

    const documentType = this.cameraCapture.documentType;
    const fileName = `${documentType}-${Date.now()}.jpg`;

    const previewUrl = URL.createObjectURL(blob);
    if (this.cameraCapture.previewUrl) {
      URL.revokeObjectURL(this.cameraCapture.previewUrl);
    }

    this.cameraCapture.blob = blob;
    this.cameraCapture.previewUrl = previewUrl;
    this.cameraCapture.file = new File([blob], fileName, { type: "image/jpeg" });
    this.cameraCapture.width = canvas.width;
    this.cameraCapture.height = canvas.height;

    if (this.elements.cameraStillPreview) {
      this.elements.cameraStillPreview.src = previewUrl;
      this.elements.cameraStillPreview.hidden = false;
    }

    video.pause();

    this.setButtonBusy(captureButton, false);
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
    if (this.elements.cameraCaptureBtn) this.elements.cameraCaptureBtn.hidden = true;
    if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.hidden = false;
    if (this.elements.cameraUseBtn) this.elements.cameraUseBtn.hidden = false;
    this.setCameraStatus("Foto capturada. Confirmala o repetila.", "success");
  }, "image/jpeg", 0.95);
}

resetCameraPreview() {
  if (this.cameraCapture.previewUrl) {
    URL.revokeObjectURL(this.cameraCapture.previewUrl);
  }

  this.cameraCapture.blob = null;
  this.cameraCapture.file = null;
  this.cameraCapture.previewUrl = null;
  this.cameraCapture.uploading = false;
  this.showCameraSupportAction(false);
  if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;

  if (this.elements.cameraStillPreview) {
    this.elements.cameraStillPreview.hidden = true;
    this.elements.cameraStillPreview.removeAttribute("src");
  }

  if (this.elements.cameraVideo?.srcObject) {
    this.elements.cameraVideo.play().catch(() => {});
  }

  if (this.elements.cameraCaptureBtn) this.elements.cameraCaptureBtn.hidden = false;
  if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.hidden = true;
  if (this.elements.cameraUseBtn) this.elements.cameraUseBtn.hidden = true;
  this.setCameraStatus("Camara lista", "info");
}

async confirmCameraCapture() {
  const providerId = this.state?.session?.providerId;
  const documentType = this.cameraCapture.documentType;
  const file = this.cameraCapture.file;

  if (this.cameraCapture.uploading) return;

  if (!providerId || !documentType || !file) {
    this.showToast("Falta capturar la foto", "warning");
    return;
  }

  try {
    this.cameraCapture.uploading = true;
    actions.setLoading(true);
    this.setButtonBusy(this.elements.cameraUseBtn, true, "Subiendo imagen segura...");
    if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.disabled = true;
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = false;

    if (this.elements.cameraStatus) {
      this.elements.cameraStatus.textContent = "Subiendo imagen segura...";
    }

const uploadedDocument = await uploadProviderDocument({
  providerId,
  documentType,
  file
});

console.info("[MIMI][KYC] Documento recibido", {
  document_type: uploadedDocument?.document_type,
  review_status: uploadedDocument?.review_status
});
    
    if (documentType === "dni_front" && this.elements.dniFrontStatus) {
      this.elements.dniFrontStatus.textContent = "Frente recibido";
    }

    if (documentType === "dni_back" && this.elements.dniBackStatus) {
      this.elements.dniBackStatus.textContent = "Dorso recibido";
    }

    if (documentType === "selfie" && this.elements.selfieStatus) {
      this.elements.selfieStatus.textContent = "Selfie recibida";
    }

    this.closeCameraCapture();

    if (documentType === "dni_front") {
      this.showToast("DNI frente recibido. Ahora cargá el dorso.", "success");
      this.showWizardStep(2);
      return;
    }

    if (documentType === "dni_back") {
      this.showToast("DNI dorso recibido. Ahora sacate una selfie.", "success");
      this.showWizardStep(3);
      return;
    }

    this.showToast("Analizando identidad...", "info");
    this.setCameraStatus("Analizando identidad...", "info");
    await invokeFunction("svc-verify-provider-identity", {
  provider_id: providerId
});


    const workspace = await loadProviderWorkspace(providerId);
    this.applyWorkspaceToState(workspace);
    this.renderVerificationStatus();

const status = String(
  workspace?.profile?.review_status ?? ""
).toUpperCase();

    
    if (["REVIEW", "PENDING", "PENDING_DOCUMENTS"].includes(status)) {
      this.showToast("Revisin en curso. Te avisamos cuando est aprobada.", "success");
    } else if (status === "NEEDS_RESUBMISSION") {
      this.showToast("Necesitamos que repitas una foto con mejor calidad.", "warning");
    } else if (status === "REJECTED") {
      this.showToast("No pudimos validar la identidad. Contact soporte.", "error");
      this.showCameraSupportAction(true);
    } else {
      this.showToast("Verificacin enviada correctamente.", "success");
    }

    this.showWizardStep(5);
  } catch (err) {
    console.error("[MIMI] Error en verificacion por camara:", err?.code || err?.message || err);
    const message = err?.details?.message || err?.message || "No pudimos completar la verificacion. Podes repetir la foto e intentar de nuevo.";
    this.showToast(message, "error");
    this.setCameraStatus(message, "error");
    this.showCameraSupportAction(true);
  } finally {
    this.cameraCapture.uploading = false;
    this.setButtonBusy(this.elements.cameraUseBtn, false);
    if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.disabled = false;
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
    actions.setLoading(false);
  }
}

async uploadVerificationFile(documentType, file, input = null) {
  const providerId = this.state?.session?.providerId;

  if (!providerId || !documentType || !file) {
    this.showToast("No pudimos preparar el archivo", "warning");
    return;
  }

  const trigger = document.querySelector(`[data-upload="${documentType}"]`);

  try {
    actions.setLoading(true);
    this.setButtonBusy(trigger, true, "Subiendo...");

    if (documentType === "criminal_record_certificate" && this.elements.criminalRecordStatus) {
      this.elements.criminalRecordStatus.textContent = "Subiendo certificado...";
    }

    await uploadProviderDocument({ providerId, documentType, file });

    if (documentType === "selfie") {
      this.showToast("Analizando identidad...", "info");
      await invokeFunction("svc-verify-provider-identity", {
        provider_id: providerId
      });
    }

    const workspace = await loadProviderWorkspace(providerId);
    this.applyWorkspaceToState(workspace);
    renderProviderScreen(this.state);
    this.renderVerificationStatus();
    this.updateVerificationResultScreen();

    if (documentType === "criminal_record_certificate" && this.elements.criminalRecordStatus) {
      this.elements.criminalRecordStatus.textContent = "Certificado recibido";
    }

    this.showToast("Documento recibido. Quedó pendiente de revisión.", "success");
    this.showWizardStep(5);
  } catch (err) {
    console.error("[MIMI] Error subiendo documento:", err);
    this.showToast(err?.message ?? "No pudimos subir el documento", "error");
    if (documentType === "selfie" || documentType === "dni_front" || documentType === "dni_back") {
      this.openProviderSection("support");
    }
  } finally {
    this.setButtonBusy(trigger, false);
    actions.setLoading(false);
    if (input) input.value = "";
  }
}

closeCameraCapture() {
  if (this.cameraCapture.previewUrl) {
    URL.revokeObjectURL(this.cameraCapture.previewUrl);
  }

  if (this.cameraStream) {
    this.cameraStream.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
  }

  if (this.elements.cameraVideo) {
    this.elements.cameraVideo.pause();
    this.elements.cameraVideo.srcObject = null;
  }

  if (this.elements.cameraCaptureModal) {
    this.elements.cameraCaptureModal.hidden = true;
  }

  if (this.elements.cameraStillPreview) {
    this.elements.cameraStillPreview.hidden = true;
    this.elements.cameraStillPreview.removeAttribute("src");
  }

  this.cameraCapture = {
    documentType: null,
    blob: null,
    file: null,
    previewUrl: null,
    uploading: false
  };
}

showWizardStep(stepNumber) {
  document.querySelectorAll(".wizard-step").forEach((step) => {
    step.classList.toggle("active", step.id === `step${stepNumber}`);
  });

  if (stepNumber === 5) {
    this.updateVerificationResultScreen();
  }

  if (this.elements.wizardProgress) {
    this.elements.wizardProgress.style.width = `${Math.min(100, stepNumber * 20)}%`;
  }

  if (this.elements.wizardPrev) {
    this.elements.wizardPrev.hidden = stepNumber <= 1 || stepNumber === 5;
  }

  if (this.elements.wizardNext) {
    this.elements.wizardNext.textContent =
      stepNumber === 4 ? "Hacer luego" : stepNumber >= 5 ? "Cerrar" : "Continuar";
  }
}

showVerificationEntry(forceStatus = false) {
  const hasDocuments = Boolean((this.state?.provider?.documents?.items ?? []).length);

  if (forceStatus || hasDocuments) {
    this.showWizardStep(5);
    return;
  }

  this.showWizardStep(1);
}

openVerificationDocumentStep(documentType) {
  const step = {
    dni_front: 1,
    dni_back: 2,
    selfie: 3,
    criminal_record_certificate: 4
  }[documentType];

  if (!step) return;

  this.verificationReturnStep = 5;
  this.showWizardStep(step);

  const statusCopy = {
    dni_front: "Cargá o corregí el frente de tu DNI.",
    dni_back: "Cargá o corregí el dorso de tu DNI.",
    selfie: "Sacate una selfie clara para completar la verificación.",
    criminal_record_certificate: "Subí el certificado si ya lo tenés disponible."
  }[documentType];

  if (statusCopy) this.showToast(statusCopy, "info");
}

handleWizardNext() {
  const activeStep = document.querySelector(".wizard-step.active");
  const current = Number(activeStep?.id?.replace("step", "") ?? 1);

  if (current === 1) {
    this.openCameraCapture("dni_front");
    return;
  }

  if (current === 2) {
    this.openCameraCapture("dni_back");
    return;
  }

  if (current === 3) {
    this.openCameraCapture("selfie");
    return;
  }

  if (current === 4) {
    this.showWizardStep(5);
    return;
  }

  if (current >= 5) {
    actions.closeModal();
    return;
  }

  this.showWizardStep(current + 1);
}

handleWizardPrev() {
  const activeStep = document.querySelector(".wizard-step.active");
  const current = Number(activeStep?.id?.replace("step", "") ?? 1);

  if (current <= 1) return;

  this.showWizardStep(current - 1);
}

}

// ============================================
// INITIALIZATION
// ============================================

if (window.__MIMI_PROVIDER_APP_BUILD && window.__MIMI_PROVIDER_APP_BUILD !== MIMI_PROVIDER_BUILD) {
  console.warn("[MIMI] Ignorando instancia provider anterior", {
    active: window.__MIMI_PROVIDER_APP_BUILD,
    incoming: MIMI_PROVIDER_BUILD
  });
} else if (window.__MIMI_PROVIDER_APP_READY) {
  console.warn("[MIMI] Provider App ya inicializada", MIMI_PROVIDER_BUILD);
} else {
  window.__MIMI_PROVIDER_APP_BUILD = MIMI_PROVIDER_BUILD;
  window.__MIMI_PROVIDER_APP_READY = true;

  // Create global app instance
  const app = new MimiProviderApp();

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }

  // Export for global access
  window.app = app;
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    await removeConflictingServiceWorkers("/prestador");
    navigator.serviceWorker.register('/sw-partner.js', { scope: '/prestador' })
      .then(registration => {
        console.log('[MIMI] SW registered:', registration);
        registration.update?.();

        registration.addEventListener?.('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener?.('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.app?.checkProviderAppVersion?.();
            }
          });
        });
      })
      .catch(error => {
        console.log('[MIMI] SW registration failed:', error);
      });
  });
}

// Helper function for offer validation
function isOfferValid(offer) {
  if (!offer) return false;
  if (offer.expiresAt && new Date(offer.expiresAt).getTime() < Date.now()) return false;
  return true;
}
