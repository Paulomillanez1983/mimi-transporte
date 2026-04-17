import {
  bindInstallEvents,
  getPwaInstallState,
  ensureAppServiceWorkerRegistered,
  promptInstall
} from "./pwa-install-manager.js";

const STORAGE_KEYS = {
  dismissed: "mimi_client_install_banner_dismissed_v1",
  locationAsked: "mimi_client_location_prompt_seen_v1"
};

function getBanner() {
  return document.getElementById("clientInstallBanner");
}

function getInstallBtn() {
  return document.getElementById("btnInstallClientApp");
}

function getOpenBrowserBtn() {
  return document.getElementById("btnOpenBrowserGuide");
}

function getDismissBtn() {
  return document.getElementById("btnDismissClientInstall");
}

function getLocationBtn() {
  return document.getElementById("btnEnableClientLocation");
}

function getStatusText() {
  return document.getElementById("clientInstallStatusText");
}

function wasDismissed() {
  return localStorage.getItem(STORAGE_KEYS.dismissed) === "1";
}

function markDismissed() {
  localStorage.setItem(STORAGE_KEYS.dismissed, "1");
}

function resetDismissed() {
  localStorage.removeItem(STORAGE_KEYS.dismissed);
}

function showBanner() {
  const el = getBanner();
  if (!el) return;
  el.hidden = false;
  el.classList.add("is-visible");
}

function hideBanner() {
  const el = getBanner();
  if (!el) return;
  el.classList.remove("is-visible");
  el.hidden = true;
}

function setStatus(message = "") {
  const el = getStatusText();
  if (el) el.textContent = message;
}

function notify(title, body, type = "info", timeout = 3500) {
  if (window.notif?.show) {
    window.notif.show(title, body, type, timeout);
  } else {
    console.log(`[${type}] ${title}: ${body}`);
  }
}

function updateBannerUI() {
  const state = getPwaInstallState();
  const installBtn = getInstallBtn();
  const openBrowserBtn = getOpenBrowserBtn();
  const locationBtn = getLocationBtn();

  if (!getBanner()) return;

  if (!state.isSecureContext) {
    setStatus("La instalación y las notificaciones requieren HTTPS.");
    installBtn && (installBtn.style.display = "none");
    openBrowserBtn && (openBrowserBtn.style.display = "none");
    locationBtn && (locationBtn.style.display = "none");
    showBanner();
    return;
  }

  if (state.installed) {
    hideBanner();
    return;
  }

  if (state.shouldSuggestOpenInBrowser) {
    setStatus("Abrí este enlace en Chrome o Safari para instalar la app.");
    installBtn && (installBtn.style.display = "none");
    openBrowserBtn && (openBrowserBtn.style.display = "inline-flex");
    locationBtn && (locationBtn.style.display = "inline-flex");
    if (!wasDismissed()) showBanner();
    return;
  }

  if (state.canPromptInstall) {
    setStatus("Instalá la app para recibir avisos y entrar más rápido.");
    installBtn && (installBtn.style.display = "inline-flex");
    openBrowserBtn && (openBrowserBtn.style.display = "none");
    locationBtn && (locationBtn.style.display = "inline-flex");
    if (!wasDismissed()) showBanner();
    return;
  }

  setStatus("La app se puede usar desde web, pero conviene instalarla cuando el navegador lo permita.");
  installBtn && (installBtn.style.display = "none");
  openBrowserBtn && (openBrowserBtn.style.display = "none");
  locationBtn && (locationBtn.style.display = "inline-flex");
}

async function requestLocationPermission({ silent = false } = {}) {
  if (!("geolocation" in navigator)) {
    if (!silent) {
      notify("Ubicación no disponible", "Tu navegador no soporta geolocalización.", "warning", 4000);
    }
    return null;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.locationAsked, "1");

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000
      });
    });

    notify("Ubicación activada", "Vamos a usar tu ubicación para agilizar origen y seguimiento.", "success", 3200);

    return {
      latitude: position.coords?.latitude ?? null,
      longitude: position.coords?.longitude ?? null,
      accuracy: position.coords?.accuracy ?? null
    };
  } catch (err) {
    console.warn("[client-pwa-onboarding] ubicación no concedida o falló:", err);

    if (!silent) {
      notify(
        "Ubicación pendiente",
        "Podés seguir usando la app igual y escribir el origen manualmente.",
        "info",
        4200
      );
    }

    return null;
  }
}

async function maybeAskLocationAfterLogin() {
  if (localStorage.getItem(STORAGE_KEYS.locationAsked) === "1") return null;
  return await requestLocationPermission({ silent: false });
}

async function handleInstallClick() {
  const result = await promptInstall();

  if (result.accepted) {
    notify("App instalada", "Listo, ya podés usar MIMI como app.", "success", 3000);
    hideBanner();
    return;
  }

  if (result.reason !== "no-prompt") {
    notify("Instalación pendiente", "No se pudo completar la instalación en este intento.", "warning", 3500);
  }
}

function handleOpenBrowserGuide() {
  notify(
    "Abrí el navegador",
    "En Instagram/Facebook/Messenger abrí el menú y elegí “Abrir en navegador” para poder instalar la app.",
    "info",
    6500
  );
}

function bindBannerEvents() {
  getInstallBtn()?.addEventListener("click", handleInstallClick);
  getOpenBrowserBtn()?.addEventListener("click", handleOpenBrowserGuide);
  getDismissBtn()?.addEventListener("click", () => {
    markDismissed();
    hideBanner();
  });
  getLocationBtn()?.addEventListener("click", async () => {
    await requestLocationPermission({ silent: false });
  });
}

async function initClientPwaOnboarding() {
  bindInstallEvents({ onChange: updateBannerUI });
  bindBannerEvents();
  await ensureAppServiceWorkerRegistered();
  updateBannerUI();
}

async function runClientPostLoginOnboarding(session) {
  if (!session?.user?.id) return;

  resetDismissed();
  await ensureAppServiceWorkerRegistered();
  updateBannerUI();

  if (typeof window.solicitarPermisosClientePostLogin === "function") {
    await window.solicitarPermisosClientePostLogin(session, { forcePrompt: false });
  }

  await maybeAskLocationAfterLogin();
  updateBannerUI();
}

window.initClientPwaOnboarding = initClientPwaOnboarding;
window.runClientPostLoginOnboarding = runClientPostLoginOnboarding;

export {
  initClientPwaOnboarding,
  runClientPostLoginOnboarding,
  requestLocationPermission
};
