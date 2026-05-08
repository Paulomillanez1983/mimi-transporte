/**
 * MIMI Servicios - Panel Prestador 2026
 * Main entry point with Uber Driver-style UX
 */

const MIMI_PROVIDER_BUILD = "2026.05.07.12";

window.MIMI_PROVIDER_BUILD = MIMI_PROVIDER_BUILD;

try {
  const previousBuild = sessionStorage.getItem("mimi_provider_build");
  const reloadFlag = `mimi_provider_reloaded_${MIMI_PROVIDER_BUILD}`;

  if (previousBuild && previousBuild !== MIMI_PROVIDER_BUILD && !sessionStorage.getItem(reloadFlag)) {
    sessionStorage.setItem(reloadFlag, "1");
    caches?.keys?.()
      ?.then((keys) => Promise.all(keys.filter((key) => key.startsWith("mimi-servicios-provider-")).map((key) => caches.delete(key))))
      ?.finally(() => location.reload());
  }

  sessionStorage.setItem("mimi_provider_build", MIMI_PROVIDER_BUILD);
} catch (_) {}

import {
  initState,
  subscribe,
  actions,
  getDeviceId,
  STORAGE_KEYS
} from "./state/app-state.js";
import {
  initMap,
  updateProviderMap
} from "./services/map.js";

import {
  bootstrapSession,
  invokeFunction,
  loadActiveRequest,
  loadCategories,
  loadNotifications,
  loadOffers,
  loadProviderWorkspace,
  getProviderDashboard,
  resolveServiceIntent,
  saveProviderWorkspace,
  uploadProviderDocument,
  signOut,
  updateProviderStatus
  } from "./services/service-api.js";


import { renderProviderScreen } from "./ui/render-provider.js";
import {
  getSupabaseClient,
  signInWithGoogle
} from "./services/supabase.js";

// ============================================
// APP CONTROLLER
// ============================================

