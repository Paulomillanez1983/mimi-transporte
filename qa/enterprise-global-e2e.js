#!/usr/bin/env node
/*
 * Authenticated production E2E for MIMI Servicios.
 *
 * Required env:
 *   MIMI_SUPABASE_URL
 *   MIMI_SUPABASE_ANON_KEY
 *   MIMI_E2E_CLIENT_EMAIL
 *   MIMI_E2E_CLIENT_PASSWORD
 *   MIMI_E2E_PROVIDER_EMAIL
 *   MIMI_E2E_PROVIDER_PASSWORD
 *
 * Optional env:
 *   MIMI_E2E_ADMIN_EMAIL
 *   MIMI_E2E_ADMIN_PASSWORD
 *   MIMI_E2E_PROVIDER_ID
 *   MIMI_E2E_CATEGORY_ID
 *   MIMI_E2E_SERVICE_LAT
 *   MIMI_E2E_SERVICE_LNG
 *   MIMI_E2E_REQUIRE_REALTIME=false
 */

const requiredEnv = [
  "MIMI_SUPABASE_URL",
  "MIMI_SUPABASE_ANON_KEY",
  "MIMI_E2E_CLIENT_EMAIL",
  "MIMI_E2E_CLIENT_PASSWORD",
  "MIMI_E2E_PROVIDER_EMAIL",
  "MIMI_E2E_PROVIDER_PASSWORD",
  "MIMI_E2E_ADMIN_EMAIL",
  "MIMI_E2E_ADMIN_PASSWORD"
];

const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(JSON.stringify({
    ok: false,
    skipped: true,
    reason: "missing_required_env",
    missing
  }, null, 2));
  process.exit(2);
}

const SUPABASE_URL = process.env.MIMI_SUPABASE_URL.replace(/\/$/, "");
const ANON_KEY = process.env.MIMI_SUPABASE_ANON_KEY;
const SERVICE_LAT = Number(process.env.MIMI_E2E_SERVICE_LAT || "-31.3101063");
const SERVICE_LNG = Number(process.env.MIMI_E2E_SERVICE_LNG || "-64.2753784");
const REQUIRE_REALTIME = process.env.MIMI_E2E_REQUIRE_REALTIME !== "false";
const DEFAULT_TIMEOUT_MS = 20000;

function redactEmail(email) {
  if (!email || !email.includes("@")) return email || null;
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function safeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    details: error?.details || undefined,
    status: error?.status || undefined
  };
}

function withTimeout(promise, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function requestJson(url, options = {}, label = "request") {
  const response = await withTimeout(fetch(url, options), label);
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `${label}_failed`);
    error.status = response.status;
    error.details = { label, url, response: data };
    throw error;
  }
  return data;
}

