import { appConfig } from "../config.js";
import { getSupabaseClient } from "./supabase.js";

function hasBackend() {
  return Boolean(getSupabaseClient());
}

async function requireSession() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const session = data?.session ?? null;

  if (!session?.access_token) {
    const authError = new Error("AUTH_REQUIRED");
    authError.code = "AUTH_REQUIRED";
    throw authError;
  }

  return session;
}

async function invokeFunction(functionName, body = {}) {
  const supabase = getSupabaseClient();

  if (!supabase || !functionName) {
    return null;
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body
  });

  if (error) throw error;

  return data;
}

async function fetchTable(tableName, buildQuery) {
  const supabase = getSupabaseClient();

  if (!supabase) return [];

  const query = buildQuery(supabase.from(tableName));

  const { data, error } = await query;

  if (error) throw error;

  return data ?? [];
}

function normalizeProviderDocuments(rows = []) {
  const supabase = getSupabaseClient();

  return (rows ?? []).map((item) => {
    const bucket = item.storage_bucket ?? "service-provider-documents";
    const path = item.storage_path ?? null;
    const publicUrl =
      supabase && bucket && path
        ? supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null
        : null;

    return {
      ...item,
      file_url: item.file_url ?? publicUrl
    };
  });
}

export async function bootstrapSession() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      isAuthenticated: false,
      userId: null,
      providerId: appConfig.demoProviderUserId ?? null,
      role: null,
      userEmail: null,
      userName: null
    };
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const session = data?.session ?? null;
  const user = session?.user ?? null;

  if (!user) {
    return {
      isAuthenticated: false,
      userId: null,
      providerId: null,
      role: null,
      userEmail: null,
      userName: null
    };
  }

  let providerId = null;
  let role = "client";

  const { data: providerRows } = await supabase
    .from("svc_providers")
    .select("id,user_id,status,approved,blocked")
    .eq("user_id", user.id)
    .limit(1);

  if (providerRows?.[0]?.id) {
    providerId = providerRows[0].id;
    role = "provider";
  }

  return {
    isAuthenticated: true,
    userId: user.id,
    providerId,
    role,
    userEmail: user.email ?? null,
    userName:
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email ??
      null
  };
}

export async function loadCategories() {
  if (!hasBackend()) {
    return appConfig.categories ?? [];
  }

  return fetchTable("svc_categories", (query) =>
    query
      .select("id,code,name,description,active")
      .eq("active", true)
      .order("name", { ascending: true })
  );
}

export async function registerDevice(payload = {}) {
  if (!hasBackend()) {
    return { ok: true };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.registerDevice, payload);
}

export async function searchProviders(categoryId, draft = {}) {
  if (!hasBackend()) {
    return [];
  }

  await requireSession();

  const payload = {
    category_id: categoryId,
    address: draft.address ?? "",
    service_lat: draft.lat ?? null,
    service_lng: draft.lng ?? null,
    request_type: draft.requestType ?? "IMMEDIATE",
    scheduled_for: draft.scheduledFor || null,
    requested_hours: Number(draft.requestedHours ?? 2)
  };

  const data = await invokeFunction(appConfig.functions.searchProviders, payload);

  return data?.providers ?? data?.data ?? data ?? [];
}

export async function prepareRequestPricing({
  clientUserId,
  categoryId,
  providerId,
  draft = {}
}) {
  if (!hasBackend()) {
    return {
      eligible: true,
      provider_price: 0,
      platform_fee: 0,
      total_price: 0,
      currency: "ARS"
    };
  }

  await requireSession();

  const data = await invokeFunction(appConfig.functions.prepareRequestPricing, {
    client_user_id: clientUserId,
    category_id: categoryId,
    provider_id: providerId,
    address: draft.address ?? "",
    service_lat: draft.lat ?? null,
    service_lng: draft.lng ?? null,
    request_type: draft.requestType ?? "IMMEDIATE",
    scheduled_for: draft.scheduledFor || null,
    requested_hours: Number(draft.requestedHours ?? 2)
  });

  return data?.pricing ?? data;
}

