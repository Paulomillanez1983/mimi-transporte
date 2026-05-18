import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";
import { markOperationFailed, markOperationSucceeded, reserveOperationLock, sha256Hex } from "../_shared/payments/operation-locks.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return fail("AUTH_REQUIRED", 401);

  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return fail("Invalid JWT", 401);

  const body = await readJson(req);
  const paymentId = String(body.payment_id ?? "").trim();
  const reason = String(body.reason ?? "cancelled").slice(0, 280);
  if (!paymentId) return fail("payment_id required", 400);

  const { data: payment, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);
  if (payment.customer_id !== userId) return fail("Forbidden", 403);
  if (!["PENDING", "CHECKOUT_CREATED", "REJECTED"].includes(payment.status)) return fail("Payment cannot be cancelled", 409);

  const traceId = crypto.randomUUID();
  const idempotencyKey = String(
    req.headers.get("x-idempotency-key") ??
      body.idempotency_key ??
      `cancel:${payment.id}:${await sha256Hex(reason)}`
  ).slice(0, 220);
  const provider = getPaymentProvider(payment.provider_name);
  const operation = await reserveOperationLock(supabase, {
    operationType: "payment_cancel",
    operationKey: idempotencyKey,
    idempotencyKey,
    providerName: provider.name,
    paymentId: payment.id,
    providerPaymentId: payment.provider_payment_id ?? payment.id,
    requestBody: { payment_id: payment.id, reason_hash: await sha256Hex(reason) },
    actorUserId: userId,
    traceId,
    correlationId: idempotencyKey
  });

  if (operation.replay && operation.lock?.response_json) {
    return json({ ok: true, replayed: true, ...operation.lock.response_json });
  }

  if (operation.conflict) {
    return fail("CANCEL_ALREADY_PROCESSING", 409, { trace_id: operation.lock?.trace_id, correlation_id: operation.lock?.correlation_id });
  }

  if (!operation.lock) return fail("CANCEL_IDEMPOTENCY_RESERVATION_FAILED", 500);

  let providerResult;
  try {
    providerResult = await provider.cancelPayment(payment.provider_payment_id ?? payment.id, reason);
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : String(providerError);
    await markOperationFailed(supabase, operation.lock.id, "PROVIDER_CANCEL_FAILED", message, true);
    return fail("PROVIDER_CANCEL_FAILED", 502, { trace_id: traceId, message });
  }

  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      raw_response: providerResult.rawResponse
    })
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) {
    await markOperationFailed(supabase, operation.lock.id, "PAYMENT_CANCEL_UPDATE_FAILED", JSON.stringify(updateError), true);
    return fail("Payment cancel update failed", 500, updateError);
  }

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "payment.cancelled",
    payload: { reason, provider: providerResult.rawResponse, trace_id: traceId, correlation_id: idempotencyKey, idempotency_key: idempotencyKey }
  });

  await markOperationSucceeded(supabase, operation.lock.id, { payment: updated });

  return json({ ok: true, payment: updated });
});