async function signIn(email, password) {
  const data = await requestJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  }, "auth_sign_in");

  if (!data?.access_token || !data?.user?.id) {
    throw new Error("auth_response_missing_token_or_user");
  }

  const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${data.access_token}`
    }
  }, "auth_get_user");

  return {
    email,
    userId: user.id,
    token: data.access_token
  };
}

async function restSelect(pathAndQuery, token, label) {
  return requestJson(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  }, label);
}

async function invokeFunction(name, token, payload, label = name) {
  return requestJson(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {})
  }, label);
}

function first(rowset, label) {
  if (!Array.isArray(rowset) || !rowset.length) {
    throw new Error(`${label}_not_found`);
  }
  return rowset[0];
}

async function loadProviderContext(providerSession) {
  const providerFilter = process.env.MIMI_E2E_PROVIDER_ID
    ? `id=eq.${encodeURIComponent(process.env.MIMI_E2E_PROVIDER_ID)}`
    : `user_id=eq.${encodeURIComponent(providerSession.userId)}`;

  const provider = first(await restSelect(
    `svc_providers?select=*&${providerFilter}&limit=1`,
    providerSession.token,
    "load_provider"
  ), "provider");

  if (provider.user_id !== providerSession.userId) {
    throw new Error("provider_session_does_not_match_provider_row");
  }

  if (!provider.approved || provider.blocked) {
    throw new Error("provider_not_approved_or_blocked");
  }

  const offeringFilter = process.env.MIMI_E2E_CATEGORY_ID
    ? `category_id=eq.${encodeURIComponent(process.env.MIMI_E2E_CATEGORY_ID)}`
    : "active=eq.true";

  const offerings = await restSelect(
    `svc_provider_service_offerings?select=*&provider_id=eq.${encodeURIComponent(provider.id)}&${offeringFilter}&order=created_at.desc&limit=5`,
    providerSession.token,
    "load_provider_offerings"
  );

  const offering = offerings.find((item) => item.active !== false) || offerings[0];
  if (!offering) {
    throw new Error("provider_has_no_active_offering");
  }

  return { provider, offering };
}

async function createRequest(clientSession, provider, offering) {
  const payload = {
    category_id: offering.category_id,
    selected_provider_id: provider.id,
    address_text: "E2E MIMI QA - ubicacion controlada",
    service_lat: SERVICE_LAT,
    service_lng: SERVICE_LNG,
    request_type: "IMMEDIATE",
    requested_hours: 1,
    notes: `MIMI_E2E ${new Date().toISOString()}`,
    offering_id: offering.id,
    service_mode: offering.service_mode || null,
    pricing_model: offering.pricing_model || null,
    unit_name: offering.unit_name || null,
    unit_quantity: offering.unit_name ? 1 : null,
    session_duration_minutes: offering.duration_minutes || null
  };

  const created = await invokeFunction("svc-create-request", clientSession.token, payload, "create_request");
  if (!created?.request?.id || !created?.offer?.id) {
    throw new Error("create_request_missing_request_or_offer");
  }
  return created;
}

function providersFromSearchResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.providers)) return data.providers;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function verifyRequestVisible(session, requestId, label) {
  return first(await restSelect(
    `svc_requests?select=*&id=eq.${encodeURIComponent(requestId)}&limit=1`,
    session.token,
    `${label}_load_request`
  ), `${label}_request`);
}

async function verifyOfferVisible(providerSession, providerId, requestId) {
  return first(await restSelect(
    `svc_request_offers?select=*&request_id=eq.${encodeURIComponent(requestId)}&provider_id=eq.${encodeURIComponent(providerId)}&limit=1`,
    providerSession.token,
    "provider_load_offer"
  ), "provider_offer");
}

async function verifyEvents(session, requestId) {
  return restSelect(
    `svc_request_events?select=event_type,actor_user_id,provider_id,metadata,created_at&request_id=eq.${encodeURIComponent(requestId)}&order=created_at.asc`,
    session.token,
    "load_request_events"
  );
}

async function maybeOpenRealtime(token, requestId) {
  if (!REQUIRE_REALTIME) {
    return { required: false, ok: true, events: [] };
  }

  if (typeof WebSocket === "undefined") {
    return { required: true, ok: false, error: "node_websocket_not_available", events: [] };
  }

  const realtimeUrl = `${SUPABASE_URL.replace(/^http/, "ws")}/realtime/v1/websocket?apikey=${encodeURIComponent(ANON_KEY)}&vsn=1.0.0`;
  const topic = "realtime:public:svc_requests";
  const events = [];

  return new Promise((resolve) => {
    const socket = new WebSocket(realtimeUrl);
    let ref = 1;
    let joined = false;
    let heartbeat;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      try { socket.close(); } catch {}
      resolve({ required: true, events, ...result });
    }

    const timer = setTimeout(() => finish({ ok: joined && events.length > 0, timeout: true }), 25000);

    socket.addEventListener("open", () => {
      heartbeat = setInterval(() => {
        socket.send(JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: String(ref++)
        }));
      }, 10000);

      socket.send(JSON.stringify({
        topic,
        event: "phx_join",
        payload: {
          config: {
            broadcast: { self: false },
            presence: { key: "" },
            postgres_changes: [
              { event: "*", schema: "public", table: "svc_requests", filter: `id=eq.${requestId}` },
              { event: "*", schema: "public", table: "svc_request_offers", filter: `request_id=eq.${requestId}` }
            ]
          },
          access_token: token
        },
        ref: String(ref++)
      }));
    });

    socket.addEventListener("message", (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }

      if (payload.event === "phx_reply" && payload.payload?.status === "ok") {
        joined = true;
      }

      if (payload.event === "postgres_changes") {
        events.push({
          table: payload.payload?.data?.table,
          type: payload.payload?.data?.type,
          recordStatus: payload.payload?.data?.record?.status || null
        });
      }

      if (events.length >= 2) {
        clearTimeout(timer);
        finish({ ok: true });
      }
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      finish({ ok: false, error: "websocket_error" });
    });
  });
}

async function run() {
  const result = {
    ok: false,
    startedAt: new Date().toISOString(),
    productionUrl: SUPABASE_URL,
    users: {
      client: redactEmail(process.env.MIMI_E2E_CLIENT_EMAIL),
      provider: redactEmail(process.env.MIMI_E2E_PROVIDER_EMAIL),
      admin: redactEmail(process.env.MIMI_E2E_ADMIN_EMAIL)
    },
    ids: {},
    states: [],
    events: [],
    realtime: null,
    admin: null,
    warnings: []
  };

  const clientSession = await signIn(process.env.MIMI_E2E_CLIENT_EMAIL, process.env.MIMI_E2E_CLIENT_PASSWORD);
  const providerSession = await signIn(process.env.MIMI_E2E_PROVIDER_EMAIL, process.env.MIMI_E2E_PROVIDER_PASSWORD);
  result.ids.client_user_id = clientSession.userId;
  result.ids.provider_user_id = providerSession.userId;

  const { provider, offering } = await loadProviderContext(providerSession);
  result.ids.provider_id = provider.id;
  result.ids.offering_id = offering.id;
  result.ids.category_id = offering.category_id;

  const searchResult = await invokeFunction("svc-search-providers", clientSession.token, {
    category_id: offering.category_id,
    service_lat: SERVICE_LAT,
    service_lng: SERVICE_LNG,
    request_type: "IMMEDIATE",
    requested_hours: 1,
    limit: 5
  }, "search_providers");
  const searchProviders = providersFromSearchResponse(searchResult);
  const foundProvider = searchProviders.find((item) => item.provider_id === provider.id || item.id === provider.id);
  if (!foundProvider) {
    const error = new Error("search_provider_not_found");
    error.details = {
      provider_id: provider.id,
      category_id: offering.category_id,
      providers_count: searchProviders.length,
      provider_ids: searchProviders.map((item) => item.provider_id || item.id).filter(Boolean)
    };
    throw error;
  }
  result.states.push({
    step: "search",
    providersCount: searchProviders.length,
    providerFound: true
  });

  const created = await createRequest(clientSession, provider, offering);
  const requestId = created.request.id;
  const offerId = created.offer.id;
  result.ids.request_id = requestId;
  result.ids.offer_id = offerId;
  result.states.push({ step: "created", status: created.request.status });

  const realtimePromise = maybeOpenRealtime(clientSession.token, requestId);

  // Before accepting, the provider receives the pending work through
  // svc_request_offers. The request row is deliberately not readable by the
  // provider until accepted_provider_id is set.
  const providerOffer = await verifyOfferVisible(providerSession, provider.id, requestId);
  result.states.push({ step: "offered", offerStatus: providerOffer.status });

  const accept = await invokeFunction("svc-provider-respond-offer", providerSession.token, {
    offer_id: offerId,
    accepted: true
  }, "accept_offer");
  const acceptedOffer = await verifyOfferVisible(providerSession, provider.id, requestId);
  const providerRequestAfterAccept = await verifyRequestVisible(providerSession, requestId, "provider_after_accept");
  result.states.push({
    step: "accepted",
    requestStatus: providerRequestAfterAccept.status,
    response: accept?.request_status || accept?.request?.status || accept?.status || null,
    offerStatus: acceptedOffer.status
  });

  await invokeFunction("svc-provider-en-route", providerSession.token, { request_id: requestId }, "provider_en_route");
  result.states.push({ step: "provider_en_route" });

  await invokeFunction("svc-provider-arrived", providerSession.token, { request_id: requestId }, "provider_arrived");
  result.states.push({ step: "provider_arrived" });

  await invokeFunction("svc-start-service", providerSession.token, { request_id: requestId }, "start_service");
  const started = await verifyRequestVisible(clientSession, requestId, "client_after_start");
  result.states.push({ step: "started", status: started.status });

  await invokeFunction("svc-complete-service", providerSession.token, { request_id: requestId }, "complete_service");
  const completed = await verifyRequestVisible(clientSession, requestId, "client_after_complete");
  result.states.push({ step: "completed", status: completed.status });

  result.events = await verifyEvents(clientSession, requestId);
  const eventTypes = new Set(result.events.map((event) => event.event_type));
  const requiredEventTypes = ["request_created", "offer_created", "offer_accepted", "request_started", "request_completed"];
  const missingEvents = requiredEventTypes.filter((eventType) => !eventTypes.has(eventType));

  result.realtime = await realtimePromise;
  if (REQUIRE_REALTIME && !result.realtime?.ok) {
    result.warnings.push(`realtime_not_confirmed:${result.realtime?.error || "no_events"}`);
  }

  const adminSession = await signIn(process.env.MIMI_E2E_ADMIN_EMAIL, process.env.MIMI_E2E_ADMIN_PASSWORD);
  const adminEvents = await verifyEvents(adminSession, requestId);
  result.admin = {
    user_id: adminSession.userId,
    canReadEvents: Array.isArray(adminEvents) && adminEvents.length >= result.events.length
  };

  const finalOk =
    completed.status === "COMPLETED" &&
    acceptedOffer.status === "ACCEPTED" &&
    missingEvents.length === 0 &&
    (!REQUIRE_REALTIME || result.realtime?.ok) &&
    result.admin?.canReadEvents === true;

  result.ok = finalOk;
  result.missingEvents = missingEvents;
  result.finishedAt = new Date().toISOString();

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

run().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    failedAt: new Date().toISOString(),
    error: safeError(error)
  }, null, 2));
  process.exit(1);
});
