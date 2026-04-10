import supabaseAdminService from "./supabase-admin-client.js";

const API_URL =
  "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/admin-review-driver";

const driversContainer = document.getElementById("drivers");
const logoutBtn = document.getElementById("logout");
const reloadBtn = document.getElementById("reloadBtn");
const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");

const SUPABASE_ANON_KEY = "TU_ANON_KEY";

/* =========================
   UTILS
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusClass(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "APROBADO") return "approved";
  if (normalized === "RECHAZADO") return "rejected";
  if (normalized === "BLOQUEADO") return "blocked";
  return "pending";
}

function showMessage(msg) {
  alert(msg); // después lo mejoramos a toast
}

/* =========================
   INIT
========================= */

async function bootstrap() {
  const result = await supabaseAdminService.requireActiveAdmin();

  if (!result.ok) {
    window.location.href = "./admin-login.html";
    return;
  }

  emailEl.textContent = result.user?.email || result.admin?.email || "";
  avatarEl.src =
    result.user?.user_metadata?.avatar_url || "../assets/icons/logo-mimi.png";

  await loadDrivers();
}

/* =========================
   LOAD DRIVERS
========================= */

async function loadDrivers() {
  try {
    const ready = await supabaseAdminService.init();
    if (!ready || !supabaseAdminService.client) {
      throw new Error("No se pudo inicializar Supabase");
    }

    driversContainer.innerHTML = `<div class="empty-state">Cargando choferes...</div>`;

    const { data, error } = await supabaseAdminService.client
      .from("driver_profiles")
      .select(`
        user_id,
        full_name,
        email,
        phone,
        onboarding_status,
        activation_status,
        documents_approved,
        review_notes,
        created_at,
        reviewed_at
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) {
      driversContainer.innerHTML = `<div class="empty-state">No hay choferes para mostrar.</div>`;
      return;
    }

    driversContainer.innerHTML = data
      .map((driver) => {
        const status = driver.onboarding_status || "PENDIENTE_REVISION";
        const noteValue = driver.review_notes || "";

        return `
        <article class="driver-card">
          <div class="driver-card-top">
            <div>
              <h3>${escapeHtml(driver.full_name || "Chofer sin nombre")}</h3>
              <p>${escapeHtml(driver.email || driver.user_id)}</p>
              <small>${escapeHtml(driver.phone || "")}</small>
            </div>
            <span class="status-badge ${getStatusClass(status)}">
              ${escapeHtml(status)}
            </span>
          </div>

          <div class="driver-meta">
            <span>Activación: ${escapeHtml(driver.activation_status || "-")}</span>
            <span>Docs: ${driver.documents_approved ? "Sí" : "No"}</span>
          </div>

          <textarea
            id="note-${driver.user_id}"
            class="review-note"
            placeholder="Notas de revisión"
          >${escapeHtml(noteValue)}</textarea>

          <div class="driver-actions">
            <button class="btn approve" data-driver-id="${driver.user_id}" data-action="approve">Aprobar</button>
            <button class="btn reject" data-driver-id="${driver.user_id}" data-action="reject">Rechazar</button>
            <button class="btn block" data-driver-id="${driver.user_id}" data-action="block">Bloquear</button>
          </div>
        </article>
      `;
      })
      .join("");
  } catch (err) {
    console.error("[admin.loadDrivers]", err);
    driversContainer.innerHTML = `
      <div class="empty-state error">
        No pudimos cargar los choferes.
      </div>
    `;
  }
}

/* =========================
   REVIEW DRIVER
========================= */

async function reviewDriver(driverId, action) {
  try {
    const session = await supabaseAdminService.getSession();

    if (!session?.access_token) {
      throw new Error("Sesión expirada. Volvé a iniciar sesión.");
    }

    const noteEl = document.getElementById(`note-${driverId}`);
    const note = noteEl?.value?.trim() || "";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        driver_user_id: driverId,
        action,
        review_notes: note
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Error al procesar");
    }

    showMessage("✔ Acción realizada");
    await loadDrivers();
  } catch (err) {
    console.error("[admin.reviewDriver]", err);
    showMessage(err.message || "Error inesperado");
  }
}

/* =========================
   EVENTS
========================= */

driversContainer?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-driver-id][data-action]");
  if (!button) return;

  const driverId = button.getAttribute("data-driver-id");
  const action = button.getAttribute("data-action");

  if (!driverId || !action) return;

  await reviewDriver(driverId, action);
});

logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

reloadBtn?.addEventListener("click", async () => {
  await loadDrivers();
});

/* =========================
   START
========================= */

bootstrap();
