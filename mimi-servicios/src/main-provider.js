/**
 * MIMI Servicios - Panel Prestador 2026
 * Main entry point with Uber Driver-style UX
 */

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
  saveProviderWorkspace,
  uploadProviderDocument,
  signOut,
  updateProviderStatus
  } from "./services/service-api.js";


import { renderProviderDashboard } from "./ui/render-provider.js";
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
cameraTitle: document.getElementById("cameraTitle"),
cameraHint: document.getElementById("cameraHint"),
cameraStatus: document.getElementById("cameraStatus"),
cameraCancelBtn: document.getElementById("cameraCancelBtn"),
cameraCaptureBtn: document.getElementById("cameraCaptureBtn"),
cameraRetakeBtn: document.getElementById("cameraRetakeBtn"),
cameraUseBtn: document.getElementById("cameraUseBtn"),
dniFrontStatus: document.getElementById("dniFrontStatus"),
selfieStatus: document.getElementById("selfieStatus"),
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
    renderProviderDashboard(this.state);
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
      const temaOscuro = true;

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
  loadCategories(),
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
        description: category.description
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

    const isVerified = Boolean(profile?.approved) && rejectedDocs === 0 && approvedDocs > 0;
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
        verificationProgress: isVerified ? 100 : documents.length ? 60 : 0,
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
      this.switchTab('account');
      this.showToast('Abr Cuenta para gestionar ayuda y verificacin', 'info');
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
  this.showWizardStep(1);
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
      this.switchTab('account');
      actions.closeDrawer();
    });

    document.getElementById('linkDocuments')?.addEventListener('click', (e) => {
      e.preventDefault();
      actions.openModal('verification');
      actions.closeDrawer();
    });

    document.getElementById('linkServices')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('account');
      actions.closeDrawer();
    });

    document.getElementById('linkEarnings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('pricing');
      actions.closeDrawer();
    });

    document.getElementById('linkSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('account');
      actions.closeDrawer();
    });

    document.getElementById('linkSupport')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.switchTab('account');
      actions.closeDrawer();
    });

