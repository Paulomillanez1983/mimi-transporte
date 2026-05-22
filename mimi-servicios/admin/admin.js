import supabaseAdminService from "./supabase-admin-client.js?v=2026.05.15.4";

const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");
const logoutBtn = document.getElementById("logout");
const themeToggleBtn = document.getElementById("adminThemeToggle");
const adminClockEl = document.getElementById("adminClock");
const adminRealtimeShellBadge = document.getElementById("adminRealtimeShellBadge");

const moduleButtons = Array.from(document.querySelectorAll("[data-admin-module]"));
const moduleSections = Array.from(document.querySelectorAll("[data-admin-section]"));
const mobileDockButtons = Array.from(document.querySelectorAll("[data-admin-mobile-view-target]"));

const MOBILE_BREAKPOINT = 980;
const ADMIN_BUILD_VERSION = "2026.05.15.enterprise.3";

function isAdminMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function normalizeMobileView(view = "providers") {
  const allowed = new Set(["providers", "clients", "catalog", "finance", "support"]);
  return allowed.has(view) ? view : "providers";
}

function isLocalVisualPreview() {
  const host = window.location.hostname;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return localHosts.has(host) && new URLSearchParams(window.location.search).has("visual");
}

function setActiveMobileView(view = "providers", options = {}) {
  const nextView = normalizeMobileView(view);
  const shouldScroll = options.scrollToTop === true;

  document.body.setAttribute("data-admin-mobile-view", nextView);

  mobileDockButtons.forEach((button) => {
    const active = button.dataset.adminMobileViewTarget === nextView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  window.dispatchEvent(
    new CustomEvent("mimi-admin:mobile-view-change", {
      detail: { view: nextView }
    })
  );

  requestAnimationFrame(() => {
    if (shouldScroll) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    if (nextView === "map") {
      window.dispatchEvent(new Event("resize"));
      window.mimiAdminMap?.resize?.();
      window.adminMap?.resize?.();
    }
  });
}

function setActiveModule(moduleName = "providers") {
  document.body.setAttribute("data-admin-module", moduleName);

  moduleButtons.forEach((button) => {
    const active = button.dataset.adminModule === moduleName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  moduleSections.forEach((section) => {
    const visible = section.dataset.adminSection === moduleName;
    section.classList.toggle("is-active", visible);
    section.toggleAttribute("hidden", !visible);
  });

  window.dispatchEvent(
    new CustomEvent("mimi-admin:module-change", {
      detail: { module: moduleName }
    })
  );
}

function setupModuleNavigation() {
  moduleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveModule(button.dataset.adminModule || "providers");
    });
  });

  mobileDockButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const view = button.dataset.adminMobileViewTarget || "providers";
      setActiveMobileView(view, { scrollToTop: true });
    });
  });
}

function setupDynamicHeader() {
  const header = document.querySelector(".header");
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle("is-condensed", window.scrollY > 20);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function updateThemeToggleLabel() {
  if (!themeToggleBtn) return;
  const theme = document.documentElement.getAttribute("data-theme") || "light";
  themeToggleBtn.textContent = theme === "dark" ? "Claro" : "Oscuro";
}

function initAdaptiveTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = () => {
    const saved = localStorage.getItem("mimi-admin-theme");
    const theme = saved || (media.matches ? "dark" : "light");

    document.documentElement.setAttribute("data-theme", theme);
    updateThemeToggleLabel();

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", theme === "dark" ? "#0b1220" : "#f5f7fb");
    }
  };

  applyTheme();

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", applyTheme);
  } else if (typeof media.addListener === "function") {
    media.addListener(applyTheme);
  }
}

function setupAdminThemeToggle() {
  if (!themeToggleBtn) return;

  updateThemeToggleLabel();

  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("mimi-admin-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    updateThemeToggleLabel();

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", next === "dark" ? "#0b1220" : "#f5f7fb");
    }
  });
}

