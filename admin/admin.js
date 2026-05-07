import supabaseAdminService from "./supabase-admin-client.js";

const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");
const logoutBtn = document.getElementById("logout");

const moduleButtons = Array.from(document.querySelectorAll("[data-admin-module]"));
const moduleSections = Array.from(document.querySelectorAll("[data-admin-section]"));
const mobileDockButtons = Array.from(document.querySelectorAll("[data-admin-mobile-view-target]"));

const MOBILE_BREAKPOINT = 980;

function isAdminMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function normalizeMobileView(view = "choferes") {
  const allowed = new Set(["choferes", "providers", "map", "support", "ai"]);
  return allowed.has(view) ? view : "choferes";
}

function setActiveMobileView(view = "choferes") {
  const nextView = normalizeMobileView(view);

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
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (nextView === "map") {
      window.dispatchEvent(new Event("resize"));
      window.mimiAdminMap?.resize?.();
      window.adminMap?.resize?.();
    }
  });
}

function setActiveModule(moduleName = "transport") {
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
      setActiveModule(button.dataset.adminModule || "transport");
    });
  });

  mobileDockButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const view = button.dataset.adminMobileViewTarget || "choferes";
      setActiveMobileView(view);
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

function initAdaptiveTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = () => {
    const saved = localStorage.getItem("mimi-admin-theme");
    const theme = saved || (media.matches ? "dark" : "light");

    document.documentElement.setAttribute("data-theme", theme);

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

function setupMobileViewSync() {
  const sync = () => {
    if (isAdminMobile()) {
      const current = document.body.getAttribute("data-admin-mobile-view") || "choferes";
      setActiveMobileView(current);
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
  const result = await supabaseAdminService.waitForActiveAdmin(3200);

  if (!result?.ok) {
    window.location.href = "./admin-login.html";
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

  setActiveModule("transport");
  setActiveMobileView("choferes");
}

logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

initAdaptiveTheme();
setupDynamicHeader();
setupModuleNavigation();
setupMobileViewSync();
bootstrapAdminShell();
