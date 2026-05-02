import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { calculateCommission } from "../_shared/payments/commission-engine.ts";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";

function normalizeContextType(value: unknown) {
  const type = String(value ?? "").trim().toUpperCase();
  if (["TRANSPORT_TRIP", "TRANSPORT_QUOTE", "SERVICE_REQUEST"].includes(type)) return type;
  return "SERVICE_REQUEST";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return fail("Missing Supabase env", 500);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return fail("AUTH_REQUIRED", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return fail("Invalid JWT", 401, userError);

  const body = await readJson(req);
  const contextType = normalizeContextType(body.context_type);
  const contextId = String(body.service_request_id ?? body.trip_id ?? body.quote_id ?? body.context_id ?? "").trim();
  if (!contextId) return fail("context_id required", 400);

  let context: Record<string, unknown> | null = null;
  let totalAmount = 0;
  let providerId: string | null = null;
  let customerId = userId;
  let serviceType = contextType;
  let currency = "ARS";

  if (contextType === "SERVICE_REQUEST") {
    const { data, error } = await supabase
      .from("svc_requests")
      .select("id,client_user_id,selected_provider_id,accepted_provider_id,total_price_snapshot,provider_price_snapshot,platform_fee_snapshot,currency,status,category_id")
      .eq("id", contextId)
      .maybeSingle();
    if (error) return fail("Request lookup failed", 500, error);
    if (!data) return fail("Service request not found", 404);
    if (data.client_user_id !== userId) return fail("Forbidden", 403);

    context = data;
    customerId = data.client_user_id;
    providerId = data.accepted_provider_id ?? data.selected_provider_id ?? null;
    totalAmount = Number(data.total_price_snapshot ?? 0);
    currency = data.currency ?? "ARS";
    serviceType = "SERVICE_REQUEST";
  }

  if (contextType === "TRANSPORT_TRIP") {
    const { data, error } = await supabase
      .from("viajes")
      .select("id,cliente_auth_id,assigned_driver_id,chofer_id_uuid,precio_total,precio,moneda,estado,servicio")
      .eq("id", contextId)
      .maybeSingle();
    if (error) return fail("Trip lookup failed", 500, error);
    if (!data) return fail("Trip not found", 404);
    if (data.cliente_auth_id !== userId) return fail("Forbidden", 403);

    context = data;
    customerId = data.cliente_auth_id;
    providerId = data.assigned_driver_id ?? data.chofer_id_uuid ?? null;
    totalAmount = Number(data.precio_total ?? data.precio ?? 0);
    currency = data.moneda ?? "ARS";
    serviceType = data.servicio ?? "TRANSPORT_TRIP";
  }

  if (contextType === "TRANSPORT_QUOTE") {
    const { data, error } = await supabase
      .from("cotizaciones")
      .select("id,cliente_auth_id,precio_total,precio_final,precio,total,moneda,moneda_codigo,servicio")
      .eq("id", contextId)
      .maybeSingle();
    if (error) return fail("Quote lookup failed", 500, error);
    if (!data) return fail("Quote not found", 404);
    if (data.cliente_auth_id !== userId) return fail("Forbidden", 403);

    context = data;
    customerId = data.cliente_auth_id;
    totalAmount = Number(data.precio_total ?? data.precio_final ?? data.precio ?? data.total ?? 0);
    currency = data.moneda ?? data.moneda_codigo ?? "ARS";
    serviceType = data.servicio ?? "TRANSPORT_QUOTE";
  }

  if (!context || totalAmount <= 0) return fail("Invalid payable amount", 400);

  const { data: rules } = await supabase
    .from("commission_rules")
    .select("service_type,percentage,minimum_fee,fixed_fee,rounding")
    .eq("active", true)
    .in("service_type", [serviceType, contextType, "DEFAULT"])
    .limit(10);

  const rule =
    rules?.find((item) => item.service_type === serviceType) ??
    rules?.find((item) => item.service_type === contextType) ??
    rules?.find((item) => item.service_type === "DEFAULT") ??
    null;

  const amounts = calculateCommission(totalAmount, rule);

  const { data: existing } = await supabase
    .from("payments")
    .select("*")
    .eq("context_type", contextType)
    .eq("context_id", contextId)
    .in("status", ["PENDING", "CHECKOUT_CREATED", "APPROVED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return json({ ok: true, payment: existing, reused: true });

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      context_type: contextType,
      context_id: contextId,
      service_request_id: contextType === "SERVICE_REQUEST" ? contextId : null,
      trip_id: contextType === "TRANSPORT_TRIP" ? contextId : null,
      customer_id: customerId,
      provider_id: providerId,
      total_amount: amounts.total_amount,
      platform_fee: amounts.platform_fee,
      provider_amount: amounts.provider_amount,
      currency,
      status: "PENDING",
      provider_name: Deno.env.get("PAYMENT_PROVIDER") ?? "mock",
      metadata_json: { commission_rule: amounts.rule, fiscal_note: "MIMI factura solo platform_fee. El servicio lo presta el proveedor independiente." }
    })
    .select("*")
    .single();

  if (insertError || !payment) return fail("Payment insert failed", 500, insertError);

  const provider = getPaymentProvider(payment.provider_name);
  const providerResult = await provider.createPaymentIntent({
    paymentId: payment.id,
    contextType,
    contextId,
    totalAmount: amounts.total_amount,
    platformFee: amounts.platform_fee,
    providerAmount: amounts.provider_amount,
    currency,
    customerId,
    providerId,
    description: "Uso de plataforma MIMI y servicio prestado por proveedor independiente"
  });

  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({
      status: providerResult.status === "PENDING" ? "CHECKOUT_CREATED" : providerResult.status,
      provider_name: providerResult.providerName,
      provider_payment_id: providerResult.providerPaymentId,
      checkout_url: providerResult.checkoutUrl,
      raw_response: providerResult.rawResponse
    })
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) return fail("Payment provider update failed", 500, updateError);

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "payment_intent.created",
    payload: providerResult.rawResponse
  });

  return json({ ok: true, payment: updated });
});
