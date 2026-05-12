import {
  MIMI_POCKETBASE_CACHE_TTL_MS,
  MIMI_POCKETBASE_ENABLED,
  MIMI_POCKETBASE_TIMEOUT_MS,
  MIMI_POCKETBASE_URL
} from "./runtime-config.js";

const CACHE_PREFIX = "mimi_pb_cms:";
const memoryCache = new Map();
const inFlightRequests = new Map();

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
  realtime_optimized_enabled: true,
  provider_tracking_optimized: true,
  nearby_snapshot_cache_enabled: true
});

export async function loadCmsCollection(collection, {
  filter = "enabled=true",
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
  sort,
  perPage,
  cacheKey,
  cached,
  fallback
}) {
  try {
    const url = new URL(`/api/collections/${collection}/records`, baseUrl);
    url.searchParams.set("perPage", String(clampPerPage(perPage)));
    if (filter) url.searchParams.set("filter", filter);
    if (sort) url.searchParams.set("sort", sort);

    const controller = new AbortController();
    const timeout = setTimeoutSafe(() => controller.abort(), MIMI_POCKETBASE_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url.toString(), {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" }
      });
    } finally {
      clearTimeoutSafe(timeout);
    }

    if (!response.ok) throw new Error(`PB_${response.status}`);

    const data = await response.json();
    const items = normalizeCollectionItems(collection, data?.items);
    writeCache(cacheKey, items);
    return items;
  } catch (error) {
    if (cached) return cached;
    if (window.MIMI_DEBUG_CMS) {
      console.warn("[MIMI CMS] PocketBase fallback", collection, error?.message || error);
    }
    return cloneFallback(fallback);
  }
}

export async function loadCmsServiceCategories(fallback = []) {
  const items = await loadCmsCollection("service_categories", {
    fallback,
    perPage: 100
  });

  return items
    .filter((item) => item?.enabled !== false)
    .map((item) => ({
      id: item.slug || item.id || slugify(item.name),
      code: item.slug || item.name || item.id,
      name: item.name,
      description: item.description || "",
      aliases: [],
      source: "pocketbase_cms",
      visual_order: Number(item.order || 0)
    }));
}

export async function loadCmsBanners(audience = "client") {
  const now = new Date().toISOString();
  const safeAudience = escapePbFilter(audience || "client");

  return loadCmsCollection("banners", {
    filter:
      `enabled=true && (audience="${safeAudience}" || audience="all")` +
      ` && (starts_at="" || starts_at<="${now}") && (ends_at="" || ends_at>="${now}")`,
    fallback: [],
    perPage: 10
  });
}

export async function loadCmsHomeSections(audience = "client", fallback = []) {
  const safeAudience = escapePbFilter(audience || "client");

  return loadCmsCollection("home_sections", {
    filter: `enabled=true && (audience="${safeAudience}" || audience="all")`,
    fallback,
    perPage: 20
  });
}

export async function loadCmsFaqs(audience = "client", fallback = []) {
  const safeAudience = escapePbFilter(audience || "client");

  return loadCmsCollection("faqs", {
    filter: `enabled=true && (audience="${safeAudience}" || audience="all")`,
    fallback,
    perPage: 50
  });
}

export async function loadCmsFeatureFlags(defaults = DEFAULT_FEATURE_FLAGS) {
  const items = await loadCmsCollection("feature_flags", {
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

export function isPocketBaseCmsConfigured() {
  return Boolean(normalizedBaseUrl()) && MIMI_POCKETBASE_ENABLED;
}

function normalizedBaseUrl() {
  const text = String(MIMI_POCKETBASE_URL || "").trim().replace(/\/+$/, "");

  if (!text) return "";

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().replace(/\/+$/, "") : "";
  } catch {
    return "";
  }
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

  const enabled = item.enabled !== false;

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
      enabled,
      parent_category: stringValue(item.parent_category, 120)
    };
  }

  if (collection === "banners") {
    const title = stringValue(item.title, 160);
    if (!title) return null;

    return {
      id: stringValue(item.id, 80),
      title,
      subtitle: stringValue(item.subtitle, 240),
      image: stringValue(item.image, 500),
      cta_label: stringValue(item.cta_label, 80),
      cta_route: safeRouteValue(item.cta_route),
      audience: stringValue(item.audience || "all", 40),
      order: numberValue(item.order),
      enabled,
      starts_at: stringValue(item.starts_at, 40),
      ends_at: stringValue(item.ends_at, 40)
    };
  }

  if (collection === "home_sections") {
    const title = stringValue(item.title, 160);
    if (!title) return null;

    return {
      id: stringValue(item.id, 80),
      title,
      subtitle: stringValue(item.subtitle, 220),
      body: stringValue(item.body, 1200),
      image: stringValue(item.image, 500),
      route: safeRouteValue(item.route),
      order: numberValue(item.order),
      enabled,
      audience: stringValue(item.audience || "all", 40)
    };
  }

  if (collection === "faqs") {
    const question = stringValue(item.question, 240);
    if (!question) return null;

    return {
      id: stringValue(item.id, 80),
      question,
      answer: stringValue(item.answer, 1200),
      audience: stringValue(item.audience || "all", 40),
      order: numberValue(item.order),
      enabled
    };
  }

  if (collection === "feature_flags") {
    const key = stringValue(item.key, 120);
    if (!/^[a-z0-9_:-]+$/i.test(key)) return null;

    return {
      id: stringValue(item.id, 80),
      key,
      enabled,
      description: stringValue(item.description, 240),
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
      enabled,
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

function clampPerPage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function cloneFallback(fallback) {
  return Array.isArray(fallback) ? [...fallback] : [];
}

function escapePbFilter(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
