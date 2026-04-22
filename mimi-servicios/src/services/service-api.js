===== src/services/service-api.js =====
import { appConfig } from "../../config.js";
import {
  callRpc,
  fetchSingle,
  fetchTable,
  getCurrentSession,
  getSupabaseClient,
  invokeFunction,
} from "./supabase.js";
import {
  buildMockMessages,
  buildMockNotifications,
  buildMockOffers,
  buildMockProviders,
} from "./mock-data.js";

function hasBackend() {
  return Boolean(getSupabaseClient());
}

function buildAuthError() {
  const error = new Error("Necesitas iniciar sesion para continuar.");
  error.code = "AUTH_REQUIRED";
  return error;
}

async function requireSession() {
  const session = await getCurrentSession();
  if (!session?.user) throw buildAuthError();
  return session;
}

export async function bootstrapSession() {
  const session = await getCurrentSession();
  const userId = session?.user?.id ?? appConfig.demoClientUserId ?? null;

  const providerRows = userId && hasBackend()
    ? await fetchTable("svc_providers", (query) =>
        query.select("id,user_id,full_name,email,phone,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_seen_at").eq("user_id", userId).limit(1)
      )
    : [];

  return {
    isAuthenticated: Boolean(session?.user),
    userId,
    userEmail: session?.user?.email ?? null,
    userName: session?.user?.user_metadata?.full_name ?? session?.user?.user_metadata?.name ?? null,
    providerId: providerRows[0]?.id ?? null,
    role: providerRows[0]?.id ? "provider" : "client",
    providerProfile: providerRows[0] ?? null,
  };
}

export async function loadCategories() {
  if (!hasBackend()) return appConfig.categories;

  try {
    await requireSession();
    const rows = await fetchTable("svc_categories", (query) =>
      query
        .select("id,code,name,description,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
    );

    return rows.length ? rows : appConfig.categories;
  } catch {
    return appConfig.categories;
  }
}

export async function searchProviders(categoryId, draft) {
  if (!hasBackend()) return buildMockProviders(categoryId, draft);
  await requireSession();

  const response = await invokeFunction(appConfig.functions.searchProviders, {
    category_id: categoryId,
    service_lat: Number(draft.lat),
    service_lng: Number(draft.lng),
    request_type: draft.requestType,
    scheduled_for: draft.scheduledFor || null,
    requested_hours: Number(draft.requestedHours),
    max_results: 10,
  });

  const providers = response?.providers ?? [];
  return providers.map((item) => {
    const fee = Math.max(500, Math.round((item.provider_price ?? 0) * 0.15));
    return {
      ...item,
      fee,
      platform_fee: fee,
      total_price: (item.provider_price ?? 0) + fee,
      estimated_eta_min: Math.max(6, Math.round((item.distance_km ?? 1) * 6)),
    };
  });
}

export async function prepareRequestPricing({
  clientUserId,
  categoryId,
  providerId,
  draft,
}) {
  if (!hasBackend()) {
    const candidates = buildMockProviders(categoryId, draft);
    const provider = candidates.find((item) => item.provider_id === providerId);

    return provider
      ? {
          eligible: true,
          provider_id: provider.provider_id,
          client_user_id: clientUserId,
          provider_price: provider.provider_price,
          platform_fee: provider.fee,
          total_price: provider.total_price,
          currency: provider.currency,
          visible_candidates: candidates,
        }
      : {
          eligible: false,
          reason: "provider_not_found",
        };
  }

  await requireSession();

  return callRpc(appConfig.rpc.prepareRequestPricing, {
    p_client_user_id: clientUserId,
    p_category_id: categoryId,
    p_provider_id: providerId,
    p_service_lat: Number(draft.lat),
    p_service_lng: Number(draft.lng),
    p_request_type: draft.requestType,
    p_scheduled_for: draft.scheduledFor || null,
    p_requested_hours: Number(draft.requestedHours),
  });
}

export async function createRequest(payload) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      status: payload.requestType === "SCHEDULED" ? "SCHEDULED" : "SEARCHING",
      ...payload,
      created_at: new Date().toISOString(),
    };
  }

  await requireSession();

  const response = await invokeFunction(
    appConfig.functions.createRequest,
    {
      category_id: payload.categoryId,
      selected_provider_id: payload.selectedProviderId,
      address_text: payload.address,
      service_lat: payload.serviceLat,
      service_lng: payload.serviceLng,
      request_type: payload.requestType,
      scheduled_for: payload.scheduledFor,
      requested_hours: payload.requestedHours,
      notes: payload.notes ?? null,
    },
    {
      headers: {
        "x-idempotency-key": payload.idempotencyKey ?? crypto.randomUUID(),
      },
    },
  );

  return response?.request ?? response;
}

