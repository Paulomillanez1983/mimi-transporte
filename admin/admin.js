import supabaseAdminService from "./supabase-admin-client.js";

const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");
const logoutBtn = document.getElementById("logout");

const moduleButtons = Array.from(document.querySelectorAll("[data-admin-module]"));
const moduleSections = Array.from(document.querySelectorAll("[data-admin-section]"));
const mobileDockButtons = Array.from(document.querySelectorAll("[data-admin-mobile-view-target]"));

let activeModule = "transport";

function setActiveModule(moduleName = "transport") {
  activeModule = moduleName;

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

  mobileDockButtons.forEach((button) => {
    const active = button.dataset.adminMobileViewTarget === moduleName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
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
    button.addEventListener("click", () => {
      setActiveModule(button.dataset.adminMobileViewTarget || "transport");
      window.scrollTo({ top: 0, behavior: "smooth" });
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
async function loadSupportInbox() {
  const session = await supabaseAdminService.refreshSessionIfNeeded();

  if (!session?.access_token) {
    console.warn("[MIMI Admin Support] Sin sesión admin");
    return;
  }

  const res = await fetch(
    `${window.MIMI_ADMIN_ENV.SUPABASE_URL}/functions/v1/admin-list-support-conversations`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    }
  );

  const data = await res.json();

  console.log("[MIMI Admin Support]", data);
  console.table(data.conversations || []);

  return data;
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
  await loadSupportInbox();
}
logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

initAdaptiveTheme();
setupDynamicHeader();
setupModuleNavigation();
bootstrapAdminShell();
