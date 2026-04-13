import supabaseAdminService from "./supabase-admin-client.js";

const loginBtn = document.getElementById("googleLoginBtn");
const loginError = document.getElementById("loginError");
const loginLoading = document.getElementById("loginLoading");
const loginLoadingText = document.getElementById("loginLoadingText");
const envHint = document.getElementById("envHint");

let isSubmitting = false;
let initialized = false;

function setError(message = "") {
  if (!loginError) return;
  loginError.textContent = message;
}

function setEnvHint(message = "") {
  if (!envHint) return;
  envHint.textContent = message;
}

function setLoading(isLoading, message = "Procesando...") {
  isSubmitting = isLoading;

  if (loginLoading) {
    loginLoading.classList.toggle("hidden", !isLoading);
  }

  if (loginLoadingText) {
    loginLoadingText.textContent = message;
  }

  if (loginBtn) {
    loginBtn.disabled = isLoading;
    loginBtn.setAttribute("aria-busy", isLoading ? "true" : "false");
  }
}

function redirectToPanel() {
  window.location.href = "./admin-panel.html";
}

async function verifyExistingAccess() {
  setError("");
  setLoading(true, "Verificando sesión...");

  try {
    const ready = await supabaseAdminService.init();

    if (!ready) {
      throw new Error("No pudimos inicializar Supabase.");
    }

    setEnvHint("Supabase listo.");

    const result = await supabaseAdminService.waitForActiveAdmin(3200);

    if (result?.ok) {
      setLoading(true, "Redirigiendo al panel...");
      redirectToPanel();
      return;
    }

    if (result?.reason === "no_session") {
      setLoading(false);
      setEnvHint("Listo para iniciar sesión.");
      return;
    }

    if (result?.reason === "not_admin") {
      setLoading(false);
      setError("Tu cuenta inició sesión, pero no tiene permisos de administrador activos.");
      setEnvHint("Acceso restringido.");
      try {
        await supabaseAdminService.signOut();
      } catch (err) {
        console.warn("[admin-login.signOut.notAdmin]", err);
      }
      return;
    }

    if (result?.reason === "admin_lookup_error") {
      setLoading(false);
      setError("No pudimos validar permisos de administrador. Probá nuevamente.");
      setEnvHint("Error al consultar permisos.");
      return;
    }

    if (result?.reason === "init_failed") {
      setLoading(false);
      setError("No pudimos inicializar Supabase.");
      setEnvHint("Falló la inicialización.");
      return;
    }

    setLoading(false);
    setError("No pudimos validar tu acceso.");
    setEnvHint("Error inesperado.");
  } catch (err) {
    console.error("[admin-login.verifyExistingAccess]", err);
    setLoading(false);
    setError(err instanceof Error ? err.message : "Ocurrió un error al verificar la sesión.");
    setEnvHint("Error de verificación.");
  }
}

async function handleGoogleLogin() {
  if (isSubmitting) return;

  setError("");
  setLoading(true, "Abriendo Google...");
  setEnvHint("Iniciando OAuth con Google...");

  try {
    const ready = await supabaseAdminService.init();

    if (!ready) {
      throw new Error("No pudimos inicializar Supabase.");
    }

    await supabaseAdminService.signInWithGoogle();
  } catch (err) {
    console.error("[admin-login.handleGoogleLogin]", err);
    setLoading(false);
    setError(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google.");
    setEnvHint("Login cancelado o con error.");
  }
}

function bindEvents() {
  if (initialized) return;
  initialized = true;

  loginBtn?.addEventListener("click", handleGoogleLogin);

  window.addEventListener("pageshow", () => {
    if (!document.hidden) {
      verifyExistingAccess();
    }
  });

  window.addEventListener("focus", () => {
    if (!document.hidden) {
      verifyExistingAccess();
    }
  });
}

async function init() {
  bindEvents();
  await verifyExistingAccess();
}

init();
