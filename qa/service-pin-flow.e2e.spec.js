const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

function readFrontendEnv() {
  const envPath = path.join(__dirname, "..", "mimi-servicios", "env.js");
  const source = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const pick = (key) => {
    const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    return match?.[1] || "";
  };
  return {
    supabaseUrl: process.env.MIMI_E2E_SUPABASE_URL || pick("SUPABASE_URL"),
    anonKey: process.env.MIMI_E2E_SUPABASE_ANON_KEY || pick("SUPABASE_ANON_KEY")
  };
}

function requiredCredentialsPresent() {
  return [
    "MIMI_E2E_CLIENT_EMAIL",
    "MIMI_E2E_CLIENT_PASSWORD",
    "MIMI_E2E_PROVIDER_EMAIL",
    "MIMI_E2E_PROVIDER_PASSWORD"
  ].every((key) => Boolean(process.env[key]));
}

function apiHeaders(anonKey, token = null) {
  return {
    apikey: anonKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function authPassword(request, supabaseUrl, anonKey, email, password) {
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      ...apiHeaders(anonKey),
      "Content-Type": "application/json"
    },
    data: { email, password }
  });
  expect(response.ok(), `auth failed for configured E2E user: ${response.status()}`).toBeTruthy();
  const body = await response.json();
  expect(body.access_token).toBeTruthy();
  expect(body.user?.id).toBeTruthy();
  return { token: body.access_token, userId: body.user.id };
}

async function restGet(request, supabaseUrl, anonKey, token, table, query) {
  const response = await request.get(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: apiHeaders(anonKey, token)
  });
  expect(response.ok(), `REST ${table} failed: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function invokeFunction(request, supabaseUrl, anonKey, token, name, data) {
  const response = await request.post(`${supabaseUrl}/functions/v1/${name}`, {
    headers: {
      ...apiHeaders(anonKey, token),
      "Content-Type": "application/json"
    },
    data
  });
  const body = await response.json().catch(() => ({}));
  expect(response.ok(), `${name} failed: ${response.status()} ${body.error || ""}`).toBeTruthy();
  expect(body.ok === false, `${name} returned ok=false: ${body.error || "unknown"}`).toBeFalsy();
  return body;
}

test.describe("service PIN lifecycle", () => {
  test("critical functions reject anonymous requests", async ({ request }) => {
    const { supabaseUrl } = readFrontendEnv();
    expect(supabaseUrl).toBeTruthy();

    for (const functionName of ["svc-get-service-pin", "svc-start-service", "accept-legal-document"]) {
      const response = await request.post(`${supabaseUrl}/functions/v1/${functionName}`, {
        data: {}
      });
      expect(response.status(), `${functionName} must require JWT`).toBe(401);
    }
  });

  test("client request -> provider accepts -> client gets PIN -> provider starts service", async ({ request }) => {
    test.skip(!requiredCredentialsPresent(), [
      "Missing E2E credentials:",
      "MIMI_E2E_CLIENT_EMAIL/MIMI_E2E_CLIENT_PASSWORD",
      "MIMI_E2E_PROVIDER_EMAIL/MIMI_E2E_PROVIDER_PASSWORD"
    ].join(" "));

    const { supabaseUrl, anonKey } = readFrontendEnv();
    expect(supabaseUrl).toBeTruthy();
    expect(anonKey).toBeTruthy();

    const client = await authPassword(
      request,
      supabaseUrl,
      anonKey,
      process.env.MIMI_E2E_CLIENT_EMAIL,
      process.env.MIMI_E2E_CLIENT_PASSWORD
    );
    const providerUser = await authPassword(
      request,
      supabaseUrl,
      anonKey,
      process.env.MIMI_E2E_PROVIDER_EMAIL,
      process.env.MIMI_E2E_PROVIDER_PASSWORD
    );

    const activeClientRequests = await restGet(
      request,
      supabaseUrl,
      anonKey,
      client.token,
      "svc_requests",
      "select=id,status&status=in.(SEARCHING,PENDING_PROVIDER_RESPONSE,ACCEPTED,SCHEDULED,PROVIDER_EN_ROUTE,PROVIDER_ARRIVED,IN_PROGRESS)&limit=1"
    );
    test.skip(activeClientRequests.length > 0, "Dedicated E2E client already has an active request.");

    const providers = await restGet(
      request,
      supabaseUrl,
      anonKey,
      providerUser.token,
      "svc_providers",
      `select=id,user_id,approved,blocked&user_id=eq.${providerUser.userId}&limit=1`
    );
    const provider = providers[0];
    test.skip(!provider?.id, "E2E provider account has no svc_providers profile.");
    test.skip(provider.approved !== true || provider.blocked === true, "E2E provider is not approved or is blocked.");

    const providerCategories = await restGet(
      request,
      supabaseUrl,
      anonKey,
      providerUser.token,
      "svc_provider_categories",
      `select=category_id,active&provider_id=eq.${provider.id}&active=eq.true&limit=1`
    );
    test.skip(!providerCategories.length, "E2E provider has no active service category.");
    const categoryId = providerCategories[0].category_id;

    const created = await invokeFunction(request, supabaseUrl, anonKey, client.token, "svc-create-request", {
      category_id: categoryId,
      selected_provider_id: provider.id,
      address_text: "E2E MIMI Servicios, Cordoba",
      service_lat: -31.4201,
      service_lng: -64.1888,
      request_type: "IMMEDIATE",
      requested_hours: 1,
      notes: "E2E service PIN lifecycle",
      provider_price: 1000,
      platform_fee: 300,
      total_price: 1300,
      currency: "ARS"
    });

    const requestRow = created.request || created;
    const requestId = requestRow.id || requestRow.request_id;
    expect(requestId).toBeTruthy();

    const offers = await restGet(
      request,
      supabaseUrl,
      anonKey,
      providerUser.token,
      "svc_request_offers",
      `select=id,request_id,status&request_id=eq.${requestId}&provider_id=eq.${provider.id}&limit=1`
    );
    const offer = created.offer || offers[0];
    expect(offer?.id).toBeTruthy();

    await invokeFunction(request, supabaseUrl, anonKey, providerUser.token, "svc-provider-respond-offer", {
      offer_id: offer.id,
      accepted: true
    });

    const pinResponse = await invokeFunction(request, supabaseUrl, anonKey, client.token, "svc-get-service-pin", {
      request_id: requestId
    });
    expect(pinResponse.pin).toMatch(/^\d{4}$/);

    await invokeFunction(request, supabaseUrl, anonKey, providerUser.token, "svc-provider-arrived", {
      request_id: requestId
    });

    await invokeFunction(request, supabaseUrl, anonKey, providerUser.token, "svc-start-service", {
      request_id: requestId,
      pin: pinResponse.pin
    });

    const updatedRows = await restGet(
      request,
      supabaseUrl,
      anonKey,
      client.token,
      "svc_requests",
      `select=id,status,started_at,service_pin_verified_at,accepted_provider_id&id=eq.${requestId}&limit=1`
    );
    const updated = updatedRows[0];
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.accepted_provider_id).toBe(provider.id);
    expect(updated.started_at).toBeTruthy();
    expect(updated.service_pin_verified_at).toBeTruthy();
  });
});
