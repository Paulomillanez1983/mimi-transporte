import supabaseAdminService from "./supabase-admin-client.js";

class AdminServicesProviders {
  constructor() {
    this.root = document.getElementById("servicesProvidersModule");
    this.list = document.getElementById("providersReviewList");
    this.metrics = {
      total: document.getElementById("svcMetricTotal"),
      pending: document.getElementById("svcMetricPending"),
      approved: document.getElementById("svcMetricApproved"),
      rejected: document.getElementById("svcMetricRejected"),
      blocked: document.getElementById("svcMetricBlocked")
    };
    this.providers = [];
    this.activeFilter = "all";
    this._actionsBound = false;
    this._filtersBound = false;
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

  scoreNumber(provider) {
    const value = Number(this.getProfile(provider)?.ai_score ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  }

  scoreGuidance(score) {
    if (score >= 80) return "Candidato fuerte: validar documentos y aprobar si la identidad coincide.";
    if (score >= 60) return "Revisión manual: pedir soporte si falta DNI dorso, selfie o matrícula.";
    return "Riesgo alto: no aprobar sin corrección documental.";
  }

  actionCopy(action) {
    return {
      approve: "aprobar este prestador",
      reject: "rechazar esta verificación",
      needs_resubmission: "pedir corrección de documentación",
      block: "bloquear este prestador"
    }[action] || "actualizar este prestador";
  }

  async invokeAdminFunction(functionName, body = {}) {
    if (!functionName) throw new Error("Nombre de función requerido.");
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
    if (!response.ok) throw new Error(json?.error || json?.message || `Error ${response.status}`);
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
      console.info("[admin-services-providers.insertAuditLog] Auditoría no persistida", error?.message || error);
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
    this.bindFilters();
    this.bindActions();
    await this.load();
  }

  async load() {
    this.list.innerHTML = `<div class="admin-empty-state">Cargando prestadores...</div>`;
    const result = await this.invokeAdminFunction("admin-list-service-providers", {});
    this.providers = Array.isArray(result?.providers) ? result.providers : [];
    this.renderMetrics(this.providers);
    this.renderActiveFilter();
    await this.renderList();
  }

  getProviderStatus(provider) {
    const profile = this.getProfile(provider);
    const reviewStatus = this.normalize(profile?.review_status || profile?.kyc_status || provider?.status);
    if (provider?.blocked) return "blocked";
    if (["rejected", "rechazado"].includes(reviewStatus)) return "rejected";
    if (provider?.approved && !provider?.blocked) return "approved";
    return "pending";
  }

  getFilteredProviders() {
    if (this.activeFilter === "all") return this.providers;
    return this.providers.filter((provider) => this.getProviderStatus(provider) === this.activeFilter);
  }

  renderMetrics(rows) {
    const total = rows.length;
    const pending = rows.filter((x) => this.getProviderStatus(x) === "pending").length;
    const approved = rows.filter((x) => this.getProviderStatus(x) === "approved").length;
    const rejected = rows.filter((x) => this.getProviderStatus(x) === "rejected").length;
    const blocked = rows.filter((x) => this.getProviderStatus(x) === "blocked").length;
    if (this.metrics.total) this.metrics.total.textContent = total;
    if (this.metrics.pending) this.metrics.pending.textContent = pending;
    if (this.metrics.approved) this.metrics.approved.textContent = approved;
    if (this.metrics.rejected) this.metrics.rejected.textContent = rejected;
    if (this.metrics.blocked) this.metrics.blocked.textContent = blocked;
  }

  renderActiveFilter() {
    document.querySelectorAll("[data-provider-filter]").forEach((btn) => {
      const isActive = btn.dataset.providerFilter === this.activeFilter;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  renderDocumentBadge(docs, type, label, urls) {
    const doc = docs.find((d) => d.document_type === type);
    const url = urls[type];
    const status = doc?.review_status || doc?.status || "pendiente";
    if (url) {
      return `<a target="_blank" rel="noopener noreferrer" href="${this.escapeHtml(url)}">${this.escapeHtml(label)} · ${this.escapeHtml(status)}</a>`;
    }
    return `<span class="${doc ? "doc-missing-file" : "doc-pending"}">${this.escapeHtml(label)} · ${doc ? "archivo no accesible" : "pendiente"}</span>`;
  }

  async renderList() {
    const rows = this.getFilteredProviders();
    if (!rows.length) {
      this.list.innerHTML = `<div class="admin-empty-state"><p>No hay prestadores para este filtro.</p></div>`;
      return;
    }

    const htmlRows = await Promise.all(
      rows.map(async (provider) => {
        const profile = this.getProfile(provider);
        const docs = this.getDocs(provider);
        const wantedDocs = ["dni_front", "dni_back", "selfie", "professional_license", "background_check"];
        const urls = {};
        await Promise.all(wantedDocs.map(async (type) => {
          const doc = docs.find((d) => d.document_type === type);
          urls[type] = await this.getSignedDocumentUrl(doc);
        }));

        const providerId = this.escapeHtml(provider.id);
        const score = this.scoreNumber(provider);
        const status = this.getProviderStatus(provider);
        const modes = Array.isArray(profile.service_modes) ? profile.service_modes.join(", ") : profile.service_modes || "Sin modalidad";
        const category = provider.category || provider.service_type || profile.primary_category || "Servicio";
        const reviewedAt = profile.reviewed_at || docs.find((d) => d.reviewed_at)?.reviewed_at;

        return `
          <article class="provider-review-card" data-provider-id="${providerId}">
            <div class="provider-review-head">
              <div>
                <h3>${this.escapeHtml(provider.full_name || "Prestador sin nombre")}</h3>
                <p>${this.escapeHtml(provider.email || "Sin email")} · ${this.escapeHtml(provider.phone || "Sin teléfono")}</p>
              </div>
              <div class="provider-review-side">
                <span class="status-badge ${this.escapeHtml(status)}">${this.escapeHtml(status)}</span>
                <span class="score-pill compact">${this.escapeHtml(score)}</span>
              </div>
            </div>

            <div class="provider-review-grid">
              <div><strong>Categoría</strong><span>${this.escapeHtml(category)}</span></div>
              <div><strong>KYC</strong><span>${this.escapeHtml(profile.kyc_status || "pending")}</span></div>
              <div><strong>Review</strong><span>${this.escapeHtml(profile.review_status || "pending")}</span></div>
              <div><strong>Modalidad</strong><span>${this.escapeHtml(modes)}</span></div>
              <div><strong>Última revisión</strong><span>${this.escapeHtml(this.formatDate(reviewedAt))}</span></div>
              <div><strong>Regla score</strong><span>${this.escapeHtml(this.scoreGuidance(score))}</span></div>
            </div>

            <div class="provider-docs">
              ${this.renderDocumentBadge(docs, "dni_front", "DNI frente", urls)}
              ${this.renderDocumentBadge(docs, "dni_back", "DNI dorso", urls)}
              ${this.renderDocumentBadge(docs, "selfie", "Selfie", urls)}
              ${this.renderDocumentBadge(docs, "professional_license", "Matrícula", urls)}
              ${this.renderDocumentBadge(docs, "background_check", "Buena conducta", urls)}
            </div>

            <textarea class="review-note" data-note="${providerId}" placeholder="Nota clara para auditoría, aprobación o corrección"></textarea>

            <div class="provider-review-actions">
              <button class="btn approve" data-action="approve" data-id="${providerId}">Aprobar</button>
              <button class="btn" data-action="needs_resubmission" data-id="${providerId}">Pedir corrección</button>
              <button class="btn reject" data-action="reject" data-id="${providerId}">Rechazar</button>
              <button class="btn block" data-action="block" data-id="${providerId}">Bloquear</button>
            </div>
          </article>
        `;
      })
    );

    this.list.innerHTML = htmlRows.join("");
  }

  bindFilters() {
    if (this._filtersBound) return;
    this._filtersBound = true;
    document.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-provider-filter]");
      if (!btn) return;
      event.preventDefault();
      this.activeFilter = btn.dataset.providerFilter || "all";
      this.renderActiveFilter();
      await this.renderList();
    });
  }

  bindActions() {
    if (this._actionsBound || !this.list) return;
    this._actionsBound = true;
    this.list.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;
      event.preventDefault();

      const providerId = btn.dataset.id;
      const action = btn.dataset.action;
      const provider = this.providers.find((row) => row.id === providerId);
      if (!providerId || !action || !provider) return;

      const notes = this.list.querySelector(`[data-note="${CSS.escape(providerId)}"]`)?.value?.trim() || "";
      if (["reject", "needs_resubmission", "block"].includes(action) && !notes) {
        alert("Agregá una nota clara antes de rechazar, pedir corrección o bloquear.");
        return;
      }

      if (!window.confirm(`Vas a ${this.actionCopy(action)}. La acción queda auditada. ¿Continuamos?`)) return;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Procesando...";

      try {
        await this.invokeAdminFunction("admin-review-service-provider", {
          provider_id: providerId,
          action,
          notes
        });
        await this.insertAuditLog(`admin.provider.${action}`, provider, { action, notes });
        await this.load();
      } catch (error) {
        console.error("[adminServicesProviders.bindActions]", error);
        alert(error?.message || "No se pudo actualizar el prestador.");
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }
}

window.adminServicesProviders = new AdminServicesProviders();
window.addEventListener("DOMContentLoaded", () => {
  window.adminServicesProviders.init();
});
