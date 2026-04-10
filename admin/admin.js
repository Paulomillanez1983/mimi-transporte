import supabaseAdminService from "./supabase-admin-client.js";

const API_URL =
  "https://xrphpqmutvadjrucqicn.supabase.co/functions/v1/admin-review-driver";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhycGhwcW11dHZhZGpydWNxaWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY5ODgsImV4cCI6MjA4OTk4Mjk4OH0.0nsO3GBevQzMBCvne17I9L5_Yi4VPYiWedxyntLr4uM";

const CORDOBA_CENTER = [-64.1888, -31.4201];
const CORDOBA_ZOOM = 11.7;
const DRIVER_CHANNEL = "mimi-admin-driver-profiles-realtime";

const LIVE_WINDOW_MINUTES = 10;
const RELOAD_DEBOUNCE_MS = 450;
const TOAST_DURATION_MS = 2600;
const SWIPE_TRIGGER_PX = 110;
const SWIPE_MAX_PX = 140;

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

const reviewChart = document.getElementById("reviewChart");
const mapMeta = document.getElementById("mapMeta");
const fitDriversBtn = document.getElementById("fitDriversBtn");
const focusCordobaBtn = document.getElementById("focusCordobaBtn");
const priorityQueue = document.getElementById("priorityQueue");
const aiSummary = document.getElementById("aiSummary");
const liveBadge = document.getElementById("liveBadge");

const modal = document.getElementById("driverModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalDialog = modal?.querySelector(".modal-dialog") || null;
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
let map = null;
let mapMarkers = new Map();
let realtimeChannel = null;
let activeCardTransforms = new WeakMap();
let loadDriversPromise = null;
let realtimeReloadTimer = null;
let lastFocusedElement = null;
let isBootstrapped = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();

  if (!normalized || normalized === "PENDIENTE_REVISION" || normalized === "PENDING") {
    return "PENDIENTE";
  }
  if (normalized === "APPROVED") return "APROBADO";
  if (normalized === "REJECTED") return "RECHAZADO";
  if (normalized === "BLOCKED") return "BLOQUEADO";

  return normalized;
}

function mapFilterToStatus(filter) {
  if (filter === "PENDING") return ["", "PENDIENTE_REVISION", "PENDING", "PENDIENTE"];
  if (filter === "APPROVED") return ["APPROVED", "APROBADO"];
  if (filter === "REJECTED") return ["REJECTED", "RECHAZADO"];
  if (filter === "BLOCKED") return ["BLOCKED", "BLOQUEADO"];
  return null;
}

function getStatusClass(status, isBlocked = false) {
  const normalized = String(status || "").trim().toUpperCase();
  if (isBlocked || normalized === "BLOCKED" || normalized === "BLOQUEADO") return "blocked";
  if (normalized === "APPROVED" || normalized === "APROBADO") return "approved";
  if (normalized === "REJECTED" || normalized === "RECHAZADO") return "rejected";
  return "pending";
}

function isBlockedDriver(driver) {
  const status = String(driver?.review_status || "").trim().toUpperCase();
  return Boolean(driver?.is_blocked) || status === "BLOCKED" || status === "BLOQUEADO";
}

function isApprovedDriver(driver) {
  const status = String(driver?.review_status || "").trim().toUpperCase();
  return status === "APPROVED" || status === "APROBADO";
}

function isRejectedDriver(driver) {
  const status = String(driver?.review_status || "").trim().toUpperCase();
  return status === "REJECTED" || status === "RECHAZADO";
}

function isPendingDriver(driver) {
  const status = String(driver?.review_status || "").trim().toUpperCase();
  return !status || status === "PENDIENTE_REVISION" || status === "PENDING" || status === "PENDIENTE";
}

function hasLocation(driver) {
  return Number.isFinite(Number(driver?.last_lng)) && Number.isFinite(Number(driver?.last_lat));
}

function minutesSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / 60000;
}

function isOnlineDriver(driver) {
  return minutesSince(driver?.last_location_at) <= LIVE_WINDOW_MINUTES && !isBlockedDriver(driver);
}