function setupAdminClock() {
  if (!adminClockEl) return;

  const tick = () => {
    adminClockEl.textContent = new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  tick();
  window.setInterval(tick, 30000);
}

function setupAdminRealtimeShellBadge() {
  if (!adminRealtimeShellBadge) return;

  const observer = new MutationObserver(() => {
    const supportBadge = document.getElementById("supportRealtimeStatus");
    const state = supportBadge?.dataset?.state || "idle";
    adminRealtimeShellBadge.textContent =
      state === "live" ? "En vivo" :
      state === "connecting" ? "Conectando" :
      state === "degraded" ? "Respaldo" :
      "Preparado";
    adminRealtimeShellBadge.dataset.state = state;
  });

  const observeWhenReady = () => {
    const supportBadge = document.getElementById("supportRealtimeStatus");
    if (!supportBadge) return;
    observer.observe(supportBadge, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-state"]
    });
  };

  observeWhenReady();
  window.addEventListener("DOMContentLoaded", observeWhenReady, { once: true });
}

function setupMobileViewSync() {
  const sync = () => {
    if (isAdminMobile()) {
      const current = document.body.getAttribute("data-admin-mobile-view") || "providers";
      setActiveMobileView(current, { scrollToTop: false });
    } else {
      document.body.removeAttribute("data-admin-mobile-view");
    }
  };

  sync();
  window.addEventListener("resize", sync, { passive: true });
  window.addEventListener("orientationchange", () => {
    setTimeout(sync, 250);
  });
}

async function bootstrapAdminShell() {
  if (isLocalVisualPreview()) {
    document.body.classList.add("admin-preview-mode");

    if (emailEl) {
      emailEl.textContent = "preview@mimigo.local";
    }

    if (avatarEl) {
      avatarEl.src = "../assets/icons/logo-mimi.png";
    }

    setActiveModule("services");
    setActiveMobileView("providers", { scrollToTop: false });
    return;
  }

  const result = await supabaseAdminService.waitForActiveAdmin(3200);

  if (!result?.ok) {
    window.location.href = "/admin";
    return;
  }

  if (emailEl) {
    emailEl.textContent = result.user?.email || result.admin?.email || "";
  }

  if (avatarEl) {
    avatarEl.src =
      result.user?.user_metadata?.avatar_url || "../assets/icons/logo-mimi.png";

    avatarEl.onerror = () => {
      avatarEl.src = "../assets/icons/logo-mimi.png";
    };
  }

  setActiveModule("services");
  setActiveMobileView("providers", { scrollToTop: false });
}

function prioritizeServicesModule() {
  const providers = document.getElementById("servicesProvidersModule");
  const support = document.querySelector(".support-section");
  if (providers && support?.parentNode) {
    support.parentNode.insertBefore(providers, support);
  }
}

logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "/admin";
});

initAdaptiveTheme();
setupAdminThemeToggle();
setupAdminClock();
setupAdminRealtimeShellBadge();
prioritizeServicesModule();
setupDynamicHeader();
setupModuleNavigation();
setupMobileViewSync();
bootstrapAdminShell();

async function checkAdminVersion() {
  try {
    document.querySelectorAll(".admin-update-banner").forEach((banner) => banner.remove());
    const response = await fetch(`/app-version.json?surface=admin&t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) return;
    const data = await response.json();
    const latest = data?.admin?.version;
    if (!latest || latest === ADMIN_BUILD_VERSION) return;
    const dismissKey = `mimi_admin_update_dismissed_${latest}`;
    if (!data?.admin?.force_update && sessionStorage.getItem(dismissKey) === "1") return;

    const banner = document.createElement("div");
    banner.className = "admin-update-banner";
    banner.dataset.critical = data?.admin?.force_update ? "true" : "false";
    banner.innerHTML = `
      <span>${data?.admin?.message || "Hay una actualizacion del panel administrativo disponible."}</span>
      <div>
        <button type="button" data-admin-update-now>Actualizar</button>
        <button type="button" data-admin-update-dismiss aria-label="Cerrar aviso">×</button>
      </div>
    `;
    banner.querySelector("[data-admin-update-now]")?.addEventListener("click", () => {
      window.location.reload();
    });
    banner.querySelector("[data-admin-update-dismiss]")?.addEventListener("click", () => {
      sessionStorage.setItem(dismissKey, "1");
      banner.remove();
    });
    document.body.appendChild(banner);
  } catch (error) {
    console.info("[admin.version] No se pudo verificar actualizacion", error?.message || error);
  }
}

checkAdminVersion();
