import { getSupabaseClient } from "./supabase.js";

let channels = [];

function addChannel(channel) {
  if (!channel) return null;
  channels.push(channel);
  return channel;
}

export function disconnectRealtime() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    channels = [];
    return;
  }

  channels.forEach((channel) => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // noop
    }
  });

  channels = [];
}

function subscribeNotifications(userId, onNotification) {
  const supabase = getSupabaseClient();
  if (!supabase || !userId || typeof onNotification !== "function") return null;

  return addChannel(
    supabase
      .channel(`mimi-servicios-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_notifications",
          filter: `user_id=eq.${userId}`
        },
        onNotification
      )
      .subscribe()
  );
}

function subscribeMessages(conversationId, onMessage) {
  const supabase = getSupabaseClient();
  if (!supabase || !conversationId || typeof onMessage !== "function") return null;

  return addChannel(
    supabase
      .channel(`mimi-servicios-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        onMessage
      )
      .subscribe()
  );
}

function subscribeRequest(requestId, onTracking, onRequest, onOffer) {
  const supabase = getSupabaseClient();
  if (!supabase || !requestId) return null;

  if (typeof onTracking === "function") {
    addChannel(
      supabase
        .channel(`mimi-servicios-tracking-${requestId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "svc_tracking",
            filter: `request_id=eq.${requestId}`
          },
          onTracking
        )
        .subscribe()
    );
  }

  const requestChannel = supabase.channel(`mimi-servicios-requests-${requestId}`);
  let hasSubscriptions = false;

  if (typeof onRequest === "function") {
    requestChannel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "svc_requests",
        filter: `id=eq.${requestId}`
      },
      onRequest
    );
    hasSubscriptions = true;
  }

  if (typeof onOffer === "function") {
    requestChannel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "svc_request_offers",
        filter: `request_id=eq.${requestId}`
      },
      onOffer
    );
    hasSubscriptions = true;
  }

  if (!hasSubscriptions) {
    return null;
  }

  return addChannel(requestChannel.subscribe());
}

function subscribeProviderOffers(providerId, onOffer) {
  const supabase = getSupabaseClient();
  if (!supabase || !providerId || typeof onOffer !== "function") return null;

  return addChannel(
    supabase
      .channel(`mimi-servicios-provider-offers-${providerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_request_offers",
          filter: `provider_id=eq.${providerId}`
        },
        onOffer
      )
      .subscribe()
  );
}

export function subscribeToClientRealtime({
  userId,
  requestId,
  conversationId,
  onNotification,
  onMessage,
  onTracking,
  onRequest
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  disconnectRealtime();

  subscribeNotifications(userId, onNotification);
  subscribeMessages(conversationId, onMessage);
  subscribeRequest(requestId, onTracking, onRequest, null);

  return disconnectRealtime;
}

export function subscribeToProviderRealtime({
  userId,
  providerId,
  requestId,
  conversationId,
  onNotification,
  onMessage,
  onTracking,
  onRequest,
  onOffer
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  disconnectRealtime();

  subscribeNotifications(userId, onNotification);
  subscribeMessages(conversationId, onMessage);
  subscribeRequest(requestId, onTracking, onRequest, onOffer);
  subscribeProviderOffers(providerId, onOffer);

  return disconnectRealtime;
}

export function subscribeToServiceRealtime(options) {
  if (options?.providerId) {
    return subscribeToProviderRealtime(options);
  }

  return subscribeToClientRealtime(options);
}
