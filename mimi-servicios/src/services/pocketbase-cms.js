import {
  MIMI_POCKETBASE_TIMEOUT_MS,
  MIMI_POCKETBASE_URL
} from "./runtime-config.js";

const CACHE_PREFIX = "mimi_pb_cms:";
const CACHE_TTL_MS = 10 * 60 * 1000;
const VISUAL_COLLECTIONS = new Set([
  "app_config",
  "home_sections",
  "service_categories",
  "banners",
  "faqs",
  "feature_flags"
]);

export async function loadCmsCollection(collection, {
  filter = "enabled=true",
  sort = "order",
  perPage = 50,
  fallback = []
} = {}) {
  if (!VISUAL_COLLECTIONS.has(collection)) {
    return fallback;
  }

  const cacheKey = `${CACHE_PREFIX}${collection}:${filter}:${sort}:${perPage}`;
  const cached = readCache(cacheKey);

  try {
    const url = new URL(`/api/collections/${collection}/records`, normalizedBaseUrl());
    url.searchParams.set("perPage", String(perPage));
    if (filter) url.searchParams.set("filter", filter);
    if (sort) url.searchParams.set("sort", sort);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), MIMI_POCKETBASE_TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    window.clearTimeout(timeout);

    if (!response.ok) throw new Error(`PB_${response.status}`);

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : fallback;
    writeCache(cacheKey, items);
    return items;
  } catch (error) {
    if (cached) return cached;
    if (window.MIMI_DEBUG_CMS) {
      console.warn("[MIMI CMS] PocketBase fallback", collection, error?.message || error);
    }
    return fallback;
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
      id: item.slug || item.id,
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
  return loadCmsCollection("banners", {
    filter:
      `enabled=true && (audience="${audience}" || audience="all")` +
      ` && (starts_at="" || starts_at<="${now}") && (ends_at="" || ends_at>="${now}")`,
    fallback: [],
    perPage: 10
  });
}

function normalizedBaseUrl() {
  return String(MIMI_POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/+$/, "");
}

function readCache(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > CACHE_TTL_MS) return null;
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

function writeCache(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), items }));
  } catch {
    // cache best effort
  }
}
