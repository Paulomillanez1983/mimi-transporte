import {
  MIMI_POCKETBASE_CACHE_TTL_MS,
  MIMI_POCKETBASE_ENABLED,
  MIMI_POCKETBASE_TIMEOUT_MS,
  MIMI_POCKETBASE_URL
} from "./runtime-config.js";

const CACHE_PREFIX = "mimi_pb_cms:";
const memoryCache = new Map();
const inFlightRequests = new Map();
let missingCmsConfigWarned = false;

const VISUAL_COLLECTIONS = new Set([
  "app_config",
  "home_sections",
  "service_categories",
  "banners",
  "faqs",
  "feature_flags"
]);

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  pocketbase_cms_enabled: true,
  enable_home_banners: true,
  enable_dynamic_categories: true,
  enable_faqs: true,
  enable_provider_highlights: true,
  realtime_optimized_enabled: true,
  provider_tracking_optimized: true,
  nearby_snapshot_cache_enabled: true
});

export async function loadCmsCollection(collection, {
  filter = "active=true",
  fallbackFilters = ["enabled=true"],
  sort = "order",
  perPage = 50,
  fallback = []
} = {}) {
  if (!VISUAL_COLLECTIONS.has(collection)) {
    return cloneFallback(fallback);
  }

  const baseUrl = normalizedBaseUrl();
  const cacheKey = `${CACHE_PREFIX}${collection}:${filter}:${sort}:${perPage}`;
  const cached = readCache(cacheKey);

  if (!baseUrl || !MIMI_POCKETBASE_ENABLED) {
    return cached || cloneFallback(fallback);
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const requestPromise = fetchCmsCollection({
    baseUrl,
    collection,
    filter,
    fallbackFilters,
    sort,
    perPage,
    cacheKey,
    cached,
    fallback
  });

  inFlightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

async function fetchCmsCollection({
  baseUrl,
  collection,
  filter,
  fallbackFilters,
  sort,
  perPage,
  cacheKey,
  cached,
  fallback
}) {
  const filters = [filter, ...(Array.isArray(fallbackFilters) ? fallbackFilters : [])]
    .filter((item, index, list) => item && list.indexOf(item) === index);
  let lastError = null;

  for (const currentFilter of filters) {
    try {
      const items = await requestCmsItems({
        baseUrl,
        collection,
        filter: currentFilter,
        sort,
        perPage
      });
      writeCache(cacheKey, items);
      return items;
    } catch (error) {
      lastError = error;
      if (!isRecoverableFilterError(error)) break;
    }
  }

  if (cached) return cached;
  if (window.MIMI_DEBUG_CMS) {
    console.warn("[MIMI CMS] PocketBase fallback", collection, lastError?.message || lastError);
  }
  return cloneFallback(fallback);
}

async function requestCmsItems({
  baseUrl,
  collection,
  filter,
  sort,
  perPage
}) {
  const attempts = 2;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const url = new URL(`/api/collections/${collection}/records`, baseUrl);
    url.searchParams.set("perPage", String(clampPerPage(perPage)));
    if (filter) url.searchParams.set("filter", filter);
    if (sort) url.searchParams.set("sort", sort);

    const controller = new AbortController();
    const timeout = setTimeoutSafe(() => controller.abort(), MIMI_POCKETBASE_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        const error = new Error(`PB_${response.status}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      return normalizeCollectionItems(collection, data?.items);
    } catch (error) {
      lastError = error;
      if (!isRetryableRequestError(error) || attempt + 1 >= attempts) throw error;
    } finally {
      clearTimeoutSafe(timeout);
    }
  }

  throw lastError || new Error("PB_REQUEST_FAILED");
}

export async function loadCmsServiceCategories(fallback = []) {
  const items = await loadCmsCollection("service_categories", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback,
    perPage: 100
  });

  return items
    .filter((item) => item?.active !== false)
    .map((item) => ({
      id: item.slug || item.id || slugify(item.name),
      code: item.slug || item.name || item.id,
      name: item.name,
      description: item.description || "",
      aliases: Array.isArray(item.tags) ? item.tags : [],
      source: "pocketbase_cms",
      visual_order: Number(item.order || 0)
    }));
}

export async function loadCmsBanners(audience = "client") {
  const safeAudience = String(audience || "client").trim() || "client";

  const items = await loadCmsCollection("banners", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback: [],
    perPage: 10
  });

  return items.filter((item) => matchesAudience(item, safeAudience) && isWithinCmsDateRange(item));
}

export async function loadCmsHomeSections(audience = "client", fallback = []) {
  const safeAudience = String(audience || "client").trim() || "client";

  const items = await loadCmsCollection("home_sections", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback,
    perPage: 20
  });

  return items.filter((item) => matchesAudience(item, safeAudience));
}

export async function loadCmsFaqs(audience = "client", fallback = []) {
  const safeAudience = String(audience || "client").trim() || "client";

  const items = await loadCmsCollection("faqs", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback,
    perPage: 50
  });

  return items.filter((item) => matchesAudience(item, safeAudience));
}

export async function loadCmsFeatureFlags(defaults = DEFAULT_FEATURE_FLAGS) {
  const items = await loadCmsCollection("feature_flags", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback: [],
    perPage: 100,
    sort: "key"
  });

  return items.reduce((flags, item) => {
    if (!item?.key) return flags;
    flags[item.key] = Boolean(item.enabled);
    return flags;
  }, { ...DEFAULT_FEATURE_FLAGS, ...(defaults || {}) });
}

export async function loadCmsAppConfig(defaults = {}) {
  const items = await loadCmsCollection("app_config", {
    filter: "active=true",
    fallbackFilters: ["enabled=true"],
    fallback: [],
    perPage: 100,
    sort: "key"
  });

  return items.reduce((config, item) => {
    if (!item?.key) return config;
    config[item.key] = item.value ?? null;
    return config;
  }, { ...(defaults || {}) });
}

export function isPocketBaseCmsConfigured() {
  return Boolean(normalizedBaseUrl()) && MIMI_POCKETBASE_ENABLED;
}

function normalizedBaseUrl() {
  const text = String(MIMI_POCKETBASE_URL || "").trim().replace(/\/+$/, "");

  if (!text) {
    warnMissingCmsConfig();
    return "";
  }

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().replace(/\/+$/, "") : "";
  } catch {
    warnMissingCmsConfig();
    return "";
  }
}

function warnMissingCmsConfig() {
  if (missingCmsConfigWarned) return;
  missingCmsConfigWarned = true;

  const hostname = window.location?.hostname || "";
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return;
  console.warn("[MIMI CMS] PocketBase URL no configurada; usando contenido fallback local.");
}

function readCache(key) {
  const memory = memoryCache.get(key);
  if (memory && Date.now() - Number(memory.savedAt || 0) <= MIMI_POCKETBASE_CACHE_TTL_MS) {
    return Array.isArray(memory.items) ? memory.items : null;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > MIMI_POCKETBASE_CACHE_TTL_MS) return null;
    const items = Array.isArray(parsed.items) ? parsed.items : null;
    if (items) memoryCache.set(key, { savedAt: Number(parsed.savedAt || Date.now()), items });
    return items;
  } catch {
    return null;
  }
}

function writeCache(key, items) {
  memoryCache.set(key, { savedAt: Date.now(), items });

  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // cache best effort
  }
}

function normalizeCollectionItems(collection, items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => normalizeCollectionItem(collection, item))
    .filter(Boolean);
}

function normalizeCollectionItem(collection, item) {
  if (!item || typeof item !== "object") return null;

  const active = item.active !== false && item.enabled !== false;

  if (collection === "service_categories") {
    const name = stringValue(item.name, 120);
    const slug = slugify(item.slug || name || item.id);
    if (!name || !slug) return null;

    return {
      id: stringValue(item.id, 80),
      name,
      slug,
      icon: stringValue(item.icon, 80),
      image: stringValue(item.image, 500),
      description: stringValue(item.description, 600),
      order: numberValue(item.order),
      active,
      enabled: active,
      featured: Boolean(item.featured),
      online: Boolean(item.online),
      radius_km: numberValue(item.radius_km, 0),
      tags: Array.isArray(item.tags) ? item.tags.map((tag) => stringValue(tag, 80)).filter(Boolean) : [],
      parent_slug: stringValue(item.parent_slug || item.parent_category, 120)
    };
  }

  if (collection === "banners") {
    const title = stringValue(item.title, 160);
    if (!title) return null;

    return {
      id: stringValue(item.id, 80),
      title,
      subtitle: stringValue(item.subtitle, 240),
      body: stringValue(item.body, 1200),
      slug: stringValue(item.slug, 120),
      image: stringValue(item.image, 500),
      cta_label: stringValue(item.cta_label, 80),
      cta_url: safeRouteValue(item.cta_url || item.cta_route),
      cta_route: safeRouteValue(item.cta_route || item.cta_url),
      placement: stringValue(item.placement || item.audience || "all", 40),
      audience: stringValue(item.audience || item.placement || "all", 40),
      order: numberValue(item.order),
      active,
      enabled: active,
      start_at: stringValue(item.start_at || item.starts_at, 40),
      end_at: stringValue(item.end_at || item.ends_at, 40),
      starts_at: stringValue(item.starts_at || item.start_at, 40),
      ends_at: stringValue(item.ends_at || item.end_at, 40)
    };
  }

  if (collection === "home_sections") {
    const title = stringValue(item.title, 160);
    if (!title) return null;
    const data = item.data && typeof item.data === "object" ? item.data : null;

    return {
      id: stringValue(item.id, 80),
      title,
      subtitle: stringValue(item.subtitle, 220),
      body: stringValue(item.body, 1200),
      slug: stringValue(item.slug, 120),
      layout: stringValue(item.layout, 80),
      data,
      image: stringValue(item.image, 500),
      route: safeRouteValue(item.route || data?.route),
      order: numberValue(item.order),
      active,
      enabled: active,
      placement: stringValue(item.placement || item.audience || data?.placement || "all", 40),
      audience: stringValue(item.audience || item.placement || data?.placement || "all", 40),
      start_at: stringValue(item.start_at, 40),
      end_at: stringValue(item.end_at, 40)
    };
  }

  if (collection === "faqs") {
    const question = stringValue(item.question, 240);
    if (!question) return null;

    return {
      id: stringValue(item.id, 80),
      question,
      answer: stringValue(item.answer, 1200),
      category: stringValue(item.category || item.audience || "all", 80),
      audience: stringValue(item.audience || item.category || "all", 40),
      order: numberValue(item.order),
      active,
      enabled: active
    };
  }

  if (collection === "feature_flags") {
    const key = stringValue(item.key, 120);
    if (!/^[a-z0-9_:-]+$/i.test(key)) return null;

    return {
      id: stringValue(item.id, 80),
      key,
      enabled: item.enabled !== false,
      active,
      description: stringValue(item.description, 240),
      environment: stringValue(item.environment, 40),
      payload: item.payload && typeof item.payload === "object" ? item.payload : null,
      rollout_percentage: Math.min(100, Math.max(0, numberValue(item.rollout_percentage, 0)))
    };
  }

  if (collection === "app_config") {
    const key = stringValue(item.key, 120);
    if (!key) return null;

    return {
      id: stringValue(item.id, 80),
      key,
      value: item.value ?? null,
      active,
      enabled: active,
      description: stringValue(item.description, 240),
      environment: stringValue(item.environment, 40),
      updated_at: stringValue(item.updated_at, 40)
    };
  }

  return null;
}

function stringValue(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeRouteValue(value) {
  const text = stringValue(value, 180);
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  return "";
}

function matchesAudience(item, audience) {
  const target = String(audience || "client").toLowerCase();
  const value = String(item?.placement || item?.audience || item?.category || "all").toLowerCase();
  return !value || value === "all" || value === target;
}

function isWithinCmsDateRange(item) {
  const now = Date.now();
  const start = Date.parse(item?.start_at || item?.starts_at || "");
  const end = Date.parse(item?.end_at || item?.ends_at || "");
  if (Number.isFinite(start) && start > now) return false;
  if (Number.isFinite(end) && end < now) return false;
  return true;
}

function clampPerPage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function cloneFallback(fallback) {
  return Array.isArray(fallback) ? [...fallback] : [];
}

function isRecoverableFilterError(error) {
  return [400, 404].includes(Number(error?.status));
}

function isRetryableRequestError(error) {
  if (!error) return false;
  if (["AbortError", "TypeError"].includes(error.name)) return true;
  return [408, 429, 500, 502, 503, 504].includes(Number(error.status));
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setTimeoutSafe(callback, ms) {
  return window.setTimeout(callback, ms);
}

function clearTimeoutSafe(timeout) {
  window.clearTimeout(timeout);
}
