import supabaseAdminService from "./supabase-admin-client.js?v=2026.05.14.2";

const REVIEW_DOCS = [
  ["dni_front", "DNI frente"],
  ["dni_back", "DNI dorso"],
  ["selfie", "Selfie"],
  ["professional_license", "Matricula"],
  ["background_check", "Antecedentes"],
  ["criminal_record_certificate", "Antecedentes"]
];

const DOC_ALIASES = {
  background_check: ["background_check", "criminal_record_certificate"],
  criminal_record_certificate: ["criminal_record_certificate", "background_check"]
};

class AdminServicesProviders {
  constructor() {
    this.root = document.getElementById("servicesProvidersModule");
    this.list = document.getElementById("providersReviewList");
    this.detail = document.getElementById("providerReviewDetail");
    this.search = document.getElementById("providerSearchInput");
    this.pageSizeSelect = document.getElementById("providerPageSize");
    this.prevBtn = document.getElementById("providerPrevPage");
    this.nextBtn = document.getElementById("providerNextPage");
    this.pageLabel = document.getElementById("providerPageLabel");
    this.refreshBtn = document.getElementById("providerRefreshBtn");
    this.metrics = {
      total: document.getElementById("svcMetricTotal"),
      pending: document.getElementById("svcMetricPending"),
      approved: document.getElementById("svcMetricApproved"),
      rejected: document.getElementById("svcMetricRejected"),
      blocked: document.getElementById("svcMetricBlocked")
    };
    this.providers = [];
    this.alphaBuckets = [];
    this.activeLetter = "all";
    this.detailTab = "verification";
    this.pagination = { page: 1, pageSize: 30, total: 0, hasMore: false };
    this.activeFilter = "queue";
    this.query = "";
    this.selectedId = null;
    this.loading = false;
    this.uploadingAction = false;
    this.alertedProviders = new Set();
    this.suppressedRiskKeys = new Set();
    this.notificationRealtimeChannel = null;
    this.notificationRealtimeRefreshTimer = null;
    this._actionsBound = false;
    this._filtersBound = false;
    this._searchTimer = null;
  }