document.querySelectorAll("[data-camera-doc]").forEach((btn) => {
  btn.addEventListener("click", () => {
    this.openCameraCapture(btn.dataset.cameraDoc);
  });
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
    this.handleProviderBusinessAction(actionButton.dataset.providerBusinessAction);
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
  this.showToast("Necesits completar tu verificacin primero", "warning");
  actions.openModal("verification");

  setTimeout(() => {
    this.showWizardStep?.(1);
  }, 50);

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
    this.showToast("Necesits completar tu verificacin", "warning");
    actions.openModal("verification");
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
      pricePerHour: data.get(`offering:${index}:pricePerHour`) ?? "",
      baseVisitFee: data.get(`offering:${index}:baseVisitFee`) ?? "",
      fixedPrice: data.get(`offering:${index}:fixedPrice`) ?? "",
      unitName: data.get(`offering:${index}:unitName`) ?? "",
      unitPrice: data.get(`offering:${index}:unitPrice`) ?? "",
      minimumCharge: data.get(`offering:${index}:minimumCharge`) ?? 0,
      minimumHours: data.get(`offering:${index}:minimumHours`) ?? "",
      maximumHours: data.get(`offering:${index}:maximumHours`) ?? "",
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
    city: data.get("providerCity") ?? "",
    province: data.get("providerProvince") ?? "",
    addressText: data.get("providerAddressText") ?? "",
    pricingMode: "HOURLY",
    acceptsImmediate: data.has("acceptsImmediate"),
    acceptsScheduled: data.has("acceptsScheduled"),
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

  if (payload.pricing.some((item) => !Number.isFinite(item.pricePerHour) || item.pricePerHour <= 0)) {
    this.showToast("Cada categoria activa necesita una tarifa de referencia o un trabajo publicado con precio", "warning");
    return;
  }

  if (payload.offerings.some((item) => !item.title || !item.categoryId)) {
    this.showToast("Revisa los trabajos publicados: falta titulo o categoria", "warning");
    return;
  }

  try {
    actions.setLoading(true);
    const workspace = await saveProviderWorkspace(providerId, payload);
    this.applyWorkspaceToState(workspace);
    renderProviderDashboard(this.state);
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

async handleProviderBusinessAction(action) {
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
      renderProviderDashboard(this.state);
      this.showToast("Panel recargado", "success");
    } catch (err) {
      console.error("[MIMI] Error recargando panel:", err);
      this.showToast("No pudimos recargar el panel", "error");
    } finally {
      actions.setLoading(false);
    }
  }
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
  
  if (!card || !statusEl || !btn) return;

  card.classList.toggle("verified", status === "approved");

  if (status === "approved") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Verificado</span>';
    btn.textContent = "Ver documentos";
  } else if (status === "in_review") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">En revisin</span>';
    btn.textContent = "Ver progreso";
  } else if (status === "rejected") {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Requiere correccin</span>';
    btn.textContent = "Repetir fotos";
  } else {
    statusEl.innerHTML = '<span class="status-icon"></span><span class="status-text">Pendiente</span>';
    btn.textContent = "Completar ahora";
  }
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
    this.elements.basePrice.textContent =
      pricing.basePrice > 0
        ? `$${Number(pricing.basePrice).toLocaleString("es-AR")}`
        : "Sin configurar";
  }

  if (this.elements.hourPrice) {
    this.elements.hourPrice.textContent =
      pricing.hourlyRate > 0
        ? `$${Number(pricing.hourlyRate).toLocaleString("es-AR")}`
        : "Sin configurar";
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
    this.elements.sheetBasePrice.textContent = `Base ${money(basePrice)}`;
  }

  if (this.elements.sheetPricingMode) {
    this.elements.sheetPricingMode.textContent =
      pricing.mode === "job" ? "Por trabajo" : "Por hora";
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

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
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

  this.cameraCapture = { documentType, blob: null, file: null };

  if (this.elements.cameraTitle) {
    this.elements.cameraTitle.textContent = isSelfie ? "Selfie de verificacin" : "Foto del DNI";
  }

  if (this.elements.cameraHint) {
    this.elements.cameraHint.textContent = isSelfie
      ? "Centrate dentro del crculo, con buena luz."
      : "Ubic el frente del DNI dentro del rectngulo.";
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

  if (!video || !canvas || !video.videoWidth) {
    this.showToast("La cmara todava no est lista", "warning");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (!blob) {
      this.showToast("No pudimos capturar la imagen", "error");
      return;
    }

    const documentType = this.cameraCapture.documentType;
    const fileName = `${documentType}-${Date.now()}.jpg`;

    this.cameraCapture.blob = blob;
    this.cameraCapture.file = new File([blob], fileName, { type: "image/jpeg" });

    video.pause();

    if (this.elements.cameraCaptureBtn) this.elements.cameraCaptureBtn.hidden = true;
    if (this.elements.cameraRetakeBtn) this.elements.cameraRetakeBtn.hidden = false;
    if (this.elements.cameraUseBtn) this.elements.cameraUseBtn.hidden = false;
    if (this.elements.cameraStatus) this.elements.cameraStatus.textContent = "Foto capturada. Confirm o repet.";
  }, "image/jpeg", 0.92);
}

resetCameraPreview() {
  this.cameraCapture.blob = null;
  this.cameraCapture.file = null;

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
      this.elements.dniFrontStatus.textContent = "Documento recibido ";
    }

    if (documentType === "selfie" && this.elements.selfieStatus) {
      this.elements.selfieStatus.textContent = "Selfie recibida ";
    }

    this.closeCameraCapture();

    if (documentType === "dni_front") {
      this.showToast("DNI recibido. Ahora sacate una selfie.", "success");
      this.showWizardStep(2);
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

    this.showWizardStep(4);
  } catch (err) {
    console.error("[MIMI] Error en verificacin por cmara:", err);
    this.showToast(err?.message ?? "No pudimos completar la verificacin", "error");
  } finally {
    actions.setLoading(false);
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

  if (this.elements.wizardProgress) {
    this.elements.wizardProgress.style.width = `${Math.min(100, stepNumber * 25)}%`;
  }

  if (this.elements.wizardPrev) {
    this.elements.wizardPrev.hidden = stepNumber <= 1;
  }

  if (this.elements.wizardNext) {
    this.elements.wizardNext.textContent = stepNumber >= 4 ? "Cerrar" : "Continuar";
  }
}

handleWizardNext() {
  const activeStep = document.querySelector(".wizard-step.active");
  const current = Number(activeStep?.id?.replace("step", "") ?? 1);

  if (current === 1) {
    this.openCameraCapture("dni_front");
    return;
  }

  if (current === 2) {
    this.openCameraCapture("selfie");
    return;
  }

  if (current >= 4) {
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

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw-2026.js')
      .then(registration => {
        console.log('[MIMI] SW registered:', registration);
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
