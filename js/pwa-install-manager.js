const PWA_STATE = {
  deferredPrompt: null,
  installed: false,
  listenersBound: false
};

function getAppBasePath() {
  const path = window.location.pathname || "/";
  return path.endsWith("/") ? path : path.replace(/[^/]*$/, "");
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isSecureContextCompat() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
}

function isAndroid() {
  return /android/i.test(window.navigator.userAgent || "");
}

function isFacebookInApp() {
  return /\bFBAN|FBAV|Instagram|Messenger\b/i.test(window.navigator.userAgent || "");
}

function isTikTokInApp() {
  return /\bTikTok\b/i.test(window.navigator.userAgent || "");
}

function isGenericEmbeddedBrowser() {
  const ua = window.navigator.userAgent || "";
  return (
    /\bwv\b/i.test(ua) ||
    /; wv\)/i.test(ua) ||
    /\bLine\b/i.test(ua) ||
    /\bMiuiBrowser\b/i.test(ua) ||
    /\bInstagram\b/i.test(ua) ||
    /\bFBAN|FBAV|Messenger\b/i.test(ua) ||
    /\bTikTok\b/i.test(ua)
  );
}

function isInstallSupportedBrowser() {
  return "BeforeInstallPromptEvent" in window || "onbeforeinstallprompt" in window;
}

function shouldSuggestOpenInBrowser() {
  if (isStandalone()) return false;
  if (isFacebookInApp() || isTikTokInApp() || isGenericEmbeddedBrowser()) return true;

  // En iOS, Chrome/Edge no disparan beforeinstallprompt para instalar; Safari sí.
  if (isIos()) {
    const ua = window.navigator.userAgent || "";
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
    return !isSafari;
  }

  return false;
}

function bindInstallEvents({ onChange } = {}) {
  if (PWA_STATE.listenersBound) return;
  PWA_STATE.listenersBound = true;

  PWA_STATE.installed = isStandalone();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    PWA_STATE.deferredPrompt = event;
    onChange?.(getPwaInstallState());
  });

  window.addEventListener("appinstalled", () => {
    PWA_STATE.deferredPrompt = null;
    PWA_STATE.installed = true;
    onChange?.(getPwaInstallState());
  });
}

function getPwaInstallState() {
  return {
    installed: isStandalone() || PWA_STATE.installed,
    canPromptInstall: !!PWA_STATE.deferredPrompt,
    shouldSuggestOpenInBrowser: shouldSuggestOpenInBrowser(),
    isSecureContext: isSecureContextCompat(),
    isIos: isIos(),
    isAndroid: isAndroid(),
    appBasePath: getAppBasePath()
  };
}

async function ensureAppServiceWorkerRegistered() {
  if (!("serviceWorker" in navigator)) return null;

  const appBasePath = getAppBasePath();
  const swUrl = `${appBasePath}js/service-worker.js`;

  try {
    const existing = await navigator.serviceWorker.getRegistration(appBasePath);
    if (existing) return existing;

    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: appBasePath
    });

    return registration;
  } catch (err) {
    console.warn("[pwa-install-manager] no se pudo registrar service worker:", err);
    return null;
  }
}

async function promptInstall() {
  const deferred = PWA_STATE.deferredPrompt;
  if (!deferred) return { accepted: false, reason: "no-prompt" };

  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    PWA_STATE.deferredPrompt = null;

    return {
      accepted: choice?.outcome === "accepted",
      outcome: choice?.outcome || "unknown"
    };
  } catch (err) {
    console.warn("[pwa-install-manager] error mostrando prompt de instalación:", err);
    return { accepted: false, reason: "prompt-error", error: err };
  }
}

window.MimiPWAInstall = {
  bindInstallEvents,
  getPwaInstallState,
  ensureAppServiceWorkerRegistered,
  promptInstall,
  isStandalone,
  shouldSuggestOpenInBrowser
};

export {
  bindInstallEvents,
  getPwaInstallState,
  ensureAppServiceWorkerRegistered,
  promptInstall,
  isStandalone,
  shouldSuggestOpenInBrowser
};
