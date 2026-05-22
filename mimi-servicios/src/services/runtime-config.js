export const MIMI_REALTIME_ENABLED = booleanFromRuntime(
  "MIMI_REALTIME_ENABLED",
  true
);

export const MIMI_REALTIME_OPTIMIZED =
  MIMI_REALTIME_ENABLED &&
  window.MIMI_SERVICES_ENV?.MIMI_REALTIME_OPTIMIZED !== false &&
  window.MIMI_SERVICES_CONFIG?.MIMI_REALTIME_OPTIMIZED !== false;

export const MIMI_REMOTE_BOOTSTRAP_ENABLED = booleanFromRuntime(
  "MIMI_REMOTE_BOOTSTRAP_ENABLED",
  true
);

export const MIMI_BOOT_PUSH_REGISTRATION_ENABLED = booleanFromRuntime(
  "MIMI_BOOT_PUSH_REGISTRATION",
  true
);

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
  ["VITE_POCKETBASE_URL", "MIMI_POCKETBASE_URL"],
  defaultPocketBaseUrl()
);

export const MIMI_POCKETBASE_ENABLED = booleanFromRuntime(
  "MIMI_POCKETBASE_ENABLED",
  true
);

export const MIMI_POCKETBASE_TIMEOUT_MS = numberFromRuntime(
  "MIMI_POCKETBASE_TIMEOUT_MS",
  800
);

export const MIMI_POCKETBASE_CACHE_TTL_MS = numberFromRuntime(
  "MIMI_POCKETBASE_CACHE_TTL_MS",
  10 * 60 * 1000
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

function booleanFromRuntime(key, fallback) {
  const value =
    window.MIMI_SERVICES_ENV?.[key] ??
    window.MIMI_SERVICES_CONFIG?.[key] ??
    window[key];

  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;

  const text = String(value).trim().toLowerCase();
  if (["false", "0", "off", "no"].includes(text)) return false;
  if (["true", "1", "on", "yes"].includes(text)) return true;
  return fallback;
}

function stringFromRuntime(keyOrKeys, fallback) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  const value = keys
    .map((key) =>
      window.MIMI_SERVICES_ENV?.[key] ??
      window.MIMI_SERVICES_CONFIG?.[key] ??
      window[key]
    )
    .find((item) => item !== undefined && item !== null && String(item).trim());
  const text = String(value ?? "").trim();
  return text || fallback;
}

function defaultPocketBaseUrl() {
  const hostname = window.location?.hostname || "";
  const normalizedHost = hostname.replace(/^www\./i, "");

  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    return "http://127.0.0.1:8090";
  }

  if (normalizedHost === "mimigo.com.ar") {
    return `https://cms.${normalizedHost}`;
  }

  return "";
}