export async function updateRequestStatus(actionName, payload) {
  if (!hasBackend()) return { ok: true, actionName, payload };
  await requireSession();
  return invokeFunction(actionName, payload);
}

export async function loadNotifications(userId) {
  if (!hasBackend()) return buildMockNotifications();
  if (!userId) return [];
  if (!(await getCurrentSession())?.user) return [];

  return fetchTable("svc_notifications", (query) =>
    query
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
}

export async function loadOffers(providerId) {
  if (!hasBackend()) return buildMockOffers();
  if (!providerId) return [];
  if (!(await getCurrentSession())?.user) return [];

  return fetchTable("svc_request_offers", (query) =>
    query
      .select("*, svc_requests(*)")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(10)
  );
}

export async function loadMessages(conversationId) {
  if (!conversationId) return [];
  if (!hasBackend()) return buildMockMessages();
  if (!(await getCurrentSession())?.user) return [];

  return fetchTable("svc_messages", (query) =>
    query
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50)
  );
}

export async function sendMessage(payload) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      ...payload,
      sender_user_id: "self",
      created_at: new Date().toISOString(),
    };
  }

  await requireSession();

  const response = await invokeFunction(appConfig.functions.sendMessage, {
    conversation_id: payload.conversationId,
    body: payload.body,
  });

  return response?.message ?? response;
}

export async function trackLocation(payload) {
  if (!hasBackend()) return { tracked: true };
  await requireSession();

  return invokeFunction(appConfig.functions.trackLocation, {
    request_id: payload.requestId,
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy ?? null,
    heading: payload.heading ?? null,
    speed: payload.speed ?? null,
  });
}

export async function registerDevice(payload) {
  if (!hasBackend()) return { ok: true };
  await requireSession();

  return invokeFunction(appConfig.functions.registerDevice, {
    device_id: payload.deviceId,
    push_token: payload.pushToken ?? null,
    platform: payload.platform,
    notifications_enabled: payload.notificationsEnabled,
    marketing_opt_in: payload.marketingOptIn,
  });
}

export async function loadActiveRequest({ userId, providerId }) {
  if (!hasBackend()) return null;
  if (!(await getCurrentSession())?.user) return null;

  const activeStatuses = [
    "SEARCHING",
    "PENDING_PROVIDER_RESPONSE",
    "ACCEPTED",
    "SCHEDULED",
    "PROVIDER_EN_ROUTE",
    "PROVIDER_ARRIVED",
    "IN_PROGRESS",
  ];

  const providerRow = providerId
    ? await fetchSingle("svc_requests", (query) =>
        query
          .select("*")
          .eq("accepted_provider_id", providerId)
          .in("status", activeStatuses)
          .order("created_at", { ascending: false })
          .limit(1)
      )
    : null;

  if (providerRow) return providerRow;

  const clientRows = userId
    ? await fetchTable("svc_requests", (query) =>
        query
          .select("*")
          .eq("client_user_id", userId)
          .in("status", activeStatuses)
          .order("created_at", { ascending: false })
          .limit(1)
      )
    : [];

  return clientRows[0] ?? null;
}

export async function loadConversationForRequest(requestId) {
  if (!requestId || !hasBackend()) return null;
  if (!(await getCurrentSession())?.user) return null;

  const rows = await fetchTable("svc_conversations", (query) =>
    query.select("*").eq("request_id", requestId).limit(1)
  );

  return rows[0] ?? null;
}

export async function updateProviderStatus(providerId, status) {
  const supabase = getSupabaseClient();
  if (!supabase || !providerId) return null;
  await requireSession();

  const { data, error } = await supabase
    .from("svc_providers")
    .update({
      status,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", providerId)
    .select("id,user_id,full_name,email,phone,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_seen_at")
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}
