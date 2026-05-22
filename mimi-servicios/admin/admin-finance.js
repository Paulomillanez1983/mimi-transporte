import supabaseAdminService from "./supabase-admin-client.js?v=2026.05.14.3";

const refreshBtn = document.getElementById("financeRefreshBtn");
const includeTestsInput = document.getElementById("financeIncludeTests");
const gmvEl = document.getElementById("financeGmv");
const revenueEl = document.getElementById("financeRevenue");
const liabilityEl = document.getElementById("financeLiability");
const refundsEl = document.getElementById("financeRefunds");
const reconciliationBadgeEl = document.getElementById("financeReconciliationBadge");
const modeBadgeEl = document.getElementById("financeModeBadge");
const reconciliationListEl = document.getElementById("financeReconciliationList");
const closuresListEl = document.getElementById("financeClosuresList");
const exportsListEl = document.getElementById("financeExportsList");
const settlementBatchesListEl = document.getElementById("financeSettlementBatchesList");
const payoutBatchesListEl = document.getElementById("financePayoutBatchesList");
const runReconciliationBtn = document.getElementById("financeRunReconciliationBtn");
const calculateSettlementsBtn = document.getElementById("financeCalculateSettlementsBtn");
const approveLatestSettlementBtn = document.getElementById("financeApproveLatestSettlementBtn");
const createPayoutBatchBtn = document.getElementById("financeCreatePayoutBatchBtn");
const createExportBtn = document.getElementById("financeCreateExportBtn");
const closePeriodBtn = document.getElementById("financeClosePeriodBtn");
const paymentProviderRefreshBtn = document.getElementById("paymentProviderRefreshBtn");
const paymentProviderValidateBtn = document.getElementById("paymentProviderValidateBtn");
const paymentProviderTestBtn = document.getElementById("paymentProviderTestBtn");
const paymentProviderActivateBtn = document.getElementById("paymentProviderActivateBtn");
const paymentProviderSelect = document.getElementById("paymentProviderSelect");
const paymentProviderEnvironmentSelect = document.getElementById("paymentProviderEnvironmentSelect");
const paymentProviderReasonInput = document.getElementById("paymentProviderReason");
const paymentProviderActiveEl = document.getElementById("paymentProviderActive");
const paymentProviderEnvironmentEl = document.getElementById("paymentProviderEnvironment");
const paymentProviderConnectionEl = document.getElementById("paymentProviderConnection");
const paymentProviderEffectiveProviderEl = document.getElementById("paymentProviderEffectiveProvider");
const paymentProviderStatusBadgeEl = document.getElementById("paymentProviderStatusBadge");
const paymentProviderWebhookUrlEl = document.getElementById("paymentProviderWebhookUrl");
const paymentProviderRealMoneyNoticeEl = document.getElementById("paymentProviderRealMoneyNotice");
const paymentProviderMatrixEl = document.getElementById("paymentProviderMatrix");
const paymentProviderSecretsListEl = document.getElementById("paymentProviderSecretsList");
const paymentProviderLogListEl = document.getElementById("paymentProviderLogList");
const paymentProviderHealthListEl = document.getElementById("paymentProviderHealthList");
const providerPayoutAccountsRefreshBtn = document.getElementById("providerPayoutAccountsRefreshBtn");
const providerPayoutAccountReviewListEl = document.getElementById("providerPayoutAccountReviewList");

let latestSettlementBatch = null;
let paymentProviderState = null;

function formatMoney(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rowTemplate(title, subtitle, badge, tone = "") {
  return `
    <div class="financial-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <b class="financial-row-badge ${tone}">${escapeHtml(badge)}</b>
    </div>
  `;
}

function emptyTemplate(text) {
  return `<div class="financial-empty">${escapeHtml(text)}</div>`;
}

function badgeTone(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (["active", "validated", "ready"].includes(normalized)) return "success";
  if (["missing_secrets", "validation_failed", "real_payments_disabled", "disabled_real_payments"].includes(normalized)) return "danger";
  return "";
}

function renderList(target, rows, mapper, emptyText) {
  if (!target) return;
  target.innerHTML = rows?.length ? rows.map(mapper).join("") : emptyTemplate(emptyText);
}

async function fetchFinancialDashboard() {
  const auth = await supabaseAdminService.waitForActiveAdmin(4200);
  if (!auth.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const includeTests = includeTestsInput?.checked ? "1" : "0";
  const range = currentMonthRange();
  const params = new URLSearchParams({
    include_tests: includeTests,
    period_start: range.start,
    period_end: range.end
  });
  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/admin-financial-dashboard?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: supabaseAdminService.client.supabaseKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`FINANCE_DASHBOARD_${response.status}`);
  }

  return response.json();
}

