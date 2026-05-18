export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-mimi-test-webhook, x-mimi-mock-signature, x-mimi-webhook-timestamp, x-mobbex-signature, x-mobbex-timestamp, x-mercadopago-signature, x-signature, x-request-id, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

export function fail(error: string, status = 400, details: unknown = null) {
  return json({ ok: false, error, details }, status);
}

export async function readJson(req: Request) {
  return await req.json().catch(() => ({}));
}
