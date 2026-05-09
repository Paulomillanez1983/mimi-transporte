#!/usr/bin/env node
/*
  Optional remote smoke test.

  Required env:
    MIMI_SUPABASE_URL or SUPABASE_URL
    MIMI_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY

  Optional env:
    MIMI_AUTH_JWT - authenticated user JWT for post-hardening checks.

  This script does not need service_role and never prints secrets.
*/

const url = process.env.MIMI_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey = process.env.MIMI_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const authJwt = process.env.MIMI_AUTH_JWT || "";
const requireEnv = process.argv.includes("--require-env");

const NIL_UUID = "00000000-0000-4000-8000-000000000000";

const internalRpcChecks = [
  { name: "admin_review_driver", body: { p_driver_user_id: NIL_UUID, p_action: "approve", p_review_notes: "smoke", p_reviewed_by: NIL_UUID } },
  { name: "reset_test_driver", body: { p_user_id: NIL_UUID } },
  { name: "dispatch_queue_mark_done", body: { p_job_id: NIL_UUID } },
  {
    name: "svc_create_request_atomic",
    body: {
      p_client_user_id: NIL_UUID,
      p_category_id: NIL_UUID,
      p_provider_id: NIL_UUID,
      p_address_text: "smoke",
      p_service_lat: 0,
      p_service_lng: 0,
      p_request_type: "IMMEDIATE",
      p_scheduled_for: null,
      p_requested_hours: 1,
      p_notes: "smoke"
    }
  },
  { name: "svc_accept_offer_atomic", body: { p_offer_id: NIL_UUID, p_provider_user_id: NIL_UUID } },
  { name: "svc_cancel_request_atomic", body: { p_request_id: NIL_UUID, p_actor_user_id: NIL_UUID, p_reason: "smoke" } },
  { name: "svc_complete_service_atomic", body: { p_request_id: NIL_UUID, p_provider_user_id: NIL_UUID } },
  {
    name: "svc_search_providers_ranked",
    body: {
      p_category_id: NIL_UUID,
      p_service_lat: 0,
      p_service_lng: 0,
      p_request_type: "IMMEDIATE",
      p_scheduled_for: null,
      p_requested_hours: 1,
      p_limit: 1
    }
  },
  { name: "svc_expire_stale_service_requests", body: { p_limit: 1 } }
];

if (!url || !anonKey) {
  const result = {
    ok: !requireEnv,
    skipped: true,
    reason: "Missing Supabase URL or anon key env. Set MIMI_SUPABASE_URL and MIMI_SUPABASE_ANON_KEY to run remote smoke tests."
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
  return;
}

function redactedStatus(status, text) {
  const cleanText = String(text || "")
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[jwt-redacted]")
    .slice(0, 280);
  return { status, bodyPreview: cleanText };
}

async function callRpc(name, body, bearer) {
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
  const text = await response.text().catch(() => "");
  return redactedStatus(response.status, text);
}

(async () => {
  const anonResults = [];
  for (const item of internalRpcChecks) {
    const response = await callRpc(item.name, item.body, anonKey);
    anonResults.push({
      rpc: item.name,
      role: "anon",
      ok: response.status < 200 || response.status >= 300,
      ...response
    });
  }

  const authResults = [];
  if (authJwt) {
    for (const item of internalRpcChecks) {
      const response = await callRpc(item.name, item.body, authJwt);
      authResults.push({
        rpc: item.name,
        role: "authenticated",
        ok: response.status < 200 || response.status >= 300,
        ...response
      });
    }
  }

  const failed = [...anonResults, ...authResults].filter((item) => !item.ok);
  const result = {
    ok: failed.length === 0,
    note: "Internal RPCs should not return 2xx to anon/authenticated after hardening. Use SQL validation for exact GRANT checks.",
    anonResults,
    authResults,
    failed
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