class MimiProviderApp {
  constructor() {
    this.state = null;
    this.unsubscribe = null;
    this.map = null;
    this.markers = {};
    this.bottomSheet = null;
    this.offerTimer = null;
    this.trackingInterval = null;
    this.notificationsInterval = null;
    this.realtimeChannel = null;
    this.offerRealtimeChannel = null;
    this.notificationRealtimeChannel = null;
    
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

  // Cargar categorías siempre, independientemente del modo o sesión
  // Esto garantiza que appConfig.categories nunca sea undefined
  try {
    console.log("[MIMI] Loading categories...");
    const cats = await loadCategories();
    if (Array.isArray(cats) && cats.length) {
      actions.updateState({
        appConfig: {
          categories: cats.map((c) => ({
            id: c.id,
            code: c.code,
            slug: c.slug ?? null,
            name: c.name,
            description: c.description,
            aliases: c.aliases ?? [],
            search_keywords: c.search_keywords ?? [],
            default_pricing_model: c.default_pricing_model ?? "HOURLY",
            requires_provider_quote: Boolean(c.requires_provider_quote),
            allowed_service_modes: c.allowed_service_modes ?? ["IN_PERSON"],
            requires_professional_license: Boolean(c.requires_professional_license),
            requires_background_check: Boolean(c.requires_background_check),
          })),
          categoriesLoaded: true,
          categoriesError: null,
        }
      });
      console.log(`[MIMI] Categories loaded: ${cats.length} items`);
      console.log("[MIMI] Categories saved to state");
    }
  } catch (catErr) {
    console.error("[MIMI] loadCategories failed:", catErr.message);
    actions.updateState({
      appConfig: { categories: [], categoriesLoaded: false, categoriesError: catErr.message }
    });
  }

  this.cacheElements();

this.unsubscribe = subscribe((state) => {
  this.state = state;
  this.render();
});

this.setupInstallPrompt();

const canBootProviderPanel = await this.loadInitialData();
  
if (!canBootProviderPanel) {
  console.log("[MIMI] Provider auth gate active");
  return;
}
  this.initUI();
  await this.initMap();

  this.setupEventListeners();
  this.setupBottomSheetGestures();
  this.checkLocationPermission();
  this.startBackgroundSync();
  this.subscribeRealtime();

  console.log("[MIMI] App initialized");
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
      acceptOffer: document.getElementById('acceptOffer'),
      rejectOffer: document.getElementById('rejectOffer'),
      cameraCaptureModal: document.getElementById("cameraCaptureModal"),
cameraVideo: document.getElementById("cameraVideo"),
cameraCanvas: document.getElementById("cameraCanvas"),
cameraGuide: document.getElementById("cameraGuide"),
cameraBusyOverlay: document.getElementById("cameraBusyOverlay"),
cameraTitle: document.getElementById("cameraTitle"),
cameraHint: document.getElementById("cameraHint"),
cameraStatus: document.getElementById("cameraStatus"),
cameraCancelBtn: document.getElementById("cameraCancelBtn"),
cameraCaptureBtn: document.getElementById("cameraCaptureBtn"),
cameraRetakeBtn: document.getElementById("cameraRetakeBtn"),
cameraUseBtn: document.getElementById("cameraUseBtn"),
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
      serviceActionBtn: document.getElementById('serviceActionBtn'),
      
      // Distance alert
      distanceAlert: document.getElementById('distanceAlert'),
      alertTitle: document.getElementById('alertTitle'),
      alertText: document.getElementById('alertText'),
      alertAction: document.getElementById('alertAction'),
      
      // Bottom sheet
      bottomSheet: document.getElementById('bottomSheet'),
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
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      chatSend: document.getElementById('chatSend'),
      
      // Modal
      verificationModal: document.getElementById('verificationModal'),
      modalClose: document.getElementById('modalClose'),
      wizardProgress: document.getElementById('wizardProgress'),
      wizardNext: document.getElementById('wizardNext'),
      wizardPrev: document.getElementById('wizardPrev'),
      
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
    console.warn("[MIMI][initMap] MapLibre no disponible");
    this.showMapFallback();
    return;
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
            this.map.easeTo({
              center: [-64.19, -31.42],
              zoom: esMobile ? 11.8 : 12.4,
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

          const activeService = this.state?.activeService;
          const servicePosition = {
            lat:
              activeService?.raw?.service_lat ??
              activeService?.raw?.lat ??
              null,
            lng:
              activeService?.raw?.service_lng ??
              activeService?.raw?.lng ??
              null
          };

          updateProviderMap({
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
  /**
   * Update provider marker on map
   */
updateProviderMarker(lat, lng) {
  updateProviderMap({
    providerPosition: { lat, lng },
    servicePosition: null
  });
}

showProviderLoginGate() {
  const container = this.elements.onlineButtonContainer;

  document.body.classList.add("provider-auth-required");
  document.body.classList.remove("provider-auth-loading", "provider-authenticated");

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
<section class="provider-auth-shell" aria-label="Acceso para prestadores MIMI">
  <div class="provider-auth-stage">
    <div class="provider-auth-hero">
      <div class="provider-auth-topbar">
        <div class="provider-auth-logo" aria-label="MiMI">Mi<span>M</span>I</div>
        <div class="provider-auth-status-pill">Plataforma Operativa</div>
      </div>

      <div class="provider-auth-copy">
        <h1>Eleg&iacute; c&oacute;mo, cu&aacute;ndo y d&oacute;nde <span>trabajar.</span></h1>
        <p>Oportunidades a tu tiempo.</p>
      </div>

<div class="provider-auth-hero-bg" aria-hidden="true">
  <img
    src="./assets/provider/provider1-login-bg.png"
    alt=""
    loading="eager"
    decoding="async"
  >
</div>
</div>

<div class="provider-auth-card">
  <div class="provider-auth-card-header">
    <div>
      <h2 class="provider-auth-card-title">MIMI SERVICIOS</h2>
      <p class="provider-auth-card-subtitle">Para prestadores</p>
    </div>
    <div class="provider-auth-card-badge">Acceso Seguro</div>
  </div>

  <div class="provider-auth-divider"></div>

  <p class="provider-auth-card-copy">
    Ofrec tus servicios.<br>
    <span>Lleg a ms personas.</span>
  </p>

  <div class="provider-auth-services">
    <article class="provider-auth-service"><strong></strong><span>Hogar</span></article>
    <article class="provider-auth-service"><strong></strong><span>Salud</span></article>
    <article class="provider-auth-service"><strong></strong><span>Bienestar</span></article>
    <article class="provider-auth-service"><strong>+12</strong><span>categoras</span></article>
  </div>

  <div class="provider-auth-login-label">
    <span>Inici sesin para continuar</span>
  </div>

  <button class="provider-auth-google" id="providerGoogleLoginButton" type="button">
    <span class="provider-auth-google-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.2l6.5-6.5C35.3 2.6 30 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.7c-.3 2-1.6 5-4.4 7l6.9 5.3c4-3.7 6.3-9.2 6.3-16z"/>
        <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6.1z"/>
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-6.9-5.3c-1.9 1.3-4.5 2.2-9 2.2-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
      </svg>
    </span>

    <span class="provider-auth-google-copy">
      <strong>Continuar con Google</strong>
    </span>

    <span class="provider-auth-google-arrow"></span>
  </button>

  <div class="provider-auth-trust">
    <span>Acceso seguro</span>
    <span>Validacin en tiempo real</span>
  </div>

  <p class="provider-auth-legal">
    Al continuar, acepts nuestros <span>Trminos y Condiciones</span><br>
    y la <span>Poltica de Privacidad</span>.
  </p>
</div>
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
    localStorage.setItem("mimi_services_install_banner_dismissed", "true");
  } catch (_) {}
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

document.body.classList.remove("provider-auth-loading", "provider-auth-required");
document.body.classList.add("provider-authenticated");

if (this.elements.onlineButtonContainer) {
  this.elements.onlineButtonContainer.hidden = true;
  this.elements.onlineButtonContainer.classList.add("hidden");
  this.elements.onlineButtonContainer.style.display = "none";
  this.elements.onlineButtonContainer.innerHTML = "";
}

if (this.elements.bottomSheet) this.elements.bottomSheet.style.display = "";
if (this.elements.header) this.elements.header.style.display = "";
if (this.elements.mapContainer) this.elements.mapContainer.style.display = "";
    const installDismissed =
  localStorage.getItem("mimi_services_install_banner_dismissed") === "true";

if (
  this.elements.installBanner &&
  this.deferredInstallPrompt &&
  !installDismissed &&
  !this.isRunningAsInstalledPwa()
) {
  this.elements.installBanner.hidden = false;
  this.elements.installBanner.style.display = "";
  this.elements.installBanner.style.opacity = "1";
  this.elements.installBanner.style.pointerEvents = "auto";
  this.elements.installBanner.removeAttribute("aria-hidden");
} else {
  this.hideInstallBanner();
}
    
    if (!session?.providerId) {
      this.showToast("No se encontr un perfil de prestador para esta cuenta", "error");
      this.showProviderLoginGate();
      return false;
    }

const [categories, workspace, notifications, offers, activeRequest] = await Promise.all([
  // Reusar categorías ya cargadas en init(); si están vacías, recargar
  (this.state?.appConfig?.categories?.length
    ? Promise.resolve(this.state.appConfig.categories)
    : loadCategories()),
  loadProviderWorkspace(session.providerId),
  loadNotifications(session.userId),
  loadOffers(session.providerId),
  loadActiveRequest({ providerId: session.providerId })
]);

if (Array.isArray(categories) && categories.length) {
  actions.updateState({
    appConfig: {
      categories: categories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        aliases: category.aliases ?? [],
        search_keywords: category.search_keywords ?? [],
        default_pricing_model: category.default_pricing_model ?? "HOURLY",
        requires_provider_quote: Boolean(category.requires_provider_quote),
        allowed_service_modes: category.allowed_service_modes ?? ["IN_PERSON"],
        requires_professional_license: Boolean(category.requires_professional_license),
        requires_background_check: Boolean(category.requires_background_check)
      }))
    }
  });
}
setTimeout(async () => {
  try {
    const freshDashboard = await getProviderDashboard(session.providerId);

    actions.updateState({
      provider: {
        ...(this.state?.provider ?? {}),
        dashboard: freshDashboard
      }
    });
  } catch (err) {
    console.warn("[MIMI] Dashboard diferido no disponible:", err);
  }
}, 800);    
    this.applyWorkspaceToState(workspace);

    actions.updateState({
      notifications: {
        items: this.normalizeNotifications(notifications),
        unreadCount: (notifications ?? []).filter((item) => !item.read_at).length
      }
    });

    const firstOffer = Array.isArray(offers) ? offers[0] : null;
    if (firstOffer) {
      actions.setActiveOffer(this.normalizeOfferForState(firstOffer));
    }

    if (activeRequest) {
      actions.setActiveService(this.normalizeServiceForState(activeRequest));
    }

    this.renderDrawerProfile();
    return true;
  } catch (err) {
    console.error("[MIMI] Error cargando datos iniciales:", err);

    actions.setError?.(err?.message ?? "No pudimos cargar tu panel de prestador");
    this.showToast("No pudimos cargar tus datos reales", "error");

    document.body.classList.remove("provider-auth-loading", "provider-authenticated");
    document.body.classList.add("provider-auth-required");

    this.showProviderLoginGate();
    return false;
  } finally {
    actions.setLoading(false);
  }
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
          reviews
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

  normalizeServiceForState(service = {}) {
    return {
      id: service.id ?? service.request_id ?? crypto.randomUUID?.() ?? String(Date.now()),
      requestId: service.request_id ?? service.id ?? null,
      status: this.normalizeRequestStatus(service.status),
      serviceType:
        service.service_type ??
        service.category_name ??
        service.title ??
        service.svc_categories?.name ??
        "Servicio",
      clientName:
        service.client_name ??
        service.client?.full_name ??
        service.svc_clients?.full_name ??
        "Cliente",
      clientAvatar: service.client_avatar ?? service.client?.avatar_url ?? null,
      location: service.address_text ?? service.location ?? "Ubicacin a confirmar",
      address: service.address_text ?? null,
      price:
        Number(service.total_price_snapshot ?? service.total_price ?? service.provider_amount ?? 0),
      scheduledFor: service.scheduled_for ?? null,
      startedAt: service.started_at ?? null,
      conversationId: service.conversation_id ?? null,
      raw: service
    };
  }

  normalizeOfferForState(offer = {}) {
    const request = offer.svc_requests ?? offer.request ?? {};

    return {
      id: offer.id,
      requestId: offer.request_id ?? request.id ?? null,
      serviceType:
        offer.title ??
        request.title ??
        request.category_name ??
        request.svc_categories?.name ??
        "Servicio",
      clientName: offer.client_name ?? request.client_name ?? "Cliente",
      location: offer.address_text ?? request.address_text ?? "Ubicacin a confirmar",
      price: Number(offer.total_price_snapshot ?? request.total_price_snapshot ?? request.total_price ?? 0),
      mode: request.request_type ?? "IMMEDIATE",
      expiresAt: offer.expires_at ?? null,
      createdAt: offer.created_at ?? new Date().toISOString(),
      raw: offer
    };
  }

  normalizeNotifications(items = []) {
    return (items ?? []).map((item) => ({
      id: item.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      title: item.title ?? "Nueva notificacin",
      text: item.body ?? item.message ?? "",
      timestamp: item.created_at ?? new Date().toISOString(),
      unread: !item.read_at,
      icon: item.icon ?? "",
      raw: item
    }));
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

  async applyServiceTransition(functionName, nextProviderStatus, successMessage) {
    const service = this.state?.activeService;
    if (!service?.requestId) return;

    const response = await invokeFunction(functionName, {
      request_id: service.requestId
    });

    const updatedService = response?.service ?? response?.request ?? response?.data ?? null;

    if (updatedService) {
      actions.setActiveService(this.normalizeServiceForState(updatedService));
    }

    if (nextProviderStatus) {
      actions.setProviderStatus(nextProviderStatus);
    }

    this.showToast(successMessage, "success");
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

  openProviderSection(section) {
    const route = {
      profile: { tab: "account", target: "providerProfilePanel" },
      documents: { tab: "account", target: "providerTrustPanel" },
      services: { tab: "pricing", target: "providerBusinessPanel" },
      earnings: { tab: "now", target: "providerDashboardPanel" },
      settings: { tab: "pricing", target: "providerBusinessPanel" },
      support: { tab: "account", target: "providerSupportPanel" }
    }[section] ?? { tab: "account", target: null };

    this.switchTab(route.tab);
    this.setBottomSheetState("expanded");
    actions.closeDrawer();

    window.requestAnimationFrame(() => {
      const target = route.target ? document.getElementById(route.target) : null;
      target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
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
          const missingLabel =
            accountApproved && type !== "criminal_record_certificate"
              ? "Aprobado por admin"
              : "Pendiente";
          return `
            <article class="verification-result-item ${doc ? "has-doc" : "missing-doc"}">
              <div>
                <strong>${title}</strong>
                <span>${rule}</span>
              </div>
              <span>${doc ? statusLabel(doc.review_status) : missingLabel}</span>
            </article>
          `;
        })
        .join("");
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Online button
    this.elements.goOnlineButton?.addEventListener('click', () => {
      this.handleGoOnline();
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
      return;
    }

    this.switchTab(tab);
    this.setBottomSheetState("expanded");
  });
});
    // Status toggle
    this.elements.statusToggleModern?.addEventListener('click', (e) => {
      const option = e.target.closest('.toggle-option');
      if (option) {
        const status = option.dataset.status;
        this.handleStatusToggle(status);
      }
    });

    // Quick actions
    this.elements.quickNotifications?.addEventListener('click', () => {
      actions.toggleNotifications();
    });

    this.elements.quickChat?.addEventListener('click', () => {
      actions.toggleChat();
    });

    this.elements.quickSupport?.addEventListener('click', () => {
      this.openProviderSection("support");
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

    this.elements.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });

    // Offer actions
    this.elements.acceptOffer?.addEventListener('click', () => {
      this.handleAcceptOffer();
    });

    this.elements.rejectOffer?.addEventListener('click', () => {
      this.handleRejectOffer();
    });

    // Service action
    this.elements.serviceActionBtn?.addEventListener('click', () => {
      this.handleServiceAction();
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

    document.getElementById('linkSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openProviderSection("settings");
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
      } else if (delta < -50) {
        // Dragging down
        if (sheet.classList.contains('expanded')) {
          sheet.classList.remove('expanded');
        } else {
          sheet.classList.add('collapsed');
        }
      }
    };

    const onTouchEnd = () => {
      this.touchState.isDragging = false;
      sheet.style.transition = '';
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
  }

  /**
   * Switch tab
   */
  switchTab(tab) {
    // Update buttons
    this.elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update panels
    this.elements.tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });
    
    actions.setTab(tab);
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
  try {
    actions.setLoading(true);

    const profile = await updateProviderStatus(providerId, "ONLINE_IDLE");

    actions.setProfile(profile);
    actions.setProviderStatus(profile?.status ?? "ONLINE_IDLE");
    actions.setBottomSheetState("peek");

    this.showToast("Ests online - recibiendo servicios", "success");
    this.startLocationTracking();
  } catch (err) {
    console.error("[MIMI] Error poniendo online:", err);
    this.showToast("No pudimos ponerte online", "error");
  } finally {
    actions.setLoading(false);
  }
}
  /**
   * Handle status toggle
   */
async handleStatusToggle(status) {
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

  try {
    actions.setLoading(true);

    const profile = await updateProviderStatus(providerId, status);

    actions.setProfile(profile);
    actions.setProviderStatus(profile?.status ?? status);

    if (status === "ONLINE_IDLE") {
      this.showToast("Ests online", "success");
      this.startLocationTracking();
    } else {
      this.showToast("Ests offline", "info");
      this.stopLocationTracking();
    }
  } catch (err) {
    console.error("[MIMI] Error cambiando disponibilidad:", err);
    this.showToast("No pudimos actualizar tu estado", "error");
  } finally {
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
      quoteRequired: data.has(`offering:${index}:quoteRequired`)
    });
  }

