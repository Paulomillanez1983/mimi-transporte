import supabaseAdminService from "./supabase-admin-client.js?v=2026.05.14.2";

const state = {
  rows: [],
  filter: "ALL",
  query: "",
  loading: false
};

const els = {
  drivers: document.getElementById("drivers"),
  search: document.getElementById("searchInput"),
  filters: Array.from(document.querySelectorAll("[data-filter]")),
  reload: document.getElementById("reloadBtn"),
  metrics: {
    total: document.getElementById("metricTotal"),
    pending: document.getElementById("metricPending"),
    approved: document.getElementById("metricApproved"),
    rejected: document.getElementById("metricRejected"),
    blocked: document.getElementById("metricBlocked")
  },
  priorityQueue: document.getElementById("priorityQueue"),
  aiSummary: document.getElementById("aiSummary"),
  reviewChart: document.getElementById("reviewChart"),
  modal: document.getElementById("driverModal"),
  modalTitle: document.getElementById("driverModalTitle"),
  modalSubtitle: document.getElementById("driverModalSubtitle"),
  modalSummary: document.getElementById("modalSummary"),
  modalScore: document.getElementById("modalScore"),
  modalDocuments: document.getElementById("modalDocuments"),
  modalMapInfo: document.getElementById("modalMapInfo"),
  toast: document.getElementById("toastContainer")
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeStatus(value = "") {
  const key = normalize(value).replace(/[\s-]+/g, "_");
  if (["approved", "aprobado", "active", "activo"].includes(key)) return "APPROVED";
  if (["rejected", "rechazado"].includes(key)) return "REJECTED";
  if (["blocked", "bloqueado"].includes(key)) return "BLOCKED";
  if (["needs_resubmission", "observado", "revision", "requires_review"].includes(key)) return "PENDING";
  return "PENDING";
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function scoreNumber(row) {
  const value = Number(row?.profile?.ai_score ?? row?.score ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function getScoreGuidance(score) {
  if (score >= 80) return "Candidato fuerte: revisar documentos y aprobar si coinciden.";
  if (score >= 60) return "Revisión manual: confirmar DNI, selfie, datos y notas.";
  return "Riesgo alto: pedir corrección o rechazar si la documentación no coincide.";
}

function getDriverStatus(row) {
  const profile = row?.profile || {};
  const ops = row?.ops || {};

  if (profile.is_blocked || ops.bloqueado) return "BLOCKED";

  const review = normalizeStatus(profile.review_status || profile.onboarding_status || profile.activation_status);
  if (review === "REJECTED") return "REJECTED";
  if (review === "APPROVED" || profile.documents_approved === true) return "APPROVED";
  return "PENDING";
}

function getStatusLabel(status) {
  return {
    PENDING: "Pendiente",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
    BLOCKED: "Bloqueado"
  }[status] || "Pendiente";
}

function getName(row) {
  return row?.profile?.full_name || row?.ops?.nombre || row?.profile?.email || "Chofer sin nombre";
}

function getInitials(name) {
  return String(name || "M")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "M";
}

function showToast(message, type = "success") {
  if (!els.toast) return;

  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.textContent = message;
  els.toast.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  window.setTimeout(() => {
    node.classList.remove("show");
    window.setTimeout(() => node.remove(), 260);
  }, 3200);
}

function docLabel(type) {
  return {
    dni_front: "DNI frente",
    dni_back: "DNI dorso",
    selfie: "Selfie",
    license_front: "Licencia",
    insurance: "Seguro",
    vehicle_card: "Cédula",
    background_check: "Buena conducta"
  }[type] || type || "Documento";
}

function groupDocs(documents = []) {
  return documents.reduce((acc, doc) => {
    const type = doc.doc_type || doc.document_type || "document";
    acc[type] = doc;
    return acc;
  }, {});
}

async function getSignedDriverDocumentUrl(doc) {
  if (!doc?.storage_path) return null;

  try {
    const { data, error } = await supabaseAdminService.client.storage
      .from("driver-documents")
      .createSignedUrl(doc.storage_path, 60 * 5);

    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

async function insertAuditLog(eventType, row, metadata = {}) {
  try {
    const admin = await supabaseAdminService.waitForActiveAdmin(1800);
    const userId = admin?.user?.id;
    if (!userId) return;

    await supabaseAdminService.client.from("audit_logs").insert({
      user_id: userId,
      actor_type: "admin",
      event_type: eventType,
      entity_type: "driver_profile",
      entity_id: row?.profile?.user_id || row?.user_id || null,
      metadata: {
        target_user_id: row?.profile?.user_id || row?.user_id || null,
        driver_name: getName(row),
        ...metadata
      },
      user_agent: navigator.userAgent
    });
  } catch (error) {
    console.info("[admin-transport.insertAuditLog] Auditoria no persistida", error?.message || error);
  }
}

function buildRow(profile, docsByUser, opsByUser) {
  const userId = profile.user_id;
  return {
    id: userId,
    user_id: userId,
    profile,
    documents: docsByUser.get(userId) || [],
    ops: opsByUser.get(userId) || null
  };
}

async function loadDrivers() {
  if (state.loading) return;
  state.loading = true;
  els.drivers && (els.drivers.innerHTML = `<div class="empty-state">Cargando choferes...</div>`);

  try {
    const admin = await supabaseAdminService.waitForActiveAdmin(4200);
    if (!admin?.ok) throw new Error("No hay sesión administradora activa.");

    const { data: profiles, error: profileError } = await supabaseAdminService.client
      .from("driver_profiles")
      .select("id,user_id,email,full_name,phone,city,province,vehicle_brand,vehicle_model,vehicle_plate,documents_approved,onboarding_status,review_status,activation_status,is_active,is_available,is_blocked,kyc_status,review_required,ai_score,ai_score_label,face_detected,face_match_score,dni_match,name_match,birth_match,reviewed_at,review_notes,rejection_reason,admin_notes,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(160);

    if (profileError) throw profileError;

    const userIds = [...new Set((profiles || []).map((profile) => profile.user_id).filter(Boolean))];
    const docsByUser = new Map();
    const opsByUser = new Map();

    if (userIds.length) {
      const [{ data: documents, error: docsError }, { data: ops, error: opsError }] = await Promise.all([
        supabaseAdminService.client
          .from("driver_documents")
          .select("id,user_id,doc_type,storage_path,status,validation_status,confidence_score,review_required,created_at,updated_at")
          .in("user_id", userIds),
        supabaseAdminService.client
          .from("choferes")
          .select("user_id,nombre,email,telefono,online,disponible,bloqueado,activo,rating_promedio,total_viajes,last_seen_at,last_location_at,lat,lng")
          .in("user_id", userIds)
      ]);

      if (docsError) throw docsError;
      if (opsError) throw opsError;

      (documents || []).forEach((doc) => {
        if (!docsByUser.has(doc.user_id)) docsByUser.set(doc.user_id, []);
        docsByUser.get(doc.user_id).push(doc);
      });

      (ops || []).forEach((row) => {
        opsByUser.set(row.user_id, row);
      });
    }

    state.rows = (profiles || []).map((profile) => buildRow(profile, docsByUser, opsByUser));
    render();
  } catch (error) {
    console.error("[admin-transport.loadDrivers]", error);
    if (els.drivers) {
      els.drivers.innerHTML = `<div class="empty-state error">No pudimos cargar choferes: ${escapeHtml(error?.message || "Error desconocido")}</div>`;
    }
  } finally {
    state.loading = false;
  }
}

function getFilteredRows() {
  const query = normalize(state.query);

  return state.rows.filter((row) => {
    const status = getDriverStatus(row);
    if (state.filter !== "ALL" && status !== state.filter) return false;
    if (!query) return true;

    const haystack = normalize([
      getName(row),
      row.profile?.email,
      row.profile?.phone,
      row.ops?.telefono,
      row.profile?.vehicle_plate,
      row.user_id
    ].join(" "));

    return haystack.includes(query);
  });
}

function renderMetrics() {
  const rows = state.rows;
  const count = (status) => rows.filter((row) => getDriverStatus(row) === status).length;
  els.metrics.total && (els.metrics.total.textContent = rows.length);
  els.metrics.pending && (els.metrics.pending.textContent = count("PENDING"));
  els.metrics.approved && (els.metrics.approved.textContent = count("APPROVED"));
  els.metrics.rejected && (els.metrics.rejected.textContent = count("REJECTED"));
  els.metrics.blocked && (els.metrics.blocked.textContent = count("BLOCKED"));

  if (els.reviewChart) {
    const total = Math.max(rows.length, 1);
    const pending = Math.round((count("PENDING") / total) * 100);
    const approved = Math.round((count("APPROVED") / total) * 100);
    const rejected = Math.round((count("REJECTED") / total) * 100);
    const blocked = Math.max(0, 100 - pending - approved - rejected);
    els.reviewChart.innerHTML = `
      <div class="review-chart-bar" style="--approved:${approved}%;--pending:${pending}%;--rejected:${rejected}%;--blocked:${blocked}%"></div>
      <small>${approved}% aprobados · ${pending}% pendientes · ${rejected}% rechazados</small>
    `;
  }
}

function renderPriority() {
  if (!els.priorityQueue) return;

  const priority = state.rows
    .filter((row) => getDriverStatus(row) === "PENDING")
    .sort((a, b) => scoreNumber(a) - scoreNumber(b))
    .slice(0, 5);

  if (!priority.length) {
    els.priorityQueue.innerHTML = `<div class="empty-state">No hay choferes pendientes.</div>`;
    return;
  }

  els.priorityQueue.innerHTML = priority
    .map((row) => `
      <button class="priority-item" type="button" data-open-driver="${escapeHtml(row.user_id)}">
        <strong>${escapeHtml(getName(row))}</strong>
        <span>Score ${scoreNumber(row)} · ${escapeHtml(row.profile?.ai_score_label || "manual")}</span>
      </button>
    `)
    .join("");
}

function renderAiSummary() {
  if (!els.aiSummary) return;
  const rows = state.rows;
  const scores = rows.map(scoreNumber);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const low = rows.filter((row) => scoreNumber(row) < 60).length;
  const manual = rows.filter((row) => scoreNumber(row) >= 60 && scoreNumber(row) < 80).length;
  const strong = rows.filter((row) => scoreNumber(row) >= 80).length;

  els.aiSummary.innerHTML = `
    <div class="ai-summary-grid">
      <div><strong>${average}</strong><span>Score promedio</span></div>
      <div><strong>${strong}</strong><span>Candidatos fuertes</span></div>
      <div><strong>${manual}</strong><span>Revisión manual</span></div>
      <div><strong>${low}</strong><span>Riesgo alto</span></div>
    </div>
    <p>Regla operativa: 80+ puede aprobarse tras revisar documentos; 60-79 requiere revisión manual; menos de 60 requiere corrección o rechazo.</p>
  `;
}

function renderDrivers() {
  if (!els.drivers) return;
  const rows = getFilteredRows();

  if (!rows.length) {
    els.drivers.innerHTML = `<div class="empty-state">No hay choferes para este filtro.</div>`;
    return;
  }

  els.drivers.innerHTML = rows
    .map((row, index) => {
      const status = getDriverStatus(row);
      const score = scoreNumber(row);
      const docs = groupDocs(row.documents);
      const name = getName(row);
      const noteId = `driver-note-${row.user_id}`;

      return `
        <article class="driver-card premium-card card-enter" style="--card-delay:${Math.min(index * 35, 240)}ms" data-driver-id="${escapeHtml(row.user_id)}">
          <div class="swipe-bg swipe-bg-left">Rechazar</div>
          <div class="swipe-bg swipe-bg-right">Aprobar</div>
          <div class="driver-card-surface">
            <div class="driver-card-top">
              <div class="driver-identity">
                <div class="driver-avatar">${escapeHtml(getInitials(name))}</div>
                <div>
                  <h3>${escapeHtml(name)}</h3>
                  <p>${escapeHtml(row.profile?.email || "Sin email")}</p>
                  <small>${escapeHtml(row.profile?.phone || row.ops?.telefono || "Sin teléfono")} · ${escapeHtml(row.profile?.vehicle_plate || "Sin patente")}</small>
                </div>
              </div>
              <div class="driver-top-side">
                <span class="status-badge ${status.toLowerCase()}">${getStatusLabel(status)}</span>
                <span class="score-pill compact">${score}</span>
              </div>
            </div>

            <div class="driver-meta">
              <span>${escapeHtml(row.profile?.kyc_status || "kyc pendiente")}</span>
              <span>${escapeHtml(row.profile?.activation_status || "activación pendiente")}</span>
              <span>${row.ops?.online ? "Online" : "Offline"}</span>
              <span>${escapeHtml(row.profile?.vehicle_brand || "Vehículo")} ${escapeHtml(row.profile?.vehicle_model || "")}</span>
            </div>

            <div class="driver-progress">
              <div class="driver-progress-track"><div class="driver-progress-fill" style="width:${score}%"></div></div>
              <small>${escapeHtml(getScoreGuidance(score))}</small>
            </div>

            <div class="driver-doc-mini">
              ${["dni_front", "dni_back", "selfie", "license_front", "background_check"].map((type) => {
                const doc = docs[type];
                return `<span class="${doc ? "ok" : "missing"}">${escapeHtml(docLabel(type))}: ${doc ? escapeHtml(doc.status || doc.validation_status || "cargado") : "pendiente"}</span>`;
              }).join("")}
            </div>

            <textarea id="${escapeHtml(noteId)}" class="review-note" data-driver-note="${escapeHtml(row.user_id)}" placeholder="Nota para aprobar, pedir corrección, rechazar o bloquear"></textarea>

            <div class="driver-actions">
              <button class="btn approve" type="button" data-driver-action="approve" data-id="${escapeHtml(row.user_id)}">Aprobar</button>
              <button class="btn" type="button" data-driver-action="needs_resubmission" data-id="${escapeHtml(row.user_id)}">Pedir corrección</button>
              <button class="btn reject" type="button" data-driver-action="reject" data-id="${escapeHtml(row.user_id)}">Rechazar</button>
              <button class="btn block" type="button" data-driver-action="block" data-id="${escapeHtml(row.user_id)}">Bloquear</button>
              <button class="btn" type="button" data-open-driver="${escapeHtml(row.user_id)}">Detalle</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function render() {
  renderMetrics();
  renderPriority();
  renderAiSummary();
  renderDrivers();

  els.filters.forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

async function updateDriver(row, action, notes) {
  const now = new Date().toISOString();
  const admin = await supabaseAdminService.waitForActiveAdmin(3200);
  const adminId = admin?.user?.id || null;
  const userId = row.user_id;

  const updatesByAction = {
    approve: {
      review_status: "APPROVED",
      onboarding_status: "APROBADO",
      activation_status: "ACTIVE",
      documents_approved: true,
      is_active: true,
      is_available: true,
      is_blocked: false,
      review_required: false,
      reviewed_by: adminId,
      reviewed_at: now,
      review_notes: notes || "Aprobado por administración."
    },
    reject: {
      review_status: "REJECTED",
      onboarding_status: "RECHAZADO",
      activation_status: "REJECTED",
      documents_approved: false,
      is_active: false,
      is_available: false,
      review_required: false,
      reviewed_by: adminId,
      reviewed_at: now,
      rejection_reason: notes || "Rechazado por administración.",
      review_notes: notes || "Rechazado por administración."
    },
    needs_resubmission: {
      review_status: "NEEDS_RESUBMISSION",
      onboarding_status: "OBSERVADO",
      activation_status: "PENDING_REVIEW",
      documents_approved: false,
      is_active: false,
      is_available: false,
      review_required: true,
      reviewed_by: adminId,
      reviewed_at: now,
      review_notes: notes || "Se solicita corrección de documentación."
    },
    block: {
      review_status: "BLOCKED",
      activation_status: "BLOCKED",
      documents_approved: false,
      is_active: false,
      is_available: false,
      is_blocked: true,
      review_required: true,
      reviewed_by: adminId,
      reviewed_at: now,
      review_notes: notes || "Bloqueado por administración."
    }
  };

  const update = updatesByAction[action];
  if (!update) throw new Error("Acción no soportada.");

  const { error: profileError } = await supabaseAdminService.client
    .from("driver_profiles")
    .update(update)
    .eq("user_id", userId);

  if (profileError) throw profileError;

  if (action === "approve") {
    await supabaseAdminService.client
      .from("choferes")
      .update({ bloqueado: false, activo: true, disponible: true })
      .eq("user_id", userId);

    await supabaseAdminService.client
      .from("driver_documents")
      .update({ status: "APPROVED", review_required: false, updated_at: now })
      .eq("user_id", userId);
  }

  if (action === "reject" || action === "needs_resubmission") {
    await supabaseAdminService.client
      .from("choferes")
      .update({ activo: false, disponible: false, online: false })
      .eq("user_id", userId);
  }

  if (action === "block") {
    await supabaseAdminService.client
      .from("choferes")
      .update({ bloqueado: true, activo: false, disponible: false, online: false })
      .eq("user_id", userId);
  }

  await insertAuditLog(`admin.driver.${action}`, row, { action, notes, reviewed_at: now });
}

function getActionCopy(action) {
  return {
    approve: "aprobar este chofer y habilitarlo para operar",
    needs_resubmission: "pedir corrección de documentación",
    reject: "rechazar esta verificación",
    block: "bloquear este chofer"
  }[action] || "actualizar este chofer";
}

async function handleDriverAction(button) {
  const row = state.rows.find((item) => item.user_id === button.dataset.id);
  const action = button.dataset.driverAction;
  if (!row || !action) return;

  const notes = els.drivers?.querySelector(`[data-driver-note="${CSS.escape(row.user_id)}"]`)?.value?.trim() || "";
  const needsNote = ["reject", "needs_resubmission", "block"].includes(action);
  if (needsNote && !notes) {
    alert("Agregá una nota clara para que el usuario o el siguiente admin entienda la decisión.");
    return;
  }

  const ok = window.confirm(`Vas a ${getActionCopy(action)}. Esta acción queda auditada. ¿Continuamos?`);
  if (!ok) return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Procesando...";

  try {
    await updateDriver(row, action, notes);
    showToast("Chofer actualizado y auditado.");
    await loadDrivers();
  } catch (error) {
    console.error("[admin-transport.handleDriverAction]", error);
    showToast(error?.message || "No pudimos actualizar el chofer.", "error");
    alert(error?.message || "No pudimos actualizar el chofer.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function openDriverModal(userId) {
  const row = state.rows.find((item) => item.user_id === userId);
  if (!row || !els.modal) return;

  const status = getDriverStatus(row);
  const score = scoreNumber(row);
  const docs = await Promise.all(
    row.documents.map(async (doc) => ({
      doc,
      url: await getSignedDriverDocumentUrl(doc)
    }))
  );

  els.modalTitle && (els.modalTitle.textContent = getName(row));
  els.modalSubtitle && (els.modalSubtitle.textContent = `${getStatusLabel(status)} · ${row.profile?.email || "Sin email"}`);

  if (els.modalSummary) {
    els.modalSummary.innerHTML = `
      <div class="summary-grid">
        <div><strong>Teléfono</strong><span>${escapeHtml(row.profile?.phone || row.ops?.telefono || "Pendiente")}</span></div>
        <div><strong>Vehículo</strong><span>${escapeHtml([row.profile?.vehicle_brand, row.profile?.vehicle_model, row.profile?.vehicle_plate].filter(Boolean).join(" · ") || "Pendiente")}</span></div>
        <div><strong>Estado operativo</strong><span>${escapeHtml(row.ops?.online ? "Online" : "Offline")} · ${escapeHtml(row.ops?.disponible ? "Disponible" : "No disponible")}</span></div>
        <div><strong>Última revisión</strong><span>${escapeHtml(formatDate(row.profile?.reviewed_at))}</span></div>
      </div>
    `;
  }

  if (els.modalScore) {
    els.modalScore.innerHTML = `
      <div class="score-panel">
        <div class="score-box"><strong>${score}</strong><span>${escapeHtml(row.profile?.ai_score_label || "Score IA")}</span></div>
        <div class="score-breakdown">
          <span>${escapeHtml(getScoreGuidance(score))}</span>
          <span>Rostro detectado: ${row.profile?.face_detected ? "sí" : "no"}</span>
          <span>DNI coincide: ${row.profile?.dni_match ? "sí" : "pendiente"}</span>
          <span>Nombre coincide: ${row.profile?.name_match ? "sí" : "pendiente"}</span>
        </div>
      </div>
    `;
  }

  if (els.modalDocuments) {
    els.modalDocuments.innerHTML = docs.length
      ? docs.map(({ doc, url }) => `
          <article class="doc-card">
            <strong>${escapeHtml(docLabel(doc.doc_type))}</strong>
            <span>${escapeHtml(doc.status || doc.validation_status || "pendiente")}</span>
            <small>Confianza ${escapeHtml(doc.confidence_score ?? "-")}</small>
            ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ver archivo</a>` : `<span>Archivo no accesible</span>`}
          </article>
        `).join("")
      : `<div class="empty-state">Sin documentos cargados.</div>`;
  }

  if (els.modalMapInfo) {
    els.modalMapInfo.innerHTML = `
      <div><strong>Última ubicación</strong> ${escapeHtml(formatDate(row.ops?.last_location_at))}</div>
      <div><strong>Coordenadas</strong> ${escapeHtml(row.ops?.lat ?? "-")}, ${escapeHtml(row.ops?.lng ?? "-")}</div>
    `;
  }

  els.modal.classList.remove("hidden");
  els.modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal() {
  if (!els.modal) return;
  els.modal.classList.add("hidden");
  els.modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function bindEvents() {
  els.filters.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter || "ALL";
      render();
    });
  });

  els.search?.addEventListener("input", (event) => {
    state.query = event.target.value || "";
    renderDrivers();
  });

  els.reload?.addEventListener("click", loadDrivers);

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-driver-action]");
    if (actionButton) {
      event.preventDefault();
      handleDriverAction(actionButton);
      return;
    }

    const openButton = event.target.closest("[data-open-driver]");
    if (openButton) {
      event.preventDefault();
      openDriverModal(openButton.dataset.openDriver);
      return;
    }

    if (event.target.closest("[data-close-modal]")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

bindEvents();
loadDrivers();
