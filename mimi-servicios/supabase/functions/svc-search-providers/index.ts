import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { calculateServicePricingFromProviderAmount } from "../_shared/services/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProviderRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string | null;
  approved: boolean | null;
  blocked: boolean | null;
  rating_avg: number | null;
  rating_count: number | null;
  last_lat: number | null;
  last_lng: number | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function assertUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(latA: unknown, lngA: unknown, latB: unknown, lngB: unknown) {
  const aLat = asNumber(latA);
  const aLng = asNumber(lngA);
  const bLat = asNumber(latB);
  const bLng = asNumber(lngB);

  if (aLat === null || aLng === null || bLat === null || bLng === null) return null;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLng * sinLng;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstByProviderId(rows: Array<Record<string, unknown>> = []) {
  const map = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const providerId = String(row?.provider_id || "");
    if (providerId && !map.has(providerId)) map.set(providerId, row);
  }

  return map;
}

function firstNameFromText(value: unknown) {
  const text = String(value ?? "")
    .replace(/@.*/, "")
    .replace(/[^a-zA-ZÀ-ÿ\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const first = text.split(" ").find(Boolean);
  if (!first || first.length < 2) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function providerPublicName(
  provider: Record<string, unknown>,
  identity?: Record<string, unknown>,
  profile?: Record<string, unknown>,
) {
  return (
    firstNameFromText(profile?.first_name) ||
    firstNameFromText(identity?.full_name_detected) ||
    firstNameFromText(provider.full_name) ||
    firstNameFromText(provider.name) ||
    "Prestador"
  );
}

function parseStorageAvatar(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return { url: raw };
  const match = raw.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

async function publicAvatarUrl(admin: ReturnType<typeof createClient>, avatarValue: unknown) {
  const parsed = parseStorageAvatar(avatarValue);
  if (!parsed) return null;
  if ("url" in parsed) return parsed.url;

  const { data, error } = await admin.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, 60 * 60);

  if (error) {
    console.warn("svc-search-providers avatar signing failed", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

function referencePrice(pricing?: Record<string, unknown>, offering?: Record<string, unknown>) {
  const model = String(offering?.pricing_model || "").toUpperCase();
  const candidates = [
    model === "FIXED" ? offering?.fixed_price : null,
    model === "BASE_VISIT" ? offering?.base_visit_fee : null,
    ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(model) ? offering?.unit_price : null,
    offering?.price_per_hour,
    pricing?.price_per_hour,
    offering?.fixed_price,
    offering?.base_visit_fee,
    offering?.unit_price,
  ];

  return Number(candidates.find((value) => Number(value) > 0) ?? 0);
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

serve(async (req) => {
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

    await requireUser(req, supabaseUrl, anonKey);

    const body = await req.json().catch(() => ({}));
    const categoryId = String(body?.category_id || "").trim();
    const serviceLat = asNumber(body?.service_lat);
    const serviceLng = asNumber(body?.service_lng);
    const requestType = String(body?.request_type || "IMMEDIATE").toUpperCase();
    const requestedHours = Math.max(0.25, Math.min(Number(body?.requested_hours || 1), 24));
    const limit = Math.max(1, Math.min(Number(body?.max_results || 20), 50));

    if (!assertUuid(categoryId)) {
      return json({ ok: false, error: "category_id_invalid", providers: [] }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    let providersFromRpc: Array<Record<string, unknown>> = [];

    if (serviceLat !== null && serviceLng !== null) {
      const { data, error } = await admin.rpc("svc_search_providers_ranked", {
        p_category_id: categoryId,
        p_service_lat: serviceLat,
        p_service_lng: serviceLng,
        p_request_type: requestType,
        p_scheduled_for: body?.scheduled_for || null,
        p_requested_hours: requestedHours,
        p_limit: limit,
      });

      if (!error && Array.isArray(data) && data.length) {
        providersFromRpc = data;
      }
    }

    if (providersFromRpc.length) {
      const rpcProviderIds = [...new Set(providersFromRpc.map((row) => String(row.provider_id || row.id || "")).filter(Boolean))];
      // svc_provider_identity_checks no tiene reviewed_at en este schema; usamos created_at
      const { data: identities, error: identityError } = rpcProviderIds.length
        ? await admin
            .from("svc_provider_identity_checks")
            .select("provider_id,full_name_detected,status,created_at")
            .in("provider_id", rpcProviderIds)
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(150)
        : { data: [], error: null };

      if (identityError) throw identityError;

      const identityByProvider = firstByProviderId(identities || []);
      const publicProviders = await Promise.all(providersFromRpc.map(async (provider) => {
        const providerId = String(provider.provider_id || provider.id || "");
        const identity = identityByProvider.get(providerId) || {};
        const publicName = providerPublicName(provider, identity);
        const avatarUrl = await publicAvatarUrl(admin, provider.avatar_url);
        return {
          ...provider,
          full_name: publicName,
          name: publicName,
          public_name: publicName,
          verified_first_name: firstNameFromText(identity.full_name_detected),
          avatar_url: avatarUrl,
        };
      }));

      return json({ ok: true, providers: publicProviders, count: publicProviders.length, source: "rpc" });
    }

    const { data: categoryLinks, error: categoryError } = await admin
      .from("svc_provider_categories")
      .select("provider_id,category_id,active,svc_categories(name,code,description)")
      .eq("category_id", categoryId)
      .eq("active", true)
      .limit(100);

    if (categoryError) throw categoryError;

    const providerIds = [...new Set((categoryLinks || []).map((row) => row.provider_id).filter(Boolean))];

    if (!providerIds.length) {
      return json({ ok: true, providers: [], count: 0, source: "tables" });
    }

    const [providersResult, profilesResult, pricingResult, offeringsResult, identityResult] = await Promise.all([
      admin
        .from("svc_providers")
        .select("id,full_name,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_seen_at")
        .in("id", providerIds)
        .eq("approved", true)
        .eq("blocked", false)
        .in("status", ["ONLINE_IDLE", "BOOKED_UPCOMING"])
        .limit(100),
      admin
        .from("svc_provider_profiles")
        .select("provider_id,first_name,avatar_public_url,bio,public_headline,professional_summary,city,province,pricing_mode,accepts_immediate,accepts_scheduled,max_hours_per_service,address_text")
        .in("provider_id", providerIds)
        .limit(100),
      admin
        .from("svc_provider_pricing")
        .select("provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active")
        .in("provider_id", providerIds)
        .eq("category_id", categoryId)
        .eq("active", true)
        .limit(100),
      admin
        .from("svc_provider_service_offerings")
        .select("id,provider_id,category_id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,minimum_charge,minimum_hours,maximum_hours,quote_required,service_mode,duration_minutes,location_policy,public_summary,active")
        .in("provider_id", providerIds)
        .eq("category_id", categoryId)
        .eq("active", true)
        .limit(100),
      admin
        .from("svc_provider_identity_checks")
        .select("provider_id,full_name_detected,status,created_at")
        .in("provider_id", providerIds)
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(150),
    ]);

    for (const result of [providersResult, profilesResult, pricingResult, offeringsResult, identityResult]) {
      if (result.error) throw result.error;
    }

    const profiles = firstByProviderId(profilesResult.data || []);
    const pricing = firstByProviderId(pricingResult.data || []);
    const offerings = firstByProviderId(offeringsResult.data || []);
    const categoryByProvider = firstByProviderId(categoryLinks || []);
    const identity = firstByProviderId(identityResult.data || []);

    const providers = (await Promise.all(((providersResult.data || []) as ProviderRow[])
      .map(async (provider, index) => {
        const profile = profiles.get(provider.id) || {};
        const priceRow = pricing.get(provider.id) || {};
        const offering = offerings.get(provider.id) || {};
        const category = (categoryByProvider.get(provider.id)?.svc_categories || {}) as Record<string, unknown>;
        const identityRow = identity.get(provider.id) || {};
        const publicName = providerPublicName(provider as unknown as Record<string, unknown>, identityRow, profile);
        const km = distanceKm(serviceLat, serviceLng, provider.last_lat, provider.last_lng);
        const price = referencePrice(priceRow, offering);
        const currency = String(offering.currency || priceRow.currency || "ARS");
        const pricingBreakdown = calculateServicePricingFromProviderAmount(price, currency);
        // Priorizar avatar pública subida por el prestador (provider-avatars bucket)
        // sobre el avatar de Google OAuth.
        const avatarUrl =
          (profile as { avatar_public_url?: string })?.avatar_public_url ||
          (await publicAvatarUrl(admin, provider.avatar_url));

        return {
          provider_id: provider.id,
          full_name: publicName,
          name: publicName,
          public_name: publicName,
          verified_first_name: firstNameFromText(identityRow.full_name_detected),
          avatar_url: avatarUrl,
          status: provider.status,
          category_id: categoryId,
          category_name: category.name || "Servicio",
          specialty: offering.title || category.name || profile.public_headline || "Prestador MIMI",
          provider_price: pricingBreakdown.providerPrice,
          platform_fee_percent: pricingBreakdown.platformFeePercent,
          platform_fee: pricingBreakdown.platformFee,
          total_price: pricingBreakdown.totalPrice,
          currency,
          distance_km: km ?? 1 + index * 0.8,
          estimated_eta_min: km ? Math.max(5, Math.round(km * 4)) : 10 + index * 3,
          score: Math.max(70, 96 - index * 3),
          rating: provider.rating_avg ?? 5,
          rating_count: provider.rating_count ?? 0,
          accepts_immediate: profile.accepts_immediate !== false && provider.status === "ONLINE_IDLE",
          accepts_scheduled: profile.accepts_scheduled !== false,
          bio: profile.bio || profile.professional_summary || offering.description || null,
          city: profile.city || null,
          province: profile.province || null,
          pricing_mode: profile.pricing_mode || offering.pricing_model || null,
          offering_id: offering.id || null,
          service_mode: offering.service_mode || null,
          pricing_model: offering.pricing_model || null,
          unit_name: offering.unit_name || null,
          session_duration_minutes: offering.duration_minutes || null,
          // "A coordinar" SOLO si quote_required Y no hay precio cargado
          price_label:
            offering.quote_required &&
            !offering.unit_price &&
            !offering.price_per_hour &&
            !offering.fixed_price &&
            !offering.base_visit_fee
              ? "A coordinar"
              : null,
          source: "tables",
        };
      })))
      .filter((provider) => provider.accepts_immediate !== false)
      .sort((a, b) => Number(a.distance_km || 999) - Number(b.distance_km || 999))
      .slice(0, limit);

    return json({ ok: true, providers, count: providers.length, source: "tables" });
  } catch (error) {
    console.error("svc-search-providers error:", error);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unexpected_error",
        providers: [],
      },
      error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400,
    );
  }
});