const availableCategories =
  this.state?.appConfig?.categories ??
  this.state?.categories ??
  [];

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
    bio: data.get("providerBio") ?? "",
    publicHeadline: data.get("providerPublicHeadline") ?? "",
    professionalSummary: data.get("providerProfessionalSummary") ?? "",
    videoIntroUrl: data.get("providerVideoIntroUrl") ?? "",
    city: data.get("providerCity") ?? "",
    province: data.get("providerProvince") ?? "",
    addressText: data.get("providerAddressText") ?? "",
    pricingMode: "HOURLY",
    acceptsImmediate: true,
    acceptsScheduled: true,
    maxHoursPerService: Number(data.get("maxHoursPerService") ?? 8),
    termsAccepted: data.has("providerTermsAccepted"),
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

  if (!payload.termsAccepted) {
    this.showToast("Acepta los terminos para finalizar tu configuracion", "warning");
    event.target?.querySelector?.("[name='providerTermsAccepted']")?.focus?.();
    return;
  }

  try {
    actions.setLoading(true);
    await this.acceptProviderTerms();
    const workspace = await saveProviderWorkspace(providerId, payload);
    this.applyWorkspaceToState(workspace);
    renderProviderScreen(this.state);
    this.renderServicesAndPricing();
    this.renderSheetSummary();
    this.showToast("Setup comercial guardado", "success");
  } catch (err) {
    console.error("[MIMI] Error guardando setup comercial:", err);
    this.showToast(err?.message ?? "No pudimos guardar tus servicios", "error");
  } finally {
    actions.setLoading(false);
  }
}

