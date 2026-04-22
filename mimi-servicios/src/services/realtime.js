import { getSupabaseClient } from "./supabase.js";

let channels = [];

function trackChannel(channel) {
  channels.push(channel);
  return channel;
}

export function disconnectRealtime() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  channels.forEach((channel) => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // noop
    }
  });

  channels = [];
}

export function subscribeToUserNotifications(userId, cb) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || typeof cb !== "function") return null;

  return trackChannel(
    supabase
      .channel(`mimi-servicios-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_notifications",
          filter: `user_id=eq.${userId}`,
        },
        cb,
      )
      .subscribe(),
  );
}

export function subscribeToConversationMessages(conversationId, cb) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId || typeof cb !== "function") return null;

  return trackChannel(
    supabase
      .channel(`mimi-servicios-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        cb,
      )
      .subscribe(),
  );
}

export function subscribeToRequestTracking(requestId, cb) {
  const supabase = getSupabaseClient();
  if (!supabase || !requestId || typeof cb !== "function") return null;

  return trackChannel(
    supabase
      .channel(`mimi-servicios-tracking-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_tracking",
          filter: `request_id=eq.${requestId}`,
        },
        cb,
      )
      .subscribe(),
  );
}

export function subscribeToRequestState(requestId, onRequest, onOffer) {
  const supabase = getSupabaseClient();
  if (!supabase || !requestId) return [];

  const localChannels = [];

  if (typeof onRequest === "function") {
    localChannels.push(
      trackChannel(
        supabase
          .channel(`mimi-servicios-request-${requestId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "svc_requests",
              filter: `id=eq.${requestId}`,
            },
            onRequest,
          )
          .subscribe(),
      ),
    );
  }

  if (typeof onOffer === "function") {
    localChannels.push(
      trackChannel(
        supabase
          .channel(`mimi-servicios-request-offers-${requestId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "svc_request_offers",
              filter: `request_id=eq.${requestId}`,
            },
            onOffer,
          )
          .subscribe(),
      ),
    );
  }

  return localChannels;
}

export function subscribeToProviderOffers(providerId, cb) {
  const supabase = getSupabaseClient();
  if (!supabase || !providerId || typeof cb !== "function") return null;

  return trackChannel(
    supabase
      .channel(`mimi-servicios-provider-offers-${providerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_request_offers",
          filter: `provider_id=eq.${providerId}`,
        },
        cb,
      )
      .subscribe(),
  );
}


export function subscribeToServiceRealtime({ userId, providerId, requestId, conversationId, onNotification, onMessage, onTracking, onRequest, onOffer } = {}) {
  disconnectRealtime();
  if (userId && typeof onNotification === "function") subscribeToUserNotifications(userId, onNotification);
  if (conversationId && typeof onMessage === "function") subscribeToConversationMessages(conversationId, onMessage);
  if (requestId) {
    if (typeof onTracking === "function") subscribeToRequestTracking(requestId, onTracking);
    if (typeof onRequest === "function" || typeof onOffer === "function") subscribeToRequestState(requestId, onRequest, onOffer);
  }
  if (providerId && typeof onOffer === "function") subscribeToProviderOffers(providerId, onOffer);
  return channels;
}
