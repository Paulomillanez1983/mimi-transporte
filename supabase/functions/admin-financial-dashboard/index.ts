import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function money(rows: Record<string, unknown>[] | null | undefined, key: string) {
  return Number((rows ?? []).reduce((sum, row) => sum + Number(row[key] ?? 0), 0).toFixed(2));
}

async function requireAdmin(supabase: ReturnType<typeof createClient>, req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false as const, response: json({ ok: false, error: "AUTH_REQUIRED" }, 401) };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { ok: false as const, response: json({ ok: false, error: "AUTH_INVALID" }, 401) };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id,active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (adminError || !adminUser) {
    return { ok: false as const, response: json({ ok: false, error: "FORBIDDEN" }, 403) };
  }

  return { ok: true as const, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const admin = await requireAdmin(supabase, req);
  if (!admin.ok) return admin.response;

  const url = new URL(req.url);
  const includeTests = url.searchParams.get("include_tests") === "1";
  const fiscalVisibility = includeTests ? undefined : "fiscal_reportable";

  const [revenueRes, earningsRes, payoutsRes, refundsRes, reportsRes, itemsRes, closesRes, exportsRes, batchesRes, payoutBatchesRes] = await Promise.all([
    supabase
      .from("platform_revenue")
      .select("gross_amount,revenue_amount,currency,created_at,fiscal_visibility,is_test")
      .eq("is_test", includeTests ? true : false)
      .match(fiscalVisibility ? { fiscal_visibility: fiscalVisibility } : {})
      .limit(5000),
    supabase
      .from("provider_earnings")
      .select("gross_amount,commission_amount,psp_fee_amount,net_amount,status,currency,created_at,fiscal_visibility,is_test")
      .eq("is_test", includeTests ? true : false)
      .match(fiscalVisibility ? { fiscal_visibility: fiscalVisibility } : {})
      .limit(5000),
    supabase
      .from("payouts")
      .select("amount,status,currency,created_at,fiscal_visibility,is_test")
      .eq("is_test", includeTests ? true : false)
      .match(fiscalVisibility ? { fiscal_visibility: fiscalVisibility } : {})
      .limit(5000),
    supabase
      .from("refunds")
      .select("amount,status,currency,created_at,fiscal_visibility,is_test")
      .eq("is_test", includeTests ? true : false)
      .match(fiscalVisibility ? { fiscal_visibility: fiscalVisibility } : {})
      .limit(5000),
    supabase
      .from("reconciliation_reports")
      .select("report_key,report_type,status,difference_amount,differences_count,period_start,period_end,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("reconciliation_items")
      .select("discrepancy_status,severity,difference_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("monthly_closures")
      .select("closure_key,status,gross_amount,revenue_amount,provider_liability_amount,discrepancy_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("financial_exports")
      .select("export_key,export_type,format,status,period_start,period_end,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("settlement_batches")
      .select("id,batch_key,settlement_type,status,period_start,period_end,provider_count,gross_amount,commission_amount,net_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("payout_batches")
      .select("id,batch_key,status,provider_count,payout_count,net_amount,created_at")
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const revenueRows = revenueRes.data ?? [];
  const earningRows = earningsRes.data ?? [];
  const payoutRows = payoutsRes.data ?? [];
  const refundRows = refundsRes.data ?? [];
  const pendingPayouts = payoutRows.filter((row) => ["pending", "processing", "failed", "on_hold"].includes(String(row.status ?? "")));
  const reconciliationRows = reportsRes.data ?? [];
  const reconciliationItems = itemsRes.data ?? [];
  const openDifferences = reconciliationRows.reduce(
    (sum, row) => sum + Number(row.differences_count ?? 0),
    0
  );
  const p0Alerts = reconciliationItems.filter((row) => row.severity === "critical").length;
  const p1Alerts = reconciliationItems.filter((row) => row.severity === "high").length;

  return json({
    ok: true,
    mode: includeTests ? "test" : "production",
    filters: {
      include_tests: includeTests,
      fiscal_visibility: fiscalVisibility ?? "all_test_visible"
    },
    metrics: {
      gmv: money(revenueRows, "gross_amount"),
      net_revenue: money(revenueRows, "revenue_amount"),
      commissions: money(earningRows, "commission_amount"),
      provider_liabilities: money(earningRows, "net_amount") - money(payoutRows.filter((row) => row.status === "paid"), "amount"),
      pending_payouts: money(pendingPayouts, "amount"),
      refunds: money(refundRows, "amount"),
      psp_fees: money(earningRows, "psp_fee_amount"),
      chargebacks: 0,
      disputes: reconciliationItems.filter((row) => row.discrepancy_status !== "matched").length,
      p0_alerts: p0Alerts,
      p1_alerts: p1Alerts,
      reconciliation_open_differences: openDifferences,
      payout_count: payoutRows.length,
      provider_earning_count: earningRows.length
    },
    reconciliation: reconciliationRows,
    reconciliation_items: reconciliationItems,
    monthly_closures: closesRes.data ?? [],
    exports: exportsRes.data ?? [],
    settlement_batches: batchesRes.data ?? [],
    payout_batches: payoutBatchesRes.data ?? [],
    generated_at: new Date().toISOString()
  });
});
