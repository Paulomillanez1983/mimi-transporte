import { appConfig } from "../config.js";
import { callRpc, fetchTable, getCurrentSession, getSupabaseClient, invokeFunction } from "./supabase.js";
import { buildMockMessages, buildMockNotifications, buildMockOffers, buildMockProviders } from "./mock-data.js";

function hasBackend() {
  return Boolean(getSupabaseClient());
}

export async function bootstrapSession() {
  const session = await getCurrentSession();
  return { userId: session?.user?.id ?? null };
}

export async function searchProviders(categoryId, draft) {
  if (!hasBackend()) return buildMockProviders(categoryId, draft);
  const result = await callRpc("svc_search_providers_ranked", {
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

export async function createRequest(payload) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      status: payload.requestType === "SCHEDULED" ? "SCHEDULED" : "SEARCHING",
      ...payload,
      created_at: new Date().toISOString()
    };
  }
  return invokeFunction(appConfig.functions.createRequest, payload);
}

export async function updateRequestStatus(actionName, payload) {
  if (!hasBackend()) return { ok: true, actionName, payload };
  return invokeFunction(actionName, payload);
}

export async function loadNotifications() {
  if (!hasBackend()) return buildMockNotifications();
  return fetchTable("svc_notifications", (query) =>
    query.select("*").order("created_at", { ascending: false }).limit(20)
  );
}

export async function loadOffers() {
  if (!hasBackend()) return buildMockOffers();
  return fetchTable("svc_request_offers", (query) =>
    query.select("*, svc_requests(*)").order("created_at", { ascending: false }).limit(10)
  );
}

export async function loadMessages(conversationId) {
  if (!hasBackend()) return buildMockMessages();
  return fetchTable("svc_messages", (query) =>
    query.select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(50)
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
