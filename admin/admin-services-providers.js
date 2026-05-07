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
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body || {})
    });

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(json?.error || json?.message || `Error ${response.status}`);
    }

    return json;
  }

  async getSignedDocumentUrl(doc) {
    const bucket = doc?.storage_bucket;
    const path = doc?.storage_path;

    if (!bucket || !path) return null;

    try {
      const { data, error } = await supabaseAdminService.client.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 5);

      if (error) {
        console.info("[admin-services-providers.getSignedDocumentUrl] Documento no accesible", {
          id: doc?.id,
          type: doc?.document_type,
          path,
          message: error?.message || error?.error || String(error)
        });
        return null;
      }

      return data?.signedUrl || null;
    } catch (error) {
      console.info("[admin-services-providers.getSignedDocumentUrl.catch] Documento no accesible", {
        id: doc?.id,
        type: doc?.document_type,
        path,
        message: error?.message || String(error)
      });
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
    const result = await this.invokeAdminFunction("admin-list-service-providers", {});
    this.providers = Array.isArray(result?.providers) ? result.providers : [];

    this.renderMetrics(this.providers);
    this.renderActiveFilter();
    await this.renderList();
  }

  getProviderStatus(provider) {
const profile = Array.isArray(provider?.svc_provider_profiles)
  ? provider.svc_provider_profiles[0] || {}
  : provider?.svc_provider_profiles || {};
    
    if (provider?.blocked) return "blocked";
    if (profile?.kyc_status === "rejected") return "rejected";
    if (provider?.approved && !provider?.blocked) return "approved";

    return "pending";
  }

  getFilteredProviders() {
    if (this.activeFilter === "all") return this.providers;

    return this.providers.filter((provider) => {
      return this.getProviderStatus(provider) === this.activeFilter;
    });
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
    const filterButtons = document.querySelectorAll("[data-provider-filter]");

    filterButtons.forEach((btn) => {
      const isActive = btn.dataset.providerFilter === this.activeFilter;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  async renderList() {
    const rows = this.getFilteredProviders();

    if (!rows.length) {
      this.list.innerHTML = `
        <div class="admin-empty-state">
          <p>No hay prestadores para este filtro.</p>
        </div>
      `;
      return;
    }

    const htmlRows = await Promise.all(
      rows.map(async (provider) => {
const profile = Array.isArray(provider?.svc_provider_profiles)
  ? provider.svc_provider_profiles[0] || {}
  : provider?.svc_provider_profiles || {};        const docs = provider.svc_provider_documents || [];
        

        const dni = docs.find((d) => d.document_type === "dni_front");
        const dniBack = docs.find((d) => d.document_type === "dni_back");
        const selfie = docs.find((d) => d.document_type === "selfie");

        const dniUrl = await this.getSignedDocumentUrl(dni);
        const dniBackUrl = await this.getSignedDocumentUrl(dniBack);
        const selfieUrl = await this.getSignedDocumentUrl(selfie);

        const providerId = this.escapeHtml(provider.id);
        const fullName = this.escapeHtml(provider.full_name || "Sin nombre");
        const email = this.escapeHtml(provider.email || "Sin email");
        const kycStatus = this.escapeHtml(profile.kyc_status || "pending");
        const aiScore = this.escapeHtml(profile.ai_score ?? 0);
        const aiScoreLabel = this.escapeHtml(profile.ai_score_label || "pending");
        const reviewStatus = this.escapeHtml(profile.review_status || "pending");

        return `
          <article class="provider-review-card">
            <div class="provider-review-head">
              <div>
                <h3>${fullName}</h3>
                <p>${email}</p>
              </div>
              <span class="score-pill">${aiScore}</span>
            </div>

            <div class="provider-review-grid">
              <div><strong>KYC:</strong> ${kycStatus}</div>
              <div><strong>Score:</strong> ${aiScoreLabel}</div>
              <div><strong>Review:</strong> ${reviewStatus}</div>
            </div>

            <div class="provider-docs">
              ${dniUrl ? `<a target="_blank" rel="noopener noreferrer" href="${this.escapeHtml(dniUrl)}">DNI frente</a>` : `<span>DNI frente no disponible</span>`}
              ${dniBackUrl ? `<a target="_blank" rel="noopener noreferrer" href="${this.escapeHtml(dniBackUrl)}">DNI dorso</a>` : `<span>DNI dorso pendiente</span>`}
              ${selfieUrl ? `<a target="_blank" rel="noopener noreferrer" href="${this.escapeHtml(selfieUrl)}">Selfie</a>` : `<span>Selfie no disponible</span>`}
            </div>

            <textarea class="review-note" data-note="${providerId}" placeholder="Notas de revisión"></textarea>

            <div class="provider-review-actions">
              <button class="btn approve" data-action="approve" data-id="${providerId}">Aprobar</button>
              <button class="btn reject" data-action="reject" data-id="${providerId}">Rechazar</button>
              <button class="btn block" data-action="needs_resubmission" data-id="${providerId}">Revisión</button>
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
      event.stopPropagation();

      this.activeFilter = btn.dataset.providerFilter || "all";

      this.renderActiveFilter();
      await this.renderList();
    });
  }

  bindActions() {
    if (this._actionsBound) return;
    this._actionsBound = true;

    this.list.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();

      const providerId = btn.dataset.id;
      const action = btn.dataset.action;
      if (!providerId || !action) return;

      const notes =
        this.list.querySelector(`[data-note="${CSS.escape(providerId)}"]`)?.value?.trim() || null;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Procesando...";

      try {
        await this.invokeAdminFunction("admin-review-service-provider", {
          provider_id: providerId,
          action,
          notes
        });

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
