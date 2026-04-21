import { getSupabaseClient } from "./supabase.js";

let channels = [];

export function disconnectRealtime() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  channels.forEach((channel) => {
    supabase.removeChannel(channel);
  });
  channels = [];
}

export function subscribeToServiceRealtime({
  userId,
  providerId,
  requestId,
  conversationId,
  onNotification,
  onMessage,
  onTracking,
  onRequest,
  onOffer,
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  disconnectRealtime();

  if (userId) {
    channels.push(
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
          onNotification,
        )
        .subscribe(),
    );
  }

  if (conversationId) {
    channels.push(
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
          onMessage,
        )
        .subscribe(),
    );
  }

  if (requestId) {
    channels.push(
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
          onTracking,
        )
        .subscribe(),
      supabase
        .channel(`mimi-servicios-requests-${requestId}`)
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
    );
  }

  if (providerId) {
    channels.push(
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
          onOffer,
        )
        .subscribe(),
    );
  }
}