  clampPageSize(value) {
    const parsed = Number(value || 30);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(parsed, 10), 50);
  }

  escapeHtml(value = "") {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  normalize(value = "") {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  formatDate(value) {
    if (!value) return "Sin fecha";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin fecha";
    return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  getProfile(provider) {
    return Array.isArray(provider?.svc_provider_profiles)
      ? provider.svc_provider_profiles[0] || {}
      : provider?.svc_provider_profiles || {};
  }

  getDocs(provider) {
    return Array.isArray(provider?.svc_provider_documents) ? provider.svc_provider_documents : [];
  }

  getChecks(provider) {
    return Array.isArray(provider?.svc_provider_identity_checks) ? provider.svc_provider_identity_checks : [];
  }

  getLatestCheck(provider) {
    return this.getChecks(provider)[0] || {};
  }

  getAudits(provider) {
    return Array.isArray(provider?.admin_audit_events) ? provider.admin_audit_events : [];
  }

  getDevices(provider) {
    return Array.isArray(provider?.svc_user_devices) ? provider.svc_user_devices : [];
  }

  getRequests(provider) {
    return Array.isArray(provider?.svc_requests) ? provider.svc_requests : [];
  }

  getReviews(provider) {
    return Array.isArray(provider?.svc_reviews) ? provider.svc_reviews : [];
  }

  getRequestEvents(provider) {
    return Array.isArray(provider?.svc_request_events) ? provider.svc_request_events : [];
  }

  getNotifications(provider) {
    return Array.isArray(provider?.svc_notifications) ? provider.svc_notifications : [];
  }

  latestKycNotification(provider) {
    return this.getNotifications(provider)
      .filter((item) => String(item?.type || "").toUpperCase() === "PROVIDER_KYC_REVIEW")
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  }

  notificationDeviceState(provider) {
    const devices = this.getDevices(provider);
    const activeDevices = devices.filter((device) => device.active !== false);
    const pushReady = activeDevices.filter((device) =>
      device.notifications_enabled !== false && device.push_configured === true
    );
    const latest = activeDevices[0] || devices[0] || null;

    if (!devices.length) {
      return {
        className: "no-device",
        label: "Sin dispositivo",
        detail: "No hay ningun dispositivo registrado para esta cuenta de prestador."
      };
    }

    if (!pushReady.length) {
      return {
        className: "no-push",
        label: "Sin push activo",
        detail: `Ultima senal del prestador: ${this.formatDate(latest?.last_seen_at || latest?.updated_at)}. Debe abrir MIMIGO Pro con esta misma cuenta y activar notificaciones.`
      };
    }

    return {
      className: "ready",
      label: `${pushReady.length} push activo${pushReady.length === 1 ? "" : "s"}`,
      detail: `Ultima senal: ${this.formatDate(latest?.last_seen_at || latest?.updated_at)}.`
    };
  }

  notificationReceiptState(notification, provider = null) {
    const deviceState = provider ? this.notificationDeviceState(provider) : null;
    if (!notification) {
      return {
        className: "missing",
        label: "Sin notificacion",
        detail: deviceState?.detail || "Todavia no hay acuse registrado para esta decision.",
        ticks: ""
      };
    }

    if (notification.read_at) {
      return {
        className: "read",
        label: "Leida",
        detail: `El prestador abrio la notificacion ${this.formatDate(notification.read_at)}.`,
        ticks: "&#10003;&#10003;"
      };
    }

    if (notification.received_at) {
      return {
        className: "received",
        label: "Recibida",
        detail: `El dispositivo del prestador confirmo recepcion ${this.formatDate(notification.received_at)}.`,
        ticks: "&#10003;&#10003;"
      };
    }

    const status = String(notification.delivery_status || "").toUpperCase();

    if (notification.delivered_at || ["SENT", "PARTIAL"].includes(status)) {
      return {
        className: "sent",
        label: "Enviada",
        detail: `Push/in-app creado ${this.formatDate(notification.created_at)}. Esperando acuse del prestador.`,
        ticks: "&#10003;"
      };
    }

    if (["NO_DEVICE", "NO_PUSH_TOKEN"].includes(status) || deviceState?.className === "no-device" || deviceState?.className === "no-push") {
      return {
        className: "no-device",
        label: deviceState?.label || "Sin dispositivo",
        detail: `${this.formatDate(notification.created_at)}: ${deviceState?.detail || "No hay un token push activo para esta cuenta."}`,
        ticks: "!"
      };
    }

    if (status === "FAILED") {
      return {
        className: "failed",
        label: "Push fallo",
        detail: `No se pudo entregar el push creado ${this.formatDate(notification.created_at)}. El prestador lo vera al abrir la app si usa esta cuenta.`,
        ticks: "!"
      };
    }

    return {
      className: "pending",
      label: "Esperando app",
      detail: `Notificacion creada ${this.formatDate(notification.created_at)}. Aun sin acuse del prestador.`,
      ticks: ""
    };
  }

  renderNotificationReceipt(provider) {
    const notification = this.latestKycNotification(provider);
    const receipt = this.notificationReceiptState(notification, provider);
    const deviceState = this.notificationDeviceState(provider);
    const action = notification?.data_json?.action || notification?.data?.action || "";
    const title = notification?.title || "Decision administrativa";

    return `
      <section class="provider-notification-receipt ${this.escapeHtml(receipt.className)}" aria-label="Estado de entrega de notificacion">
        <div>
          <span class="provider-receipt-eyebrow">Notificacion al prestador</span>
          <strong>${this.escapeHtml(title)}</strong>
          <small>${this.escapeHtml(action ? this.actionCopy(action) : "Ultima decision enviada")}</small>
          <em>${this.escapeHtml(receipt.detail)}</em>
          <em class="provider-receipt-device">${this.escapeHtml(deviceState.label)} - ${this.escapeHtml(deviceState.detail)}</em>
        </div>
        <span class="provider-receipt-ticks ${this.escapeHtml(receipt.className)}" aria-label="${this.escapeHtml(receipt.label)}">${receipt.ticks}</span>
      </section>
    `;
  }

  notificationActionFeedback(result, sentMessage, missingMessage) {
    const status = String(result?.notification_delivery_status || "").toUpperCase();
    if (!result?.notification_created) {
      return { message: missingMessage, tone: "warning" };
    }
    if (["NO_DEVICE", "NO_PUSH_TOKEN"].includes(status)) {
      return {
        message: "Decision guardada. La cuenta destino no tiene push activo; el aviso queda en la app y se acusa cuando el prestador la abra con esa cuenta.",
        tone: "warning"
      };
    }
    if (status === "FAILED") {
      return {
        message: "Decision guardada. El push fallo; el aviso queda en la app y se acusa cuando el prestador la abra.",
        tone: "warning"
      };
    }
    return { message: sentMessage, tone: "success" };
  }

  providerLetter(provider) {
    const name = String(provider?.full_name || provider?.email || "#").trim();
    const first = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
    return /^[A-Z]$/.test(first) ? first : "#";
  }

  serviceStatusLabel(status = "") {
    const normalized = this.normalize(status);
    return {
      requested: "Solicitado",
      pending: "Pendiente",
      offered: "Ofertado",
      accepted: "Aceptado",
      en_route: "En camino",
      arrived: "Arribo",
      in_progress: "En curso",
      completed: "Finalizado",
      cancelled: "Cancelado",
      expired: "Expirado"
    }[normalized] || String(status || "Sin estado");
  }

  activitySummary(provider) {
    const requests = this.getRequests(provider);
    const reviews = this.getReviews(provider);
    const count = (matcher) => requests.filter(matcher).length;
    const ratings = reviews
      .map((review) => Number(review.stars ?? review.rating ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const average = ratings.length
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : Number(provider.rating_avg || 0);

    return {
      total: requests.length,
      pending: count((item) => ["REQUESTED", "PENDING", "OFFERED"].includes(String(item.status || "").toUpperCase())),
      active: count((item) => ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(String(item.status || "").toUpperCase())),
      completed: count((item) => String(item.status || "").toUpperCase() === "COMPLETED" || item.completed_at),
      cancelled: count((item) => String(item.status || "").toUpperCase() === "CANCELLED" || item.cancelled_at),
      reviews: reviews.length,
      rating: Number.isFinite(average) ? average : 0
    };
  }

  riskReasons(provider) {
    return this.reviewTasks(provider)
      .filter((task) => ["critical", "danger"].includes(task.severity))
      .map((task) => task.title);
  }

  docReviewState(provider, type) {
    const doc = this.getDoc(provider, type);
    const status = this.normalize(doc?.review_status || "");
    const required = ["dni_front", "dni_back", "selfie"].includes(type);

    if (!doc) {
      return {
        severity: required ? "danger" : "warning",
        label: required ? "Falta archivo" : "Pendiente",
        action: required ? "Pedir reenvio del documento." : "Solicitar si corresponde al servicio."
      };
    }

    if (["approved", "aprobado"].includes(status)) {
      return { severity: "ok", label: "Aprobado", action: "Sin accion inmediata." };
    }

    if (["rejected", "rechazado"].includes(status)) {
      return { severity: "danger", label: "Rechazado", action: "Pedir correccion con nota clara." };
    }

    if (["needs_resubmission", "observado"].includes(status)) {
      return { severity: "danger", label: "Requiere reenvio", action: "Pedir nueva carga del archivo." };
    }

    return {
      severity: required ? "warning" : "neutral",
      label: "Pendiente",
      action: required ? "Revisar nitidez, coincidencia y vigencia." : "Revisar si aplica."
    };
  }

  reviewTasks(provider) {
    const profile = this.getProfile(provider);
    const latestCheck = this.getLatestCheck(provider);
    const score = this.reviewScore(provider);
    const tasks = [];
    const docLabels = {
      dni_front: "DNI frente",
      dni_back: "DNI dorso",
      selfie: "Selfie",
      professional_license: "Matricula",
      background_check: "Buena conducta"
    };

    ["dni_front", "dni_back", "selfie"].forEach((type) => {
      const state = this.docReviewState(provider, type);
      if (state.severity === "danger") {
        tasks.push({
          severity: "danger",
          title: `${docLabels[type]}: ${state.label}`,
          detail: state.action
        });
      } else if (state.severity === "warning") {
        tasks.push({
          severity: "warning",
          title: `${docLabels[type]} pendiente de revision`,
          detail: state.action
        });
      }
    });

    const licenseState = this.docReviewState(provider, "professional_license");
    if (licenseState.severity === "danger") {
      tasks.push({
        severity: "danger",
        title: "Matricula requiere correccion",
        detail: "No aprobar una categoria regulada sin evidencia valida."
      });
    } else if (!this.getDoc(provider, "professional_license")) {
      tasks.push({
        severity: "warning",
        title: "Matricula sin archivo",
        detail: "Confirmar si la categoria del prestador exige matricula."
      });
    }

    if (score < 60) {
      tasks.push({
        severity: "danger",
        title: `Score bajo (${score}/100)`,
        detail: "No aprobar sin correccion documental o revision manual completa."
      });
    } else if (score < 80) {
      tasks.push({
        severity: "warning",
        title: `Score medio (${score}/100)`,
        detail: "Revisar coincidencia de DNI, selfie, telefono y senales antes de aprobar."
      });
    }

    if (!profile.phone_verified) {
      tasks.push({
        severity: "danger",
        title: "Telefono no verificado",
        detail: "Pedir verificacion de celular antes de aprobar."
      });
    }

    if (!latestCheck.face_detected) {
      tasks.push({
        severity: "warning",
        title: "Rostro pendiente",
        detail: "Verificar que la selfie sea clara y corresponda con el DNI."
      });
    }

    if (latestCheck.status && this.normalize(latestCheck.status).includes("fail")) {
      tasks.push({
        severity: "danger",
        title: "Verificacion facial fallida",
        detail: "Pedir nueva selfie o rechazar si no hay coincidencia."
      });
    }

    if (this.normalize(profile.auth_risk_level) === "high") {
      tasks.push({
        severity: "critical",
        title: "Riesgo auth alto",
        detail: "Bloquear o escalar si hay senales de cuenta/dispositivo sospechoso."
      });
    }

    const riskFlags = Array.isArray(profile.risk_flags) ? profile.risk_flags : [];
    if (riskFlags.length) {
      tasks.push({
        severity: "critical",
        title: "Senales de riesgo registradas",
        detail: riskFlags.slice(0, 3).join(" - ")
      });
    }

    if (!tasks.length) {
      tasks.push({
        severity: "ok",
        title: "Sin alertas criticas",
        detail: "Aun asi, confirmar visualmente documentos antes de aprobar."
      });
    }

    return tasks;
  }

  taskSummary(tasks = []) {
    const priority = ["critical", "danger", "warning", "neutral", "ok"];
    return priority
      .map((severity) => ({ severity, count: tasks.filter((task) => task.severity === severity).length }))
      .find((item) => item.count > 0) || { severity: "ok", count: 0 };
  }

  documentNumber(provider) {
    const profile = this.getProfile(provider);
    const docs = this.getDocs(provider);
    const candidates = [
      profile.document_number,
      profile.dni,
      profile.national_id,
      profile.identity_number,
      profile.metadata_json?.document_number,
      profile.metadata_json?.dni,
      profile.metadata_json?.national_id,
      profile.metadata_json?.identity_number,
      ...docs.flatMap((doc) => [
        doc.metadata_json?.document_number,
        doc.metadata_json?.dni,
        doc.metadata_json?.national_id,
        doc.metadata_json?.identity_number,
        doc.metadata_json?.ocr?.document_number,
        doc.metadata_json?.ocr?.dni
      ])
    ];

    return candidates.find((value) => String(value ?? "").trim()) || "No registrado";
  }

  riskDialogKey(provider, reasons = this.riskReasons(provider)) {
    return `${provider?.id || ""}:${this.getProviderStatus(provider)}:${reasons.join("|")}`;
  }

  shouldShowRiskDialog(provider, reasons = this.riskReasons(provider)) {
    if (!provider?.id || !reasons.length) return false;
    const status = this.getProviderStatus(provider);
    if (!["queue", "pending"].includes(status)) return false;
    const key = this.riskDialogKey(provider, reasons);
    return !this.suppressedRiskKeys.has(key) && !this.alertedProviders.has(key);
  }

  maybeShowRiskDialog(provider, options = {}) {
    if (!options.fromUserSelection) return;
    const reasons = this.riskReasons(provider);
    if (!this.shouldShowRiskDialog(provider, reasons)) return;
    const key = this.riskDialogKey(provider, reasons);
    this.alertedProviders.add(key);

    const dialog = document.createElement("div");
    dialog.className = "provider-risk-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `
      <div class="provider-risk-dialog-card">
        <span class="provider-risk-dialog-eyebrow">Revision sensible</span>
        <strong>${this.escapeHtml(provider.full_name || "Prestador sin nombre")}</strong>
        <p>${this.escapeHtml(provider.email || "Sin email")} - ${this.escapeHtml(this.displayPhone(provider))}</p>
        <p>DNI: ${this.escapeHtml(this.documentNumber(provider))}</p>
        <small>Este prestador requiere atencion antes de aprobar. Revisa los puntos marcados abajo.</small>
        <ul>${this.reviewTasks(provider).filter((task) => task.severity !== "ok").slice(0, 5).map((task) => `
          <li class="${this.escapeHtml(task.severity)}">
            <b>${this.escapeHtml(task.title)}</b>
            <span>${this.escapeHtml(task.detail)}</span>
          </li>
        `).join("")}</ul>
        <button type="button">Entendido, revisar ahora</button>
      </div>
    `;
    dialog.querySelector("button")?.addEventListener("click", () => {
      this.suppressedRiskKeys.add(key);
      dialog.remove();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        this.suppressedRiskKeys.add(key);
        dialog.remove();
      }
    });
    document.body.appendChild(dialog);
  }

  scoreNumber(provider) {
    const profile = this.getProfile(provider);
    const latestCheck = this.getLatestCheck(provider);
    const value = Math.max(Number(profile?.ai_score ?? 0), Number(latestCheck?.ai_score ?? 0));
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  }

  reviewScore(provider) {
    const profile = this.getProfile(provider);
    const docs = this.getDocs(provider);
    const latestCheck = this.getLatestCheck(provider);
    const requiredTypes = ["dni_front", "dni_back", "selfie"];
    const requiredLoaded = requiredTypes.filter((type) => docs.some((doc) => doc.document_type === type)).length;
    const hasBackground = docs.some((doc) => ["background_check", "criminal_record_certificate"].includes(doc.document_type));
    const phoneScore = profile.phone_verified ? 15 : 0;
    const docsScore = Math.round((requiredLoaded / requiredTypes.length) * 30);
    const backgroundScore = hasBackground ? 10 : 0;
    const faceScore = latestCheck.face_detected ? 10 : 0;
    const aiScore = Math.round(this.scoreNumber(provider) * 0.35);
    return Math.max(0, Math.min(100, phoneScore + docsScore + backgroundScore + faceScore + aiScore));
  }

  scoreGuidance(score) {
    if (score >= 80) return "Score fuerte: la evidencia principal parece consistente. Igual revisa visualmente DNI, selfie y telefono antes de aprobar.";
    if (score >= 60) return "Score medio: puede aprobarse solo si DNI, selfie, telefono y senales manuales coinciden.";
    return "Score bajo: faltan evidencias o hay inconsistencias. No apruebes hasta corregir documentos y confirmar identidad.";
  }

  getProviderStatus(provider) {
    const profile = this.getProfile(provider);
    const reviewStatus = this.normalize(profile?.review_status || profile?.kyc_status || provider?.status);
    if (provider?.blocked || reviewStatus === "blocked") return "blocked";
    if (["rejected", "rechazado"].includes(reviewStatus)) return "rejected";
    if (["needs_resubmission", "observado"].includes(reviewStatus)) return "needs_resubmission";
    if (provider?.approved || ["approved", "aprobado", "manual_approved"].includes(reviewStatus)) return "approved";
    return "queue";
  }

  getStatusLabel(status) {
    return {
      queue: "En revision",
      pending: "En revision",
      approved: "Aprobado",
      rejected: "Rechazado",
      blocked: "Bloqueado",
      needs_resubmission: "Correccion"
    }[status] || "En revision";
  }

  statusText(value, fallback = "Pendiente") {
    const normalized = this.normalize(value);
    if (!normalized) return fallback;
    return {
      pending: "Pendiente",
      pending_review: "En revision",
      manual_review: "Revision manual",
      ready_for_approval: "Lista para aprobar",
      auto_validated: "Validada",
      approved: "Aprobado",
      manual_approved: "Aprobado",
      rejected: "Rechazado",
      needs_resubmission: "Requiere correccion",
      blocked: "Bloqueado",
      high_risk: "Riesgo alto"
    }[normalized] || String(value);
  }

  getInitials(name = "") {
    return String(name || "M")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M";
  }

  getDoc(provider, type) {
    const aliases = DOC_ALIASES[type] || [type];
    return this.getDocs(provider).find((doc) => aliases.includes(doc.document_type));
  }

  displayPhone(provider) {
    const profile = this.getProfile(provider);
    return profile.phone_number || provider.phone || "Sin telefono";
  }

  phoneVerifiedLabel(provider) {
    const profile = this.getProfile(provider);
    if (profile.phone_verified) return `Verificado ${this.formatDate(profile.phone_verified_at)}`;
    if (profile.phone_number || provider.phone) return "Telefono cargado, no verificado";
    return "Sin telefono registrado";
  }

  latestIp(provider) {
    const profile = this.getProfile(provider);
    const audits = this.getAudits(provider);
    return profile.otp_last_ip || audits.find((audit) => audit.ip_address)?.ip_address || "No registrada";
  }

  latestUserAgent(provider) {
    return this.getAudits(provider).find((audit) => audit.user_agent)?.user_agent || "No registrado";
  }

  locationText(provider) {
    const profile = this.getProfile(provider);
    const parts = [profile.city, profile.province, profile.country_code].filter(Boolean);
    if (parts.length) return parts.join(", ");
    if (provider.last_lat && provider.last_lng) return `${Number(provider.last_lat).toFixed(5)}, ${Number(provider.last_lng).toFixed(5)}`;
    return "No registrada";
  }

  locationMeta(provider) {
    const profile = this.getProfile(provider);
    if (provider.last_seen_at) return `Ultima ubicacion ${this.formatDate(provider.last_seen_at)}`;
    if (profile.address_text) return profile.address_text;
    return "No se capturo ubicacion durante la verificacion. Si es clave para este caso, pedi correccion o contacta al prestador desde soporte.";
  }

  actionCopy(action) {
    return {
      approve: "aprobar este prestador",
      reject: "rechazar esta verificacion",
      needs_resubmission: "pedir correccion de documentacion",
      block: "bloquear este prestador",
      approve_document: "aprobar este documento",
      request_document_correction: "pedir correccion de este documento"
    }[action] || "actualizar este prestador";
  }

  documentLabel(type) {
    return REVIEW_DOCS.find(([docType]) => docType === type)?.[1] || "Documento";
  }

  noteTemplates(type = "") {
    const docLabel = this.documentLabel(type);
    return {
      approve: "Documentacion validada manualmente: DNI, selfie y telefono coinciden. No se observan senales criticas al momento de la revision.",
      correction: "Necesitamos que vuelvas a cargar la documentacion indicada. La imagen actual no permite validar la identidad con suficiente claridad.",
      document: `Necesitamos que vuelvas a cargar ${docLabel}. El archivo actual no permite una revision segura o no coincide con los datos del perfil.`,
      context: "Para completar la revision necesitamos que vuelvas a hacer la verificacion desde tu celular, con permisos de ubicacion activos y buena conexion.",
      reject: "No podemos aprobar la verificacion porque la documentacion enviada no coincide con el perfil o no permite confirmar la identidad.",
      block: "Perfil bloqueado por revision administrativa. Contacta a soporte si consideras que se trata de un error."
    };
  }

  applyNoteTemplate(providerId, templateKey, docType = "") {
    const textarea = this.detail?.querySelector(`[data-note="${CSS.escape(providerId)}"]`);
    if (!textarea) return "";
    const templates = this.noteTemplates(docType);
    const nextValue = templates[templateKey] || templates.correction;
    textarea.value = nextValue.slice(0, 500);
    const counter = this.detail.querySelector(`[data-note-counter="${CSS.escape(providerId)}"]`);
    if (counter) counter.textContent = `${textarea.value.length}/500`;
    textarea.focus();
    return textarea.value;
  }

  showFeedback(message, type = "info") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }

    const toast = document.createElement("div");
    toast.className = `provider-admin-toast ${this.escapeHtml(type)}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.classList.add("is-visible"), 20);
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
  }

  async invokeAdminFunction(functionName, body = {}) {
    if (!functionName) throw new Error("Nombre de funcion requerido.");
    await supabaseAdminService.waitForActiveAdmin?.();
    const { data, error } = await supabaseAdminService.client.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error("AUTH_REQUIRED");

    const supabaseUrl =
      window.MIMI_ADMIN_ENV?.SUPABASE_URL ||
      window.MIMI_ENV?.SUPABASE_URL ||
      window.SUPABASE_URL ||
      "https://xrphpqmutvadjrucqicn.supabase.co";

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body || {})
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const detail = json?.details?.message || json?.details?.details || json?.message || "";
      throw new Error([json?.error || `Error ${response.status}`, detail].filter(Boolean).join(": "));
    }
    return json;
  }

  async insertAuditLog(eventType, provider, metadata = {}) {
    try {
      const admin = await supabaseAdminService.waitForActiveAdmin(1800);
      if (!admin?.user?.id) return;

      await supabaseAdminService.client.from("audit_logs").insert({
        user_id: admin.user.id,
        actor_type: "admin",
        event_type: eventType,
        entity_type: "svc_provider",
        entity_id: provider?.id || null,
        metadata: {
          provider_id: provider?.id || null,
          provider_user_id: provider?.user_id || null,
          provider_name: provider?.full_name || null,
          ...metadata
        },
        user_agent: navigator.userAgent
      });
    } catch (error) {
      console.info("[admin-services-providers.insertAuditLog] Auditoria no persistida", error?.message || error);
    }
  }

  async getSignedDocumentUrl(doc) {
    const bucket = doc?.storage_bucket;
    const path = doc?.storage_path;
    if (!bucket || !path) return null;

    try {
      const { data, error } = await supabaseAdminService.client.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 5);
      if (error) return null;
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  }

  async init() {
    if (!this.root || !this.list) return;
    const admin = await supabaseAdminService.waitForActiveAdmin?.(3200);
    if (!admin?.ok) return;
    this.bindFilters();
    this.bindActions();
    this.bindSearch();
    await this.load();
    this.setupNotificationRealtime();
  }

  setupNotificationRealtime() {
    const client = supabaseAdminService.client;
    if (!client?.channel || this.notificationRealtimeChannel) return;

    this.notificationRealtimeChannel = client
      .channel("admin:provider-kyc-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_notifications"
        },
        (payload) => this.onNotificationReceiptChange(payload)
      )
      .subscribe();
  }

  onNotificationReceiptChange(payload) {
    const row = payload?.new || payload?.old;
    if (!row || String(row.type || "").toUpperCase() !== "PROVIDER_KYC_REVIEW") return;

    const provider = this.providers.find((item) => String(item.user_id || "") === String(row.user_id || ""));
    if (!provider) return;

    const notifications = this.getNotifications(provider).filter((item) => String(item.id) !== String(row.id));
    provider.svc_notifications = [row, ...notifications]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 50);

    window.clearTimeout(this.notificationRealtimeRefreshTimer);
    this.notificationRealtimeRefreshTimer = window.setTimeout(() => {
      this.renderList();
      if (String(provider.id) === String(this.selectedId)) {
        this.renderDetail({ fromUserSelection: false });
      }
    }, 120);
  }

  async load({ keepSelection = false } = {}) {
    if (this.loading) return;
    this.loading = true;
    this.renderLoading();

    try {
      const result = await this.invokeAdminFunction("admin-list-service-providers", {
        page: this.pagination.page,
        pageSize: this.pagination.pageSize,
        status: this.activeFilter,
        query: this.query
      });

      this.providers = Array.isArray(result?.providers) ? result.providers : [];
      this.alphaBuckets = Array.isArray(result?.alphaBuckets) ? result.alphaBuckets : [];
      this.pagination = {
        page: Number(result?.pagination?.page || this.pagination.page),
        pageSize: this.clampPageSize(result?.pagination?.pageSize || this.pagination.pageSize),
        total: Number(result?.pagination?.total || 0),
        hasMore: Boolean(result?.pagination?.hasMore)
      };
      if (this.pageSizeSelect) this.pageSizeSelect.value = String(this.pagination.pageSize);

      if (!keepSelection || !this.providers.some((provider) => provider.id === this.selectedId)) {
        this.selectedId = this.providers[0]?.id || null;
      }

      this.renderMetrics(result?.stats || {});
      this.renderActiveFilter();
      this.renderList();
      await this.renderDetail({ fromUserSelection: false });
    } catch (error) {
      console.error("[adminServicesProviders.load]", error);
      this.list.innerHTML = `
        <div class="admin-empty-state error">
          <p>No pudimos cargar la cola de prestadores.</p>
          <small>${this.escapeHtml(error?.message || "Error desconocido")}</small>
          <button class="btn" type="button" data-provider-retry>Reintentar</button>
        </div>
      `;
      if (this.detail) {
        this.detail.innerHTML = `<div class="provider-detail-empty">La revision queda disponible cuando la cola vuelva a cargar.</div>`;
      }
    } finally {
      this.loading = false;
      this.renderPagination();
    }
  }

  renderLoading() {
    if (this.list) {
      this.list.innerHTML = `<div class="admin-empty-state">Cargando cola de prestadores...</div>`;
    }
    if (this.detail && !this.selectedId) {
      this.detail.innerHTML = `<div class="provider-detail-empty">Preparando detalle de revision...</div>`;
    }
  }

  renderMetrics(stats) {
    if (this.metrics.total) this.metrics.total.textContent = stats.total ?? 0;
    if (this.metrics.pending) this.metrics.pending.textContent = stats.queue ?? 0;
    if (this.metrics.approved) this.metrics.approved.textContent = stats.approved ?? 0;
    if (this.metrics.rejected) this.metrics.rejected.textContent = stats.rejected ?? 0;
    if (this.metrics.blocked) this.metrics.blocked.textContent = stats.blocked ?? 0;
  }

  renderActiveFilter() {
    document.querySelectorAll("[data-provider-filter]").forEach((btn) => {
      const isActive = btn.dataset.providerFilter === this.activeFilter;
      btn.classList.toggle("is-active", isActive);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  renderPagination() {
    const totalPages = Math.max(1, Math.ceil((this.pagination.total || 0) / this.pagination.pageSize));
    const nav = this.prevBtn?.closest(".provider-pagination");
    if (nav) nav.hidden = !this.pagination.total;
    if (this.pageLabel) {
      this.pageLabel.textContent = `Pagina ${this.pagination.page} de ${totalPages} - ${this.pagination.total} prestadores`;
    }
    if (this.prevBtn) this.prevBtn.disabled = this.loading || this.pagination.page <= 1;
    if (this.nextBtn) this.nextBtn.disabled = this.loading || !this.pagination.hasMore;
    if (this.pageSizeSelect) this.pageSizeSelect.value = String(this.pagination.pageSize);
  }

  renderAlphaBuckets() {
    const letters = this.alphaBuckets.length ? this.alphaBuckets : [];
    if (!letters.length) return "";
    const totalQueue = letters.reduce((sum, item) => sum + Number(item.queue || 0), 0);
    return `
      <section class="provider-alpha-rail" aria-label="Carpetas alfabeticas">
        <button class="${this.activeLetter === "all" ? "is-active" : ""}" type="button" data-provider-letter="all">
          <strong>Todos</strong>
          <span>${totalQueue}</span>
        </button>
        ${letters.map((item) => `
          <button class="${this.activeLetter === item.letter ? "is-active" : ""}" type="button" data-provider-letter="${this.escapeHtml(item.letter)}">
            <strong>${this.escapeHtml(item.letter)}</strong>
            <span>${Number(item.queue || 0)}</span>
          </button>
        `).join("")}
      </section>
    `;
  }

  renderDocSummary(provider) {
    const docs = this.getDocs(provider);
    return REVIEW_DOCS.slice(0, 5)
      .map(([type, label]) => {
        const doc = docs.find((item) => item.document_type === type);
        const status = this.normalize(doc?.review_status || "");
        const ok = ["approved", "aprobado"].includes(status);
        const bad = ["rejected", "rechazado", "needs_resubmission", "observado"].includes(status);
        return `<span class="${doc ? (ok ? "ok" : bad ? "missing" : "pending") : "missing"}">${this.escapeHtml(label)}</span>`;
      })
      .join("");
  }

  renderSecurityPill(label, value, state = "neutral") {
    const icon = {
      ok: "OK",
      warning: "!",
      danger: "!",
      neutral: "-"
    }[state] || "-";

    return `
      <div class="provider-security-pill ${this.escapeHtml(state)}">
        <i aria-hidden="true">${this.escapeHtml(icon)}</i>
        <div>
          <strong>${this.escapeHtml(label)}</strong>
          <span>${this.escapeHtml(value)}</span>
        </div>
      </div>
    `;
  }

  renderReviewTasks(tasks = []) {
    const summary = this.taskSummary(tasks);
    const label = {
      critical: "Riesgo critico",
      danger: "Requiere correccion",
      warning: "Revisar antes de aprobar",
      neutral: "Sin decision automatica",
      ok: "Sin alertas criticas"
    }[summary.severity] || "Revision";

    return `
      <section class="provider-action-panel ${this.escapeHtml(summary.severity)}" aria-label="Puntos de revision recomendados">
        <div class="provider-action-panel-head">
          <div>
            <strong>${this.escapeHtml(label)}</strong>
            <span>${tasks.filter((task) => task.severity !== "ok").length || "0"} puntos para mirar</span>
          </div>
          <b>${this.escapeHtml(summary.severity === "ok" ? "OK" : "ATENCION")}</b>
        </div>
        <div class="provider-action-list">
          ${tasks.slice(0, 8).map((task) => `
            <article class="provider-action-item ${this.escapeHtml(task.severity)}">
              <strong>${this.escapeHtml(task.title)}</strong>
              <span>${this.escapeHtml(task.detail)}</span>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  renderList() {
    this.root?.classList.toggle("has-providers", this.providers.length > 0);
    this.root?.classList.toggle("has-selection", Boolean(this.selectedId));
    const visibleProviders = this.activeLetter === "all"
      ? this.providers
      : this.providers.filter((provider) => this.providerLetter(provider) === this.activeLetter);

    if (!visibleProviders.length) {
      this.list.innerHTML = `
        ${this.renderAlphaBuckets()}
        <div class="admin-empty-state">
          <p>No hay prestadores para este filtro.</p>
          <small>Proba cambiar el estado, limpiar la busqueda o recargar la cola.</small>
        </div>
      `;
      this.renderPagination();
      return;
    }

    this.list.innerHTML = `
      ${this.renderAlphaBuckets()}
      <div class="provider-directory-list">
      ${visibleProviders.map((provider) => {
      const profile = this.getProfile(provider);
      const latestCheck = this.getLatestCheck(provider);
      const providerId = this.escapeHtml(provider.id);
      const score = this.reviewScore(provider);
      const status = this.getProviderStatus(provider);
      const isSelected = provider.id === this.selectedId;
      const updatedAt = profile.updated_at || provider.updated_at || provider.created_at;
      const activity = this.activitySummary(provider);
      const taskSummary = this.taskSummary(this.reviewTasks(provider));
      const receipt = this.notificationReceiptState(this.latestKycNotification(provider), provider);

      return `
        <button class="provider-queue-row ${isSelected ? "is-selected" : ""} risk-${this.escapeHtml(taskSummary.severity)}" type="button" data-provider-select="${providerId}">
          <span class="provider-queue-main">
            <strong>${this.escapeHtml(provider.full_name || "Prestador sin nombre")}</strong>
            <small>${this.escapeHtml(provider.email || "Sin email")} - ${this.escapeHtml(this.displayPhone(provider))}</small>
            <small class="provider-queue-document">DNI: ${this.escapeHtml(this.documentNumber(provider))}</small>
          </span>
          <span class="provider-queue-docs" aria-label="Documentos">
            ${this.renderDocSummary(provider)}
          </span>
          <span class="provider-queue-side">
            <span class="provider-queue-statusline">
              <span class="status-badge ${this.escapeHtml(status)}">${this.escapeHtml(this.getStatusLabel(status))}</span>
              <span class="score-pill compact">${score}</span>
            </span>
            <small class="provider-queue-risk">${this.escapeHtml(taskSummary.severity === "ok" ? "Sin alertas" : `${taskSummary.count} alertas`)}</small>
            <small class="provider-queue-receipt ${this.escapeHtml(receipt.className)}"><span>${receipt.ticks}</span>${this.escapeHtml(receipt.label)}</small>
            <small class="provider-queue-activity">${activity.total} servicios - ${activity.rating ? activity.rating.toFixed(1) : "SR"} rating</small>
            <small class="provider-queue-date">${this.escapeHtml(this.formatDate(latestCheck.created_at || updatedAt))}</small>
          </span>
        </button>
      `;
      }).join("")}
      </div>
    `;

    this.renderPagination();
  }

  async renderDetail(options = {}) {
    if (!this.detail) return;
    const provider = this.providers.find((row) => row.id === this.selectedId);
    this.root?.classList.toggle("has-selection", Boolean(provider));
    if (!provider) {
      this.detail.innerHTML = `<div class="provider-detail-empty">Selecciona un prestador para revisar identidad, documentos y decision.</div>`;
      return;
    }

    const profile = this.getProfile(provider);
    const docs = this.getDocs(provider);
    const latestCheck = this.getLatestCheck(provider);
    const aiScore = this.scoreNumber(provider);
    const score = this.reviewScore(provider);
    const status = this.getProviderStatus(provider);
    const urls = {};

    await Promise.all(REVIEW_DOCS.map(async ([type]) => {
      const doc = this.getDoc(provider, type);
      urls[type] = await this.getSignedDocumentUrl(doc);
    }));

    const riskFlags = Array.isArray(profile.risk_flags)
      ? profile.risk_flags
      : Array.isArray(latestCheck.risk_flags)
        ? latestCheck.risk_flags
        : [];
    const phoneVerified = profile.phone_verified === true;
    const latestDevice = this.getDevices(provider)[0] || {};
    const latestAudit = this.getAudits(provider)[0] || {};
    const activity = this.activitySummary(provider);
    const faceMatch = Number(latestCheck.face_match_score ?? 0);
    const livenessScore = Number(latestCheck.liveness_score ?? 0);
    const scoreState = score >= 80 ? "ok" : score >= 60 ? "warning" : "danger";
    const riskReasons = this.riskReasons(provider);
    const reviewTasks = this.reviewTasks(provider);

    this.detail.innerHTML = `
      <article class="provider-detail-card" data-provider-detail="${this.escapeHtml(provider.id)}">
        <header class="provider-detail-head">
          <div class="provider-review-avatar" aria-hidden="true">${this.escapeHtml(this.getInitials(provider.full_name || provider.email))}</div>
          <div>
            <span class="eyebrow">Revision de identidad</span>
            <h3>${this.escapeHtml(provider.full_name || "Prestador sin nombre")}</h3>
            <p>${this.escapeHtml(provider.email || "Sin email")} - ${this.escapeHtml(this.displayPhone(provider))}</p>
          </div>
          <div class="provider-detail-status">
            <span class="status-badge ${this.escapeHtml(status)}">${this.escapeHtml(this.getStatusLabel(status))}</span>
            <span class="score-pill">${score}</span>
          </div>
        </header>

        <nav class="provider-detail-tabs" aria-label="Secciones del prestador">
          <button class="${this.detailTab === "verification" ? "is-active" : ""}" type="button" data-provider-tab="verification">Verificacion</button>
          <button class="${this.detailTab === "activity" ? "is-active" : ""}" type="button" data-provider-tab="activity">Actividad</button>
          <button class="${this.detailTab === "audit" ? "is-active" : ""}" type="button" data-provider-tab="audit">Auditoria</button>
        </nav>

        ${riskReasons.length ? `
          <section class="provider-critical-alert" role="alert">
            <strong>Atencion requerida</strong>
            <span>${riskReasons.slice(0, 4).map((reason) => this.escapeHtml(reason)).join(" - ")}</span>
          </section>
        ` : ""}

        <div class="provider-tab-panel ${this.detailTab === "verification" ? "is-active" : ""}" data-provider-panel="verification">
          ${this.renderReviewTasks(reviewTasks)}

          <section class="provider-detail-grid provider-summary-grid" aria-label="Resumen seguro KYC">
          <div><strong>Categoria</strong><span>${this.escapeHtml(profile.public_headline || "Servicio")}</span></div>
          <div><strong>KYC</strong><span>${this.escapeHtml(this.statusText(profile.kyc_status || latestCheck.status))}</span></div>
          <div><strong>Review</strong><span>${this.escapeHtml(this.statusText(profile.review_status))}</span></div>
          <div><strong>Modalidad</strong><span>${this.escapeHtml(Array.isArray(profile.service_modes) && profile.service_modes.length ? profile.service_modes.join(", ") : "Sin modalidad")}</span></div>
          <div><strong>Telefono</strong><span>${this.escapeHtml(this.phoneVerifiedLabel(provider))}</span></div>
          <div><strong>IP verificacion</strong><span>${this.escapeHtml(this.latestIp(provider))}</span></div>
          <div><strong>Ubicacion</strong><span>${this.escapeHtml(this.locationText(provider))}</span></div>
          <div><strong>Dispositivo</strong><span>${this.escapeHtml(latestDevice.platform || profile.last_verified_device_id || "No registrado")}</span></div>
          </section>

          ${this.renderNotificationReceipt(provider)}

          <section class="provider-score-panel ${this.escapeHtml(scoreState)}" aria-label="Score de revision">
          <div>
            <strong>Criterio del score</strong>
            <span>${this.escapeHtml(this.scoreGuidance(score))}</span>
            <small>Score compuesto ${score}/100 - IA ${aiScore}/100 - match facial ${Number.isFinite(faceMatch) ? faceMatch : 0} - liveness ${Number.isFinite(livenessScore) ? livenessScore : 0}</small>
          </div>
          <b>${score}</b>
          </section>

          <section class="provider-security-grid" aria-label="Evidencia de seguridad">
          ${this.renderSecurityPill("Telefono", phoneVerified ? "Verificado" : "No verificado", phoneVerified ? "ok" : "warning")}
          ${this.renderSecurityPill("OTP", profile.otp_last_channel || "Sin canal", profile.otp_last_channel ? "ok" : "neutral")}
          ${this.renderSecurityPill("Rostro", latestCheck.face_detected ? "Detectado" : "Pendiente", latestCheck.face_detected ? "ok" : "warning")}
          ${this.renderSecurityPill("Riesgo auth", profile.auth_risk_level || "No registrado", this.normalize(profile.auth_risk_level) === "high" ? "danger" : "neutral")}
          ${this.renderSecurityPill("Dispositivo", profile.trusted_device ? "Confiable" : "No confirmado", profile.trusted_device ? "ok" : "neutral")}
          ${this.renderSecurityPill("Ultima senal", this.formatDate(latestAudit.created_at || provider.last_seen_at), latestAudit.created_at || provider.last_seen_at ? "ok" : "neutral")}
          </section>

        <section class="provider-detail-grid provider-legacy-grid" aria-label="Resumen KYC">
          <div><strong>KYC</strong><span>${this.escapeHtml(profile.kyc_status || latestCheck.status || "pending")}</span></div>
          <div><strong>Review</strong><span>${this.escapeHtml(profile.review_status || "pending")}</span></div>
          <div><strong>Rostro</strong><span>${latestCheck.face_detected ? "Detectado" : "Pendiente"}</span></div>
          <div><strong>Match</strong><span>${this.escapeHtml(latestCheck.face_match_score ?? "-")}</span></div>
          <div><strong>Ultimo analisis</strong><span>${this.escapeHtml(this.formatDate(latestCheck.created_at || profile.reviewed_at))}</span></div>
          <div><strong>Guia</strong><span>${this.escapeHtml(this.scoreGuidance(score))}</span></div>
        </section>

          <section class="provider-risk-panel provider-context-panel" aria-label="Contexto de verificacion">
          <strong>Contexto de verificacion</strong>
          <span>${this.escapeHtml(this.locationMeta(provider))}</span>
          <small>User agent: ${this.escapeHtml(this.latestUserAgent(provider))}</small>
          <button class="btn small ghost" type="button" data-note-template="context" data-id="${this.escapeHtml(provider.id)}">Pedir contexto</button>
          </section>

          <section class="provider-risk-panel" aria-label="Senales de riesgo">
          <strong>Senales operativas</strong>
          <span>${riskFlags.length ? riskFlags.map((flag) => this.escapeHtml(flag)).join(" - ") : "No hay senales criticas automaticas. Continua con la revision visual de documentos."}</span>
          </section>

          <section class="provider-document-bulk" aria-label="Acciones masivas de documentos">
            <div>
              <strong>Correccion por seleccion</strong>
              <span>Marca uno o varios documentos y envia una sola observacion auditada.</span>
            </div>
            <button class="btn small danger-soft" type="button" data-doc-bulk-action="request_document_correction" data-id="${this.escapeHtml(provider.id)}">Pedir correccion seleccionados</button>
            <button class="btn small success" type="button" data-doc-bulk-action="approve_document" data-id="${this.escapeHtml(provider.id)}">OK seleccionados</button>
          </section>

          <section class="provider-document-review" aria-label="Documentos del prestador">
          ${REVIEW_DOCS.map(([type, label]) => {
            const doc = this.getDoc(provider, type);
            if (!doc && type === "criminal_record_certificate") return "";
            const url = urls[type];
            const docState = this.docReviewState(provider, type);
            return `
              <div class="provider-doc-row ${this.escapeHtml(docState.severity)}">
                <label class="provider-doc-select">
                  <input type="checkbox" data-doc-select data-doc-type="${this.escapeHtml(type)}" data-doc-id="${this.escapeHtml(doc?.id || "")}" ${doc || ["dni_front", "dni_back", "selfie", "professional_license", "background_check"].includes(type) ? "" : "disabled"}>
                  <span>
                    <strong>${this.escapeHtml(label)}</strong>
                    <em>${this.escapeHtml(docState.label)} - ${this.escapeHtml(this.formatDate(doc?.created_at))}</em>
                    <small>${this.escapeHtml(docState.action)}</small>
                  </span>
                </label>
                <div class="provider-doc-actions">
                  ${url ? `<a class="btn small" target="_blank" rel="noopener noreferrer" href="${this.escapeHtml(url)}">Ver archivo</a>` : `<span class="doc-pending">Sin archivo</span>`}
                  ${doc ? `<button class="btn small success" type="button" data-doc-action="approve_document" data-id="${this.escapeHtml(provider.id)}" data-doc-type="${this.escapeHtml(type)}" data-doc-id="${this.escapeHtml(doc.id || "")}">OK doc</button>` : ""}
                  <button class="btn small danger-soft" type="button" data-doc-action="request_document_correction" data-id="${this.escapeHtml(provider.id)}" data-doc-type="${this.escapeHtml(type)}" data-doc-id="${this.escapeHtml(doc?.id || "")}">Pedir correccion</button>
                </div>
              </div>
            `;
          }).join("")}
          </section>
        </div>

        <div class="provider-tab-panel ${this.detailTab === "activity" ? "is-active" : ""}" data-provider-panel="activity">
          ${this.renderActivity(provider, activity)}
        </div>

        <div class="provider-tab-panel ${this.detailTab === "audit" ? "is-active" : ""}" data-provider-panel="audit">
          ${this.renderAudit(provider)}
        </div>

        <label class="provider-note-wrap">
          <span>Nota de decision administrativa</span>
          <textarea maxlength="500" class="review-note" data-note="${this.escapeHtml(provider.id)}" placeholder="Ejemplo: necesitamos que vuelvas a cargar el DNI frente porque la imagen no permite validar los datos."></textarea>
          <em>Se usa para auditoria interna. En correccion, rechazo o bloqueo tambien se envia al prestador como observacion.</em>
          <small data-note-counter="${this.escapeHtml(provider.id)}">0/500</small>
        </label>

        <div class="provider-note-examples" aria-label="Ejemplos de notas administrativas">
          <span>Plantillas rapidas</span>
          <button type="button" data-note-template="approve" data-id="${this.escapeHtml(provider.id)}">Aprobacion</button>
          <button type="button" data-note-template="correction" data-id="${this.escapeHtml(provider.id)}">Correccion</button>
          <button type="button" data-note-template="context" data-id="${this.escapeHtml(provider.id)}">Pedir contexto</button>
          <button type="button" data-note-template="reject" data-id="${this.escapeHtml(provider.id)}">Rechazo</button>
          <button type="button" data-note-template="block" data-id="${this.escapeHtml(provider.id)}">Bloqueo</button>
        </div>

        <div class="provider-review-actions">
          <button class="btn approve" data-action="approve" data-id="${this.escapeHtml(provider.id)}">Aprobar</button>
          <button class="btn" data-action="needs_resubmission" data-id="${this.escapeHtml(provider.id)}">Pedir correccion</button>
          <button class="btn reject" data-action="reject" data-id="${this.escapeHtml(provider.id)}">Rechazar</button>
          <button class="btn block" data-action="block" data-id="${this.escapeHtml(provider.id)}">Bloquear</button>
        </div>
      </article>
    `;

    this.maybeShowRiskDialog(provider, options);
  }

  renderActivity(provider, activity = this.activitySummary(provider)) {
    const requests = this.getRequests(provider)
      .slice()
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    const events = this.getRequestEvents(provider);
    const reviews = this.getReviews(provider);

    const eventMap = new Map();
    events.forEach((event) => {
      const requestId = String(event.request_id || "");
      if (!requestId) return;
      if (!eventMap.has(requestId)) eventMap.set(requestId, []);
      eventMap.get(requestId).push(event);
    });

    return `
      <section class="provider-activity-kpis" aria-label="Actividad de servicios">
        <div><strong>${activity.total}</strong><span>Total</span></div>
        <div><strong>${activity.active}</strong><span>En curso</span></div>
        <div><strong>${activity.pending}</strong><span>Pendientes</span></div>
        <div><strong>${activity.completed}</strong><span>Finalizados</span></div>
        <div><strong>${activity.cancelled}</strong><span>Cancelados</span></div>
        <div><strong>${activity.rating ? activity.rating.toFixed(1) : "SR"}</strong><span>Rating</span></div>
      </section>

      <section class="provider-activity-list" aria-label="Servicios del prestador">
        ${requests.length ? requests.map((request) => {
          const requestEvents = eventMap.get(String(request.id)) || [];
          const total = Number(request.total_price_snapshot || 0);
          const providerNet = Number(request.provider_price_snapshot || 0);
          const fee = Number(request.platform_fee_snapshot || 0);
          const pinOk = Boolean(request.service_pin_verified_at);
          const pinLocked = Boolean(request.service_pin_locked_until);
          return `
            <article class="provider-service-row">
              <div class="provider-service-head">
                <strong>#${this.escapeHtml(String(request.id || "").slice(0, 8))}</strong>
                <span>${this.escapeHtml(this.serviceStatusLabel(request.status))}</span>
              </div>
              <div class="provider-service-grid">
                <div><small>Creado</small><b>${this.escapeHtml(this.formatDate(request.created_at))}</b></div>
                <div><small>Inicio</small><b>${this.escapeHtml(this.formatDate(request.started_at))}</b></div>
                <div><small>Finalizado</small><b>${this.escapeHtml(this.formatDate(request.completed_at))}</b></div>
                <div><small>PIN</small><b>${pinOk ? "Verificado" : pinLocked ? "Bloqueado" : "Pendiente"}</b></div>
                <div><small>Total</small><b>${total ? `${this.escapeHtml(request.currency || "ARS")} ${total.toFixed(0)}` : "Sin total"}</b></div>
                <div><small>Prestador</small><b>${providerNet ? `${this.escapeHtml(request.currency || "ARS")} ${providerNet.toFixed(0)}` : "Sin liquidar"}</b></div>
                <div><small>Comision</small><b>${fee ? `${this.escapeHtml(request.currency || "ARS")} ${fee.toFixed(0)}` : "Sin dato"}</b></div>
                <div><small>Eventos</small><b>${requestEvents.length}</b></div>
              </div>
              <p>${this.escapeHtml(request.address_text || request.service_mode || "Sin direccion/modo registrado")}</p>
            </article>
          `;
        }).join("") : `<div class="admin-empty-state"><p>Este prestador todavia no tiene servicios registrados.</p></div>`}
      </section>

      <section class="provider-risk-panel" aria-label="Calificaciones">
        <strong>Calificaciones</strong>
        <span>${reviews.length ? reviews.slice(0, 6).map((review) => `${Number(review.stars ?? review.rating ?? 0)}/5 - ${this.formatDate(review.created_at)}`).join(" | ") : "Sin calificaciones registradas"}</span>
      </section>
    `;
  }

  renderAudit(provider) {
    const audits = this.getAudits(provider);
    const events = this.getRequestEvents(provider);
    const rows = [
      ...audits.map((item) => ({
        type: item.event_type,
        at: item.created_at,
        detail: item.ip_address || item.device_id || item.metadata?.status || "Sin detalle"
      })),
      ...events.map((item) => ({
        type: item.event_type,
        at: item.created_at,
        detail: item.request_id ? `Servicio #${String(item.request_id).slice(0, 8)}` : "Evento de servicio"
      }))
    ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    return `
      <section class="provider-audit-list" aria-label="Auditoria del prestador">
        ${rows.length ? rows.slice(0, 80).map((row) => `
          <div class="provider-audit-row">
            <strong>${this.escapeHtml(row.type || "evento")}</strong>
            <span>${this.escapeHtml(row.detail || "Sin detalle")}</span>
            <small>${this.escapeHtml(this.formatDate(row.at))}</small>
          </div>
        `).join("") : `<div class="admin-empty-state"><p>Sin auditoria registrada para este prestador.</p></div>`}
      </section>
    `;
  }

  bindSearch() {
    this.search?.addEventListener("input", (event) => {
      this.query = event.target.value || "";
      window.clearTimeout(this._searchTimer);
      this._searchTimer = window.setTimeout(() => {
        this.pagination.page = 1;
        this.load();
      }, 280);
    });

    this.pageSizeSelect?.addEventListener("change", (event) => {
      this.pagination.pageSize = this.clampPageSize(event.target.value || 30);
      event.target.value = String(this.pagination.pageSize);
      this.pagination.page = 1;
      this.load({ keepSelection: true });
    });

    this.prevBtn?.addEventListener("click", () => {
      if (this.pagination.page <= 1) return;
      this.pagination.page -= 1;
      this.load();
    });

    this.nextBtn?.addEventListener("click", () => {
      if (!this.pagination.hasMore) return;
      this.pagination.page += 1;
      this.load();
    });

    this.refreshBtn?.addEventListener("click", () => this.load({ keepSelection: true }));
  }

  bindFilters() {
    if (this._filtersBound) return;
    this._filtersBound = true;
    document.addEventListener("click", async (event) => {
      const retry = event.target.closest("[data-provider-retry]");
      if (retry) {
        event.preventDefault();
        await this.load({ keepSelection: true });
        return;
      }

      const btn = event.target.closest("[data-provider-filter]");
      if (!btn) return;
      event.preventDefault();
      this.activeFilter = btn.dataset.providerFilter || "queue";
      this.pagination.page = 1;
      this.renderActiveFilter();
      await this.load();
    });
  }

  bindActions() {
    if (this._actionsBound) return;
    this._actionsBound = true;

    this.list?.addEventListener("click", async (event) => {
      const letterBtn = event.target.closest("[data-provider-letter]");
      if (letterBtn) {
        event.preventDefault();
        this.activeLetter = letterBtn.dataset.providerLetter || "all";
        const firstVisible = this.activeLetter === "all"
          ? this.providers[0]
          : this.providers.find((provider) => this.providerLetter(provider) === this.activeLetter);
        this.selectedId = firstVisible?.id || this.selectedId;
        this.renderList();
        await this.renderDetail({ fromUserSelection: Boolean(firstVisible) });
        return;
      }

      const row = event.target.closest("[data-provider-select]");
      if (!row) return;
      event.preventDefault();
      this.selectedId = row.dataset.providerSelect;
      this.detailTab = "verification";
      this.renderList();
      await this.renderDetail({ fromUserSelection: true });
    });

    this.detail?.addEventListener("click", async (event) => {
      const tab = event.target.closest("[data-provider-tab]");
      if (tab) {
        event.preventDefault();
        this.detailTab = tab.dataset.providerTab || "verification";
        await this.renderDetail({ fromUserSelection: false });
        return;
      }

      const templateBtn = event.target.closest("[data-note-template]");
      if (templateBtn) {
        event.preventDefault();
        const providerId = templateBtn.dataset.id || this.selectedId;
        const docType = templateBtn.dataset.docType || "";
        this.applyNoteTemplate(providerId, templateBtn.dataset.noteTemplate, docType);
        return;
      }

      const docBtn = event.target.closest("[data-doc-action]");
      if (docBtn && !this.uploadingAction) {
        event.preventDefault();
        const providerId = docBtn.dataset.id;
        const action = docBtn.dataset.docAction;
        const documentType = docBtn.dataset.docType || "";
        const documentId = docBtn.dataset.docId || null;
        const provider = this.providers.find((row) => row.id === providerId);
        if (!providerId || !action || !documentType || !provider) return;

        let notes = this.detail.querySelector(`[data-note="${CSS.escape(providerId)}"]`)?.value?.trim() || "";
        if (action === "request_document_correction" && !notes) {
          notes = this.applyNoteTemplate(providerId, "document", documentType);
        }

        const docLabel = this.documentLabel(documentType);
        if (!window.confirm(`Vas a ${this.actionCopy(action)}: ${docLabel}. La accion queda auditada. Continuamos?`)) return;

        const originalText = docBtn.textContent;
        this.uploadingAction = true;
        docBtn.disabled = true;
        docBtn.textContent = "Procesando...";

        try {
          const result = await this.invokeAdminFunction("admin-review-service-provider", {
            provider_id: providerId,
            action,
            document_type: documentType,
            document_id: documentId,
            notes
          });
          await this.insertAuditLog(`admin.provider.${action}`, provider, { action, document_type: documentType, document_id: documentId, notes });
          const feedback = this.notificationActionFeedback(
            result,
            action === "request_document_correction"
              ? "Documento observado. Notificacion enviada; esperando recepcion del prestador."
              : "Documento marcado como aprobado y notificado.",
            action === "request_document_correction"
              ? "Documento observado. No se pudo crear notificacion automatica."
              : "Documento marcado como aprobado. No se pudo crear notificacion automatica."
          );
          this.showFeedback(feedback.message, feedback.tone);
          this.alertedProviders.clear();
          await this.load({ keepSelection: true });
        } catch (error) {
          console.error("[adminServicesProviders.docAction]", error);
          this.showFeedback(error?.message || "No se pudo actualizar el documento.", "error");
        } finally {
          this.uploadingAction = false;
          docBtn.disabled = false;
          docBtn.textContent = originalText;
        }
        return;
      }

      const bulkDocBtn = event.target.closest("[data-doc-bulk-action]");
      if (bulkDocBtn && !this.uploadingAction) {
        event.preventDefault();
        const providerId = bulkDocBtn.dataset.id;
        const action = bulkDocBtn.dataset.docBulkAction;
        const provider = this.providers.find((row) => row.id === providerId);
        if (!providerId || !action || !provider) return;

        const selectedDocs = [...this.detail.querySelectorAll("[data-doc-select]:checked")]
          .map((input) => ({
            document_type: input.dataset.docType || "",
            document_id: input.dataset.docId || ""
          }))
          .filter((item) => item.document_type);

        if (!selectedDocs.length) {
          this.showFeedback("Selecciona al menos un documento para aplicar esta accion.", "warning");
          return;
        }

        let notes = this.detail.querySelector(`[data-note="${CSS.escape(providerId)}"]`)?.value?.trim() || "";
        if (action === "request_document_correction" && !notes) {
          notes = this.applyNoteTemplate(providerId, "correction");
        }

        const labels = selectedDocs.map((item) => this.documentLabel(item.document_type)).join(", ");
        if (!window.confirm(`Vas a ${this.actionCopy(action)} para: ${labels}. La accion queda auditada. Continuamos?`)) return;

        const originalText = bulkDocBtn.textContent;
        this.uploadingAction = true;
        bulkDocBtn.disabled = true;
        bulkDocBtn.textContent = "Procesando...";

        try {
          const result = await this.invokeAdminFunction("admin-review-service-provider", {
            provider_id: providerId,
            action,
            documents: selectedDocs,
            notes
          });
          await this.insertAuditLog(`admin.provider.${action}.bulk`, provider, { action, documents: selectedDocs, notes });
          const feedback = this.notificationActionFeedback(
            result,
            action === "request_document_correction"
              ? "Correccion multiple enviada; esperando recepcion del prestador."
              : "Documentos seleccionados marcados como aprobados y notificados.",
            action === "request_document_correction"
              ? "Correccion multiple guardada. No se pudo crear notificacion automatica."
              : "Documentos seleccionados marcados como aprobados. No se pudo crear notificacion automatica."
          );
          this.showFeedback(feedback.message, feedback.tone);
          this.alertedProviders.clear();
          await this.load({ keepSelection: true });
        } catch (error) {
          console.error("[adminServicesProviders.bulkDocAction]", error);
          this.showFeedback(error?.message || "No se pudo actualizar la seleccion de documentos.", "error");
        } finally {
          this.uploadingAction = false;
          bulkDocBtn.disabled = false;
          bulkDocBtn.textContent = originalText;
        }
        return;
      }

      const btn = event.target.closest("[data-action]");
      if (!btn || this.uploadingAction) return;
      event.preventDefault();

      const providerId = btn.dataset.id;
      const action = btn.dataset.action;
      const provider = this.providers.find((row) => row.id === providerId);
      if (!providerId || !action || !provider) return;

      const notes = this.detail.querySelector(`[data-note="${CSS.escape(providerId)}"]`)?.value?.trim() || "";
      if (["reject", "needs_resubmission", "block"].includes(action) && !notes) {
        alert("Agrega una nota clara antes de rechazar, pedir correccion o bloquear.");
        return;
      }

      if (!window.confirm(`Vas a ${this.actionCopy(action)}. La accion queda auditada. Continuamos?`)) return;

      const originalText = btn.textContent;
      this.uploadingAction = true;
      btn.disabled = true;
      btn.textContent = "Procesando...";

      try {
        const result = await this.invokeAdminFunction("admin-review-service-provider", {
          provider_id: providerId,
          action,
          notes
        });
        await this.insertAuditLog(`admin.provider.${action}`, provider, { action, notes });
        const feedback = this.notificationActionFeedback(
          result,
          "Decision guardada. Notificacion enviada; esperando recepcion del prestador.",
          "Decision guardada. No se pudo crear la notificacion automatica; revisa soporte si el usuario consulta."
        );
        this.showFeedback(feedback.message, feedback.tone);
        this.alertedProviders.clear();
        await this.load();
      } catch (error) {
        console.error("[adminServicesProviders.bindActions]", error);
        this.showFeedback(error?.message || "No se pudo actualizar el prestador.", "error");
      } finally {
        this.uploadingAction = false;
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    this.detail?.addEventListener("input", (event) => {
      const textarea = event.target.closest("[data-note]");
      if (!textarea) return;
      const counter = this.detail.querySelector(`[data-note-counter="${CSS.escape(textarea.dataset.note)}"]`);
      if (counter) counter.textContent = `${textarea.value.length}/500`;
    });
  }
}

window.adminServicesProviders = new AdminServicesProviders();
window.addEventListener("DOMContentLoaded", () => {
  window.adminServicesProviders.init();
});
