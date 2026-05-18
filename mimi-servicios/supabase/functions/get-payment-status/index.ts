import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";

const FINAL_PAYMENT_STATUSES = new Set([
  "APPROVED",
  "CAPTURED",
  "CANCELLED",
  "REJECTED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "SETTLED"
]);

const SYNCABLE_PAYMENT_STATUSES = new Set(["PENDING", "CHECKOUT_CREATED"]);

function normalizeProviderName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function isMercadoPagoProvider(value: unknown) {
  const provider = normalizeProviderName(value);
  return provider === "mercadopago" || provider === "mercado_pago";
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeProviderStatus(status: unknown, currentStatus: string) {
  const next = String(status ?? "").trim().toUpperCase();
  if (!next) return currentStatus;
  if (next === "PENDING" && currentStatus === "CHECKOUT_CREATED") return currentStatus;
  if (["PENDING", "CHECKOUT_CREATED", "APPROVED", "CAPTURED", "REJECTED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "SETTLED"].includes(next)) {
    return next;
  }
  return currentStatus;
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
  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return fail("Invalid JWT", 401);

  const body = await readJson(req);
  const paymentId = String(body.payment_id ?? "").trim();
  if (!paymentId) return fail("payment_id required", 400);
  const requestedProviderPaymentId = String(body.provider_payment_id ?? body.mercadopago_payment_id ?? body.collection_id ?? "").trim();

  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);

  const isParticipant =
    payment.customer_id === userId ||
    Boolean(payment.provider_id) &&
      Boolean((await supabase.from("svc_providers").select("id").eq("id", payment.provider_id).eq("user_id", userId).maybeSingle()).data);

  const isAdmin = Boolean((await supabase.from("admin_users").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle()).data);
  if (!isParticipant && !isAdmin) return fail("Forbidden", 403);

  const currentStatus = String(payment.status ?? "PENDING").toUpperCase();
  if (
    !isMercadoPagoProvider(payment.provider_name) ||
    FINAL_PAYMENT_STATUSES.has(currentStatus) ||
    !SYNCABLE_PAYMENT_STATUSES.has(currentStatus)
  ) {
    return json({ ok: true, payment, synced: false });
  }

  const providerPaymentId = requestedProviderPaymentId || String(payment.provider_payment_id ?? "").trim();
  if (!providerPaymentId) {
    return json({
      ok: true,
      payment,
      synced: false,
      sync_warning: "provider_payment_id_missing"
    });
  }

  try {
    const provider = getPaymentProvider(payment.provider_name);
    const providerResult = await provider.getPaymentStatus(providerPaymentId);
    const providerRaw = rawRecord(providerResult.rawResponse);
    const nextStatus = normalizeProviderStatus(providerResult.status, currentStatus);
    const effectiveIsTest = boolValue(payment.is_test) || boolValue(providerRaw.is_test);
    const effectiveFiscalVisibility = effectiveIsTest
      ? "excluded_from_accounting"
      : String(payment.fiscal_visibility ?? providerRaw.fiscal_visibility ?? "fiscal_reportable");
    const effectiveEnvironment = effectiveIsTest ? "sandbox" : String(payment.environment ?? "production");

    const existingRaw = rawRecord(payment.raw_response);
    const patch: Record<string, unknown> = {
      status: nextStatus,
      provider_name: providerResult.providerName,
      provider_payment_id: providerResult.providerPaymentId || providerPaymentId,
      raw_response: {
        ...existingRaw,
        ...providerRaw,
        provider_status_sync: true,
        previous_local_status: currentStatus
      },
      payment_method_status: nextStatus === "APPROVED" ? "approved" : "provider_status_synced",
      environment: effectiveEnvironment,
      is_test: effectiveIsTest,
      fiscal_visibility: effectiveFiscalVisibility,
      updated_at: new Date().toISOString()
    };

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update(patch)
      .eq("id", payment.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    if (nextStatus !== currentStatus) {
      await supabase.from("payment_events").insert({
        payment_id: payment.id,
        event_type: "payment_status.synced",
        provider_event_id: `status-sync:${providerResult.providerName}:${providerResult.providerPaymentId || providerPaymentId}:${nextStatus}`,
        payload: providerRaw,
        environment: effectiveEnvironment,
        is_test: effectiveIsTest,
        fiscal_visibility: effectiveFiscalVisibility
      });
    }

    return json({
      ok: true,
      payment: updatedPayment,
      synced: true,
      provider_status: providerResult.status
    });
  } catch (syncError) {
    console.warn("[get-payment-status] provider sync failed", {
      payment_id: payment.id,
      provider_name: payment.provider_name,
      provider_payment_id: providerPaymentId,
      error: syncError instanceof Error ? syncError.message : String(syncError)
    });

    return json({
      ok: true,
      payment,
      synced: false,
      sync_warning: "provider_sync_failed",
      provider_warning: syncError instanceof Error ? syncError.message : String(syncError)
    });
  }
});
