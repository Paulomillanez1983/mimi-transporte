import { appConfig } from "./config.js";
import {
  callRpc,
  fetchTable,
  getCurrentSession,
  getSupabaseClient,
  invokeFunction
} from "./supabase.js";
import {
  buildMockMessages,
  buildMockNotifications,
  buildMockOffers,
  buildMockProviders
} from "./mock-data.js";

function hasBackend() {
  return Boolean(getSupabaseClient());
}

export async function bootstrapSession() {
  const session = await getCurrentSession();
  const userId = session?.user?.id ?? appConfig.demoClientUserId ?? null;

  const providerRows = userId && hasBackend()
    ? await fetchTable("svc_providers", (query) =>
        query.select("id,user_id,status").eq("user_id", userId).limit(1)
      )
    : [];

  return {
    userId,
    providerId: providerRows[0]?.id ?? null,
    role: providerRows[0]?.id ? "provider" : "client"
  };
}

export async function searchProviders(categoryId, draft) {
  if (!hasBackend()) return buildMockProviders(categoryId, draft);

  const result = await callRpc(appConfig.rpc.searchProvidersRanked, {
    p_category_id: categoryId,
    p_service_lat: Number(draft.lat),
    p_service_lng: Number(draft.lng),
    p_request_type: draft.requestType,
    p_scheduled_for: draft.scheduledFor || null,
    p_requested_hours: Number(draft.requestedHours),
    p_limit: 10
  });

  return (result ?? []).map((item) => {
    const fee = Math.max(500, Math.round(item.provider_price * 0.15));
    return {
      ...item,
      fee,
      total_price: item.provider_price + fee,
      estimated_eta_min: Math.max(6, Math.round((item.distance_km ?? 1) * 6))
    };
  });
}

export async function prepareRequestPricing({
  clientUserId,
  categoryId,
  providerId,
  draft
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
          visible_candidates: candidates
        }
      : {
          eligible: false,
          reason: "provider_not_found"
        };
  }

  return callRpc(appConfig.rpc.prepareRequestPricing, {
    p_client_user_id: clientUserId,
    p_category_id: categoryId,
    p_provider_id: providerId,
    p_service_lat: Number(draft.lat),
    p_service_lng: Number(draft.lng),
    p_request_type: draft.requestType,
    p_scheduled_for: draft.scheduledFor || null,
    p_requested_hours: Number(draft.requestedHours)
  });
}

export async function createRequest(payload) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      status: payload.requestType === "SCHEDULED" ? "SCHEDULED" : "SEARCHING",
      ...payload,
      created_at: new Date().toISOString()
    };
  }

  return invokeFunction(appConfig.functions.createRequest, {
    idempotencyKey: payload.idempotencyKey ?? crypto.randomUUID(),
    categoryId: payload.categoryId,
    category_id: payload.categoryId,
    selectedProviderId: payload.selectedProviderId,
    selected_provider_id: payload.selectedProviderId,
    serviceAddress: payload.address,
    address_text: payload.address,
    serviceLat: payload.serviceLat,
    service_lat: payload.serviceLat,
    serviceLng: payload.serviceLng,
    service_lng: payload.serviceLng,
    requestType: payload.requestType,
    request_type: payload.requestType,
    scheduledFor: payload.scheduledFor,
    scheduled_for: payload.scheduledFor,
    requestedHours: payload.requestedHours,
    requested_hours: payload.requestedHours,
    providerPrice: payload.providerPrice,
    provider_price_snapshot: payload.providerPrice,
    platformFee: payload.platformFee,
    platform_fee_snapshot: payload.platformFee,
    totalPrice: payload.totalPrice,
    total_price_snapshot: payload.totalPrice,
    currency: payload.currency ?? "ARS"
  });
}

export async function updateRequestStatus(actionName, payload) {
  if (!hasBackend()) return { ok: true, actionName, payload };
  return invokeFunction(actionName, payload);
}

export async function loadNotifications(userId) {
  if (!hasBackend()) return buildMockNotifications();

  return fetchTable("svc_notifications", (query) =>
    (userId ? query.select("*").eq("user_id", userId) : query.select("*"))
      .order("created_at", { ascending: false })
      .limit(20)
  );
}

export async function loadOffers(providerId) {
  if (!hasBackend()) return buildMockOffers();
  if (!providerId) return [];

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
      created_at: new Date().toISOString()
    };
  }

  return invokeFunction(appConfig.functions.sendMessage, payload);
}

export async function loadActiveRequest({ userId, providerId }) {
  if (!hasBackend()) return null;

  const activeStatuses = [
    "SEARCHING",
    "PENDING_PROVIDER_RESPONSE",
    "ACCEPTED",
    "SCHEDULED",
    "PROVIDER_EN_ROUTE",
    "PROVIDER_ARRIVED",
    "IN_PROGRESS"
  ];

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

  if (clientRows[0]) return clientRows[0];

  const providerRows = providerId
    ? await fetchTable("svc_requests", (query) =>
        query
          .select("*")
          .eq("accepted_provider_id", providerId)
          .in("status", activeStatuses)
          .order("created_at", { ascending: false })
          .limit(1)
      )
    : [];

  return providerRows[0] ?? null;
}

export async function loadConversationForRequest(requestId) {
  if (!requestId || !hasBackend()) return null;

  const rows = await fetchTable("svc_conversations", (query) =>
    query.select("*").eq("request_id", requestId).limit(1)
  );

  return rows[0] ?? null;
}
