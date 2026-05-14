import supabaseAdminService from "./supabase-admin-client.js";

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

let latestSettlementBatch = null;

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
  const response = await fetch(
    `${supabaseAdminService.client.supabaseUrl}/functions/v1/admin-financial-dashboard?include_tests=${includeTests}`,
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
    const data = await fetchFinancialDashboard();
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
window.addEventListener("mimi-admin:mobile-view-change", (event) => {
  if (event.detail?.view === "finance") {
    loadFinancialDashboard();
  }
});

window.mimiAdminFinance = {
  reload: loadFinancialDashboard
};
