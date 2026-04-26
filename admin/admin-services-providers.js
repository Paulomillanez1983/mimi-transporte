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
  }

  async init() {
    if (!this.root) return;
    await this.load();
  }

  async load() {
    const result = await supabaseAdminService.invoke("admin-list-service-providers", {});
    const providers = result?.providers ?? [];

    this.renderMetrics(providers);
    this.renderList(providers);
  }

  renderMetrics(rows) {
    const total = rows.length;
    const pending = rows.filter(x => !x.approved && !x.blocked).length;
    const approved = rows.filter(x => x.approved && !x.blocked).length;
    const rejected = rows.filter(x => x.svc_provider_profiles?.[0]?.kyc_status === "rejected").length;
    const blocked = rows.filter(x => x.blocked).length;

    this.metrics.total.textContent = total;
    this.metrics.pending.textContent = pending;
    this.metrics.approved.textContent = approved;
    this.metrics.rejected.textContent = rejected;
    this.metrics.blocked.textContent = blocked;
  }

  renderList(rows) {
    this.list.innerHTML = rows.map(provider => {
      const profile = provider.svc_provider_profiles?.[0] || {};
      const docs = provider.svc_provider_documents || [];
      const dni = docs.find(d => d.document_type === "dni_front");
      const selfie = docs.find(d => d.document_type === "selfie");

      return `
        <article class="provider-review-card">
          <div class="provider-review-head">
            <div>
              <h3>${provider.full_name || "Sin nombre"}</h3>
              <p>${provider.email || "Sin email"}</p>
            </div>
            <span class="score-pill">${profile.ai_score ?? 0}</span>
          </div>

          <div class="provider-review-grid">
            <div><strong>KYC:</strong> ${profile.kyc_status || "pending"}</div>
            <div><strong>Score:</strong> ${profile.ai_score_label || "pending"}</div>
            <div><strong>Review:</strong> ${profile.review_status || "pending"}</div>
          </div>

          <div class="provider-docs">
            ${dni ? `<a target="_blank" href="${dni.metadata_json?.public_url || "#"}">DNI</a>` : ""}
            ${selfie ? `<a target="_blank" href="${selfie.metadata_json?.public_url || "#"}">Selfie</a>` : ""}
          </div>

          <textarea class="review-note" data-note="${provider.id}" placeholder="Notas de revisión"></textarea>

          <div class="provider-review-actions">
            <button class="btn approve" data-action="approve" data-id="${provider.id}">Aprobar</button>
            <button class="btn reject" data-action="reject" data-id="${provider.id}">Rechazar</button>
            <button class="btn block" data-action="needs_resubmission" data-id="${provider.id}">Revisión</button>
            <button class="btn block" data-action="block" data-id="${provider.id}">Bloquear</button>
          </div>
        </article>
      `;
    }).join("");

    this.bindActions();
  }

  bindActions() {
    this.list.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const providerId = btn.dataset.id;
        const action = btn.dataset.action;
        const notes = this.list.querySelector(`[data-note="${providerId}"]`)?.value || null;

        await supabaseAdminService.invoke("admin-review-service-provider", {
          provider_id: providerId,
          action,
          notes
        });

        await this.load();
      });
    });
  }
}

window.adminServicesProviders = new AdminServicesProviders();
window.addEventListener("DOMContentLoaded", () => window.adminServicesProviders.init());
