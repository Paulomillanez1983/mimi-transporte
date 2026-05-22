import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FUNCTION_BUILD = "2026.05.20.14-publication-idempotent";

const defaultAllowedOrigins = [
  "https://mimigo.com.ar",
  "https://www.mimigo.com.ar",
  "https://mimi-transporte.vercel.app",
];

function configuredAllowedOrigins() {
  return new Set([
    ...defaultAllowedOrigins,
    ...(Deno.env.get("MIMI_CORS_ALLOW_ORIGIN") || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]);
}

function isLocalDevOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function corsHeadersForRequest(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = configuredAllowedOrigins().has(origin) || isLocalDevOrigin(origin)
    ? origin
    : "https://mimigo.com.ar";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mimi-provider-id, x-mimi-correlation-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const OFFERING_SELECT = "id,provider_id,category_id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,minimum_charge,minimum_hours,maximum_hours,quote_required,service_mode,duration_minutes,location_policy,public_summary,client_instructions,active,metadata,created_at,updated_at";
const ADDON_SELECT = "id,provider_id,offering_id,name,description,addon_code,price,pricing_model,unit,is_active,created_at,updated_at";
const PRICING_SELECT = "id,provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active,created_at,updated_at";
const CATEGORY_LINK_SELECT = "id,provider_id,category_id,active,created_at,updated_at,svc_categories(id,name,code,description,active)";
const PROFILE_SELECT = "id,provider_id,first_name,bio,address_text,city,province,country_code,pricing_mode,accepts_immediate,accepts_scheduled,max_hours_per_service,onboarding_completed,public_headline,professional_summary,video_intro_url,metadata_json,avatar_public_url,created_at,updated_at";

type JsonRecord = Record<string, unknown>;

function json(body: JsonRecord, status = 200, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (isRecord(error) && typeof error.code === "string" && error.code.trim()) {
    return error.code.trim();
  }
  return "unexpected_error";
}

function errorCode(error: unknown) {
  if (isRecord(error) && typeof error.code === "string" && error.code.trim()) {
    return error.code.trim();
  }
  return null;
}

function assertUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function cleanText(value: unknown, maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength = 500) {
  const text = cleanText(value, maxLength);
  return text || null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = optionalNumber(value);
  if (parsed === null) return fallback;
  if (parsed < 0) throw new Error("negative_amount_not_allowed");
  return parsed;
}

function normalizeEnum(value: unknown, allowed: string[], fallback: string) {
  const normalized = String(value || fallback).trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function strictEnum(value: unknown, allowed: string[], fallback: string, field: string) {
  const normalized = String(value === "" || value == null ? fallback : value).trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new Error(`${field}_invalid`);
  return normalized;
}

function normalizePricingModel(value: unknown) {
  return strictEnum(value, ["HOURLY", "BASE_VISIT", "QUOTE", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER"], "HOURLY", "pricing_model");
}

function normalizeServiceMode(value: unknown) {
  return strictEnum(value, ["IN_PERSON", "ONLINE", "HYBRID"], "IN_PERSON", "service_mode");
}

function normalizeLocationPolicy(value: unknown) {
  return strictEnum(value, ["CLIENT_ADDRESS", "PROVIDER_ADDRESS", "ONLINE", "FLEXIBLE"], "CLIENT_ADDRESS", "location_policy");
}

function normalizeCurrency(value: unknown) {
  const currency = cleanText(value || "ARS", 8).toUpperCase();
  return currency || "ARS";
}

function normalizePricingMode(value: unknown) {
  return normalizeEnum(value, ["HOURLY", "FIXED", "QUOTE", "FLEXIBLE"], "HOURLY");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function snapshotOffering(row: JsonRecord | null | undefined) {
  if (!row) return {};
  return {
    id: row.id ?? null,
    provider_id: row.provider_id ?? null,
    category_id: row.category_id ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    pricing_model: row.pricing_model ?? null,
    currency: row.currency ?? null,
    price_per_hour: row.price_per_hour ?? null,
    base_visit_fee: row.base_visit_fee ?? null,
    fixed_price: row.fixed_price ?? null,
    unit_name: row.unit_name ?? null,
    unit_price: row.unit_price ?? null,
    minimum_charge: row.minimum_charge ?? null,
    minimum_hours: row.minimum_hours ?? null,
    maximum_hours: row.maximum_hours ?? null,
    quote_required: row.quote_required ?? null,
    service_mode: row.service_mode ?? null,
    duration_minutes: row.duration_minutes ?? null,
    location_policy: row.location_policy ?? null,
    public_summary: row.public_summary ?? null,
    client_instructions: row.client_instructions ?? null,
    active: row.active ?? null,
    metadata: isRecord(row.metadata) ? row.metadata : {},
  };
}

function diffSnapshots(previous: JsonRecord, current: JsonRecord) {
  const diff: JsonRecord = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const key of keys) {
    const before = previous[key] ?? null;
    const after = current[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[key] = { from: before, to: after };
    }
  }

  return diff;
}

function hasPriceChange(diff: JsonRecord) {
  return [
    "pricing_model",
    "currency",
    "price_per_hour",
    "base_visit_fee",
    "fixed_price",
    "unit_name",
    "unit_price",
    "minimum_charge",
    "minimum_hours",
    "maximum_hours",
    "quote_required",
  ].some((key) => Object.prototype.hasOwnProperty.call(diff, key));
}

function normalizeAddonPricingModel(value: unknown) {
  return strictEnum(value, ["FIXED", "UNIT", "HOURLY", "SQUARE_METER", "QUOTE"], "FIXED", "addon_pricing_model");
}

function normalizeAddonCode(value: unknown, fallbackName: string) {
  const source = cleanText(value, 80) || fallbackName;
  return source
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "addon";
}

function snapshotAddon(row: JsonRecord | null | undefined) {
  if (!row) return {};
  return {
    id: row.id ?? null,
    provider_id: row.provider_id ?? null,
    offering_id: row.offering_id ?? null,
    name: row.name ?? null,
    description: row.description ?? null,
    addon_code: row.addon_code ?? null,
    price: row.price ?? null,
    pricing_model: row.pricing_model ?? null,
    unit: row.unit ?? null,
    is_active: row.is_active ?? null,
  };
}

function normalizeCategories(payload: JsonRecord) {
  const source = Array.isArray(payload.categories) ? payload.categories : [];
  const seen = new Set<string>();
  const categories: Array<{ category_id: string }> = [];

  for (const item of source) {
    const categoryId = String((item as JsonRecord)?.categoryId || (item as JsonRecord)?.category_id || "").trim();
    if (!assertUuid(categoryId) || seen.has(categoryId)) continue;
    seen.add(categoryId);
    categories.push({ category_id: categoryId });
  }

  return categories;
}

function normalizePricing(payload: JsonRecord) {
  const source = Array.isArray(payload.pricing) ? payload.pricing : [];
  const pricing = [];

  for (const item of source) {
    const record = item as JsonRecord;
    const categoryId = String(record.categoryId || record.category_id || "").trim();
    if (!assertUuid(categoryId)) continue;

    const pricePerHour = requiredNonNegativeNumber(record.pricePerHour ?? record.price_per_hour, 0);
    const minimumHours = Math.max(0, requiredNonNegativeNumber(record.minimumHours ?? record.minimum_hours, 1));
    const maximumHours = Math.max(minimumHours || 1, requiredNonNegativeNumber(record.maximumHours ?? record.maximum_hours, 8));

    pricing.push({
      category_id: categoryId,
      currency: normalizeCurrency(record.currency),
      price_per_hour: pricePerHour,
      minimum_hours: minimumHours || 1,
      maximum_hours: maximumHours || 8,
      active: true,
    });
  }

  return pricing;
}

function normalizeOfferingMetadata(value: unknown) {
  const metadata = isRecord(value) ? value : {};
  const coverageRadiusMeters = optionalNumber(metadata.coverage_radius_meters);

  return coverageRadiusMeters === null
    ? {}
    : { coverage_radius_meters: coverageRadiusMeters };
}

function normalizeOfferings(payload: JsonRecord) {
  const source = Array.isArray(payload.offerings) ? payload.offerings : [];
  const offerings = [];

  for (const item of source) {
    const record = item as JsonRecord;
    const categoryId = String(record.categoryId || record.category_id || "").trim();
    const title = cleanText(record.title, 120);
    if (!assertUuid(categoryId) || !title) continue;

    const row: JsonRecord = {
      category_id: categoryId,
      title,
      description: optionalText(record.description, 1200),
      pricing_model: normalizePricingModel(record.pricingModel ?? record.pricing_model),
      currency: normalizeCurrency(record.currency),
      price_per_hour: optionalNumber(record.pricePerHour ?? record.price_per_hour),
      base_visit_fee: optionalNumber(record.baseVisitFee ?? record.base_visit_fee),
      fixed_price: optionalNumber(record.fixedPrice ?? record.fixed_price),
      unit_name: optionalText(record.unitName ?? record.unit_name, 40),
      unit_price: optionalNumber(record.unitPrice ?? record.unit_price),
      minimum_charge: requiredNonNegativeNumber(record.minimumCharge ?? record.minimum_charge, 0),
      minimum_hours: optionalNumber(record.minimumHours ?? record.minimum_hours),
      maximum_hours: optionalNumber(record.maximumHours ?? record.maximum_hours),
      quote_required: Boolean(record.quoteRequired ?? record.quote_required),
      service_mode: normalizeServiceMode(record.serviceMode ?? record.service_mode),
      duration_minutes: optionalNumber(record.durationMinutes ?? record.duration_minutes),
      location_policy: normalizeLocationPolicy(record.locationPolicy ?? record.location_policy),
      public_summary: optionalText(record.publicSummary ?? record.public_summary, 280),
      client_instructions: optionalText(record.clientInstructions ?? record.client_instructions, 800),
      active: true,
      metadata: normalizeOfferingMetadata(record.metadata),
    };

    const id = String(record.id || "").trim();
    if (id) {
      if (!assertUuid(id)) throw new Error("offering_id_invalid");
      row.id = id;
    }

    const priceFields = [
      row.price_per_hour,
      row.base_visit_fee,
      row.fixed_price,
      row.unit_price,
      row.minimum_charge,
    ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);

    if (row.pricing_model !== "QUOTE" && !row.quote_required && priceFields.length === 0) {
      throw new Error("offering_price_required");
    }

    offerings.push(row);
  }

  return offerings;
}

function normalizeOfferingAddons(payload: JsonRecord) {
  const source = Array.isArray(payload.addons) ? payload.addons : [];
  const addons = [];

  for (const item of source) {
    const record = item as JsonRecord;
    const name = cleanText(record.name, 80);
    const id = String(record.id || "").trim();
    if (!name && !id) continue;
    if (!name) throw new Error("addon_name_required");

    const pricingModel = normalizeAddonPricingModel(record.pricingModel ?? record.pricing_model);
    const price = pricingModel === "QUOTE"
      ? 0
      : requiredNonNegativeNumber(record.price, 0);

    const row: JsonRecord = {
      name,
      description: optionalText(record.description, 280),
      addon_code: normalizeAddonCode(record.addonCode ?? record.addon_code, name),
      price,
      pricing_model: pricingModel,
      unit: optionalText(record.unit, 40),
      is_active: record.isActive === false || record.is_active === false ? false : true,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      if (!assertUuid(id)) throw new Error("addon_id_invalid");
      row.id = id;
    }

    addons.push(row);
  }

  return addons;
}

function normalizeAvailability(payload: JsonRecord) {
  const source = Array.isArray(payload.availability) ? payload.availability : [];
  return source
    .filter((item) => {
      const record = item as JsonRecord;
      return record?.active && record?.startTime && record?.endTime;
    })
    .map((item) => {
      const record = item as JsonRecord;
      return {
        day_of_week: Number(record.dayOfWeek ?? record.day_of_week),
        start_time: String(record.startTime ?? record.start_time),
        end_time: String(record.endTime ?? record.end_time),
        active: true,
      };
    })
    .filter((item) => Number.isInteger(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6);
}

async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  if (!token) throw new Error("AUTH_REQUIRED");

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);

  if (error || !data?.user) throw new Error("AUTH_REQUIRED");

  return data.user;
}

async function assertProviderOwnership(admin: any, providerId: string, userId: string) {
  const { data, error } = await admin
    .from("svc_providers")
    .select("id,user_id,blocked,approved,status")
    .eq("id", providerId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.user_id !== userId) throw new Error("PROVIDER_FORBIDDEN");
  if (data.blocked) throw new Error("PROVIDER_BLOCKED");

  return data;
}

async function resolveProviderIdForUser(admin: any, requestedProviderId: string, userId: string) {
  const normalized = String(requestedProviderId || "").trim();
  if (assertUuid(normalized)) {
    const { data, error } = await admin
      .from("svc_providers")
      .select("id")
      .eq("id", normalized)
      .maybeSingle();

    if (error) throw error;
    if (data?.id) return String(data.id);
  }

  const { data, error } = await admin
    .from("svc_providers")
    .select("id")
    .eq("user_id", userId)
    .limit(2);

  if (error) throw error;
  if (data?.length === 1 && assertUuid(data[0]?.id)) {
    return String(data[0].id);
  }

  const providerError = new Error("provider_id_required") as Error & { providerCount?: number };
  providerError.providerCount = data?.length || 0;
  throw providerError;
}

async function assertCategoriesExist(admin: any, categoryIds: string[]) {
  const uniqueIds = [...new Set(categoryIds.filter(assertUuid))];
  if (!uniqueIds.length) return;

  const { data, error } = await admin
    .from("svc_categories")
    .select("id,active")
    .in("id", uniqueIds);

  if (error) throw error;

  const valid = new Set((data || []).filter((row: JsonRecord) => row.active !== false).map((row: JsonRecord) => String(row.id)));
  const missing = uniqueIds.filter((id) => !valid.has(id));
  if (missing.length) throw new Error("category_not_available");
}

async function assertOfferingOwnership(admin: any, providerId: string, offerings: JsonRecord[]) {
  const ids = offerings.map((row) => String(row.id || "")).filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await admin
    .from("svc_provider_service_offerings")
    .select("id,provider_id")
    .in("id", ids);

  if (error) throw error;

  const owned = new Set((data || []).filter((row: JsonRecord) => row.provider_id === providerId).map((row: JsonRecord) => String(row.id)));
  const invalid = ids.filter((id) => !owned.has(id));
  if (invalid.length) throw new Error("offering_forbidden");
}

async function loadCanonicalWorkspace(admin: any, providerId: string) {
  const [
    providerResult,
    profileResult,
    pricingResult,
    offeringResult,
    addonResult,
    availabilityResult,
    categoryResult,
    completedResult,
  ] = await Promise.all([
    admin
      .from("svc_providers")
      .select("id,user_id,full_name,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,created_at,updated_at")
      .eq("id", providerId)
      .maybeSingle(),
    admin
      .from("svc_provider_profiles")
      .select(PROFILE_SELECT)
      .eq("provider_id", providerId)
      .maybeSingle(),
    admin
      .from("svc_provider_pricing")
      .select(PRICING_SELECT)
      .eq("provider_id", providerId)
      .eq("active", true),
    admin
      .from("svc_provider_service_offerings")
      .select(OFFERING_SELECT)
      .eq("provider_id", providerId)
      .eq("active", true)
      .order("updated_at", { ascending: false }),
    admin
      .from("svc_provider_offering_addons")
      .select(ADDON_SELECT)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: true }),
    admin
      .from("svc_provider_availability")
      .select("id,provider_id,day_of_week,start_time,end_time,active,created_at,updated_at")
      .eq("provider_id", providerId)
      .eq("active", true),
    admin
      .from("svc_provider_categories")
      .select(CATEGORY_LINK_SELECT)
      .eq("provider_id", providerId)
      .eq("active", true),
    admin
      .from("svc_requests")
      .select("id", { count: "exact" })
      .or(`selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`)
      .eq("status", "COMPLETED")
      .limit(1),
  ]);

  for (const result of [providerResult, profileResult, pricingResult, offeringResult, addonResult, availabilityResult, categoryResult, completedResult]) {
    if (result.error) throw result.error;
  }

  const addonsByOfferingId = new Map<string, JsonRecord[]>();
  for (const addon of addonResult.data || []) {
    const offeringId = String((addon as JsonRecord).offering_id || "");
    if (!offeringId) continue;
    if (!addonsByOfferingId.has(offeringId)) addonsByOfferingId.set(offeringId, []);
    addonsByOfferingId.get(offeringId)?.push(addon as JsonRecord);
  }

  const offeringsWithAddons = (offeringResult.data || []).map((offering: JsonRecord) => ({
    ...offering,
    addons: addonsByOfferingId.get(String(offering.id || "")) || [],
  }));

  return {
    profile: providerResult.data || null,
    profileDetail: profileResult.data || null,
    pricing: pricingResult.data || [],
    offerings: offeringsWithAddons,
    addons: addonResult.data || [],
    availability: availabilityResult.data || [],
    categories: categoryResult.data || [],
    completedCount: completedResult.count || 0,
  };
}

async function loadPublicationWorkspace(
  admin: any,
  providerId: string,
  fallbackOffering: JsonRecord | null = null,
) {
  try {
    return await loadCanonicalWorkspace(admin, providerId);
  } catch (error) {
    console.error("svc-save-provider-service publication workspace reload failed:", error);
    return {
      profile: null,
      profileDetail: null,
      pricing: [],
      offerings: fallbackOffering?.active !== false ? [fallbackOffering] : [],
      availability: [],
      categories: [],
      completedCount: 0,
      workspace_warning: "canonical_workspace_reload_failed",
    };
  }
}

function canonicalMatchesSubmitted(canonical: JsonRecord[], submitted: JsonRecord[]) {
  for (const expected of submitted) {
    const match = expected.id
      ? canonical.find((row) => row.id === expected.id)
      : canonical.find((row) =>
          row.category_id === expected.category_id &&
          String(row.title || "").trim() === String(expected.title || "").trim() &&
          String(row.pricing_model || "").toUpperCase() === String(expected.pricing_model || "").toUpperCase()
        );

    if (!match) return false;

    const fields = [
      "category_id",
      "title",
      "description",
      "pricing_model",
      "currency",
      "price_per_hour",
      "base_visit_fee",
      "fixed_price",
      "unit_name",
      "unit_price",
      "minimum_charge",
      "minimum_hours",
      "maximum_hours",
      "quote_required",
      "service_mode",
      "duration_minutes",
      "location_policy",
      "public_summary",
      "client_instructions",
    ];

    for (const field of fields) {
      const left = match[field] ?? null;
      const right = expected[field] ?? null;
      if (JSON.stringify(left) !== JSON.stringify(right)) return false;
    }
  }

  return true;
}

function sameNumber(left: unknown, right: unknown) {
  const leftNumber = optionalNumber(left);
  const rightNumber = optionalNumber(right);
  if (leftNumber === null && rightNumber === null) return true;
  return leftNumber !== null && rightNumber !== null && Math.abs(leftNumber - rightNumber) < 0.000001;
}

function canonicalPricingMatchesSubmitted(canonical: JsonRecord[], submitted: JsonRecord[]) {
  for (const expected of submitted) {
    const match = canonical.find((row) => row.category_id === expected.category_id);
    if (!match) return false;

    if (String(match.currency || "ARS").toUpperCase() !== String(expected.currency || "ARS").toUpperCase()) return false;
    if (!sameNumber(match.price_per_hour, expected.price_per_hour)) return false;
    if (!sameNumber(match.minimum_hours, expected.minimum_hours)) return false;
    if (!sameNumber(match.maximum_hours, expected.maximum_hours)) return false;
  }

  return true;
}

async function insertChangeEvents(
  admin: any,
  providerId: string,
  actorUserId: string,
  correlationId: string,
  previousOfferings: JsonRecord[],
  canonicalOfferings: JsonRecord[],
) {
  const previousById = new Map(previousOfferings.map((row) => [String(row.id), row]));
  const activeCanonicalIds = new Set(canonicalOfferings.map((row) => String(row.id)));
  const events = [];

  for (const current of canonicalOfferings) {
    const previous = previousById.get(String(current.id));
    const previousSnapshot = snapshotOffering(previous);
    const newSnapshot = snapshotOffering(current);
    const diff = diffSnapshots(previousSnapshot, newSnapshot);

    if (!previous) {
      events.push({
        provider_id: providerId,
        offering_id: current.id,
        actor_user_id: actorUserId,
        change_type: "created",
        previous_snapshot: {},
        new_snapshot: newSnapshot,
        diff,
        source: "svc-save-provider-service",
        correlation_id: correlationId,
      });
      continue;
    }

    if (!Object.keys(diff).length) continue;

    events.push({
      provider_id: providerId,
      offering_id: current.id,
      actor_user_id: actorUserId,
      change_type: previous.active === false
        ? "activated"
        : hasPriceChange(diff)
          ? "price_changed"
          : "updated",
      previous_snapshot: previousSnapshot,
      new_snapshot: newSnapshot,
      diff,
      source: "svc-save-provider-service",
      correlation_id: correlationId,
    });
  }

  for (const previous of previousOfferings) {
    if (previous.active === false || activeCanonicalIds.has(String(previous.id))) continue;

    const previousSnapshot = snapshotOffering(previous);
    const newSnapshot = { ...previousSnapshot, active: false };
    events.push({
      provider_id: providerId,
      offering_id: previous.id,
      actor_user_id: actorUserId,
      change_type: "deactivated",
      previous_snapshot: previousSnapshot,
      new_snapshot: newSnapshot,
      diff: { active: { from: true, to: false } },
      source: "svc-save-provider-service",
      correlation_id: correlationId,
    });
  }

  if (!events.length) return 0;

  const { error } = await admin
    .from("svc_provider_service_change_events")
    .insert(events);

  if (error) throw error;

  return events.length;
}

async function deactivateOffering(
  admin: any,
  providerId: string,
  actorUserId: string,
  offeringId: string,
  correlationId: string,
) {
  if (!assertUuid(offeringId)) throw new Error("offering_id_invalid");

  await assertOfferingOwnership(admin, providerId, [{ id: offeringId }]);

  const { data: previous, error: previousError } = await admin
    .from("svc_provider_service_offerings")
    .select(OFFERING_SELECT)
    .eq("id", offeringId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (previousError) throw previousError;
  if (!previous) throw new Error("offering_forbidden");

  if (previous.active === false) {
    return {
      workspace: await loadPublicationWorkspace(admin, providerId),
      auditEventsCount: 0,
    };
  }

  const { data: updated, error: updateError } = await admin
    .from("svc_provider_service_offerings")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", offeringId)
    .eq("provider_id", providerId)
    .eq("active", true)
    .select(OFFERING_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    return {
      workspace: await loadPublicationWorkspace(admin, providerId),
      auditEventsCount: 0,
    };
  }

  const previousSnapshot = snapshotOffering(previous);
  const newSnapshot = snapshotOffering(updated);
  const diff = diffSnapshots(previousSnapshot, newSnapshot);

  const { error: auditError } = await admin
    .from("svc_provider_service_change_events")
    .insert({
      provider_id: providerId,
      offering_id: offeringId,
      actor_user_id: actorUserId,
      change_type: "deactivated",
      previous_snapshot: previousSnapshot,
      new_snapshot: newSnapshot,
      diff: Object.keys(diff).length ? diff : { active: { from: true, to: false } },
      source: "svc-save-provider-service",
      correlation_id: correlationId,
    });

  if (auditError) throw auditError;

  return {
    workspace: await loadPublicationWorkspace(admin, providerId, updated),
    auditEventsCount: 1,
  };
}

async function reactivateOffering(
  admin: any,
  providerId: string,
  actorUserId: string,
  offeringId: string,
  correlationId: string,
) {
  if (!assertUuid(offeringId)) throw new Error("offering_id_invalid");

  await assertOfferingOwnership(admin, providerId, [{ id: offeringId }]);

  const { data: previous, error: previousError } = await admin
    .from("svc_provider_service_offerings")
    .select(OFFERING_SELECT)
    .eq("id", offeringId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (previousError) throw previousError;
  if (!previous) throw new Error("offering_forbidden");

  if (previous.active !== false) {
    return {
      workspace: await loadPublicationWorkspace(admin, providerId, previous),
      auditEventsCount: 0,
    };
  }

  const { data: updated, error: updateError } = await admin
    .from("svc_provider_service_offerings")
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq("id", offeringId)
    .eq("provider_id", providerId)
    .eq("active", false)
    .select(OFFERING_SELECT)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    const { data: current, error: currentError } = await admin
      .from("svc_provider_service_offerings")
      .select(OFFERING_SELECT)
      .eq("id", offeringId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (currentError) throw currentError;
    return {
      workspace: await loadPublicationWorkspace(admin, providerId, current || previous),
      auditEventsCount: 0,
    };
  }

  const previousSnapshot = snapshotOffering(previous);
  const newSnapshot = snapshotOffering(updated);
  const diff = diffSnapshots(previousSnapshot, newSnapshot);

  const { error: auditError } = await admin
    .from("svc_provider_service_change_events")
    .insert({
      provider_id: providerId,
      offering_id: offeringId,
      actor_user_id: actorUserId,
      change_type: "reactivated",
      previous_snapshot: previousSnapshot,
      new_snapshot: newSnapshot,
      diff: Object.keys(diff).length ? diff : { active: { from: false, to: true } },
      source: "svc-save-provider-service",
      correlation_id: correlationId,
    });

  if (auditError) throw auditError;

  return {
    workspace: await loadPublicationWorkspace(admin, providerId, updated),
    auditEventsCount: 1,
  };
}

async function saveOfferingAddons(
  admin: any,
  providerId: string,
  actorUserId: string,
  offeringId: string,
  payload: JsonRecord,
  correlationId: string,
) {
  if (!assertUuid(offeringId)) throw new Error("offering_id_invalid");

  await assertOfferingOwnership(admin, providerId, [{ id: offeringId }]);

  const addons = normalizeOfferingAddons(payload);
  const { data: previousAddons, error: previousError } = await admin
    .from("svc_provider_offering_addons")
    .select(ADDON_SELECT)
    .eq("provider_id", providerId)
    .eq("offering_id", offeringId);

  if (previousError) throw previousError;

  const previousRows = (previousAddons || []) as JsonRecord[];
  const previousById = new Map(previousRows.map((row) => [String(row.id), row]));
  const submittedIds = new Set(addons.map((row) => String(row.id || "")).filter(Boolean));

  for (const id of submittedIds) {
    if (!previousById.has(id)) throw new Error("addon_forbidden");
  }

  const savedRows: JsonRecord[] = [];

  for (const addon of addons) {
    const input = {
      ...addon,
      provider_id: providerId,
      offering_id: offeringId,
    };

    if (addon.id) {
      const { data, error } = await admin
        .from("svc_provider_offering_addons")
        .update(input)
        .eq("id", addon.id)
        .eq("provider_id", providerId)
        .eq("offering_id", offeringId)
        .select(ADDON_SELECT)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("addon_forbidden");
      savedRows.push(data);
      continue;
    }

    const { data, error } = await admin
      .from("svc_provider_offering_addons")
      .insert(input)
      .select(ADDON_SELECT)
      .single();

    if (error) throw error;
    savedRows.push(data);
  }

  const savedIds = new Set(savedRows.map((row) => String(row.id)));
  const omittedActiveRows = previousRows.filter((row) =>
    row.is_active !== false &&
    !submittedIds.has(String(row.id)) &&
    !savedIds.has(String(row.id))
  );
  const deactivatedRows: JsonRecord[] = [];

  for (const row of omittedActiveRows) {
    const { data, error } = await admin
      .from("svc_provider_offering_addons")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("provider_id", providerId)
      .eq("offering_id", offeringId)
      .select(ADDON_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (data) deactivatedRows.push(data);
  }

  const auditRows = [...savedRows, ...deactivatedRows];
  const events = [];

  for (const current of auditRows) {
    const previous = previousById.get(String(current.id));
    const previousSnapshot = snapshotAddon(previous);
    const newSnapshot = snapshotAddon(current);
    const diff = diffSnapshots(previousSnapshot, newSnapshot);
    if (previous && !Object.keys(diff).length) continue;

    const deactivated = previous?.is_active !== false && current.is_active === false;
    events.push({
      provider_id: providerId,
      offering_id: offeringId,
      actor_user_id: actorUserId,
      change_type: previous ? (deactivated ? "addon_deactivated" : "addon_updated") : "addon_created",
      previous_snapshot: previous ? previousSnapshot : {},
      new_snapshot: newSnapshot,
      diff,
      source: "svc-save-provider-service",
      correlation_id: correlationId,
      metadata_json: {
        entity: "svc_provider_offering_addons",
        addon_id: current.id,
      },
    });
  }

  if (events.length) {
    const { error } = await admin
      .from("svc_provider_service_change_events")
      .insert(events);

    if (error) throw error;
  }

  return {
    workspace: await loadPublicationWorkspace(admin, providerId),
    auditEventsCount: events.length,
  };
}

async function buildProfileInput(admin: any, providerId: string, payload: JsonRecord) {
  const input: JsonRecord = {
    provider_id: providerId,
    pricing_mode: normalizePricingMode(payload.pricingMode),
    accepts_immediate: Boolean(payload.acceptsImmediate),
    accepts_scheduled: Boolean(payload.acceptsScheduled),
    max_hours_per_service: Number(payload.maxHoursPerService ?? 8),
    onboarding_completed: true,
  };

  const textFields: Record<string, string> = {
    firstName: "first_name",
    bio: "bio",
    publicHeadline: "public_headline",
    professionalSummary: "professional_summary",
    videoIntroUrl: "video_intro_url",
    addressText: "address_text",
    city: "city",
    province: "province",
  };

  for (const [payloadKey, dbKey] of Object.entries(textFields)) {
    if (Object.prototype.hasOwnProperty.call(payload, payloadKey)) {
      input[dbKey] = cleanText(payload[payloadKey], 1200);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "coverageRadiusMeters")) {
    const { data, error } = await admin
      .from("svc_provider_profiles")
      .select("metadata_json")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;

    const existingMetadata = isRecord(data?.metadata_json) ? data.metadata_json : {};
    const baseLocation = isRecord(payload.providerBaseLocation) ? payload.providerBaseLocation : {};
    const baseLat = optionalNumber(baseLocation.lat);
    const baseLng = optionalNumber(baseLocation.lng);
    const baseAccuracy = optionalNumber(baseLocation.accuracyM);

    const metadata: JsonRecord = {
      ...existingMetadata,
      coverage_radius_meters: optionalNumber(payload.coverageRadiusMeters),
    };

    if (baseLat !== null && baseLng !== null) {
      metadata.provider_base_location = {
        lat: baseLat,
        lng: baseLng,
        accuracy_m: baseAccuracy === null ? null : Math.round(baseAccuracy),
        source: cleanText(baseLocation.source || "browser_geolocation", 80) || "browser_geolocation",
        updated_at: new Date().toISOString(),
      };
      metadata.provider_base_location_lat = baseLat;
      metadata.provider_base_location_lng = baseLng;
      metadata.provider_base_location_accuracy_m = baseAccuracy === null ? null : Math.round(baseAccuracy);
      metadata.provider_base_location_source = cleanText(baseLocation.source || "browser_geolocation", 80) || "browser_geolocation";
    }

    input.metadata_json = metadata;
  }

  return input;
}

serve(async (req) => {
  const corsHeaders = corsHeadersForRequest(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("SUPABASE_ENV_MISSING");
    }

    const user = await requireUser(req, supabaseUrl, anonKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const rawBodyProviderId = body.providerId || body.provider_id || "";
    const rawHeaderProviderId = req.headers.get("x-mimi-provider-id") || "";
    const rawQueryProviderId = url.searchParams.get("provider_id") || url.searchParams.get("providerId") || "";
    const correlationId =
      cleanText(body.correlationId || body.correlation_id || req.headers.get("x-mimi-correlation-id"), 120) ||
      crypto.randomUUID?.() ||
      `svc-save-${Date.now()}`;
    let providerId = "";
    try {
      providerId = await resolveProviderIdForUser(
        admin,
        String(rawBodyProviderId || rawHeaderProviderId || rawQueryProviderId || "").trim(),
        user.id,
      );
    } catch (providerError) {
      if ((providerError as Error)?.message === "provider_id_required") {
        return json({
          ok: false,
          error: "provider_id_required",
          correlation_id: correlationId,
          debug: {
            has_body_provider_id: Boolean(rawBodyProviderId),
            body_provider_id_length: String(rawBodyProviderId || "").trim().length,
            has_header_provider_id: Boolean(rawHeaderProviderId),
            header_provider_id_length: String(rawHeaderProviderId || "").trim().length,
            has_query_provider_id: Boolean(rawQueryProviderId),
            query_provider_id_length: String(rawQueryProviderId || "").trim().length,
            provider_lookup_count: (providerError as Error & { providerCount?: number }).providerCount ?? null,
            function_build: FUNCTION_BUILD,
            auth_user_tail: String(user.id || "").slice(-8),
            body_keys: Object.keys(body || {}).filter((key) => !/token|password|secret|key/i.test(key)).slice(0, 12),
          },
        }, 400, corsHeaders);
      }

      throw providerError;
    }
    const payload = isRecord(body.payload) ? body.payload : {};
    const operation = cleanText(body.mode || body.operation || body.action, 80).toLowerCase();

    await assertProviderOwnership(admin, providerId, user.id);

    if (operation && !["save_workspace", "deactivate_offering", "deleted_soft", "deactivated", "reactivate_offering", "reactivated", "save_offering_addons"].includes(operation)) {
      return json({ ok: false, error: "invalid_operation", correlation_id: correlationId }, 400, corsHeaders);
    }

    if (["deactivate_offering", "deleted_soft", "deactivated"].includes(operation)) {
      const offeringId = cleanText(
        body.offeringId || body.offering_id || payload.offeringId || payload.offering_id,
        80,
      );
      const { workspace, auditEventsCount } = await deactivateOffering(
        admin,
        providerId,
        user.id,
        offeringId,
        correlationId,
      );

      return json({
        ok: true,
        function_build: FUNCTION_BUILD,
        operation: "deactivate_offering",
        provider_id: providerId,
        offering_id: offeringId,
        correlation_id: correlationId,
        audit_events_count: auditEventsCount,
        workspace,
      }, 200, corsHeaders);
    }

    if (["reactivate_offering", "reactivated"].includes(operation)) {
      const offeringId = cleanText(
        body.offeringId || body.offering_id || payload.offeringId || payload.offering_id,
        80,
      );
      const { workspace, auditEventsCount } = await reactivateOffering(
        admin,
        providerId,
        user.id,
        offeringId,
        correlationId,
      );

      return json({
        ok: true,
        function_build: FUNCTION_BUILD,
        operation: "reactivate_offering",
        provider_id: providerId,
        offering_id: offeringId,
        correlation_id: correlationId,
        audit_events_count: auditEventsCount,
        workspace,
      }, 200, corsHeaders);
    }

    if (operation === "save_offering_addons") {
      const offeringId = cleanText(
        body.offeringId || body.offering_id || payload.offeringId || payload.offering_id,
        80,
      );
      const { workspace, auditEventsCount } = await saveOfferingAddons(
        admin,
        providerId,
        user.id,
        offeringId,
        payload,
        correlationId,
      );

      return json({
        ok: true,
        function_build: FUNCTION_BUILD,
        operation: "save_offering_addons",
        provider_id: providerId,
        offering_id: offeringId,
        correlation_id: correlationId,
        audit_events_count: auditEventsCount,
        workspace,
      }, 200, corsHeaders);
    }

    const categories = normalizeCategories(payload);
    const pricing = normalizePricing(payload);
    const offerings = normalizeOfferings(payload);
    const availability = normalizeAvailability(payload);

    if (!categories.length && offerings.length) {
      const existing = new Set(categories.map((item) => item.category_id));
      for (const offering of offerings) {
        const categoryId = String(offering.category_id || "");
        if (!existing.has(categoryId)) {
          existing.add(categoryId);
          categories.push({ category_id: categoryId });
        }
      }
    }

    if (!offerings.length) {
      return json({ ok: false, error: "offering_required", correlation_id: correlationId }, 400, corsHeaders);
    }

    const categoryIds = [
      ...categories.map((item) => item.category_id),
      ...pricing.map((item) => item.category_id),
      ...offerings.map((item) => String(item.category_id || "")),
    ];

    await assertCategoriesExist(admin, categoryIds);
    await assertOfferingOwnership(admin, providerId, offerings);

    const { data: previousOfferings, error: previousOfferingsError } = await admin
      .from("svc_provider_service_offerings")
      .select(OFFERING_SELECT)
      .eq("provider_id", providerId);

    if (previousOfferingsError) throw previousOfferingsError;

    const profileInput = await buildProfileInput(admin, providerId, payload);
    const { error: profileError } = await admin
      .from("svc_provider_profiles")
      .upsert(profileInput, { onConflict: "provider_id" });

    if (profileError) throw profileError;

    const deactivateTargets = [
      admin.from("svc_provider_categories").update({ active: false }).eq("provider_id", providerId),
      admin.from("svc_provider_pricing").update({ active: false }).eq("provider_id", providerId),
      admin.from("svc_provider_service_offerings").update({ active: false }).eq("provider_id", providerId),
      admin.from("svc_provider_availability").update({ active: false }).eq("provider_id", providerId),
    ];

    const deactivateResults = await Promise.all(deactivateTargets);
    for (const result of deactivateResults) {
      if (result.error) throw result.error;
    }

    if (categories.length) {
      const { error } = await admin
        .from("svc_provider_categories")
        .upsert(
          categories.map((item) => ({
            provider_id: providerId,
            category_id: item.category_id,
            active: true,
          })),
          { onConflict: "provider_id,category_id" },
        );

      if (error) throw error;
    }

    if (pricing.length) {
      const { error } = await admin
        .from("svc_provider_pricing")
        .upsert(
          pricing.map((item) => ({
            ...item,
            provider_id: providerId,
          })),
          { onConflict: "provider_id,category_id" },
        );

      if (error) throw error;
    }

    const { data: upsertedOfferings, error: offeringError } = await admin
      .from("svc_provider_service_offerings")
      .upsert(
        offerings.map((item) => ({
          ...item,
          provider_id: providerId,
        })),
        { onConflict: "id" },
      )
      .select(OFFERING_SELECT);

    if (offeringError) throw offeringError;

    if (availability.length) {
      const { error } = await admin
        .from("svc_provider_availability")
        .upsert(
          availability.map((item) => ({
            ...item,
            provider_id: providerId,
          })),
          { onConflict: "provider_id,day_of_week,start_time,end_time" },
        );

      if (error) throw error;
    }

    const workspace = await loadCanonicalWorkspace(admin, providerId);
    const canonicalOfferings = Array.isArray(workspace.offerings) ? workspace.offerings as JsonRecord[] : [];
    const submittedRows = Array.isArray(upsertedOfferings) && upsertedOfferings.length
      ? upsertedOfferings as JsonRecord[]
      : offerings;

    if (!canonicalMatchesSubmitted(canonicalOfferings, submittedRows)) {
      return json({ ok: false, error: "canonical_offering_mismatch", correlation_id: correlationId }, 409, corsHeaders);
    }

    const canonicalPricing = Array.isArray(workspace.pricing) ? workspace.pricing as JsonRecord[] : [];
    if (!canonicalPricingMatchesSubmitted(canonicalPricing, pricing as JsonRecord[])) {
      return json({ ok: false, error: "canonical_pricing_mismatch", correlation_id: correlationId }, 409, corsHeaders);
    }

    const auditEventsCount = await insertChangeEvents(
      admin,
      providerId,
      user.id,
      correlationId,
      (previousOfferings || []) as JsonRecord[],
      canonicalOfferings,
    );

    return json({
      ok: true,
      function_build: FUNCTION_BUILD,
      provider_id: providerId,
      correlation_id: correlationId,
      audit_events_count: auditEventsCount,
      workspace,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("svc-save-provider-service error:", error);
    const message = errorMessage(error);
    const status = message === "AUTH_REQUIRED"
      ? 401
      : ["PROVIDER_FORBIDDEN", "PROVIDER_BLOCKED", "offering_forbidden"].includes(message)
        ? 403
        : 400;

    return json({
      ok: false,
      error: message,
      code: errorCode(error),
      correlation_id: correlationId,
      function_build: FUNCTION_BUILD,
    }, status, corsHeaders);
  }
});
