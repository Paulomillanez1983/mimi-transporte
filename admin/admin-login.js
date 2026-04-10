import supabaseAdminService from "./supabase-admin-client.js";

const loginBtn = document.getElementById("loginGoogle");
const loginBtnText = loginBtn?.querySelector(".login-google-btn__text");
const errorEl = document.getElementById("error");
const loadingEl = document.getElementById("loading");

function setError(message = "") {
  if (errorEl) errorEl.textContent = message;
}

function setLoadingMessage(message = "") {
  if (!loadingEl) return;

  if (!message) {
    loadingEl.textContent = "";
    loadingEl.classList.add("hidden");
    return;
  }

  loadingEl.textContent = message;
  loadingEl.classList.remove("hidden");
}

function setLoadingState(isLoading, label = "Ingresar con Google") {
  if (!loginBtn) return;

  loginBtn.disabled = isLoading;
  loginBtn.setAttribute("aria-busy", String(isLoading));

  if (loginBtnText) {
    loginBtnText.textContent = isLoading ? "Ingresando..." : label;
  } else {
    loginBtn.textContent = isLoading ? "Ingresando..." : label;
  }
}

async function handleExistingSession() {
  setError("");
  setLoadingMessage("Verificando acceso...");
  setLoadingState(true);

  const result = await supabaseAdminService.requireActiveAdmin();

  if (result.ok) {
    window.location.href = "./admin-panel.html";
    return;
  }

  if (result.reason === "no_session") {
    setLoadingMessage("");
    setLoadingState(false);
    return;
  }

  if (result.reason === "not_admin") {
    setError("Tu cuenta no tiene permisos de administrador.");
    try {
      await supabaseAdminService.signOut();
    } catch (err) {
      console.error("[admin-login.signOut.notAdmin]", err);
    }
    setLoadingMessage("");
    setLoadingState(false);
    return;
  }

  if (result.reason === "init_failed") {
    setError("No pudimos inicializar Supabase.");
    setLoadingMessage("");
    setLoadingState(false);
    return;
  }

  setError("No pudimos validar tus permisos de administrador.");
  setLoadingMessage("");
  setLoadingState(false);
}

async function handleGoogleLogin() {
  try {
    setError("");
    setLoadingMessage("Redirigiendo a Google...");
    setLoadingState(true);
    await supabaseAdminService.signInWithGoogle();
  } catch (err) {
    console.error("[admin-login.handleGoogleLogin]", err);
    setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    setLoadingMessage("");
    setLoadingState(false);
  }
}

function bindEvents() {
  loginBtn?.addEventListener("click", handleGoogleLogin);

  window.addEventListener("pageshow", () => {
    setLoadingState(false);
    setLoadingMessage("");
  });
}

async function init() {
  bindEvents();
  await handleExistingSession();
}

init();