async function postPaymentProviderConfig(action, payload = {}) {
  const auth = await supabaseAdminService.waitForActiveAdmin(4200);
  if (!auth.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/admin-payment-provider-config`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: supabaseAdminService.client.supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `PAYMENT_PROVIDER_CONFIG_${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
}

async function postProviderPayoutAccounts(action, payload = {}) {
  const auth = await supabaseAdminService.waitForActiveAdmin(4200);
  if (!auth.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/admin-provider-payout-accounts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: supabaseAdminService.client.supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action, ...payload })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `PROVIDER_PAYOUT_ACCOUNTS_${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
}

async function postVerifyProviderPayoutAccount(payload = {}) {
  const auth = await supabaseAdminService.waitForActiveAdmin(4200);
  if (!auth.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/verify-provider-payout-account`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: supabaseAdminService.client.supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: payload.action || "verify", ...payload })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || `VERIFY_PROVIDER_PAYOUT_ACCOUNT_${response.status}`);
    error.payload = data;
    throw error;
  }

  return data;
}

function renderDashboard(data) {
  const metrics = data?.metrics || {};
  latestSettlementBatch = data?.settlement_batches?.[0] || null;
  gmvEl.textContent = formatMoney(metrics.gmv);
  revenueEl.textContent = formatMoney(metrics.net_revenue);
  liabilityEl.textContent = formatMoney(metrics.provider_liabilities);
  refundsEl.textContent = formatMoney(metrics.refunds);

  const openDifferences = Number(metrics.reconciliation_open_differences ?? 0);
  reconciliationBadgeEl.textContent = openDifferences > 0 ? `${openDifferences} diferencias` : "Sin diferencias abiertas";
  reconciliationBadgeEl.className = openDifferences > 0 ? "financial-row-badge danger" : "financial-row-badge success";
  modeBadgeEl.textContent = data?.mode === "test" ? "Test / QA" : "Produccion";
  const paymentHealth = data?.payment_health || {};
  renderList(
    paymentProviderHealthListEl,
    [
      {
        title: "Checkouts abiertos",
        subtitle: "Pagos sandbox/preparados que todavia no estan aprobados.",
        value: Number(paymentHealth.open_checkouts ?? metrics.open_checkouts ?? 0),
        tone: Number(paymentHealth.open_checkouts ?? metrics.open_checkouts ?? 0) > 0 ? "danger" : "success"
      },
      {
        title: "Webhooks no recibidos",
        subtitle: "Checkouts abiertos sin eventos de procesador en el periodo.",
        value: Number(paymentHealth.missing_webhooks ?? metrics.missing_webhooks ?? 0),
        tone: Number(paymentHealth.missing_webhooks ?? metrics.missing_webhooks ?? 0) > 0 ? "danger" : "success"
      },
      {
        title: "Servicios sin pago aprobado",
        subtitle: "Solicitudes avanzadas o completadas sin payment APPROVED.",
        value: Number(paymentHealth.advanced_without_approved ?? metrics.advanced_without_approved ?? 0),
        tone: Number(paymentHealth.advanced_without_approved ?? metrics.advanced_without_approved ?? 0) > 0 ? "danger" : "success"
      }
    ],
    (row) => rowTemplate(row.title, row.subtitle, String(row.value), row.tone),
    "Sin alertas operativas de pago."
  );
  const canApproveLatest = latestSettlementBatch
    && ["calculated", "pending_review"].includes(String(latestSettlementBatch.status || "").toLowerCase());
  const canCreatePayout = latestSettlementBatch
    && ["approved", "locked"].includes(String(latestSettlementBatch.status || "").toLowerCase());
  if (approveLatestSettlementBtn) {
    approveLatestSettlementBtn.disabled = !canApproveLatest;
    approveLatestSettlementBtn.title = latestSettlementBatch
      ? "Aprueba la ultima liquidacion calculada para pasarla a payout."
      : "Primero genera una liquidacion.";
  }
  if (createPayoutBatchBtn) {
    createPayoutBatchBtn.disabled = !canCreatePayout;
    createPayoutBatchBtn.title = latestSettlementBatch
      ? "Crea payouts idempotentes para la ultima liquidacion aprobada."
      : "Primero genera y aprueba una liquidacion.";
  }

  renderList(
    reconciliationListEl,
    data?.reconciliation || [],
    (row) =>
      rowTemplate(
        `${row.report_type || "conciliacion"} - ${row.report_key || "sin clave"}`,
        `${formatDate(row.period_start)} a ${formatDate(row.period_end)} - diferencia ${formatMoney(row.difference_amount)}`,
        row.status || "draft",
        Number(row.differences_count ?? 0) > 0 ? "danger" : "success"
      ),
    "Todavia no hay reportes de conciliacion."
  );

  renderList(
    closuresListEl,
    data?.monthly_closures || [],
    (row) =>
      rowTemplate(
        row.closure_key || "Cierre mensual",
        `Revenue ${formatMoney(row.revenue_amount)} - deuda prestadores ${formatMoney(row.provider_liability_amount)}`,
        row.status || "draft",
        row.status === "closed" || row.status === "locked" ? "success" : ""
      ),
    "Todavia no hay cierres mensuales."
  );

  renderList(
    exportsListEl,
    data?.exports || [],
    (row) =>
      rowTemplate(
        `${row.export_type || "export"} ${String(row.format || "").toUpperCase()}`,
        `${formatDate(row.period_start)} a ${formatDate(row.period_end)} - ${row.export_key || "sin clave"}`,
        row.status || "queued",
        row.status === "ready" ? "success" : row.status === "failed" ? "danger" : ""
      ),
    "Todavia no hay exports contables."
  );

  renderList(
    settlementBatchesListEl,
    data?.settlement_batches || [],
    (row) =>
      rowTemplate(
        row.batch_key || "Liquidacion",
        `${formatDate(row.period_start)} a ${formatDate(row.period_end)} - neto ${formatMoney(row.net_amount)} - ${row.provider_count || 0} prestadores`,
        row.status || "draft",
        row.status === "failed" ? "danger" : row.status === "paid" ? "success" : ""
      ),
    "Todavia no hay batches de liquidacion."
  );

  renderList(
    payoutBatchesListEl,
    data?.payout_batches || [],
    (row) =>
      rowTemplate(
        row.batch_key || "Payout batch",
        `${row.payout_count || 0} pagos - neto ${formatMoney(row.net_amount)}`,
        row.status || "pending",
        row.status === "failed" || row.status === "on_hold" ? "danger" : row.status === "paid" ? "success" : ""
      ),
    "Todavia no hay batches de payout."
  );
}

