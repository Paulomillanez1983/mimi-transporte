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
async invokeAdminFunction(functionName, body = {}) {
  if (!functionName) {
    throw new Error("Nombre de función requerido.");
  }

  await supabaseAdminService.waitForActiveAdmin?.();

  const { data, error } = await supabaseAdminService.client.auth.getSession();

  if (error) throw error;

  const token = data?.session?.access_token;

  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

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
async init() {
  if (!this.root || !this.list) return;

  this.bindActions();
  await this.load();
}
  
  async load() {
    const result = await this.invokeAdminFunction("admin-list-service-providers", {});
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

    const bucketBase = "https://xrphpqmutvadjrucqicn.supabase.co/storage/v1/object/public/";

    const dniUrl =
      dni?.storage_bucket && dni?.storage_path
        ? `${bucketBase}${dni.storage_bucket}/${dni.storage_path}`
        : null;

    const selfieUrl =
      selfie?.storage_bucket && selfie?.storage_path
        ? `${bucketBase}${selfie.storage_bucket}/${selfie.storage_path}`
        : null;

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
          ${dniUrl ? `<a target="_blank" href="${dniUrl}">DNI</a>` : ""}
          ${selfieUrl ? `<a target="_blank" href="${selfieUrl}">Selfie</a>` : ""}
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
      this.list.querySelector(`[data-note="${providerId}"]`)?.value?.trim() || null;

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
  window.adminServicesProviders = new AdminServicesProviders();
window.addEventListener("DOMContentLoaded", () => window.adminServicesProviders.init());