export async function createRequest(payload = {}) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      status: "PENDING",
      ...payload
    };
  }

  await requireSession();

  const data = await invokeFunction(appConfig.functions.createRequest, {
    category_id: payload.categoryId,
    selected_provider_id: payload.selectedProviderId,
    address: payload.address,
    service_lat: payload.serviceLat,
    service_lng: payload.serviceLng,
    request_type: payload.requestType,
    scheduled_for: payload.scheduledFor,
    requested_hours: payload.requestedHours,
    provider_price: payload.providerPrice,
    platform_fee: payload.platformFee,
    total_price: payload.totalPrice,
    currency: payload.currency ?? "ARS"
  });

  return data?.request ?? data;
}

export async function loadActiveRequest({ userId = null, providerId = null } = {}) {
  if (!hasBackend()) return null;

  await requireSession();

  let query = getSupabaseClient()
    .from("svc_requests")
    .select("*")
    .not("status", "in", '("COMPLETED","CANCELLED","EXPIRED")')
    .order("created_at", { ascending: false })
    .limit(1);

  if (providerId) {
    query = query.or(
      `selected_provider_id.eq.${providerId},accepted_provider_id.eq.${providerId}`
    );
  } else if (userId) {
    query = query.eq("client_user_id", userId);
  } else {
    return null;
  }

  const { data, error } = await query;

  if (error) throw error;

  return data?.[0] ?? null;
}

export async function loadConversationForRequest(requestId) {
  if (!hasBackend() || !requestId) return null;

  await requireSession();

  const rows = await fetchTable("svc_conversations", (query) =>
    query
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(1)
  );

  return rows?.[0] ?? null;
}

export async function loadMessages(conversationId) {
  if (!hasBackend() || !conversationId) return [];

  await requireSession();

  return fetchTable("svc_messages", (query) =>
    query
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100)
  );
}

export async function sendMessage({ conversationId, body }) {
  if (!hasBackend()) {
    return {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      body,
      created_at: new Date().toISOString()
    };
  }

  await requireSession();

  const data = await invokeFunction(appConfig.functions.sendMessage, {
    conversation_id: conversationId,
    body
  });

  return data?.message ?? data;
}

export async function loadNotifications(userId) {
  if (!hasBackend() || !userId) return [];

  await requireSession();

  return fetchTable("svc_notifications", (query) =>
    query
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
  );
}

export async function loadOffers(providerId) {
  if (!hasBackend() || !providerId) return [];

  await requireSession();

  return fetchTable("svc_request_offers", (query) =>
    query
      .select("*")
      .eq("provider_id", providerId)
      .in("status", ["PENDING", "SENT"])
      .order("created_at", { ascending: false })
      .limit(20)
  );
}

export async function updateRequestStatus(functionName, payload = {}) {
  if (!hasBackend()) {
    return { ok: true };
  }

  await requireSession();

  return invokeFunction(functionName, payload);
}

export async function trackLocation(payload = {}) {
  if (!hasBackend()) {
    return { ok: true };
  }

  await requireSession();

  return invokeFunction(appConfig.functions.trackLocation, {
    request_id: payload.requestId,
    lat: payload.lat,
    lng: payload.lng,
    accuracy: payload.accuracy ?? null,
    heading: payload.heading ?? null,
    speed: payload.speed ?? null
  });
}

export async function updateProviderStatus(providerId, status) {
  const supabase = getSupabaseClient();

  if (!supabase || !providerId) return null;

  await requireSession();

  let location = null;

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      status !== "OFFLINE"
    ) {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        });
      });

      location = {
        last_lat: position.coords.latitude,
        last_lng: position.coords.longitude,
        last_location: `POINT(${position.coords.longitude} ${position.coords.latitude})`
      };
    }
  } catch {
    location = null;
  }

  const { data, error } = await supabase
    .from("svc_providers")
    .update({
      status,
      last_seen_at: new Date().toISOString(),
      ...(location ?? {})
    })
    .eq("id", providerId)
    .select(
      "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at"
    )
    .single();

  if (error) throw error;

  return data;
}

