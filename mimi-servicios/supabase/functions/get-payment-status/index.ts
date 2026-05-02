import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, fail, json, readJson } from "../_shared/payments/http.ts";

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

  return json({ ok: true, payment });
});
