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
  gmvEl.textContent = formatMoney(metrics.gmv);
  revenueEl.textContent = formatMoney(metrics.net_revenue);
  liabilityEl.textContent = formatMoney(metrics.provider_liabilities);
  refundsEl.textContent = formatMoney(metrics.refunds);

  const openDifferences = Number(metrics.reconciliation_open_differences ?? 0);
  reconciliationBadgeEl.textContent = openDifferences > 0 ? `${openDifferences} diferencias` : "Sin diferencias abiertas";
  reconciliationBadgeEl.className = openDifferences > 0 ? "financial-row-badge danger" : "financial-row-badge success";
  modeBadgeEl.textContent = data?.mode === "test" ? "Test / QA" : "Produccion";

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
window.addEventListener("mimi-admin:mobile-view-change", (event) => {
  if (event.detail?.view === "finance") {
    loadFinancialDashboard();
  }
});

window.mimiAdminFinance = {
  reload: loadFinancialDashboard
};