export async function loadProviderWorkspace(providerId) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return {
      profile: null,
      profileDetail: null,
      pricing: [],
      availability: [],
      documents: [],
      reviews: [],
      categories: [],
      completedCount: 0
    };
  }

  await requireSession();

  const [
    profileRows,
    profileDetailRows,
    pricingRows,
    availabilityRows,
    documentRows,
    reviewRows,
    categoryRows,
    completedRows
  ] = await Promise.all([
    fetchTable("svc_providers", (query) =>
      query
        .select(
          "id,user_id,full_name,email,phone,avatar_url,status,approved,blocked,rating_avg,rating_count,last_lat,last_lng,last_location,last_seen_at"
        )
        .eq("id", providerId)
        .limit(1)
    ),

    fetchTable("svc_provider_profiles", (query) =>
      query
        .select("*")
        .eq("provider_id", providerId)
        .limit(1)
    ),

    fetchTable("svc_provider_pricing", (query) =>
      query
        .select(
          "id,provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active"
        )
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(50)
    ),

    fetchTable("svc_provider_availability", (query) =>
      query
        .select("id,provider_id,day_of_week,start_time,end_time,active")
        .eq("provider_id", providerId)
        .eq("active", true)
        .order("day_of_week", { ascending: true })
    ),

    fetchTable("svc_provider_documents", (query) =>
      query
        .select("id,provider_id,document_type,storage_bucket,storage_path,mime_type,file_size_bytes,review_status,review_notes,reviewed_at,created_at,updated_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(10)
    ),

    fetchTable("svc_reviews", (query) =>
      query
        .select("id,provider_id,client_user_id,rating,comment,created_at")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(4)
    ),

    fetchTable("svc_provider_categories", (query) =>
      query
        .select("id,provider_id,category_id,active,svc_categories(name,code,description)")
        .eq("provider_id", providerId)
        .eq("active", true)
        .limit(20)
    ),

    fetchTable("svc_requests", (query) =>
      query
        .select("id")
        .eq("selected_provider_id", providerId)
        .eq("status", "COMPLETED")
        .limit(500)
    )
  ]);

  return {
    profile: profileRows?.[0] ?? null,
    profileDetail: profileDetailRows?.[0] ?? null,
    pricing: pricingRows ?? [],
    availability: availabilityRows ?? [],
    documents: normalizeProviderDocuments(documentRows),
    reviews: reviewRows ?? [],
    categories: categoryRows ?? [],
    completedCount: completedRows?.length ?? 0
  };
}

