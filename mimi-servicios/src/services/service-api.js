import { appConfig } from "../../config.js";
import {
  callRpc,
  fetchSingle,
  fetchTable,
  getCurrentProviderContext,
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

function normalizeProviderCandidate(item) {
  const providerPrice = Number(item?.provider_price ?? 0);
  const fee = Math.max(500, Math.round(providerPrice * 0.15));

  return {
    ...item,
    fee,
    platform_fee: fee,
    total_price: providerPrice + fee,
    estimated_eta_min: Math.max(6, Math.round((Number(item?.distance_km ?? 1) || 1) * 6)),
  };
}

export async function bootstrapSession() {
  const context = await getCurrentProviderContext();
  const session = context?.session ?? await getCurrentSession();
  const userId = session?.user?.id ?? appConfig.demoClientUserId ?? null;
  const provider = context?.provider ?? null;

  return {
    userId,
    providerId: provider?.id ?? null,
    role: provider?.id ? "provider" : "client",
    providerProfile: provider,
  };
}

/* =========================
   CLIENTE
========================= */

export async function searchProviders(categoryId, draft) {
  if (!hasBackend()) return buildMockProviders(categoryId, draft).map(normalizeProviderCandidate);

  const response = await invokeFunction(appConfig.functions.searchProviders, {
    category_id: categoryId,
    service_lat: Number(draft.lat),
    service_lng: Number(draft.lng),
    request_type: draft.requestType,
    scheduled_for: draft.scheduledFor || null,
    requested_hours: Number(draft.requestedHours),
    max_results: 10,
  });

  return (response?.providers ?? []).map(normalizeProviderCandidate);
}

export async function prepareRequestPricing({
  clientUserId,
  categoryId,
  providerId,
  draft,
}) {
  if (!hasBackend()) {
    const candidates = buildMockProviders(categoryId, draft).map(normalizeProviderCandidate);
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
      : { eligible: false, reason: "provider_not_found" };
  }

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

export async function cancelRequest(requestId, reason = "cancelled_by_user") {
  if (!hasBackend()) return { ok: true, request_id: requestId };

  return invokeFunction(appConfig.functions.cancelRequest, {
    request_id: requestId,
    reason,
  });
}

/* =========================
   PRESTADOR
========================= */

export async function loadProviderOffers(providerId) {
  if (!providerId) return [];
  if (!hasBackend()) return buildMockOffers();

  const offers = await fetchTable("svc_request_offers", (query) =>
    query
      .select("*, svc_requests(*)")
      .eq("provider_id", providerId)
      .in("status", ["PENDING", "ACCEPTED"])
      .order("created_at", { ascending: false })
      .limit(20)
  );

  return offers.map((offer) => ({
    ...offer,
    request: offer.svc_requests ?? null,
    title: offer?.svc_requests?.request_type === "SCHEDULED"
      ? "Servicio programado"
      : "Solicitud inmediata",
    address_text: offer?.svc_requests?.address_text ?? "Ubicación a confirmar",
    requested_hours: offer?.svc_requests?.requested_hours ?? 2,
    total_price_snapshot: offer?.svc_requests?.total_price_snapshot ?? 0,
  }));
}

export async function acceptOffer(offerId) {
  if (!hasBackend()) return { accepted: true, offer_id: offerId };

  return invokeFunction(appConfig.functions.providerRespondOffer, {
    offer_id: offerId,
    action: "ACCEPT",
  });
}

export async function rejectOffer(offerId) {
  if (!hasBackend()) return { rejected: true, offer_id: offerId };

  return invokeFunction(appConfig.functions.providerRespondOffer, {
    offer_id: offerId,
    action: "REJECT",
  });
}

export async function markProviderEnRoute(requestId) {
  if (!hasBackend()) return { ok: true, request_id: requestId };
  return invokeFunction(appConfig.functions.providerEnRoute, { request_id: requestId });
}

export async function markProviderArrived(requestId) {
  if (!hasBackend()) return { ok: true, request_id: requestId };
  return invokeFunction(appConfig.functions.providerArrived, { request_id: requestId });
}

export async function startService(requestId) {
  if (!hasBackend()) return { ok: true, request_id: requestId };
  return invokeFunction(appConfig.functions.startService, { request_id: requestId });
}

export async function completeService(requestId) {
  if (!hasBackend()) return { ok: true, request_id: requestId };
  return invokeFunction(appConfig.functions.completeService, { request_id: requestId });
}

export async function sendProviderLocation(requestId, coords) {
  if (!hasBackend()) return { tracked: true };

  return invokeFunction(appConfig.functions.trackLocation, {
    request_id: requestId,
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy ?? null,
    heading: coords.heading ?? null,
    speed: coords.speed ?? null,
  });
}

export async function sendProviderMessage(conversationId, body) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      body,
      conversation_id: conversationId,
      sender_user_id: "mock-self",
      created_at: new Date().toISOString(),
    };
  }

  const response = await invokeFunction(appConfig.functions.sendMessage, {
    conversation_id: conversationId,
    body,
  });

  return response?.message ?? response;
}

/* =========================
   COMPARTIDO
========================= */

export async function registerDevice(payload) {
  if (!hasBackend()) return { ok: true };

  return invokeFunction(appConfig.functions.registerDevice, {
    device_id: payload.deviceId,
    push_token: payload.pushToken ?? null,
    platform: payload.platform,
    notifications_enabled: payload.notificationsEnabled,
    marketing_opt_in: payload.marketingOptIn,
  });
}

export async function loadNotifications(userId) {
  if (!hasBackend()) return buildMockNotifications();
  if (!userId) return [];

  return fetchTable("svc_notifications", (query) =>
    query
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(appConfig.providerUi.notificationsMaxItems ?? 50)
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
      .limit(100)
  );
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
    "IN_PROGRESS",
  ];

  if (providerId) {
    const providerRequest = await fetchSingle("svc_requests", (query) =>
      query
        .select("*")
        .eq("accepted_provider_id", providerId)
        .in("status", activeStatuses)
        .order("created_at", { ascending: false })
        .limit(1)
    );

    if (providerRequest) return providerRequest;
  }

  if (userId) {
    const clientRequest = await fetchSingle("svc_requests", (query) =>
      query
        .select("*")
        .eq("client_user_id", userId)
        .in("status", activeStatuses)
        .order("created_at", { ascending: false })
        .limit(1)
    );

    if (clientRequest) return clientRequest;
  }

  return null;
}

export async function loadConversationForRequest(requestId) {
  if (!requestId || !hasBackend()) return null;

  return fetchSingle("svc_conversations", (query) =>
    query
      .select("*")
      .eq("request_id", requestId)
      .limit(1)
  );
}