function getDriverScore(driver) {
  if (Number.isFinite(Number(driver?.ai_score))) {
    return clamp(Number(driver.ai_score), 0, 100);
  }

  let score = 40;

  if (driver?.profile_completed) score += 10;
  if (driver?.documents_approved) score += 22;

  if (driver?.dni_front_url) score += 6;
  if (driver?.dni_back_url) score += 6;
  if (driver?.license_front_url || driver?.license_back_url) score += 8;
  if (driver?.vehicle_insurance_url) score += 4;
  if (driver?.vehicle_registration_url) score += 4;
  if (driver?.selfie_url) score += 6;

  if (String(driver?.activation_status || "").toUpperCase() === "ACTIVO") score += 8;
  if (isApprovedDriver(driver)) score += 10;
  if (isRejectedDriver(driver)) score -= 18;
  if (isBlockedDriver(driver)) score -= 30;

  return clamp(score, 0, 100);
}

function getScoreLabel(score) {
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Confiable";
  if (score >= 55) return "Medio";
  return "Revisar";
}

function getPriorityLabel(driver) {
  if (isBlockedDriver(driver)) return "Bloqueado";
  if (isPendingDriver(driver) && getDriverScore(driver) < 60) return "Riesgo";
  if (isPendingDriver(driver)) return "Pendiente";
  if (isRejectedDriver(driver)) return "Observado";
  return "Normal";
}

function getPriorityValue(driver) {
  let score = 0;

  if (driver?.kyc_status === "HIGH_RISK") score += 100;
  if (driver?.kyc_status === "MANUAL_REVIEW") score += 70;
  if (driver?.kyc_status === "READY_FOR_APPROVAL") score += 10;

  if (driver?.review_required === true) score += 40;
  if (driver?.dni_match === false) score += 30;
  if (driver?.name_match === false) score += 20;
  if (driver?.birth_match === false) score += 20;
  if (driver?.face_detected === false) score += 35;

  if (isPendingDriver(driver)) score += 20;
  if (isBlockedDriver(driver)) score += 40;

  score += Math.max(0, 100 - getDriverScore(driver));

  return score;
}

function getDriverDisplayName(driver) {
  return driver?.full_name || "Chofer sin nombre";
}

function getDriverSubline(driver) {
  return driver?.email || driver?.user_id || "";
}

function getDriverPhone(driver) {
  return driver?.phone || "Sin teléfono";
}

