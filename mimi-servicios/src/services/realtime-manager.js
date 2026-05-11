import { getSupabaseClient } from "./supabase.js";
import { MIMI_REALTIME_OPTIMIZED } from "./runtime-config.js";

const channels = new Map();
const pausedChannels = new Map();
const stats = {
  messages: new Map(),
  duplicates: 0,
  paused: 0,
  resumed: 0,
  removed: 0
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

  detachChannel(entry);
  channels.delete(key);
  pausedChannels.delete(key);
  stats.removed += 1;
  debugRealtime("remove", key);
}

export function pauseScopedChannel(key) {
  const entry = channels.get(key);
  if (!entry || entry.critical) return;

  detachChannel(entry);
  channels.delete(key);
  pausedChannels.set(key, {
    ...entry,
    channel: null,
    pausedAt: Date.now()
  });
  stats.paused += 1;
  debugRealtime("pause", key);
}

export function resumePausedChannels(scopePrefix = "") {
  if (!MIMI_REALTIME_OPTIMIZED || document.visibilityState === "hidden") return;

  [...pausedChannels.entries()]
    .filter(([key]) => !scopePrefix || key.startsWith(scopePrefix))
    .forEach(([key, entry]) => {
      pausedChannels.delete(key);
      subscribeScopedChannel(key, entry.buildChannel, {
        pauseWhenHidden: entry.pauseWhenHidden,
        critical: entry.critical
      });
      stats.resumed += 1;
      debugRealtime("resume", key);
    });
}

function detachChannel(entry) {
  const supabase = getSupabaseClient();
  try {
    if (supabase?.removeChannel) supabase.removeChannel(entry.channel);
    else entry.channel?.unsubscribe?.();
  } catch {
    // noop
  }
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
    pausedChannels: [...pausedChannels.keys()],
    duplicates: stats.duplicates,
    paused: stats.paused,
    resumed: stats.resumed,
    removed: stats.removed,
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
  if (!MIMI_REALTIME_OPTIMIZED) return;

  if (document.visibilityState === "visible") {
    resumePausedChannels();
    return;
  }

  [...channels.values()]
    .filter((entry) => entry.pauseWhenHidden && !entry.critical)
    .forEach((entry) => pauseScopedChannel(entry.key));
});

window.addEventListener("pagehide", () => disconnectRealtime());
window.addEventListener("beforeunload", () => disconnectRealtime());

window.MIMI_REALTIME_DEBUG = realtimeDebugSnapshot;