function providerLabel(provider = "mock") {
  const labels = {
    mock: "Mock / test",
    mercadopago: "Mercado Pago",
    mobbex: "Mobbex",
    stripe: "Stripe",
    manual: "Manual / cash futuro"
  };
  return labels[provider] || provider;
}

function selectedProviderPayload() {
  return {
    provider: paymentProviderSelect?.value || "mock",
    environment: paymentProviderEnvironmentSelect?.value || "test"
  };
}

function renderProviderSecrets(provider, result = {}) {
  const supported = paymentProviderState?.supported_providers?.find((item) => item.provider === provider);
  const required = result.required_secrets || supported?.required_secrets || [];
  const missing = new Set(result.missing_secrets || []);
  const present = new Set(result.present_secrets || []);

  if (!required.length) {
    renderList(paymentProviderSecretsListEl, [{ name: "Sin secrets requeridos", status: "ok" }], (row) =>
      rowTemplate(row.name, "Proveedor de prueba o placeholder manual. No hay valores sensibles en DB.", "OK", "success")
    , "Sin secrets requeridos.");
    return;
  }

  renderList(
    paymentProviderSecretsListEl,
    required.map((name) => ({ name, missing: missing.has(name), present: present.has(name) })),
    (row) =>
      rowTemplate(
        row.name,
        row.missing ? "Falta configurar en Supabase Edge Function Secrets" : "Presente. Valor oculto.",
        row.missing ? "Falta" : row.present ? "Presente" : "Sin verificar",
        row.missing ? "danger" : row.present ? "success" : ""
      ),
    "Selecciona un proveedor para ver secrets requeridos."
  );
}

