import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";
import { getPaymentProvider } from "../_shared/payments/providers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return fail("AUTH_REQUIRED", 401);

  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return fail("Invalid JWT", 401);

  const isAdmin = Boolean((await supabase.from("admin_users").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle()).data);
  if (!isAdmin) return fail("Forbidden", 403);

  const body = await readJson(req);
  const paymentId = String(body.payment_id ?? "").trim();
  const reason = String(body.reason ?? "admin_refund").slice(0, 280);
  if (!paymentId) return fail("payment_id required", 400);

  const { data: payment, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) return fail("Payment lookup failed", 500, error);
  if (!payment) return fail("Payment not found", 404);
  if (!["APPROVED", "CAPTURED", "SETTLED"].includes(payment.status)) return fail("Payment cannot be refunded", 409);

  const amount = Math.min(Number(body.amount ?? payment.total_amount), Number(payment.total_amount));
  if (amount <= 0) return fail("Invalid refund amount", 400);

  const provider = getPaymentProvider(payment.provider_name);
  const providerResult = await provider.refundPayment(payment.provider_payment_id ?? payment.id, amount, reason);

  const { data: refund, error: refundError } = await supabase
    .from("refunds")
    .insert({
      payment_id: payment.id,
      amount,
      reason,
      status: providerResult.status,
      provider_refund_id: providerResult.providerPaymentId,
      raw_response: providerResult.rawResponse
    })
    .select("*")
    .single();

  if (refundError) return fail("Refund insert failed", 500, refundError);

  const nextStatus = amount >= Number(payment.total_amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ status: nextStatus, refunded_at: new Date().toISOString(), raw_response: providerResult.rawResponse })
    .eq("id", payment.id)
    .select("*")
    .single();

  if (updateError) return fail("Payment refund update failed", 500, updateError);

  await supabase.from("payment_events").insert({
    payment_id: payment.id,
    event_type: "payment.refunded",
    payload: { refund, provider: providerResult.rawResponse }
  });

  return json({ ok: true, payment: updated, refund });
});
