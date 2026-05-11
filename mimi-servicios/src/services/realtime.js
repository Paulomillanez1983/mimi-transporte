import { getSupabaseClient } from "./supabase.js";
import {
  disconnectRealtime as disconnectManagedRealtime,
  subscribeScopedChannel
} from "./realtime-manager.js";

let channels = [];

function rememberChannel(channel) {
  if (!channel) return null;
  channels.push(channel);
  return channel;
}

export function disconnectRealtime() {
  const supabase = getSupabaseClient();
  disconnectManagedRealtime("services:");

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

  if (!supabase || !userId || typeof onNotification !== "function") {
    return null;
  }

  return rememberChannel(
    subscribeScopedChannel(
      `services:notifications:${userId}`,
      (count) => supabase
      .channel(`client:${userId}:notifications`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_notifications",
          filter: `user_id=eq.${userId}`
        },
        count(onNotification)
      )
      .subscribe(),
      { pauseWhenHidden: true }
    )
  );
}

function subscribeMessages(conversationId, onMessage) {
  const supabase = getSupabaseClient();

  if (!supabase || !conversationId || typeof onMessage !== "function") {
    return null;
  }

  return rememberChannel(
    subscribeScopedChannel(
      `services:messages:${conversationId}`,
      (count) => supabase
      .channel(`conversation:${conversationId}:messages`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_messages",
          filter: `conversation_id=eq.${conversationId}`
        },
        count(onMessage)
      )
      .subscribe(),
      { pauseWhenHidden: true }
    )
  );
}

function subscribeRequest(requestId, onTracking, onRequest, onOffer) {
  const supabase = getSupabaseClient();

  if (!supabase || !requestId) {
    return null;
  }

  if (typeof onTracking === "function") {
    rememberChannel(
      subscribeScopedChannel(
        `services:job:${requestId}:tracking`,
        (count) => supabase
        .channel(`job:${requestId}:tracking`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "svc_tracking",
            filter: `request_id=eq.${requestId}`
          },
          count(onTracking)
        )
        .subscribe(),
        { critical: true }
      )
    );
  }

  const requestChannel = supabase.channel(`job:${requestId}`);
  let hasRequestSubscriptions = false;

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

    hasRequestSubscriptions = true;
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

    hasRequestSubscriptions = true;
  }

  if (!hasRequestSubscriptions) {
    return null;
  }

  return rememberChannel(
    subscribeScopedChannel(
      `services:job:${requestId}:state`,
      () => requestChannel.subscribe(),
      { critical: true }
    )
  );
}

function subscribeProviderOffers(providerId, onOffer) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId || typeof onOffer !== "function") {
    return null;
  }

  return rememberChannel(
    subscribeScopedChannel(
      `services:provider:${providerId}:inbox`,
      (count) => supabase
      .channel(`provider:${providerId}:inbox`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "svc_request_offers",
          filter: `provider_id=eq.${providerId}`
        },
        count(onOffer)
      )
      .subscribe(),
      { critical: true }
    )
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

  if (!supabase) {
    return () => {};
  }

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

  if (!supabase) {
    return () => {};
  }

  disconnectRealtime();

  subscribeNotifications(userId, onNotification);
  subscribeMessages(conversationId, onMessage);
  subscribeRequest(requestId, onTracking, onRequest, onOffer);
  subscribeProviderOffers(providerId, onOffer);

  return disconnectRealtime;
}

export function subscribeToServiceRealtime(options = {}) {
  if (options.providerId) {
    return subscribeToProviderRealtime(options);
  }

  return subscribeToClientRealtime(options);
}
