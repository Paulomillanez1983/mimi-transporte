export const MIMI_REALTIME_OPTIMIZED =
  window.MIMI_SERVICES_ENV?.MIMI_REALTIME_OPTIMIZED !== false &&
  window.MIMI_SERVICES_CONFIG?.MIMI_REALTIME_OPTIMIZED !== false;

export const MIMI_PROVIDER_HEARTBEAT_INTERVAL_MS = numberFromRuntime(
  "MIMI_PROVIDER_HEARTBEAT_INTERVAL_MS",
  3 * 60 * 1000
);

export const MIMI_ACTIVE_JOB_LOCATION_INTERVAL_MS = numberFromRuntime(
  "MIMI_ACTIVE_JOB_LOCATION_INTERVAL_MS",
  45 * 1000
);

export const MIMI_NEARBY_REFRESH_INTERVAL_MS = numberFromRuntime(
  "MIMI_NEARBY_REFRESH_INTERVAL_MS",
  60 * 1000
);

export const MIMI_POCKETBASE_URL = stringFromRuntime(
  "MIMI_POCKETBASE_URL",
  "http://127.0.0.1:8090"
);

export const MIMI_POCKETBASE_TIMEOUT_MS = numberFromRuntime(
  "MIMI_POCKETBASE_TIMEOUT_MS",
  800
);

export const MIMI_OBSERVABILITY_ENABLED =
  window.MIMI_SERVICES_ENV?.MIMI_OBSERVABILITY_ENABLED !== false &&
  window.MIMI_SERVICES_CONFIG?.MIMI_OBSERVABILITY_ENABLED !== false;

export const MIMI_OBSERVABILITY_SAMPLE_RATE = Math.min(
  1,
  Math.max(0, numberFromRuntime("MIMI_OBSERVABILITY_SAMPLE_RATE", 1))
);

function numberFromRuntime(key, fallback) {
  const value =
    window.MIMI_SERVICES_ENV?.[key] ??
    window.MIMI_SERVICES_CONFIG?.[key] ??
    window[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringFromRuntime(key, fallback) {
  const value =
    window.MIMI_SERVICES_ENV?.[key] ??
    window.MIMI_SERVICES_CONFIG?.[key] ??
    window[key];
  const text = String(value ?? "").trim();
  return text || fallback;
}