async acceptProviderTerms() {
  const userId = this.state?.session?.userId;
  if (!userId) throw new Error("No se encontro la sesion del prestador");

  await invokeFunction("accept-legal-document", {
    actor_type: "provider",
    document_code: "terms_providers",
    version: "2026.1.0",
    acceptance_method: "provider_service_setup"
  });

  await invokeFunction("accept-legal-document", {
    actor_type: "all",
    document_code: "privacy_policy",
    version: "2026.1.0",
    acceptance_method: "provider_service_setup"
  });
}

async handleProviderBusinessAction(action, source = null) {
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
  if (categorySelect && firstSelected) categorySelect.value = firstSelected;
  if (activeInput && firstSelected) activeInput.checked = true;

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

renderProviderSuggestionCards(form, matches, text, { fallback = false } = {}) {
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");
  const emptyBox = form?.querySelector?.("#providerAiEmpty");
  if (!suggestionBox) return false;

  const cards = (matches ?? []).slice(0, 5).map((item) => {
    const categoryId = item.category_id ?? item.id ?? "";
    const code = item.code ?? "";
    const description = item.description ?? this.providerSuggestionReason(text, item);
    const isDynamic = item.auto_created || item.discovery_status === "auto";

    return `
      <button class="provider-suggestion-card" type="button" data-provider-suggestion-card data-provider-business-action="toggle-provider-suggestion" data-category-id="${this.escapeHtml(categoryId)}" data-category-code="${this.escapeHtml(code)}" aria-pressed="false">
        <strong>${this.escapeHtml(item.name ?? "Servicio sugerido")}</strong>
        <span>${this.escapeHtml(description)}</span>
        ${isDynamic ? `<small>Nuevo rubro ordenado por MIMI</small>` : ""}
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
  suggestionBox.hidden = false;
  suggestionBox.removeAttribute("hidden");
  suggestionBox.classList.toggle("has-suggestions", Boolean(cards));
  suggestionBox.setAttribute("aria-live", "polite");

  if (emptyBox) {
    emptyBox.hidden = true;
    emptyBox.setAttribute("hidden", "");
  }

  this.syncProviderSelectedCategories(form);

  if (!fallback && cards) {
    this.revealProviderSuggestions(form);
  }

  return Boolean(cards);
}

revealProviderSuggestions(form = document.getElementById("providerBusinessForm")) {
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");
  const firstCard = suggestionBox?.querySelector?.("[data-provider-suggestion-card]");
  const target = firstCard ?? suggestionBox;

  window.setTimeout(() => {
    target?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
    firstCard?.focus?.({ preventScroll: true });
  }, 80);
}

toggleProviderSuggestion(source = null) {
  const card = source?.closest?.("[data-provider-suggestion-card]");
  if (!card) return;

  card.classList.toggle("is-selected");
  card.setAttribute("aria-pressed", card.classList.contains("is-selected") ? "true" : "false");
  this.syncProviderSelectedCategories(card.closest("form"));

  if (card.classList.contains("is-selected")) {
    this.showToast("Perfecto. Podes elegir mas de una opcion.", "success");
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
  const suggestionBox = form?.querySelector?.("#providerAiSuggestions");

  try {
    actions.setLoading(true);
    this.setButtonBusy(trigger, true, "Buscando...");
    promptInput?.blur?.();
    const result = await resolveServiceIntent(text, { limit: 5 });
    const matches = this.mergeProviderCategorySuggestions(
      Array.isArray(result?.matches) ? result.matches : [],
      this.localProviderCategorySuggestions(text)
    );
    const top = matches[0] ?? null;

    if (!top) {
      if (suggestionBox) {
        suggestionBox.innerHTML = "";
        suggestionBox.hidden = true;
      }
      if (emptyBox) {
        emptyBox.hidden = false;
        emptyBox.textContent = "No encontramos una coincidencia clara. Proba describirlo con mas detalle, por ejemplo: pinto casas, cuido adultos mayores, hago electricidad domiciliaria.";
      }
      this.showToast("No encontramos una coincidencia clara. Proba con mas detalle.", "info");
      return;
    }

    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = this.providerTitleFromPrompt(text, top.name);
    }
    if (summaryInput && !summaryInput.value.trim()) {
      summaryInput.value = `${top.name}: ${text}`.slice(0, 140);
    }
    if (descriptionInput && !descriptionInput.value.trim()) {
      descriptionInput.value = text.slice(0, 220);
    }

    this.renderProviderSuggestionCards(form, matches, text);

    this.showToast("Listo. Bajamos a las opciones sugeridas.", "info");
  } catch (err) {
    console.warn("[MIMI] Sugerencia provider fallback:", err);
    const matches = this.localProviderCategorySuggestions(text);
    if (!matches.length) {
      if (emptyBox) {
        emptyBox.hidden = false;
        emptyBox.textContent = "No encontramos una coincidencia clara. Proba describirlo con mas detalle.";
      }
      this.showToast("No pudimos sugerir rubros ahora. Proba con mas detalle.", "info");
      return;
    }
    this.renderProviderSuggestionCards(form, matches, text, { fallback: true });
    this.showToast("Usamos sugerencias locales. Elegi una o varias.", "info");
  } finally {
    this.setButtonBusy(trigger, false);
    actions.setLoading(false);
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
  const categories = this.state?.appConfig?.categories ?? [];
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
  const categories = this.state?.appConfig?.categories ?? [];
  const categoryByCode = new Map(categories.map((category) => [String(category.code ?? "").toUpperCase(), category]));
  const blueprintMatches = [];

  for (const blueprint of this.providerIntentBlueprints()) {
    const hitCount = blueprint.terms.filter((term) => normalized.includes(this.normalizeText(term))).length;
    if (!hitCount) continue;

    blueprint.codes.forEach((code, index) => {
      const category = categoryByCode.get(code);
      if (!category) return;
      blueprintMatches.push({
        ...category,
        category_id: category.id,
        localScore: hitCount * 14 - index,
        score: hitCount * 14 - index
      });
    });
  }

  const keywordMatches = categories
    .map((category) => {
      const haystack = this.normalizeText([
        category.name,
        category.description,
        ...(category.aliases ?? []),
        ...(category.search_keywords ?? [])
      ].join(" "));
      const score = normalized
        .split(" ")
        .filter((word) => word.length >= 3 && haystack.includes(word)).length;

      return { ...category, category_id: category.id, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return this.mergeProviderCategorySuggestions(blueprintMatches, keywordMatches);
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

    try {
        await invokeFunction("svc-track-location", {
        request_id: service.requestId,
        lat: loc.lat,
        lng: loc.lng,
         accuracy: loc.accuracy ?? null,
        heading: loc.heading ?? null,
        speed: loc.speed ?? null
      });
    } catch (err) {
      console.warn("[MIMI] Error tracking location:", err);
    }
  }, 10000);
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

      const response = await invokeFunction("svc-provider-respond-offer", {
        offer_id: offer.id,
        accepted: true
      });

      const service = response?.service ?? response?.request ?? response?.data ?? null;

      if (!service) {
        throw new Error("La funcin no devolvi response.service");
      }

      actions.setActiveService(this.normalizeServiceForState(service));
      actions.clearActiveOffer();
      actions.setProviderStatus("BOOKED_UPCOMING");

      if (this.offerTimer) {
        clearInterval(this.offerTimer);
        this.offerTimer = null;
      }

      this.showToast("Servicio aceptado ", "success");
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
          await this.applyServiceTransition(
            "svc-start-service",
            "IN_SERVICE",
            "Servicio iniciado"
          );
          break;

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
          this.showToast("Servicio completado", "success");
          break;
        }

        default:
          console.warn("[MIMI] Estado de servicio no manejado:", service.status);
      }
    } catch (err) {
      console.error("[MIMI] Error updating service:", err);
      this.showToast("Error actualizando servicio", "error");
    } finally {
      actions.setLoading(false);
    }
  }

  /**
   * Send chat message
   */
  sendChatMessage() {
    const input = this.elements.chatInput;
    const text = input?.value.trim();
    
    if (!text) return;

    const message = {
      id: Date.now(),
      text,
      type: 'outgoing',
      timestamp: Date.now()
    };

    actions.addMessage(message);
    input.value = '';
    
this.renderChatMessages();
  }

  /**
   * Render chat messages
   */
  renderChatMessages() {
    const container = this.elements.chatMessages;
    if (!container) return;

    const messages = this.state?.chat.messages || [];
    container.innerHTML = messages.map(msg => `
      <div class="chat-message ${msg.type}">
        ${msg.text}
        <div class="chat-message-time">
          ${new Date(msg.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `).join('');
    
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
          <p>No tens servicios programados</p>
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
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">En revisin</span>';
    btn.textContent = "Ver estado";
  } else if (status === "rejected") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Requiere correccin</span>';
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
    this.elements.servicesChips.innerHTML = categories.length
      ? categories
          .map(
            (item) => `
              <span class="service-chip active">
                ${item.name || item.code || "Servicio"}
              </span>
            `
          )
          .join("")
      : `<span class="service-chip">Sin servicios activos</span>`;
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
        <span class="online-button-text">Ponerme en lnea</span>
        <span class="online-button-subtext">Para recibir servicios</span>
      </button>
    `;

    this.elements.goOnlineButton = document.getElementById("goOnlineButton");

    this.elements.goOnlineButton?.addEventListener("click", () => {
      this.handleGoOnline();
    });
  }

  container.removeAttribute("style");

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

    if (this.elements.offerCard) {
      this.elements.offerCard.hidden = false;
      
      if (this.elements.offerService) {
        this.elements.offerService.textContent = offer.serviceType;
      }
      if (this.elements.offerLocation) {
        this.elements.offerLocation.textContent = offer.location;
      }
      if (this.elements.offerClient) {
        this.elements.offerClient.textContent = `Cliente: ${offer.clientName}`;
      }
      if (this.elements.offerPrice) {
        this.elements.offerPrice.textContent = offer.price 
          ? `$${offer.price.toLocaleString('es-AR')} estimado`
          : 'Precio a convenir';
      }
    }

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
        this.elements.activeServiceLocation.textContent = service.location;
      }
      if (this.elements.activeServiceClient) {
        this.elements.activeServiceClient.textContent = service.clientName;
      }
      
      // Button text
      const buttonLabels = {
        'ACCEPTED': 'Llegu al domicilio',
        'PROVIDER_EN_ROUTE': 'Llegu al domicilio',
        'PROVIDER_ARRIVED': 'Iniciar servicio',
        'IN_PROGRESS': 'Finalizar servicio'
      };
      
      if (this.elements.serviceActionBtn) {
        this.elements.serviceActionBtn.textContent = buttonLabels[serviceStatus] || 'Accin';
      }
    }
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
            <p>No tens notificaciones</p>
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

      this.notificationRealtimeChannel?.unsubscribe?.();
      this.offerRealtimeChannel?.unsubscribe?.();
      this.realtimeChannel?.unsubscribe?.();

      if (userId) {
        this.notificationRealtimeChannel = supabase
          .channel(`mimi-services-provider-notifications-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "svc_notifications",
              filter: `user_id=eq.${userId}`
            },
            (payload) => this.onNotification(payload)
          )
          .subscribe((status) => console.log("[MIMI] Notifications realtime:", status));
      }

      if (providerId) {
        this.offerRealtimeChannel = supabase
          .channel(`mimi-services-provider-offers-${providerId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "svc_request_offers",
              filter: `provider_id=eq.${providerId}`
            },
            (payload) => this.onOfferChange(payload)
          )
          .subscribe((status) => console.log("[MIMI] Offers realtime:", status));
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

    this.showToast(normalized.title || "Nueva notificacin", "info");
  }

  onOfferChange(payload) {
    const eventType = payload?.eventType;
    const row = payload?.new ?? payload?.old;
    if (!row) return;

    const status = String(row.status ?? "").toUpperCase();

    if (eventType === "DELETE" || ["EXPIRED", "REJECTED", "CANCELLED", "ACCEPTED_BY_OTHER"].includes(status)) {
      if (this.state?.activeOffer?.id === row.id) {
        actions.clearActiveOffer();
      }
      return;
    }

    if (["PENDING", "PENDING_PROVIDER_RESPONSE"].includes(status)) {
      actions.setActiveOffer(this.normalizeOfferForState(row));
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

hideInstallBanner() {
  if (!this.elements?.installBanner) return;

  this.elements.installBanner.hidden = true;
  this.elements.installBanner.style.setProperty("display", "none", "important");
  this.elements.installBanner.style.opacity = "0";
  this.elements.installBanner.style.pointerEvents = "none";
  this.elements.installBanner.setAttribute("aria-hidden", "true");
}

setupInstallPrompt() {
  if (this.isRunningAsInstalledPwa()) {
    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;
    localStorage.setItem("mimi_services_pwa_installed", "true");
    this.hideInstallBanner();
    return;
  }

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

    actions.updateState({
      ui: {
        installPrompt: e
      }
    });

const installDismissed =
  localStorage.getItem("mimi_services_install_banner_dismissed") === "true";

const isAuthenticated =
  document.body.classList.contains("provider-authenticated") ||
  Boolean(this.state?.session?.isAuthenticated);

if (this.elements.installBanner && !installDismissed && isAuthenticated && !this.isRunningAsInstalledPwa()) {
  this.elements.installBanner.hidden = false;
  this.elements.installBanner.style.display = "";
} else if (this.elements.installBanner) {
  this.hideInstallBanner();
}
    console.log("[MIMI] PWA install prompt listo");
  });

  window.addEventListener("appinstalled", () => {
    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;

    actions.updateState({
      ui: {
        installPrompt: null
      }
    });

    if (this.elements.installBanner) {
      this.hideInstallBanner();
    }

    this.showToast("App instalada correctamente", "success");
  });

  window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", () => {
    this.hideInstallBanner();
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
    this.state?.ui?.installPrompt;

  if (!promptEvent) {
    this.showToast("La instalacin an no est disponible. Recarg la pgina e intent de nuevo.", "warning");
    console.warn("[MIMI] No hay beforeinstallprompt guardado");
    return;
  }

  try {
    await promptEvent.prompt();

    const choice = await promptEvent.userChoice;
    console.log("[MIMI] PWA install choice:", choice);

    this.deferredInstallPrompt = null;
    window.deferredInstallPrompt = null;

    actions.updateState({
      ui: {
        installPrompt: null
      }
    });

    if (this.elements.installBanner) {
      this.hideInstallBanner();
    }

    if (choice?.outcome === "accepted") {
      this.showToast("Instalando app...", "success");
    } else {
      this.showToast("Instalacin cancelada", "info");
    }
  } catch (err) {
    console.error("[MIMI] Error instalando PWA:", err);
    this.showToast("No pudimos abrir la instalacin", "error");
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
    await signOut();

    this.state = null;
    this.map = null;

    document.body.classList.remove(
      "provider-authenticated",
      "provider-auth-submitting"
    );

    document.body.classList.add("provider-auth-required");

    this.showProviderLoginGate();
  } catch (err) {
    console.error("[MIMI] logout error:", err);
    this.showToast("No pudimos cerrar sesin", "error");
  }
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

  this.cameraCapture = { documentType, blob: null, file: null };

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

    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: isSelfie ? "user" : { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

const video = this.elements.cameraVideo;

video.setAttribute("playsinline", "");
video.setAttribute("webkit-playsinline", "");
video.muted = true;
video.autoplay = true;
video.srcObject = this.cameraStream;

await new Promise((resolve) => {
  video.onloadedmetadata = resolve;
});

await video.play();
    if (this.elements.cameraStatus) {
      this.elements.cameraStatus.textContent = "Cmara lista";
    }
  } catch (err) {
    console.error("[MIMI] Error abriendo cmara:", err);
    this.closeCameraCapture();
    this.showToast("No pudimos abrir la cmara. Revis permisos del navegador.", "error");
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

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (!blob) {
      this.setButtonBusy(captureButton, false);
      if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
      this.showToast("No pudimos capturar la imagen", "error");
      return;
    }

    const documentType = this.cameraCapture.documentType;
    const fileName = `${documentType}-${Date.now()}.jpg`;

    this.cameraCapture.blob = blob;
    this.cameraCapture.file = new File([blob], fileName, { type: "image/jpeg" });

    video.pause();

    this.setButtonBusy(captureButton, false);
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;
    if (this.elements.cameraCaptureBtn) this.elements.cameraCaptureBtn.hidden = true;
    if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.hidden = false;
    if (this.elements.cameraUseBtn) this.elements.cameraUseBtn.hidden = false;
    if (this.elements.cameraStatus) this.elements.cameraStatus.textContent = "Foto capturada. Confirm o repet.";
  }, "image/jpeg", 0.92);
}

resetCameraPreview() {
  this.cameraCapture.blob = null;
  this.cameraCapture.file = null;
  if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = true;

  if (this.elements.cameraVideo?.srcObject) {
    this.elements.cameraVideo.play().catch(() => {});
  }

  if (this.elements.cameraCaptureBtn) this.elements.cameraCaptureBtn.hidden = false;
  if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.hidden = true;
  if (this.elements.cameraUseBtn) this.elements.cameraUseBtn.hidden = true;
  if (this.elements.cameraStatus) this.elements.cameraStatus.textContent = "Cmara lista";
}

async confirmCameraCapture() {
  const providerId = this.state?.session?.providerId;
  const documentType = this.cameraCapture.documentType;
  const file = this.cameraCapture.file;

  if (!providerId || !documentType || !file) {
    this.showToast("Falta capturar la foto", "warning");
    return;
  }

  try {
    actions.setLoading(true);
    this.setButtonBusy(this.elements.cameraUseBtn, true, "Subiendo...");
    if (this.elements.cameraBusyOverlay) this.elements.cameraBusyOverlay.hidden = false;

    if (this.elements.cameraStatus) {
      this.elements.cameraStatus.textContent = "Subiendo imagen segura...";
    }

const uploadedDocument = await uploadProviderDocument({
  providerId,
  documentType,
  file
});

console.log("[MIMI][KYC] Documento subido:", uploadedDocument);
    
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

    this.showToast("Verificando identidad...", "info");
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
    } else {
      this.showToast("Verificacin enviada correctamente.", "success");
    }

    this.showWizardStep(5);
  } catch (err) {
    console.error("[MIMI] Error en verificacin por cmara:", err);
    this.showToast(err?.message ?? "No pudimos completar la verificacin", "error");
  } finally {
    this.setButtonBusy(this.elements.cameraUseBtn, false);
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
  } finally {
    this.setButtonBusy(trigger, false);
    actions.setLoading(false);
    if (input) input.value = "";
  }
}

closeCameraCapture() {
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

  this.cameraCapture = {
    documentType: null,
    blob: null,
    file: null
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw-2026.js')
      .then(registration => {
        console.log('[MIMI] SW registered:', registration);
        registration.update?.();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener?.('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener?.('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(error => {
        console.log('[MIMI] SW registration failed:', error);
      });
  });
}

// ============================================
// NOTIFICATION PERMISSION
// ============================================

if ('Notification' in window && Notification.permission === 'default') {
  // Request permission after user interaction
  const requestNotificationPermission = () => {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('[MIMI] Notification permission granted');
      }
    });
  };
  
  document.addEventListener('click', requestNotificationPermission, { once: true });
}

// Helper function for offer validation
function isOfferValid(offer) {
  if (!offer) return false;
  if (offer.expiresAt && new Date(offer.expiresAt).getTime() < Date.now()) return false;
  return true;
}
