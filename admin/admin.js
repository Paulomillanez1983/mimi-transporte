import supabaseAdminService from "./supabase-admin-client.js";

const API_URL =
  "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/admin-review-driver";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM";

const driversContainer = document.getElementById("drivers");
const logoutBtn = document.getElementById("logout");
const reloadBtn = document.getElementById("reloadBtn");
const emailEl = document.getElementById("email");
const avatarEl = document.getElementById("avatar");
const searchInput = document.getElementById("searchInput");
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));

const metricTotal = document.getElementById("metricTotal");
const metricPending = document.getElementById("metricPending");
const metricApproved = document.getElementById("metricApproved");
const metricRejected = document.getElementById("metricRejected");
const metricBlocked = document.getElementById("metricBlocked");

const modal = document.getElementById("driverModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalTitle = document.getElementById("driverModalTitle");
const modalSubtitle = document.getElementById("driverModalSubtitle");
const modalSummary = document.getElementById("modalSummary");
const modalScore = document.getElementById("modalScore");
const modalDocuments = document.getElementById("modalDocuments");
const modalMapInfo = document.getElementById("modalMapInfo");

const toastContainer = document.getElementById("toastContainer");

let allDrivers = [];
let currentFilter = "ALL";
let currentSearch = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getStatusClass(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "APROBADO") return "approved";
  if (normalized === "RECHAZADO") return "rejected";
  if (normalized === "BLOQUEADO") return "blocked";
  return "pending";
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function getDriverScore(driver) {
  let score = 50;

  if (driver.documents_approved) score += 25;
  if (String(driver.activation_status || "").toUpperCase() === "ACTIVO") score += 15;
  if (String(driver.onboarding_status || "").toUpperCase() === "APROBADO") score += 10;

  if (String(driver.onboarding_status || "").toUpperCase() === "RECHAZADO") score -= 15;
  if (String(driver.onboarding_status || "").toUpperCase() === "BLOQUEADO") score -= 25;

  return Math.max(0, Math.min(100, score));
}

function getScoreLabel(score) {
  if (score >= 85) return "Alto";
  if (score >= 65) return "Medio";
  return "Revisar";
}

function updateMetrics(drivers) {
  const total = drivers.length;
  const pending = drivers.filter(d => (d.onboarding_status || "PENDIENTE_REVISION") === "PENDIENTE_REVISION").length;
  const approved = drivers.filter(d => d.onboarding_status === "APROBADO").length;
  const rejected = drivers.filter(d => d.onboarding_status === "RECHAZADO").length;
  const blocked = drivers.filter(d => d.onboarding_status === "BLOQUEADO").length;

  metricTotal.textContent = String(total);
  metricPending.textContent = String(pending);
  metricApproved.textContent = String(approved);
  metricRejected.textContent = String(rejected);
  metricBlocked.textContent = String(blocked);
}

function filterDrivers(drivers) {
  return drivers.filter((driver) => {
    const status = String(driver.onboarding_status || "PENDIENTE_REVISION").toUpperCase();

    const matchesFilter = currentFilter === "ALL" || status === currentFilter;

    if (!matchesFilter) return false;

    const haystack = normalizeText([
      driver.full_name,
      driver.email,
      driver.phone,
      driver.user_id
    ].join(" "));

    const matchesSearch = !currentSearch || haystack.includes(currentSearch);
    return matchesSearch;
  });
}

function renderDrivers() {
  const filtered = filterDrivers(allDrivers);

  if (!filtered.length) {
    driversContainer.innerHTML = `<div class="empty-state">No encontramos choferes con esos filtros.</div>`;
    return;
  }

  driversContainer.innerHTML = filtered.map((driver) => {
    const status = driver.onboarding_status || "PENDIENTE_REVISION";
    const noteValue = driver.review_notes || "";
    const score = getDriverScore(driver);

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
          <span>Score: ${score}/100</span>
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
          <button class="btn secondary" data-open-driver="${driver.user_id}">Ver detalle</button>
        </div>
      </article>
    `;
  }).join("");
}

function openDriverModal(driver) {
  const score = getDriverScore(driver);

  modalTitle.textContent = driver.full_name || "Chofer sin nombre";
  modalSubtitle.textContent = driver.email || driver.user_id || "";

  modalSummary.innerHTML = `
    <div class="summary-grid">
      <div><strong>user_id:</strong><br>${escapeHtml(driver.user_id || "-")}</div>
      <div><strong>Teléfono:</strong><br>${escapeHtml(driver.phone || "-")}</div>
      <div><strong>Onboarding:</strong><br>${escapeHtml(driver.onboarding_status || "-")}</div>
      <div><strong>Activación:</strong><br>${escapeHtml(driver.activation_status || "-")}</div>
      <div><strong>Documentos aprobados:</strong><br>${driver.documents_approved ? "Sí" : "No"}</div>
      <div><strong>Revisado:</strong><br>${escapeHtml(driver.reviewed_at || "-")}</div>
    </div>
  `;

  modalScore.innerHTML = `
    <div class="score-pill">
      <strong>${score}/100</strong>
      <span>${getScoreLabel(score)}</span>
    </div>
    <p class="score-help">
      Este score es visual/manual. Si después conectás Rekognition / Vision / OCR, acá reemplazamos por score real.
    </p>
  `;

  const possibleDocs = [
    { label: "DNI frente", url: driver.dni_front_url || driver.document_front_url || null },
    { label: "DNI dorso", url: driver.dni_back_url || driver.document_back_url || null },
    { label: "Licencia", url: driver.license_url || driver.license_front_url || null },
    { label: "Selfie", url: driver.selfie_url || null }
  ];

  modalDocuments.innerHTML = possibleDocs.map((doc) => {
    if (!doc.url) {
      return `
        <article class="doc-card empty">
          <strong>${escapeHtml(doc.label)}</strong>
          <span>No disponible</span>
        </article>
      `;
    }

    return `
      <article class="doc-card">
        <strong>${escapeHtml(doc.label)}</strong>
        <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">Abrir archivo</a>
      </article>
    `;
  }).join("");

  const lat = driver.last_lat ?? driver.lat ?? null;
  const lng = driver.last_lng ?? driver.lng ?? null;

  modalMapInfo.innerHTML = lat != null && lng != null
    ? `<div class="map-coords">Lat: ${escapeHtml(lat)}<br>Lng: ${escapeHtml(lng)}</div>`
    : `<div class="empty-state">No hay coordenadas disponibles para este chofer.</div>`;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeDriverModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function bootstrap() {
  const result = await supabaseAdminService.requireActiveAdmin();

  if (!result.ok) {
    window.location.href = "./admin-login.html";
    return;
  }

  emailEl.textContent = result.user?.email || result.admin?.email || "";
  avatarEl.src = result.user?.user_metadata?.avatar_url || "../assets/icons/logo-mimi.png";

  await loadDrivers();
}

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
        reviewed_at,
        dni_front_url,
        dni_back_url,
        license_url,
        license_front_url,
        selfie_url,
        document_front_url,
        document_back_url,
        lat,
        lng,
        last_lat,
        last_lng
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    allDrivers = Array.isArray(data) ? data : [];
    updateMetrics(allDrivers);
    renderDrivers();
  } catch (err) {
    console.error("[admin.loadDrivers]", err);
    driversContainer.innerHTML = `
      <div class="empty-state error">
        No pudimos cargar los choferes.
      </div>
    `;
    showToast("No pudimos cargar choferes", "error");
  }
}

async function reviewDriver(driverId, action, button) {
  try {
    const session = await supabaseAdminService.getSession();

    if (!session?.access_token) {
      throw new Error("Sesión expirada. Volvé a iniciar sesión.");
    }

    const noteEl = document.getElementById(`note-${driverId}`);
    const note = noteEl?.value?.trim() || "";

    if (button) button.disabled = true;

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

    showToast("✔ Acción realizada", "success");
    await loadDrivers();
  } catch (err) {
    console.error("[admin.reviewDriver]", err);
    showToast(err instanceof Error ? err.message : "Error inesperado", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

driversContainer?.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-driver-id][data-action]");
  if (actionButton) {
    const driverId = actionButton.getAttribute("data-driver-id");
    const action = actionButton.getAttribute("data-action");
    if (driverId && action) {
      await reviewDriver(driverId, action, actionButton);
    }
    return;
  }

  const detailButton = event.target.closest("button[data-open-driver]");
  if (detailButton) {
    const driverId = detailButton.getAttribute("data-open-driver");
    const driver = allDrivers.find((d) => d.user_id === driverId);
    if (driver) openDriverModal(driver);
  }
});

searchInput?.addEventListener("input", (event) => {
  currentSearch = normalizeText(event.target.value);
  renderDrivers();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter || "ALL";
    renderDrivers();
  });
});

logoutBtn?.addEventListener("click", async () => {
  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

reloadBtn?.addEventListener("click", async () => {
  await loadDrivers();
});

closeModalBtn?.addEventListener("click", closeDriverModal);
modal?.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-modal='true']");
  if (close) closeDriverModal();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDriverModal();
});

bootstrap();