function providerSecretStatus(provider = {}) {
  const status = provider.secret_status || {};
  const required = status.required_secret_names || provider.required_secrets || [];
  const missing = status.missing_secret_names || [];
  const present = status.present_secret_names || [];
  return {
    required,
    missing,
    present,
    allPresent: required.length === 0 || status.all_present === true,
    missingCount: Number(status.missing_secret_count ?? missing.length)
  };
}

function renderProviderMatrix(data) {
  if (!paymentProviderMatrixEl) return;
  const supported = data?.supported_providers || [];
  if (!supported.length) {
    paymentProviderMatrixEl.innerHTML = emptyTemplate("Sin proveedores disponibles.");
    return;
  }

  paymentProviderMatrixEl.innerHTML = supported.map((provider) => {
    const status = providerSecretStatus(provider);
    const tone = status.allPresent ? "success" : "danger";
    const label = providerLabel(provider.provider);
    const subtitle = status.required.length
      ? status.missingCount > 0
        ? `Faltan: ${status.missing.join(", ")}`
        : `Presentes: ${status.present.join(", ")}`
      : "No requiere secrets. No mueve dinero real.";
    return `
      <div class="payment-provider-matrix-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <b class="financial-row-badge ${tone}">
          ${status.allPresent ? "Configurado" : `${status.missingCount} faltan`}
        </b>
      </div>
    `;
  }).join("");
}

function renderPaymentProviderConfig(data) {
  paymentProviderState = data;
  const runtime = data?.runtime_flags || {};
  const current = data?.current || data?.configs?.find((row) => row.is_active) || null;
  const selectedProvider = current?.provider || runtime.PAYMENT_PROVIDER || "mock";
  const selectedEnvironment = current?.environment || runtime.PAYMENT_ENVIRONMENT || "test";
  const selectedSupported = data?.supported_providers?.find((item) => item.provider === selectedProvider);

  if (paymentProviderSelect) paymentProviderSelect.value = selectedProvider;
  if (paymentProviderEnvironmentSelect) paymentProviderEnvironmentSelect.value = selectedEnvironment;

  paymentProviderActiveEl.textContent = providerLabel(selectedProvider);
  paymentProviderEnvironmentEl.textContent = selectedEnvironment === "production" ? "Produccion" : "Test";
  paymentProviderConnectionEl.textContent = current?.status || "Sin configurar";
  paymentProviderEffectiveProviderEl.textContent = providerLabel(runtime.effective_provider_for_money || "mock");
  paymentProviderWebhookUrlEl.textContent = current?.webhook_url || selectedSupported?.webhook_url || "Sin webhook";

  const realBlocked = runtime.real_money_blocked !== false;
  paymentProviderRealMoneyNoticeEl.hidden = !realBlocked;
  paymentProviderStatusBadgeEl.textContent = realBlocked
    ? "Dinero real desactivado"
    : "Dinero real habilitado por secrets";
  paymentProviderStatusBadgeEl.className = realBlocked ? "financial-row-badge danger" : "financial-row-badge success";

  renderProviderSecrets(selectedProvider, {
    required_secrets: current?.metadata_public?.required_secrets,
    missing_secrets: current?.metadata_public?.missing_secrets || [],
    present_secrets: current?.metadata_public?.present_secret_names || []
  });

  renderProviderMatrix(data);

  renderList(
    paymentProviderLogListEl,
    data?.audit_events || [],
    (row) => {
      const provider = row.metadata?.provider || "config";
      const env = row.metadata?.environment || row.environment || "n/a";
      return rowTemplate(
        row.event_type || "admin.payment_provider",
        `${provider} - ${env} - ${formatDate(row.created_at)}`,
        row.metadata?.payments_real_enabled ? "real flag on" : "real flag off",
        row.metadata?.payments_real_enabled ? "danger" : "success"
      );
    },
    "Todavia no hay eventos de pasarela."
  );
}

function accountIdentifier(account = {}) {
  return account.cbu_masked || account.cvu_masked || account.alias_masked || account.account_last4 || "Sin alias";
}

