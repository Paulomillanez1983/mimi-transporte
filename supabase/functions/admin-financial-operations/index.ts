import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function requireFinanceAdmin(supabase: ReturnType<typeof createClient>, req: Request) {
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
    .select("user_id,active,role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  const role = String(adminUser?.role ?? "").toUpperCase();
  if (adminError || !["SUPERADMIN", "ADMIN", "FINANCE", "FINANCE_ADMIN"].includes(role)) {
    return { ok: false as const, response: json({ ok: false, error: "FINANCE_FORBIDDEN" }, 403) };
  }

  return { ok: true as const, user, role };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const admin = await requireFinanceAdmin(supabase, req);
  if (!admin.ok) return admin.response;

  const body = await readJson(req);
  const action = String(body.action ?? "").trim();
  const includeTests = Boolean(body.include_tests);
  const actorId = admin.user.id;
  const traceId = crypto.randomUUID();

  try {
    if (action === "calculate_settlements") {
      const { data, error } = await supabase.rpc("financial_calculate_settlement_batch", {
        p_period_start: body.period_start,
        p_period_end: body.period_end,
        p_settlement_type: body.settlement_type ?? "weekly",
        p_actor_user_id: actorId,
        p_include_tests: includeTests,
        p_batch_key: body.batch_key ?? null
      });
      if (error) throw error;
      return json({ ok: true, action, settlement_batch_id: data, trace_id: traceId });
    }

    if (action === "create_payout_batch") {
      const { data, error } = await supabase.rpc("financial_create_payout_batch", {
        p_settlement_batch_id: body.settlement_batch_id,
        p_actor_user_id: actorId,
        p_idempotency_key: body.idempotency_key ?? null
      });
      if (error) throw error;
      return json({ ok: true, action, payout_batch_id: data, trace_id: traceId });
    }

    if (action === "approve_settlement_batch") {
      const { data, error } = await supabase.rpc("financial_approve_settlement_batch", {
        p_settlement_batch_id: body.settlement_batch_id,
        p_actor_user_id: actorId
      });
      if (error) throw error;
      return json({ ok: true, action, settlement_batch_id: data, trace_id: traceId });
    }

    if (action === "mark_payout_paid") {
      const { data, error } = await supabase.rpc("financial_mark_payout_paid", {
        p_payout_id: body.payout_id,
        p_actor_user_id: actorId,
        p_provider_event_id: body.provider_event_id ?? null
      });
      if (error) throw error;
      return json({ ok: true, action, financial_transaction_id: data, trace_id: traceId });
    }

    if (action === "run_reconciliation") {
      const { data, error } = await supabase.rpc("financial_run_reconciliation", {
        p_period_start: body.period_start,
        p_period_end: body.period_end,
        p_report_type: body.report_type ?? "psp",
        p_actor_user_id: actorId,
        p_include_tests: includeTests,
        p_report_key: body.report_key ?? null
      });
      if (error) throw error;
      return json({ ok: true, action, reconciliation_report_id: data, trace_id: traceId });
    }

    if (action === "close_period") {
      const { data, error } = await supabase.rpc("financial_close_accounting_period", {
        p_period_key: body.period_key,
        p_period_start: body.period_start,
        p_period_end: body.period_end,
        p_actor_user_id: actorId,
        p_force: Boolean(body.force)
      });
      if (error) throw error;
      return json({ ok: true, action, monthly_closure_id: data, trace_id: traceId });
    }

    if (action === "create_export") {
      const { data, error } = await supabase.rpc("financial_create_export_record", {
        p_export_type: body.export_type ?? "monthly_accounting",
        p_format: body.format ?? "json",
        p_period_start: body.period_start,
        p_period_end: body.period_end,
        p_actor_user_id: actorId,
        p_include_tests: includeTests
      });
      if (error) throw error;
      return json({ ok: true, action, financial_export_id: data, trace_id: traceId });
    }

    return json({ ok: false, error: "UNKNOWN_FINANCIAL_ACTION" }, 400);
  } catch (error) {
    console.error("[admin-financial-operations]", {
      action,
      traceId,
      message: error instanceof Error ? error.message : String(error)
    });

    return json({ ok: false, error: "FINANCIAL_OPERATION_FAILED", action, trace_id: traceId }, 500);
  }
});
