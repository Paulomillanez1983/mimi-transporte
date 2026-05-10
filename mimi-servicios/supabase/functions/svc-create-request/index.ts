import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createUserNotificationWithPush } from "../_shared/push-notifications.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMode(value: unknown) {
  const mode = String(value || "").toUpperCase();
  if (["HOURLY", "BASE_VISIT", "QUOTE", "FIXED", "UNIT", "SQUARE_METER", "LINEAR_METER"].includes(mode)) {
    return mode;
  }
  return "HOURLY";
}

function priceFromOffering(offering: Record<string, unknown>, pricing: Record<string, unknown>, requestedHours: number, unitQuantity: number) {
  const model = normalizeMode(offering.pricing_model || pricing.pricing_model);
  const currency = String(offering.currency || pricing.currency || "ARS");

  // Calcular el precio según el modelo, ignorando quote_required acá:
  // quote_required indica que el prestador prefiere confirmar antes,
  // pero si tiene precio cargado, lo usamos como referencia (el prestador
  // ajusta después si hace falta).
  let unitPrice = 0;
  let multiplier = 1;

  if (model === "FIXED") unitPrice = asNumber(offering.fixed_price);
  else if (model === "BASE_VISIT") unitPrice = asNumber(offering.base_visit_fee);
  else if (["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(model)) {
    unitPrice = asNumber(offering.unit_price);
    multiplier = Math.max(1, unitQuantity);
  } else if (model === "QUOTE") {
    // QUOTE puro = sin precio referencial, queda en 0 a presupuestar
    return { model, providerPrice: 0, platformFee: 0, totalPrice: 0, currency, priceLabel: "A coordinar" };
  } else {
    unitPrice = asNumber(offering.price_per_hour, asNumber(pricing.price_per_hour));
    multiplier = Math.max(1, requestedHours);
  }

  const providerPrice = Math.max(0, Math.round(unitPrice * multiplier * 100) / 100);

  // Si el prestador tiene quote_required=true PERO no hay precio cargado, mostrar "A coordinar"
  // Si hay precio cargado, lo usamos como referencia (quote_required pasa a ser info, no fuerza 0).
  if (providerPrice <= 0 && offering.quote_required === true) {
    return { model, providerPrice: 0, platformFee: 0, totalPrice: 0, currency, priceLabel: "A coordinar" };
  }

  return { model, providerPrice, platformFee: 0, totalPrice: providerPrice, currency, priceLabel: null };
}

function unitNameForModel(model: string, explicit: unknown) {
  const value = String(explicit || "").trim();
  if (value) return value;
  if (model === "SQUARE_METER") return "m2";
  if (model === "LINEAR_METER") return "metro lineal";
  if (model === "HOURLY") return "hora";
  if (model === "BASE_VISIT") return "visita";
  if (model === "FIXED") return "trabajo";
  return "unidad";
}

function pricingModelLabel(model: string) {
  const labels: Record<string, string> = {
    HOURLY: "Por hora",
    BASE_VISIT: "Por visita",
    QUOTE: "A coordinar",
    FIXED: "Precio cerrado",
    UNIT: "Por unidad",
    SQUARE_METER: "Por m2",
    LINEAR_METER: "Por metro lineal",
  };
  return labels[model] || "A coordinar";
}

function serviceModeLabel(value: unknown) {
  const mode = String(value || "").toUpperCase();
  if (mode === "ONLINE") return "Online";
  if (mode === "HYBRID") return "Online o presencial";
  if (mode === "IN_PERSON") return "Presencial";
  return "A coordinar";
}

function money(value: number, currency = "ARS") {
  if (!Number.isFinite(value) || value <= 0) return "A coordinar";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));

    const categoryId = String(body.category_id || "").trim();
    const providerId = String(body.selected_provider_id || "").trim();
    const serviceLat = asNumber(body.service_lat, Number.NaN);
    const serviceLng = asNumber(body.service_lng, Number.NaN);
    const requestType = String(body.request_type || "IMMEDIATE").toUpperCase() === "SCHEDULED" ? "SCHEDULED" : "IMMEDIATE";
    const requestedHours = Math.max(1, Math.min(8, Math.round(asNumber(body.requested_hours, 1))));
    const unitQuantity = Math.max(1, asNumber(body.unit_quantity, 1));
    // Deadline para que el prestador acepte/rechace.
    // SCHEDULED: 1 hora (3600s). El cliente está agendando con anticipación.
    // IMMEDIATE: 5 minutos (300s). 90s era muy poco — el prestador necesita
    // tiempo para abrir la app, ver la oferta y decidir. Si quedan dudas,
    // mejor dejar al provider responder vs caducar al instante.
    const deadlineSeconds = requestType === "SCHEDULED" ? 3600 : 300;
    const expiresAt = new Date(Date.now() + deadlineSeconds * 1000).toISOString();

    if (!assertUuid(categoryId)) return json({ ok: false, error: "category_id_invalid" }, 400);
    if (!assertUuid(providerId)) return json({ ok: false, error: "selected_provider_id_invalid" }, 400);
    if (!Number.isFinite(serviceLat) || !Number.isFinite(serviceLng)) {
      return json({ ok: false, error: "service_coordinates_required" }, 400);
    }

    const { data: provider, error: providerError } = await admin
      .from("svc_providers")
      .select("id,user_id,full_name,status,approved,blocked")
      .eq("id", providerId)
      .single();

    if (providerError) throw providerError;
    if (!provider?.approved || provider?.blocked) return json({ ok: false, error: "provider_not_available" }, 400);
    if (!["ONLINE_IDLE", "BOOKED_UPCOMING"].includes(String(provider.status || ""))) {
      return json({ ok: false, error: "provider_offline" }, 400);
    }

    const [{ data: offering }, { data: pricing }, { data: category }] = await Promise.all([
      admin
        .from("svc_provider_service_offerings")
        .select("id,title,description,pricing_model,currency,price_per_hour,base_visit_fee,fixed_price,unit_name,unit_price,quote_required,service_mode,duration_minutes,active")
        .eq("provider_id", providerId)
        .eq("category_id", categoryId)
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      admin
        .from("svc_provider_pricing")
        .select("provider_id,category_id,currency,price_per_hour,minimum_hours,maximum_hours,active")
        .eq("provider_id", providerId)
        .eq("category_id", categoryId)
        .eq("active", true)
        .limit(1)
        .maybeSingle(),
      admin
        .from("svc_categories")
        .select("id,name,code,description")
        .eq("id", categoryId)
        .maybeSingle(),
    ]);

    if (!offering && !pricing) return json({ ok: false, error: "provider_pricing_not_found" }, 400);

    // Auto-cleanup: cancelar requests vencidos del mismo cliente (deadline pasó pero
    // siguen como PENDING). Sin esto, el unique index ux_svc_active_request_per_client
    // bloquea cualquier solicitud nueva del cliente.
    await admin
      .from("svc_requests")
      .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
      .eq("client_user_id", user.id)
      .in("status", ["SEARCHING", "PENDING_PROVIDER_RESPONSE"])
      .lt("provider_response_deadline_at", new Date().toISOString());

    // Si el cliente todavía tiene un request realmente activo (no vencido) en estados
    // de "in-flight", no se puede crear otro. Devolvemos un mensaje claro en vez del
    // 23505 críptico de Postgres.
    const { data: blockingActive } = await admin
      .from("svc_requests")
      .select("id, status, provider_response_deadline_at")
      .eq("client_user_id", user.id)
      .in("status", ["SEARCHING", "PENDING_PROVIDER_RESPONSE", "ACCEPTED", "SCHEDULED",
                     "PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"])
      .limit(1)
      .maybeSingle();

    if (blockingActive) {
      return json({
        ok: false,
        error: "active_request_exists",
        active_request_id: blockingActive.id,
        active_request_status: blockingActive.status,
      }, 409);
    }

    const pricingResult = priceFromOffering(offering || {}, pricing || {}, requestedHours, unitQuantity);
    const appliesUnitQuantity = ["UNIT", "SQUARE_METER", "LINEAR_METER"].includes(pricingResult.model);
    const unitName = unitNameForModel(pricingResult.model, body.unit_name || offering?.unit_name);
    const serviceMode = body.service_mode || offering?.service_mode || null;
    const unitPrice = appliesUnitQuantity
      ? asNumber(offering?.unit_price, pricingResult.providerPrice > 0 ? pricingResult.providerPrice / unitQuantity : 0)
      : pricingResult.model === "HOURLY"
        ? asNumber(offering?.price_per_hour, asNumber(pricing?.price_per_hour))
        : pricingResult.model === "BASE_VISIT"
          ? asNumber(offering?.base_visit_fee)
          : pricingResult.model === "FIXED"
            ? asNumber(offering?.fixed_price)
            : 0;
    const serviceDetails = {
      schema_version: 1,
      source: "svc-create-request",
      category_id: categoryId,
      category_name: category?.name || null,
      provider_id: providerId,
      offering_id: offering?.id || body.offering_id || null,
      offering_title: offering?.title || null,
      request_type: requestType,
      address_text: body.address_text || null,
      service_lat: serviceLat,
      service_lng: serviceLng,
      scheduled_for: body.scheduled_for || null,
      requested_hours: pricingResult.model === "HOURLY" ? requestedHours : null,
      pricing_model: pricingResult.model,
      pricing_model_label: pricingModelLabel(pricingResult.model),
      service_mode: serviceMode,
      service_mode_label: serviceModeLabel(serviceMode),
      unit_quantity: appliesUnitQuantity ? unitQuantity : null,
      unit_name: appliesUnitQuantity ? unitName : null,
      unit_price: unitPrice || null,
      price_label: pricingResult.priceLabel,
      provider_price: pricingResult.providerPrice,
      platform_fee: pricingResult.platformFee,
      total_price: pricingResult.totalPrice,
      total_price_label: money(pricingResult.totalPrice, pricingResult.currency),
      currency: pricingResult.currency,
      client_notes: body.notes ? String(body.notes) : null,
    };
    const notes = [
      body.notes ? String(body.notes) : "",
      pricingResult.model !== "HOURLY"
        ? `Cotizacion de referencia: ${pricingResult.model}; cantidad=${unitQuantity}; unidad=${unitName}`.trim()
        : "",
    ].filter(Boolean).join("\n");

    const { data: requestRow, error: requestError } = await admin
      .from("svc_requests")
      .insert({
        client_user_id: user.id,
        category_id: categoryId,
        selected_provider_id: providerId,
        request_type: requestType,
        status: "PENDING_PROVIDER_RESPONSE",
        address_text: body.address_text || null,
        service_lat: serviceLat,
        service_lng: serviceLng,
        scheduled_for: body.scheduled_for || null,
        requested_hours: requestedHours,
        notes: notes || null,
        provider_price_snapshot: pricingResult.providerPrice,
        platform_fee_snapshot: pricingResult.platformFee,
        total_price_snapshot: pricingResult.totalPrice,
        currency: pricingResult.currency,
        provider_response_deadline_at: expiresAt,
        created_via: "CLIENT_APP",
        metadata_json: {
          service_details: serviceDetails,
          provider_confirmation: {
            requires_response: true,
            deadline_at: expiresAt,
          },
        },
      })
      .select("*")
      .single();

    if (requestError) throw requestError;

    const { data: offerRow, error: offerError } = await admin
      .from("svc_request_offers")
      .insert({
        request_id: requestRow.id,
        provider_id: providerId,
        status: "PENDING",
        sent_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (offerError) throw offerError;

    const { data: conversation } = await admin
      .from("svc_conversations")
      .upsert({
        request_id: requestRow.id,
        client_user_id: user.id,
        provider_user_id: provider.user_id,
        status: "OPEN",
        app_context: "services",
        subject: "Solicitud de servicio",
      }, { onConflict: "request_id" })
      .select("id")
      .single();

    await admin.from("svc_payment_intents").insert({
      request_id: requestRow.id,
      client_user_id: user.id,
      provider_id: providerId,
      amount_total: pricingResult.totalPrice,
      amount_provider: pricingResult.providerPrice,
      amount_platform_fee: pricingResult.platformFee,
      currency: pricingResult.currency,
      status: "CREATED",
      metadata_json: {
        source: "svc-create-request",
        pricing_model: pricingResult.model,
        unit_quantity: appliesUnitQuantity ? unitQuantity : null,
        unit_name: appliesUnitQuantity ? unitName : null,
        offering_id: offering?.id || null,
        service_details: serviceDetails,
      },
    });

    const quantityText = appliesUnitQuantity
      ? `${unitQuantity} ${unitName}`
      : pricingResult.model === "HOURLY"
        ? `${requestedHours} hs`
        : null;
    const notificationBody = [
      category?.name || offering?.title || "Servicio",
      quantityText,
      serviceDetails.service_mode_label || "Ruta al abrir la app",
      pricingResult.totalPrice > 0 ? `total ${money(pricingResult.totalPrice, pricingResult.currency)}` : "precio a coordinar",
    ].filter(Boolean).join(" · ");

    await createUserNotificationWithPush(admin, {
      userId: provider.user_id,
      type: "SERVICE_REQUEST_CREATED",
      title: "Nueva solicitud de servicio",
      body: notificationBody,
      fallbackTag: `svc-request-${requestRow.id}-CREATED`,
      data: {
        request_id: requestRow.id,
        provider_id: providerId,
        category_id: categoryId,
        offer_id: offerRow.id,
        service_details: serviceDetails,
        url: "/mimi-servicios/prestador",
        pricing_model: pricingResult.model,
        unit_quantity: appliesUnitQuantity ? unitQuantity : "",
        unit_name: appliesUnitQuantity ? unitName : "",
        total_price: pricingResult.totalPrice,
        currency: pricingResult.currency,
      },
    });

    return json({
      ok: true,
      request: { ...requestRow, conversation_id: conversation?.id || null },
      offer: offerRow,
      provider_user_id: provider.user_id,
      provider_response_deadline_at: expiresAt,
      pricing: {
        provider_price: pricingResult.providerPrice,
        platform_fee: pricingResult.platformFee,
        total_price: pricingResult.totalPrice,
        currency: pricingResult.currency,
        pricing_model: pricingResult.model,
        unit_quantity: unitQuantity,
        unit_name: appliesUnitQuantity ? unitName : null,
        offering_id: offering?.id || null,
        price_label: pricingResult.priceLabel,
        service_details: serviceDetails,
      },
    });
  } catch (error) {
    console.error("svc-create-request error:", error);
    return json(
      { ok: false, error: error instanceof Error ? error.message : "unexpected_error" },
      error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 400,
    );
  }
});