function renderPayoutAccountReviews(accounts = []) {
  renderList(
    providerPayoutAccountReviewListEl,
    accounts,
    (row) => {
      const encryptionBlocked = row.encrypted_payload_required === true;
      const tone = row.status === "verified" ? "success" : row.status === "rejected" ? "danger" : "";
      const ownershipStatus = row.ownership_verification_status || "not_verified";
      const ownershipTone = row.ownership_match ? "success" : ["ownership_mismatch", "account_inactive"].includes(ownershipStatus) ? "danger" : "";
      const actions = row.status === "pending_review"
        ? `
          <div class="financial-row-actions">
            <button type="button" data-payout-verify="true" data-account-id="${escapeHtml(row.id)}">Verificar API</button>
            ${row.ownership_match ? `<button type="button" data-payout-review="verified" data-account-id="${escapeHtml(row.id)}">Aprobar</button>` : ""}
            <button type="button" data-payout-review="needs_more_info" data-account-id="${escapeHtml(row.id)}">Pedir info</button>
            <button type="button" data-payout-review="manual_review" data-account-id="${escapeHtml(row.id)}">Revisión manual</button>
            <button type="button" data-payout-review="rejected" data-account-id="${escapeHtml(row.id)}">Rechazar</button>
          </div>
        `
        : "";
      const manualForm = row.status === "pending_review"
        ? `
          <form class="financial-manual-verification" data-payout-manual-form data-account-id="${escapeHtml(row.id)}">
            <label>
              <span>CUIT/CUIL observado en banco</span>
              <input name="observed_tax_id" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Solo numeros" required />
            </label>
            <label>
              <span>Titular observado</span>
              <input name="observed_holder_name" maxlength="120" autocomplete="off" placeholder="Nombre mostrado por banco" required />
            </label>
            <label>
              <span>Banco/entidad observado</span>
              <input name="observed_bank_name" maxlength="120" autocomplete="off" placeholder="Banco o billetera" required />
            </label>
            <label class="financial-manual-verification-wide">
              <span>Motivo</span>
              <input name="reason" maxlength="220" autocomplete="off" placeholder="Ej: titularidad validada en homebanking" required />
            </label>
            <label class="financial-manual-verification-check">
              <input type="checkbox" name="confirm_ownership_match" value="true" required />
              <span>Confirmo que el CUIT/CUIL del titular/cotitular coincide con el CUIT/CUIL verificado del prestador.</span>
            </label>
            <button type="submit">Aprobar titularidad manual</button>
          </form>
        `
        : "";
      return `
        <div class="financial-row financial-row-review">
          <div>
            <strong>${escapeHtml(row.provider_name || row.provider_email || row.provider_id || "Prestador")}</strong>
            <span>${escapeHtml(accountIdentifier(row))} - ${escapeHtml(row.status || "pending_review")} - ${formatDate(row.submitted_at || row.created_at)}</span>
            <span>Banco declarado: ${escapeHtml(row.bank_name || "Sin dato")} - Titular declarado: ${escapeHtml(row.holder_name_masked || "Enmascarado")}</span>
            <span>CUIT/CUIL declarado: ${escapeHtml(row.holder_tax_id_masked || "No informado")} - KYC: ${escapeHtml(row.provider_kyc_tax_id_status || "missing")} ${row.provider_kyc_tax_id_masked ? `(${escapeHtml(row.provider_kyc_tax_id_masked)})` : ""}</span>
            <span>Comprobante: ${row.payout_proof_present ? "adjunto" : "no adjunto"}</span>
            <span>Verificación titularidad: <b class="financial-row-badge ${ownershipTone}">${escapeHtml(ownershipStatus)}</b> ${row.ownership_match ? "match CUIT/CUIL" : "sin match aprobado"}</span>
            ${row.ownership_match_reason ? `<span>Razón: ${escapeHtml(row.ownership_match_reason)}</span>` : ""}
            ${encryptionBlocked ? '<em class="financial-inline-warning">Requiere payload cifrado antes de aprobar.</em>' : ""}
            ${ownershipStatus === "pending_missing_tax_id" ? '<em class="financial-inline-warning">Falta CUIT/CUIL KYC verificado. No se puede aprobar para payouts.</em>' : ""}
            ${ownershipStatus === "needs_more_info" ? '<em class="financial-inline-warning">Se pidio mas informacion al prestador. No queda habilitado para payout.</em>' : ""}
            ${manualForm}
            ${ownershipStatus === "pending_external_verification" ? '<em class="financial-inline-warning">Falta proveedor externo de verificación de titularidad.</em>' : ""}
          </div>
          <b class="financial-row-badge ${tone}">${escapeHtml(row.risk_status || "pending")}</b>
          ${actions}
        </div>
      `;
    },
    "Todavia no hay CBU/CVU en revision."
  );
}

