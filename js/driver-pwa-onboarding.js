import {
  bindInstallEvents,
  getPwaInstallState,
  ensureAppServiceWorkerRegistered,
  promptInstall
} from "./pwa-install-manager.js";

const STORAGE_KEYS = {
  dismissed: "mimi_driver_install_banner_dismissed_v1"
};

function getBanner() {
  return document.getElementById("driverInstallBanner");
}

function getInstallBtn() {
  return document.getElementById("btnInstallDriverApp");
}

function getOpenBrowserBtn() {
  return document.getElementById("btnOpenDriverBrowserGuide");
}

function getDismissBtn() {
  return document.getElementById("btnDismissDriverInstall");
}

function getStatusText() {
  return document.getElementById("driverInstallStatusText");
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
  if (window.uiController?.showToast) {
    window.uiController.showToast(body, type, timeout);
  } else {
    console.log(`[${type}] ${title}: ${body}`);
  }
}

function updateBannerUI() {
  const state = getPwaInstallState();
  const installBtn = getInstallBtn();
  const openBrowserBtn = getOpenBrowserBtn();

  if (!getBanner()) return;

  if (!state.isSecureContext) {
    setStatus("La instalación y las notificaciones requieren HTTPS.");
    installBtn && (installBtn.style.display = "none");
    openBrowserBtn && (openBrowserBtn.style.display = "none");
    showBanner();
    return;
  }

  if (state.installed) {
    hideBanner();
    return;
  }

  if (state.shouldSuggestOpenInBrowser) {
    setStatus("Abrí este enlace en Chrome o Safari para instalar la app del chofer.");
    installBtn && (installBtn.style.display = "none");
    openBrowserBtn && (openBrowserBtn.style.display = "inline-flex");
    if (!wasDismissed()) showBanner();
    return;
  }

  if (state.canPromptInstall) {
    setStatus("Instalá la app del chofer para recibir viajes y abrir más rápido.");
    installBtn && (installBtn.style.display = "inline-flex");
    openBrowserBtn && (openBrowserBtn.style.display = "none");
    if (!wasDismissed()) showBanner();
    return;
  }

  setStatus("Podés usarla desde web, pero conviene instalarla cuando el navegador lo permita.");
  installBtn && (installBtn.style.display = "none");
  openBrowserBtn && (openBrowserBtn.style.display = "none");
}

async function handleInstallClick() {
  try {
    if (navigator.vibrate) navigator.vibrate(18);
  } catch (_) {}

  const result = await promptInstall();

  if (result.accepted) {
    notify("App instalada", "Listo, ya podés usar MIMI Chofer como app.", "success", 3000);
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
    "Si abriste desde Instagram, Facebook o Messenger, elegí “Abrir en navegador” para poder instalar la app.",
    "info",
    6000
  );
}

function bindBannerEvents() {
  getInstallBtn()?.addEventListener("click", handleInstallClick);
  getOpenBrowserBtn()?.addEventListener("click", handleOpenBrowserGuide);
  getDismissBtn()?.addEventListener("click", () => {
    markDismissed();
    hideBanner();
  });
}

async function initDriverPwaOnboarding() {
  bindInstallEvents({ onChange: updateBannerUI });
  bindBannerEvents();
  await ensureAppServiceWorkerRegistered();
  updateBannerUI();
}

async function runDriverPostLoginOnboarding(session) {
  if (!session?.user?.id) return;

  resetDismissed();
  await ensureAppServiceWorkerRegistered();
  updateBannerUI();
}

window.initDriverPwaOnboarding = initDriverPwaOnboarding;
window.runDriverPostLoginOnboarding = runDriverPostLoginOnboarding;

export {
  initDriverPwaOnboarding,
  runDriverPostLoginOnboarding
};
