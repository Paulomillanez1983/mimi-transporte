#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const files = {
  searchPath: "supabase/migrations/20260509221109_enterprise_01_security_definer_search_path.sql",
  rpc: "supabase/migrations/20260509221209_enterprise_02_rpc_permissions.sql",
  rls: "supabase/migrations/20260509221309_enterprise_03_rls_policy_hardening.sql",
  audit: "supabase/migrations/20260509221409_enterprise_04_service_audit_and_expiration.sql",
  residualRpc: "supabase/migrations/20260509233520_enterprise_05_close_residual_rpc_exposure.sql",
  providerGuard: "supabase/migrations/20260509234909_enterprise_06_guard_provider_admin_fields.sql",
  validation: "docs/backend-hardening/enterprise_validation.sql",
  releasePlan: "docs/backend-hardening/enterprise_release_plan_2026-05-09.md"
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing required file: ${rel}`);
  }
  const text = fs.readFileSync(abs, "utf8");
  if (!text.trim()) {
    throw new Error(`Required file is empty: ${rel}`);
  }
  return text;
}

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
}

const searchPath = read(files.searchPath);
const rpc = read(files.rpc);
const rls = read(files.rls);
const audit = read(files.audit);
const residualRpc = read(files.residualRpc);
const providerGuard = read(files.providerGuard);
const validation = read(files.validation);
const releasePlan = read(files.releasePlan);

[
  "admin_review_driver",
  "dispatch_queue_mark_done",
  "svc_create_request_atomic",
  "svc_accept_offer_atomic",
  "svc_cancel_request_atomic",
  "svc_complete_service_atomic",
  "svc_search_providers_ranked"
].forEach((fn) => check(`rpc hardens ${fn}`, rpc.includes(fn)));

[
  "dispatch_aceptar_oferta_pro",
  "dispatch_rechazar_oferta_pro",
  "dispatch_viaje",
  "expirar_ofertas_vencidas",
  "buscar_choferes_cercanos",
  "search_categories_hybrid"
].forEach((fn) => check(`residual rpc hardens ${fn}`, residualRpc.includes(fn)));

[
  "svc_guard_provider_admin_fields",
  "provider_approved_admin_only",
  "provider_blocked_admin_only",
  "provider_notes_internal_admin_only",
  "trg_svc_providers_guard_admin_fields"
].forEach((guard) => check(`provider admin field guard ${guard}`, providerGuard.includes(guard)));

check(
  "provider admin guard is not executable by authenticated",
  /revoke execute on function public\.svc_guard_provider_admin_fields\(\) from public, anon, authenticated/i.test(providerGuard)
);

[
  "push_tokens_insert_own",
  "push_tokens_select_own_or_admin",
  "svc_provider_intents_select_own_or_admin",
  "svc_request_events_read_participants_or_admin"
].forEach((policy) => check(`rls defines ${policy}`, rls.includes(policy)));

[
  "request_created",
  "offer_created",
  "offer_accepted",
  "offer_rejected",
  "request_cancelled",
  "request_started",
  "request_completed",
  "request_expired",
  "offer_expired"
].forEach((eventName) => check(`audit event ${eventName}`, audit.includes(eventName)));

check("search_path migration pins public app functions", /alter function %s set search_path = public, pg_temp/i.test(searchPath));
check("expiration worker exists", audit.includes("svc_expire_stale_service_requests"));
check("expiration worker service_role only", /grant execute on function public\.svc_expire_stale_service_requests\(integer\) to service_role/i.test(audit));
check("validation covers RPC exposure", validation.includes("internal_rpc_execute_matrix"));
check("release plan includes go/no-go", /go\/no-go/i.test(releasePlan));
check("release plan includes rollback", /rollback/i.test(releasePlan));

const failed = checks.filter((item) => !item.ok);
const result = {
  ok: failed.length === 0,
  checkedFiles: Object.values(files),
  checks,
  failed
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