export async function saveProviderWorkspace(providerId, payload = {}) {
  const supabase = getSupabaseClient();

  if (!providerId || !supabase) {
    return { ok: true };
  }

  await requireSession();

  const profileInput = {
    provider_id: providerId,
    pricing_mode: payload.pricingMode ?? "POR_HORA",
    accepts_immediate: Boolean(payload.acceptsImmediate),
    accepts_scheduled: Boolean(payload.acceptsScheduled),
    max_hours_per_service: Number(payload.maxHoursPerService ?? 8),
    onboarding_completed: true
  };

  if (typeof payload.bio === "string") {
    profileInput.bio = payload.bio.trim();
  }

  if (typeof payload.addressText === "string") {
    profileInput.address_text = payload.addressText.trim();
  }

  if (typeof payload.city === "string") {
    profileInput.city = payload.city.trim();
  }

  if (typeof payload.province === "string") {
    profileInput.province = payload.province.trim();
  }

  const { error: profileError } = await supabase
    .from("svc_provider_profiles")
    .upsert(profileInput, {
      onConflict: "provider_id"
    });

  if (profileError) throw profileError;

  const categories = Array.isArray(payload.categories)
    ? payload.categories.filter((item) => item?.categoryId)
    : [];

  const pricing = Array.isArray(payload.pricing)
    ? payload.pricing.filter((item) => item?.categoryId)
    : [];

  const availability = Array.isArray(payload.availability)
    ? payload.availability
    : [];

  await supabase
    .from("svc_provider_categories")
    .update({ active: false })
    .eq("provider_id", providerId);

  await supabase
    .from("svc_provider_pricing")
    .update({ active: false })
    .eq("provider_id", providerId);

  await supabase
    .from("svc_provider_availability")
    .update({ active: false })
    .eq("provider_id", providerId);

  if (categories.length) {
    const { error: categoriesError } = await supabase
      .from("svc_provider_categories")
      .upsert(
        categories.map((item) => ({
          provider_id: providerId,
          category_id: item.categoryId,
          active: true
        })),
        { onConflict: "provider_id,category_id" }
      );

    if (categoriesError) throw categoriesError;
  }

  if (pricing.length) {
    const { error: pricingError } = await supabase
      .from("svc_provider_pricing")
      .upsert(
        pricing.map((item) => ({
          provider_id: providerId,
          category_id: item.categoryId,
          currency: item.currency ?? "ARS",
          price_per_hour: Number(item.pricePerHour ?? 0),
          minimum_hours: Number(item.minimumHours ?? 1),
          maximum_hours: Number(
            item.maximumHours ?? payload.maxHoursPerService ?? 8
          ),
          active: true
        })),
        { onConflict: "provider_id,category_id" }
      );

    if (pricingError) throw pricingError;
  }

  if (availability.length) {
    const { error: availabilityError } = await supabase
      .from("svc_provider_availability")
      .upsert(
        availability
          .filter((item) => item?.active && item?.startTime && item?.endTime)
          .map((item) => ({
            provider_id: providerId,
            day_of_week: Number(item.dayOfWeek),
            start_time: item.startTime,
            end_time: item.endTime,
            active: true
          })),
        { onConflict: "provider_id,day_of_week,start_time,end_time" }
      );

    if (availabilityError) throw availabilityError;
  }

  return loadProviderWorkspace(providerId);
}

export async function loadClientRequestInsights(requestId, providerId = null) {
  if (!hasBackend() || !requestId) {
    return {
      paymentIntent: null,
      escrowHold: null,
      candidates: [],
      offers: [],
      providerProfile: null,
      providerPricing: [],
      providerReviews: [],
      providerCategories: []
    };
  }

  await requireSession();

  const [
    paymentIntentRows,
    escrowHoldRows,
    candidateRows,
    offerRows,
    providerProfileRows,
    providerPricingRows,
    providerReviewRows,
    providerCategoryRows
  ] = await Promise.all([
    fetchTable("svc_payment_intents", (query) =>
      query.select("*").eq("request_id", requestId).limit(1)
    ),

    fetchTable("svc_escrow_holds", (query) =>
      query.select("*").eq("request_id", requestId).limit(1)
    ),

    fetchTable("svc_request_candidates", (query) =>
      query
        .select("*")
        .eq("request_id", requestId)
        .order("rank_score", { ascending: false })
        .limit(10)
    ),

    fetchTable("svc_request_offers", (query) =>
      query
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(10)
    ),

    providerId
      ? fetchTable("svc_provider_profiles", (query) =>
          query.select("*").eq("provider_id", providerId).limit(1)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_provider_pricing", (query) =>
          query
            .select("*")
            .eq("provider_id", providerId)
            .eq("active", true)
            .limit(20)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_reviews", (query) =>
          query
            .select("*")
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false })
            .limit(5)
        )
      : Promise.resolve([]),

    providerId
      ? fetchTable("svc_provider_categories", (query) =>
          query
            .select("id,provider_id,category_id,active,svc_categories(name,code,description)")
            .eq("provider_id", providerId)
            .eq("active", true)
            .limit(10)
        )
      : Promise.resolve([])
  ]);

  return {
    paymentIntent: paymentIntentRows?.[0] ?? null,
    escrowHold: escrowHoldRows?.[0] ?? null,
    candidates: candidateRows ?? [],
    offers: offerRows ?? [],
    providerProfile: providerProfileRows?.[0] ?? null,
    providerPricing: providerPricingRows ?? [],
    providerReviews: providerReviewRows ?? [],
    providerCategories: providerCategoryRows ?? []
  };
}
