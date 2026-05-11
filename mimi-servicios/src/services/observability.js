import {
  MIMI_OBSERVABILITY_ENABLED,
  MIMI_OBSERVABILITY_SAMPLE_RATE
} from "./runtime-config.js";

const MAX_EVENTS = 120;
const MAX_MESSAGE_LENGTH = 240;
const SENSITIVE_KEYS = /token|secret|password|authorization|apikey|email|phone|dni|document|address/i;

const state = {
  enabled: Boolean(MIMI_OBSERVABILITY_ENABLED),
  sampled: Math.random() <= MIMI_OBSERVABILITY_SAMPLE_RATE,
  bootAt: Date.now(),
  events: [],
  counters: new Map()
};

export function initObservability(surface = "services") {
  if (!shouldRecord()) return;

  recordEvent("app_boot", {
    surface,
    path: location.pathname,
    standalone: isStandalone(),
    connection: navigator.connection?.effectiveType || "unknown"
  });

  observeErrors(surface);
  observeLongTasks(surface);
  observeNavigation(surface);

  window.MIMI_OBSERVABILITY = snapshotObservability;
}

export function recordEvent(type, metadata = {}) {
  if (!shouldRecord() || !type) return;

  const event = {
    type: String(type).slice(0, 80),
    at: Date.now(),
    sinceBootMs: Date.now() - state.bootAt,
    metadata: sanitize(metadata)
  };

  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.shift();

  state.counters.set(event.type, (state.counters.get(event.type) || 0) + 1);

  if (window.MIMI_DEBUG_OBSERVABILITY) {
    console.debug("[MIMI observability]", event);
  }
}

export function markPerformance(name) {
  if (!shouldRecord() || !performance?.mark || !name) return;
  try {
    performance.mark(`mimi:${name}`);
  } catch {
    // best effort
  }
}

export function measurePerformance(name, startMark, endMark) {
  if (!shouldRecord() || !performance?.measure || !name) return;
  try {
    performance.measure(`mimi:${name}`, `mimi:${startMark}`, `mimi:${endMark}`);
  } catch {
    // best effort
  }
}

export function snapshotObservability() {
  return {
    enabled: state.enabled,
    sampled: state.sampled,
    uptimeMs: Date.now() - state.bootAt,
    counters: Object.fromEntries(state.counters),
    events: [...state.events]
  };
}

function observeErrors(surface) {
  window.addEventListener("error", (event) => {
    recordEvent("frontend_error", {
      surface,
      message: event.message,
      source: fileNameOnly(event.filename),
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordEvent("unhandled_rejection", {
      surface,
      message: event.reason?.message || String(event.reason || "unknown")
    });
  });
}

function observeLongTasks(surface) {
  if (!("PerformanceObserver" in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordEvent("long_task", {
          surface,
          durationMs: Math.round(entry.duration)
        });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // unsupported browser
  }
}

function observeNavigation(surface) {
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (!nav) return;
      recordEvent("navigation_timing", {
        surface,
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        transferSize: nav.transferSize || 0
      });
    }, 0);
  }, { once: true });
}

function shouldRecord() {
  return state.enabled && state.sampled;
}

function sanitize(value) {
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, MAX_MESSAGE_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitize);
  if (typeof value !== "object") return String(value).slice(0, MAX_MESSAGE_LENGTH);

  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key)) {
      clean[key] = "[redacted]";
    } else {
      clean[key] = sanitize(item);
    }
  }
  return clean;
}

function fileNameOnly(value) {
  if (!value) return "";
  try {
    return new URL(value).pathname.split("/").pop() || "";
  } catch {
    return String(value).split(/[\\/]/).pop() || "";
  }
}

function isStandalone() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    navigator.standalone
  );
}