async function verifyProviderPayoutAccount(accountId) {
  const reason = window.prompt("Motivo para verificar titularidad CBU/CVU")?.trim() || "";
  try {
    await postVerifyProviderPayoutAccount({ account_id: accountId, reason });
    await loadProviderPayoutAccountReviews();
  } catch (error) {
    const details = error.payload?.reason || error.message || "No se pudo verificar titularidad.";
    renderList(
      providerPayoutAccountReviewListEl,
      [{ title: error.payload?.error || "Verificación rechazada", subtitle: details, badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Verificación rechazada."
    );
  }
}

async function manualVerifyProviderPayoutAccount(form) {
  const formData = new FormData(form);
  const accountId = form.dataset.accountId;
  const observedTaxId = String(formData.get("observed_tax_id") || "").replace(/\D/g, "");
  const observedHolderName = String(formData.get("observed_holder_name") || "").trim();
  const observedBankName = String(formData.get("observed_bank_name") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  const confirmed = formData.get("confirm_ownership_match") === "true";

  if (!accountId || observedTaxId.length !== 11 || !observedHolderName || !observedBankName || reason.length < 10 || !confirmed) {
    renderList(
      providerPayoutAccountReviewListEl,
      [{
        title: "Revision manual incompleta",
        subtitle: "CUIT/CUIL observado completo, titular, banco, motivo y confirmacion son obligatorios.",
        badge: "No aplicado"
      }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Revision manual incompleta."
    );
    return;
  }

  try {
    await postVerifyProviderPayoutAccount({
      action: "manual_verify",
      account_id: accountId,
      observed_tax_id: observedTaxId,
      observed_holder_name: observedHolderName,
      observed_bank_name: observedBankName,
      reason,
      confirm_ownership_match: true
    });
    form.reset();
    await loadProviderPayoutAccountReviews();
  } catch (error) {
    const details = error.payload?.reason || error.message || "La revision manual fue rechazada de forma segura.";
    renderList(
      providerPayoutAccountReviewListEl,
      [{ title: error.payload?.error || "Revision manual rechazada", subtitle: details, badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Revision manual rechazada."
    );
  }
}

async function loadProviderPayoutAccountReviews() {
  if (!providerPayoutAccountsRefreshBtn) return;
  const original = providerPayoutAccountsRefreshBtn.textContent;
  providerPayoutAccountsRefreshBtn.disabled = true;
  providerPayoutAccountsRefreshBtn.textContent = "Cargando...";

  try {
    const data = await postProviderPayoutAccounts("list_pending");
    renderPayoutAccountReviews(data.accounts || []);
  } catch (error) {
    console.error("[admin-finance] payout account review load failed", error);
    renderList(
      providerPayoutAccountReviewListEl,
      [],
      null,
      "No pudimos cargar datos de cobro. Requiere FINANCE_ADMIN o SUPER_ADMIN."
    );
  } finally {
    providerPayoutAccountsRefreshBtn.disabled = false;
    providerPayoutAccountsRefreshBtn.textContent = original;
  }
}

async function reviewProviderPayoutAccount(accountId, decision) {
  const reason = window.prompt(
    decision === "verified"
      ? "Motivo para aprobar estos datos de cobro"
      : decision === "needs_more_info"
        ? "Que informacion debe corregir o completar el prestador?"
      : "Motivo para rechazar estos datos de cobro"
  )?.trim() || "";
  if (reason.length < 10) {
    renderList(
      providerPayoutAccountReviewListEl,
      [{ title: "Motivo requerido", subtitle: "Escribe al menos 10 caracteres para auditar la decision.", badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Motivo requerido."
    );
    return;
  }

  try {
    await postProviderPayoutAccounts("review", { account_id: accountId, decision, reason });
    await loadProviderPayoutAccountReviews();
  } catch (error) {
    const details = error.payload?.reason || error.message || "Operacion rechazada de forma segura.";
    renderList(
      providerPayoutAccountReviewListEl,
      [{ title: error.payload?.error || error.message || "Revision rechazada", subtitle: details, badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Revision rechazada."
    );
  }
}

async function loadPaymentProviderConfig() {
  if (!paymentProviderRefreshBtn) return;
  const original = paymentProviderRefreshBtn.textContent;
  paymentProviderRefreshBtn.disabled = true;
  paymentProviderRefreshBtn.textContent = "Cargando...";

  try {
    const data = await postPaymentProviderConfig("get_current_config");
    renderPaymentProviderConfig(data);
  } catch (error) {
    console.error("[admin-finance] provider config load failed", error);
    paymentProviderActiveEl.textContent = "Sin permiso";
    paymentProviderConnectionEl.textContent = error.message || "Error";
    renderList(
      paymentProviderSecretsListEl,
      [],
      null,
      "No pudimos cargar la pasarela. Requiere FINANCE_ADMIN o SUPER_ADMIN."
    );
  } finally {
    paymentProviderRefreshBtn.disabled = false;
    paymentProviderRefreshBtn.textContent = original;
  }
}

async function runPaymentProviderAction(button, loadingLabel, action, extraPayload = {}) {
  if (!button) return;
  const original = button.textContent;
  const payload = {
    ...selectedProviderPayload(),
    ...extraPayload
  };

  button.disabled = true;
  button.textContent = loadingLabel;

  try {
    const data = await postPaymentProviderConfig(action, payload);
    renderProviderSecrets(payload.provider, data);
    await loadPaymentProviderConfig();
  } catch (error) {
    console.error("[admin-finance] provider action failed", action, error);
    const data = error.payload || {};
    renderProviderSecrets(payload.provider, data);
    renderList(
      paymentProviderLogListEl,
      [{ title: data.error || error.message || "Error", subtitle: data.missing_secrets?.join(", ") || "Operacion rechazada de forma segura", badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Operacion rechazada."
    );
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    periodKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  };
}

async function postFinanceOperation(action, payload = {}) {
  const auth = await supabaseAdminService.waitForActiveAdmin(4200);
  if (!auth.ok || !auth.session?.access_token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/admin-financial-operations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: supabaseAdminService.client.supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        include_tests: Boolean(includeTestsInput?.checked),
        ...payload
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `FINANCE_OPERATION_${response.status}`);
  }

  return data;
}

async function runAction(button, label, action, payload) {
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;

  try {
    await postFinanceOperation(action, payload);
    await loadFinancialDashboard();
  } catch (error) {
    console.error("[admin-finance] operation failed", action, error);
    renderList(reconciliationListEl, [], null, `No pudimos ejecutar ${action}. Revisa permisos, periodo o conciliacion.`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadFinancialDashboard() {
  if (!refreshBtn) return;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Cargando...";

  try {
    const [data] = await Promise.all([
      fetchFinancialDashboard(),
      loadPaymentProviderConfig().catch((error) => {
        console.info("[admin-finance] provider config optional load failed", error?.message || error);
      }),
      loadProviderPayoutAccountReviews().catch((error) => {
        console.info("[admin-finance] payout account reviews optional load failed", error?.message || error);
      })
    ]);
    renderDashboard(data);
  } catch (error) {
    console.error("[admin-finance] dashboard load failed", error);
    renderList(reconciliationListEl, [], null, "No pudimos cargar Finanzas. Reintenta o revisa el deploy de la funcion.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Recargar";
  }
}

refreshBtn?.addEventListener("click", loadFinancialDashboard);
includeTestsInput?.addEventListener("change", loadFinancialDashboard);
runReconciliationBtn?.addEventListener("click", () => {
  const range = currentMonthRange();
  runAction(runReconciliationBtn, "Conciliando...", "run_reconciliation", {
    period_start: range.start,
    period_end: range.end,
    report_type: "psp"
  });
});
calculateSettlementsBtn?.addEventListener("click", () => {
  const range = currentMonthRange();
  runAction(calculateSettlementsBtn, "Calculando...", "calculate_settlements", {
    period_start: range.start,
    period_end: range.end,
    settlement_type: "monthly"
  });
});
approveLatestSettlementBtn?.addEventListener("click", () => {
  if (!latestSettlementBatch?.id) return;
  const ok = window.confirm(`Aprobar la liquidacion ${latestSettlementBatch.batch_key || latestSettlementBatch.id}?`);
  if (!ok) return;
  runAction(approveLatestSettlementBtn, "Aprobando...", "approve_settlement_batch", {
    settlement_batch_id: latestSettlementBatch.id
  });
});
createPayoutBatchBtn?.addEventListener("click", () => {
  if (!latestSettlementBatch?.id) return;
  const ok = window.confirm(`Crear payouts para ${latestSettlementBatch.batch_key || latestSettlementBatch.id}?`);
  if (!ok) return;
  runAction(createPayoutBatchBtn, "Creando payouts...", "create_payout_batch", {
    settlement_batch_id: latestSettlementBatch.id
  });
});
createExportBtn?.addEventListener("click", () => {
  const range = currentMonthRange();
  runAction(createExportBtn, "Generando...", "create_export", {
    period_start: range.start,
    period_end: range.end,
    export_type: "monthly_accounting",
    format: "json"
  });
});
closePeriodBtn?.addEventListener("click", () => {
  const range = currentMonthRange();
  const ok = window.confirm(`Cerrar el periodo ${range.periodKey}? Esta accion bloquea movimientos fiscales retroactivos.`);
  if (!ok) return;
  runAction(closePeriodBtn, "Cerrando...", "close_period", {
    period_key: range.periodKey,
    period_start: range.start.slice(0, 10),
    period_end: new Date(new Date(range.end).getTime() - 86400000).toISOString().slice(0, 10),
    force: false
  });
});
paymentProviderRefreshBtn?.addEventListener("click", loadPaymentProviderConfig);
paymentProviderSelect?.addEventListener("change", () => {
  renderProviderSecrets(paymentProviderSelect.value);
  const supported = paymentProviderState?.supported_providers?.find((item) => item.provider === paymentProviderSelect.value);
  paymentProviderWebhookUrlEl.textContent = supported?.webhook_url || "Sin webhook";
});
paymentProviderValidateBtn?.addEventListener("click", () => {
  runPaymentProviderAction(paymentProviderValidateBtn, "Validando...", "validate_provider_config");
});
paymentProviderTestBtn?.addEventListener("click", () => {
  runPaymentProviderAction(paymentProviderTestBtn, "Probando...", "test_connection");
});
paymentProviderActivateBtn?.addEventListener("click", () => {
  const payload = selectedProviderPayload();
  const reason = paymentProviderReasonInput?.value?.trim() || "";
  if (reason.length < 10) {
    renderList(
      paymentProviderLogListEl,
      [{ title: "Motivo requerido", subtitle: "Escribe al menos 10 caracteres para auditar el cambio.", badge: "No aplicado" }],
      (row) => rowTemplate(row.title, row.subtitle, row.badge, "danger"),
      "Motivo requerido."
    );
    return;
  }
  const ok = window.confirm(`Cambiar pasarela a ${providerLabel(payload.provider)} en ${payload.environment}? Solo afectara pagos nuevos.`);
  if (!ok) return;
  runPaymentProviderAction(paymentProviderActivateBtn, "Cambiando...", "set_active_provider", {
    reason
  });
});
providerPayoutAccountsRefreshBtn?.addEventListener("click", loadProviderPayoutAccountReviews);
providerPayoutAccountReviewListEl?.addEventListener("click", (event) => {
  const verifyButton = event.target?.closest?.("[data-payout-verify]");
  if (verifyButton) {
    verifyProviderPayoutAccount(verifyButton.dataset.accountId);
    return;
  }

  const button = event.target?.closest?.("[data-payout-review]");
  if (!button) return;
  reviewProviderPayoutAccount(button.dataset.accountId, button.dataset.payoutReview);
});
providerPayoutAccountReviewListEl?.addEventListener("submit", (event) => {
  const form = event.target?.closest?.("[data-payout-manual-form]");
  if (!form) return;
  event.preventDefault();
  manualVerifyProviderPayoutAccount(form);
});
window.addEventListener("mimi-admin:mobile-view-change", (event) => {
  if (event.detail?.view === "finance") {
    loadFinancialDashboard();
    loadPaymentProviderConfig();
    loadProviderPayoutAccountReviews();
  }
});

window.mimiAdminFinance = {
  reload: loadFinancialDashboard
};