function setLoadingState(message = "Cargando...") {
  if (!driversContainer) return;
  driversContainer.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setErrorState(message = "Ocurrió un error.") {
  if (!driversContainer) return;
  driversContainer.innerHTML = `<div class="empty-state error">${escapeHtml(message)}</div>`;
}

function showToast(message, type = "info") {
  if (!toastContainer) return;

  const existing = Array.from(toastContainer.children);
  if (existing.length >= 4) {
    existing[0]?.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, TOAST_DURATION_MS);
}

function updateLiveBadge() {
  if (!liveBadge) return;
  const onlineCount = allDrivers.filter(isOnlineDriver).length;
  liveBadge.textContent = onlineCount > 0 ? `En vivo · ${onlineCount}` : "En vivo";
}

function updateMetrics(drivers) {
  const total = drivers.length;
  const pending = drivers.filter(isPendingDriver).length;
  const approved = drivers.filter(isApprovedDriver).length;
  const rejected = drivers.filter(isRejectedDriver).length;
  const blocked = drivers.filter(isBlockedDriver).length;

  if (metricTotal) metricTotal.textContent = String(total);
  if (metricPending) metricPending.textContent = String(pending);
  if (metricApproved) metricApproved.textContent = String(approved);
  if (metricRejected) metricRejected.textContent = String(rejected);
  if (metricBlocked) metricBlocked.textContent = String(blocked);

  renderReviewChart({ total, pending, approved, rejected, blocked });
  renderPriorityQueue(drivers);
  renderAiSummary(drivers);
  updateLiveBadge();
}

function renderReviewChart({ total, pending, approved, rejected, blocked }) {
  if (!reviewChart) return;

  const data = [
    { label: "Pendientes", value: pending, className: "bar-pending" },
    { label: "Aprobados", value: approved, className: "bar-approved" },
    { label: "Rechazados", value: rejected, className: "bar-rejected" },
    { label: "Bloqueados", value: blocked, className: "bar-blocked" }
  ];

  const max = Math.max(1, ...data.map((item) => item.value));

  reviewChart.innerHTML = `
    <div class="mini-bars">
      ${data.map((item) => `
        <div class="mini-bar-col">
          <div class="mini-bar-track">
            <div
              class="mini-bar ${item.className}"
              style="height:${Math.max(8, (item.value / max) * 100)}%"
            ></div>
          </div>
          <strong>${item.value}</strong>
          <span>${escapeHtml(item.label)}</span>
        </div>
      `).join("")}
    </div>
    <div class="chart-footer">
      <span>Total revisiones visibles: <strong>${total}</strong></span>
    </div>
  `;
}

function renderPriorityQueue(drivers) {
  if (!priorityQueue) return;

  const top = [...drivers]
    .sort((a, b) => getPriorityValue(b) - getPriorityValue(a))
    .slice(0, 5);

  if (!top.length) {
    priorityQueue.innerHTML = `<div class="empty-state">Sin choferes para mostrar.</div>`;
    return;
  }

  priorityQueue.innerHTML = top.map((driver) => {
    const score = getDriverScore(driver);
    return `
      <button class="queue-item" type="button" data-open-driver="${escapeHtml(driver.user_id)}">
        <div class="queue-item-main">
          <strong>${escapeHtml(getDriverDisplayName(driver))}</strong>
          <span>${escapeHtml(getDriverSubline(driver))}</span>
        </div>
        <div class="queue-item-side">
          <span class="queue-tag ${getStatusClass(driver.review_status, driver.is_blocked)}">
            ${escapeHtml(getPriorityLabel(driver))}
          </span>
          <strong>${score}</strong>
        </div>
      </button>
    `;
  }).join("");
}

function renderAiSummary(drivers) {
  if (!aiSummary) return;

  if (!drivers.length) {
    aiSummary.innerHTML = `<div class="empty-state">Sin datos para IA.</div>`;
    return;
  }

  const avgScore = Math.round(
    drivers.reduce((acc, driver) => acc + Number(driver.ai_score || getDriverScore(driver)), 0) /
    Math.max(drivers.length, 1)
  );

  const readyForApproval = drivers.filter((d) => d.kyc_status === "READY_FOR_APPROVAL").length;
  const manualReview = drivers.filter((d) => d.kyc_status === "MANUAL_REVIEW").length;
  const highRisk = drivers.filter((d) => d.kyc_status === "HIGH_RISK").length;
  const reviewRequiredCount = drivers.filter((d) => d.review_required === true).length;

  aiSummary.innerHTML = `
    <div class="ai-kpi-grid">
      <div class="ai-kpi">
        <span>Score promedio</span>
        <strong>${avgScore}</strong>
      </div>
      <div class="ai-kpi">
        <span>Listos para aprobar</span>
        <strong>${readyForApproval}</strong>
      </div>
      <div class="ai-kpi">
        <span>Revisión manual</span>
        <strong>${manualReview}</strong>
      </div>
      <div class="ai-kpi">
        <span>Riesgo alto</span>
        <strong>${highRisk}</strong>
      </div>
    </div>
    <p class="ai-help">
      ${reviewRequiredCount} choferes todavía requieren revisión manual.
    </p>
  `;
}

function filterDrivers(drivers) {
  return drivers.filter((driver) => {
    const haystack = normalizeText([
      driver?.full_name,
      driver?.email,
      driver?.phone,
      driver?.user_id
    ].join(" "));

    const allowedStatuses = mapFilterToStatus(currentFilter);
    const normalizedStatus = String(driver?.review_status || "").trim().toUpperCase();

    const matchesFilter = currentFilter === "ALL"
      ? true
      : currentFilter === "BLOCKED"
        ? isBlockedDriver(driver)
        : Array.isArray(allowedStatuses) && allowedStatuses.includes(normalizedStatus);

    if (!matchesFilter) return false;

    return !currentSearch || haystack.includes(currentSearch);
  });
}

function createDriverCard(driver) {
  const score = getDriverScore(driver);
  const scoreLabel = getScoreLabel(score);
  const statusText = formatStatus(driver.review_status);
  const statusClass = getStatusClass(driver.review_status, driver.is_blocked);
  const online = isOnlineDriver(driver);
  const noteValue = escapeHtml(driver.review_notes || "");
  const driverId = escapeHtml(driver.user_id);

  return `
  <article class="driver-card premium-card" data-driver-card data-driver-id="${driverId}">
    <div class="swipe-bg swipe-bg-left">Rechazar</div>
    <div class="swipe-bg swipe-bg-right">Aprobar</div>

    <div class="driver-card-surface">
  
        <div class="driver-card-top">
          <div class="driver-identity">
            <div class="driver-avatar">
              ${escapeHtml((getDriverDisplayName(driver).trim().charAt(0) || "C").toUpperCase())}
            </div>

            <div>
              <h3>${escapeHtml(getDriverDisplayName(driver))}</h3>
              <p>${escapeHtml(getDriverSubline(driver))}</p>
              <small>${escapeHtml(getDriverPhone(driver))}</small>
            </div>
          </div>

          <div class="driver-top-side">
            <span class="status-badge ${statusClass}">
              ${escapeHtml(statusText)}
            </span>
            <span class="online-badge ${online ? "is-online" : "is-offline"}">
              ${online ? "En vivo" : "Sin señal"}
            </span>
          </div>
        </div>

        <div class="driver-meta premium-meta">
          <span>Activación: ${escapeHtml(driver.activation_status || "-")}</span>
          <span>Docs: ${driver.documents_approved ? "OK" : "Pendiente"}</span>
          <span>Score IA: ${score}/100</span>
          <span>KYC: ${escapeHtml(driver.kyc_status || "-")}</span>
          <span>Review: ${driver.review_required ? "Sí" : "No"}</span>
          <span>${escapeHtml(scoreLabel)}</span>
        </div>

        <div class="driver-progress">
          <div class="driver-progress-track">
            <div class="driver-progress-fill" style="width:${score}%"></div>
          </div>
        </div>

        <textarea
          id="note-${driverId}"
          class="review-note"
          placeholder="Notas de revisión"
        >${noteValue}</textarea>

        <div class="driver-actions premium-actions">
          <button class="btn approve" data-driver-id="${driverId}" data-action="approve">Aprobar</button>
          <button class="btn reject" data-driver-id="${driverId}" data-action="reject">Rechazar</button>
          <button class="btn block" data-driver-id="${driverId}" data-action="block">Bloquear</button>
          <button class="btn secondary" data-open-driver="${driverId}">Ver detalle</button>
        </div>
      </div>
    </article>
  `;
}

function renderDrivers() {
  if (!driversContainer) return;

  const filtered = filterDrivers(allDrivers);

  if (!filtered.length) {
    driversContainer.innerHTML = `<div class="empty-state">No encontramos choferes con esos filtros.</div>`;
    syncMap(filtered);

    window.setTimeout(() => map?.resize(), 120);
    window.setTimeout(() => map?.resize(), 300);
    return;
  }

  driversContainer.innerHTML = filtered.map(createDriverCard).join("");
  enableSwipeCards();
  syncMap(filtered);

  window.setTimeout(() => map?.resize(), 120);
  window.setTimeout(() => map?.resize(), 300);
}
function setFilterButtonState(nextFilter) {
  filterButtons.forEach((button) => {
    const isActive = (button.dataset.filter || "ALL") === nextFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function buildDocumentCards(driver) {
  const possibleDocs = [
    { label: "DNI frente", url: driver.dni_front_url || null },
    { label: "DNI dorso", url: driver.dni_back_url || null },
    { label: "Licencia frente", url: driver.license_front_url || null },
    { label: "Licencia dorso", url: driver.license_back_url || null },
    { label: "Seguro", url: driver.vehicle_insurance_url || null },
    { label: "Cédula / registro", url: driver.vehicle_registration_url || null },
    { label: "Selfie", url: driver.selfie_url || null }
  ];

  return possibleDocs.map((doc) => {
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
        <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">
          Abrir archivo
        </a>
      </article>
    `;
  }).join("");
}

function openDriverModal(driver) {
  if (!modal || !modalTitle || !modalSubtitle || !modalSummary || !modalScore || !modalDocuments || !modalMapInfo) {
    return;
  }

  const score = getDriverScore(driver);
  const kycStatus = driver.kyc_status || "PENDIENTE";
  const kycLabel = {
    READY_FOR_APPROVAL: "✅ Listo para aprobar",
    MANUAL_REVIEW: "⚠ Revisión manual",
    HIGH_RISK: "❌ Riesgo alto",
    PENDIENTE: "⏳ Pendiente"
  }[kycStatus] || kycStatus;

  modalTitle.textContent = getDriverDisplayName(driver);
  modalSubtitle.textContent = getDriverSubline(driver);

  modalSummary.innerHTML = `
    <div class="summary-grid">
      <div><strong>user_id:</strong><br>${escapeHtml(driver.user_id || "-")}</div>
      <div><strong>Teléfono:</strong><br>${escapeHtml(driver.phone || "-")}</div>
      <div><strong>Revisión:</strong><br>${escapeHtml(formatStatus(driver.review_status || "-"))}</div>
      <div><strong>Activación:</strong><br>${escapeHtml(driver.activation_status || "-")}</div>
      <div><strong>KYC status:</strong><br>${escapeHtml(driver.kyc_status || "-")}</div>
      <div><strong>Review requerida:</strong><br>${driver.review_required ? "Sí" : "No"}</div>
      <div><strong>Documentos aprobados:</strong><br>${driver.documents_approved ? "Sí" : "No"}</div>
      <div><strong>Última señal:</strong><br>${escapeHtml(formatDate(driver.last_location_at || driver.reviewed_at || "-"))}</div>
    </div>
  `;

  modalScore.innerHTML = `
    <div class="score-panel">
      <div class="score-pill">
        <strong>${score}/100</strong>
        <span>${escapeHtml(getScoreLabel(score))}</span>
      </div>

      <div class="score-breakdown">
        <div><strong>Estado KYC:</strong> ${escapeHtml(kycLabel)}</div>
        <div><strong>Perfil completo:</strong> ${driver.profile_completed ? "Sí" : "No"}</div>
        <div><strong>Docs aprobados:</strong> ${driver.documents_approved ? "Sí" : "No"}</div>
        <div><strong>Selfie:</strong> ${driver.selfie_url ? "Sí" : "No"}</div>
        <div><strong>Rostro detectado:</strong> ${driver.face_detected === true ? "✔ Sí" : driver.face_detected === false ? "❌ No" : "-"}</div>
        <div><strong>DNI match:</strong> ${driver.dni_match === true ? "✔ Sí" : driver.dni_match === false ? "❌ No" : "-"}</div>
        <div><strong>Nombre match:</strong> ${driver.name_match === true ? "✔ Sí" : driver.name_match === false ? "❌ No" : "-"}</div>
        <div><strong>Nacimiento match:</strong> ${driver.birth_match === true ? "✔ Sí" : driver.birth_match === false ? "❌ No" : "-"}</div>
        <div><strong>Review requerida:</strong> ${driver.review_required ? "⚠ Sí" : "✅ No"}</div>
        <div><strong>Estado operativo:</strong> ${isOnlineDriver(driver) ? "En vivo" : "No activo"}</div>
      </div>
    </div>

    <p class="score-help">
      Este score refleja KYC automático, OCR y coincidencias de identidad.
    </p>
  `;

  modalDocuments.innerHTML = buildDocumentCards(driver);

  const lat = Number(driver.last_lat);
  const lng = Number(driver.last_lng);

  modalMapInfo.innerHTML = Number.isFinite(lat) && Number.isFinite(lng)
    ? `
      <div class="map-coords">
        <strong>Ubicación</strong><br>
        Lat: ${escapeHtml(lat.toFixed(6))}<br>
        Lng: ${escapeHtml(lng.toFixed(6))}<br>
        Última actualización: ${escapeHtml(formatDate(driver.last_location_at))}
      </div>
    `
    : `<div class="empty-state">No hay coordenadas disponibles para este chofer.</div>`;

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    modalDialog?.focus();
  });
}

function closeDriverModal() {
  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    requestAnimationFrame(() => lastFocusedElement.focus());
  }
}

function initMap() {
  if (map || !window.maplibregl) return;

  map = new window.maplibregl.Map({
    container: "driversMap",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: CORDOBA_CENTER,
    zoom: CORDOBA_ZOOM,
    attributionControl: true,
    dragRotate: false,
    touchZoomRotate: false
  });

  if (window.innerWidth <= 820) {
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.doubleClickZoom.disable();
  }

  map.addControl(new window.maplibregl.NavigationControl(), "top-right");

  map.on("load", () => {
    map?.resize();

    map.flyTo({
      center: CORDOBA_CENTER,
      zoom: CORDOBA_ZOOM,
      duration: 0
    });

    window.setTimeout(() => map?.resize(), 80);
    window.setTimeout(() => map?.resize(), 220);
  });
}
function buildMarkerElement(driver) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `map-driver-marker marker-${getStatusClass(driver.review_status, driver.is_blocked)} ${isOnlineDriver(driver) ? "marker-live" : ""}`;
  el.title = getDriverDisplayName(driver);
  el.setAttribute("aria-label", `Abrir detalle de ${getDriverDisplayName(driver)}`);
  el.innerHTML = "<span></span>";
  el.addEventListener("click", () => openDriverModal(driver));
  return el;
}

function clearMapMarkers() {
  for (const marker of mapMarkers.values()) {
    marker.remove();
  }
  mapMarkers.clear();
}

function syncMap(drivers) {
  initMap();
  if (!map) return;

  const locatedDrivers = drivers.filter(hasLocation);

  clearMapMarkers();

  locatedDrivers.forEach((driver) => {
    const marker = new window.maplibregl.Marker({
      element: buildMarkerElement(driver),
      anchor: "center"
    })
      .setLngLat([Number(driver.last_lng), Number(driver.last_lat)])
      .addTo(map);

    mapMarkers.set(driver.user_id, marker);
  });

  const onlineCount = locatedDrivers.filter(isOnlineDriver).length;

  if (mapMeta) {
    mapMeta.textContent = locatedDrivers.length
      ? `${locatedDrivers.length} con ubicación · ${onlineCount} activos`
      : "Sin coordenadas aún";
  }

  if (!locatedDrivers.length) {
    map.easeTo({
      center: CORDOBA_CENTER,
      zoom: CORDOBA_ZOOM,
      duration: 700
    });
    return;
  }

  if (locatedDrivers.length === 1) {
    const d = locatedDrivers[0];
    map.easeTo({
      center: [Number(d.last_lng), Number(d.last_lat)],
      zoom: 13.5,
      duration: 800
    });
    return;
  }

  const bounds = new window.maplibregl.LngLatBounds();
  locatedDrivers.forEach((driver) => {
    bounds.extend([Number(driver.last_lng), Number(driver.last_lat)]);
  });

  map.fitBounds(bounds, {
    padding: 60,
    maxZoom: 14,
    duration: 800
  });
}
function focusCordoba() {
  if (!map) return;
  map.easeTo({
    center: CORDOBA_CENTER,
    zoom: CORDOBA_ZOOM,
    duration: 700
  });
}

function fitDrivers() {
  syncMap(filterDrivers(allDrivers));
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
async function bootstrap() {
  if (isBootstrapped) return;
  isBootstrapped = true;

  const result = await supabaseAdminService.requireActiveAdmin();

  if (!result?.ok) {
    window.location.href = "./admin-login.html";
    return;
  }

  if (emailEl) {
    emailEl.textContent = result.user?.email || result.admin?.email || "";
  }

  if (avatarEl) {
    avatarEl.src = result.user?.user_metadata?.avatar_url || "../assets/icons/logo-mimi.png";
    avatarEl.onerror = () => {
      avatarEl.src = "../assets/icons/logo-mimi.png";
    };
  }

  initMap();
  await loadDrivers();

  window.setTimeout(() => map?.resize(), 120);
  window.setTimeout(() => map?.resize(), 320);

  subscribeRealtime();
}
async function loadDrivers(force = false) {
  if (loadDriversPromise && !force) return loadDriversPromise;

  loadDriversPromise = (async () => {
    try {
      const ready = await supabaseAdminService.init();
      if (!ready || !supabaseAdminService.client) {
        throw new Error("No se pudo inicializar Supabase");
      }

      setLoadingState("Cargando choferes...");

      const { data, error } = await supabaseAdminService.client
        .from("driver_profiles")
        .select(`
          user_id,
          full_name,
          email,
          phone,

          review_status,
          is_blocked,
          blocked_reason,

          onboarding_status,
          activation_status,

          documents_approved,
          profile_completed,

          ai_score,
          ai_score_label,
          review_required,
          kyc_status,

          dni_match,
          name_match,
          birth_match,
          face_detected,

          dni_front_url,
          dni_back_url,
          license_front_url,
          license_back_url,
          vehicle_insurance_url,
          vehicle_registration_url,
          selfie_url,

          last_lat,
          last_lng,
          last_location_at,

          review_notes,
          reviewed_at,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      allDrivers = Array.isArray(data) ? data : [];
      updateMetrics(allDrivers);
      renderDrivers();
    } catch (err) {
      console.error("[admin.loadDrivers]", err);
      setErrorState("No pudimos cargar los choferes.");
      showToast("No pudimos cargar choferes", "error");
    } finally {
      loadDriversPromise = null;
    }
  })();

  return loadDriversPromise;
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
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY
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

    showToast(
      action === "approve"
        ? "Chofer aprobado"
        : action === "reject"
          ? "Chofer rechazado"
          : "Chofer bloqueado",
      "success"
    );

    await loadDrivers(true);
  } catch (err) {
    console.error("[admin.reviewDriver]", err);
    showToast(err instanceof Error ? err.message : "Error inesperado", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function scheduleRealtimeReload() {
  if (realtimeReloadTimer) {
    window.clearTimeout(realtimeReloadTimer);
  }

  realtimeReloadTimer = window.setTimeout(() => {
    realtimeReloadTimer = null;
    loadDrivers(true);
  }, RELOAD_DEBOUNCE_MS);
}

function subscribeRealtime() {
  if (!supabaseAdminService.client) return;

  if (realtimeChannel) {
    supabaseAdminService.client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabaseAdminService.client
    .channel(DRIVER_CHANNEL)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "driver_profiles" },
      () => {
        scheduleRealtimeReload();
      }
    )
    .subscribe((status) => {
      console.log("[admin.realtime]", status);
    });
}

function resetCardTransform(card) {
  const surface = card.querySelector(".driver-card-surface");
  if (!surface) return;

  surface.style.transition = "transform 0.2s ease";
  surface.style.transform = "translateX(0px)";
  card.classList.remove(
    "swiping-left",
    "swiping-right",
    "swipe-success",
    "swipe-error"
  );
  activeCardTransforms.set(card, 0);

  window.setTimeout(() => {
    surface.style.transition = "";
  }, 220);
}
function enableSwipeCards() {
  const cards = Array.from(document.querySelectorAll("[data-driver-card]"));

  cards.forEach((card) => {
    if (card.dataset.swipeReady === "true") return;
    card.dataset.swipeReady = "true";

    const surface = card.querySelector(".driver-card-surface");
    if (!surface) return;

    let pointerId = null;
    let startX = 0;
    let currentX = 0;
    let dragging = false;

    const onPointerMove = (event) => {
      if (!dragging || event.pointerId !== pointerId) return;

      currentX = event.clientX;
      const delta = clamp(currentX - startX, -SWIPE_MAX_PX, SWIPE_MAX_PX);

      surface.style.transform = `translateX(${delta}px)`;
      card.classList.toggle("swiping-right", delta > 18);
      card.classList.toggle("swiping-left", delta < -18);
      activeCardTransforms.set(card, delta);
    };

const finishSwipe = async () => {
  if (!dragging) return;
  dragging = false;

  const delta = activeCardTransforms.get(card) || 0;
  const driverId = card.getAttribute("data-driver-id");
  const approveBtn = card.querySelector('[data-action="approve"]');
  const rejectBtn = card.querySelector('[data-action="reject"]');

  if (delta >= SWIPE_TRIGGER_PX && driverId) {
    surface.style.transition = "transform 0.18s ease";
    surface.style.transform = "translateX(160px)";
    card.classList.add("swipe-success");

    if (navigator.vibrate) navigator.vibrate(20);

    window.setTimeout(() => resetCardTransform(card), 220);
    await reviewDriver(driverId, "approve", approveBtn);
    return;
  }

  if (delta <= -SWIPE_TRIGGER_PX && driverId) {
    surface.style.transition = "transform 0.18s ease";
    surface.style.transform = "translateX(-160px)";
    card.classList.add("swipe-error");

    if (navigator.vibrate) navigator.vibrate(20);

    window.setTimeout(() => resetCardTransform(card), 220);
    await reviewDriver(driverId, "reject", rejectBtn);
    return;
  }

  resetCardTransform(card);
};
    card.addEventListener("pointerdown", (event) => {
      if (event.target.closest("textarea, button, a, input")) return;

      pointerId = event.pointerId;
      dragging = true;
      startX = event.clientX;
      currentX = event.clientX;
      activeCardTransforms.set(card, 0);
      surface.style.transition = "none";

      if (typeof card.setPointerCapture === "function") {
        try {
          card.setPointerCapture(pointerId);
        } catch (_) {}
      }
    });

    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", finishSwipe);
    card.addEventListener("pointercancel", finishSwipe);
    card.addEventListener("lostpointercapture", finishSwipe);
  });
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

priorityQueue?.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-open-driver]");
  if (!detailButton) return;

  const driverId = detailButton.getAttribute("data-open-driver");
  const driver = allDrivers.find((d) => d.user_id === driverId);
  if (driver) openDriverModal(driver);
});

searchInput?.addEventListener("input", (event) => {
  currentSearch = normalizeText(event.target.value);
  renderDrivers();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter || "ALL";
    setFilterButtonState(currentFilter);
    renderDrivers();
  });
});

logoutBtn?.addEventListener("click", async () => {
  try {
    if (realtimeChannel && supabaseAdminService.client) {
      await supabaseAdminService.client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  } catch (err) {
    console.warn("[admin.logout.removeChannel]", err);
  }

  await supabaseAdminService.signOut();
  window.location.href = "./admin-login.html";
});

reloadBtn?.addEventListener("click", async () => {
  await loadDrivers(true);
});

fitDriversBtn?.addEventListener("click", fitDrivers);
focusCordobaBtn?.addEventListener("click", focusCordoba);

closeModalBtn?.addEventListener("click", closeDriverModal);

modal?.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close-modal='true']");
  if (close) closeDriverModal();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDriverModal();
  }
});

window.addEventListener("resize", () => {
  if (map) {
    window.setTimeout(() => map?.resize(), 100);
  }
});

function setupDynamicHeader() {
  const header = document.querySelector(".header");
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle("is-condensed", window.scrollY > 20);
  };

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

setFilterButtonState(currentFilter);
initAdaptiveTheme();
setupDynamicHeader();
bootstrap();
