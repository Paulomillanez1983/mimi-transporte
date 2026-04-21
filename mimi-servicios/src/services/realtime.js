import { getSupabaseClient } from "./supabase.js";

let channels = [];

export function disconnectRealtime() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  channels.forEach((channel) => supabase.removeChannel(channel));
  channels = [];
}

export function subscribeToServiceRealtime({ onNotification, onMessage, onTracking, onRequest, onOffer }) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  disconnectRealtime();

  channels = [
    supabase.channel("mimi-servicios-notifications").on("postgres_changes", { event: "*", schema: "public", table: "svc_notifications" }, onNotification).subscribe(),
    supabase.channel("mimi-servicios-messages").on("postgres_changes", { event: "*", schema: "public", table: "svc_messages" }, onMessage).subscribe(),
    supabase.channel("mimi-servicios-tracking").on("postgres_changes", { event: "*", schema: "public", table: "svc_tracking" }, onTracking).subscribe(),
    supabase
      .channel("mimi-servicios-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "svc_requests" }, onRequest)
      .on("postgres_changes", { event: "*", schema: "public", table: "svc_request_offers" }, onOffer)
      .subscribe()
  ];
}
