import { getSupabaseClient } from "./supabase.js";
import { MIMI_REALTIME_OPTIMIZED } from "./runtime-config.js";

const channels = new Map();
const stats = {
  messages: new Map(),
  duplicates: 0
};

export function subscribeScopedChannel(key, buildChannel, {
  pauseWhenHidden = false,
  critical = false
} = {}) {
  if (!key || typeof buildChannel !== "function") return null;

  const existing = channels.get(key);
  if (existing?.channel) {
    stats.duplicates += 1;
    debugRealtime("duplicate", key);
    return existing.channel;
  }

  if (pauseWhenHidden && document.visibilityState === "hidden" && !critical) {
    return null;
  }

  const channel = buildChannel(wrapMessageCounter(key));
  if (!channel) return null;

  channels.set(key, {
    key,
    channel,
    pauseWhenHidden,
    critical,
    buildChannel,
    startedAt: Date.now()
  });

  debugRealtime("subscribe", key);
  return channel;
}

export function removeScopedChannel(key) {
  const entry = channels.get(key);
  if (!entry) return;

  const supabase = getSupabaseClient();
  try {
    if (supabase?.removeChannel) supabase.removeChannel(entry.channel);
    else entry.channel?.unsubscribe?.();
  } catch {
    // noop
  }

  channels.delete(key);
  debugRealtime("remove", key);
}

export function disconnectRealtime(scopePrefix = "") {
  [...channels.keys()]
    .filter((key) => !scopePrefix || key.startsWith(scopePrefix))
    .forEach(removeScopedChannel);
}

export function activeRealtimeChannels() {
  return [...channels.keys()];
}

export function realtimeDebugSnapshot() {
  return {
    optimized: MIMI_REALTIME_OPTIMIZED,
    activeChannels: activeRealtimeChannels(),
    duplicates: stats.duplicates,
    messages: Object.fromEntries(stats.messages)
  };
}

function wrapMessageCounter(key) {
  return (handler) => (payload) => {
    const current = stats.messages.get(key) || 0;
    stats.messages.set(key, current + 1);
    handler(payload);
  };
}

function debugRealtime(event, key) {
  if (!window.MIMI_DEBUG_REALTIME) return;
  console.debug("[MIMI realtime]", event, key, realtimeDebugSnapshot());
}

document.addEventListener("visibilitychange", () => {
  if (!MIMI_REALTIME_OPTIMIZED || document.visibilityState !== "hidden") return;

  [...channels.values()]
    .filter((entry) => entry.pauseWhenHidden && !entry.critical)
    .forEach((entry) => removeScopedChannel(entry.key));
});

window.MIMI_REALTIME_DEBUG = realtimeDebugSnapshot;
