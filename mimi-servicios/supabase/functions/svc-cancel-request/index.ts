/**
 * svc-cancel-request — cancelación de un servicio con cargo por cancelación y reembolso.
 *
 * QUÉ HACE (en orden, y es importante que sea en este orden):
 *  1. Autentica al usuario (cliente o prestador).
 *  2. Llama a la RPC `svc_cancel_request_atomic`, que dentro de una sola transacción
 *     decide quién cancela, busca la regla en `cancellation_rules`, calcula el cargo,
 *     marca la solicitud como CANCELLED y escribe el cargo en el ledger.
 *  3. Devuelve el resto del pago al cliente vía `refund-payment`.
 *  4. Avisa a las DOS partes, con los montos exactos.
 *
 * SIN ESTO LA CANCELACIÓN ES INCOMPLETA: la RPC por sí sola registra el cargo pero deja
 * la plata del cliente retenida. El reembolso es este archivo.
 *
 * REGLA DE NEGOCIO (decidida 18-sep-2026):
 *  · Cliente: cancela gratis hasta que el prestador sale, 25% con el prestador en camino,
 *    40% cuando ya llegó. Con el PIN ya validado (IN_PROGRESS) NO cancela: reclama.
 *  · Prestador: puede cancelar en cualquier estado y nunca le cuesta nada al cliente
 *    (se le devuelve el 100%).
 */

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function formatArs(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function requireUser(req: Request, supabaseUrl: string, anonKey: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new Error("AUTH_REQUIRED");
  return data.user;
}

/** Estados en los que Mercado Pago todavía tiene plata del cliente que se puede devolver. */
const REFUNDABLE_PAYMENT_STATUSES = ["APPROVED", "CAPTURED", "SETTLED", "PARTIALLY_REFUNDED"];
const COUNTED_REFUND_STATUSES = ["REFUNDED", "REFUND_PENDING", "PARTIALLY_REFUNDED"];

/** Llama a refund-payment como llamador de sistema (service_role). */
async function requestRefund(
  supabaseUrl: string,
  serviceRoleKey: string,
  paymentId: string,
  amount: number,
  reason: string,
  idempotencyKey: string,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/refund-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      payment_id: paymentId,
      amount,
      reason,
      idempotency_key: idempotencyKey,
      // Obligatorio para llamadores de sistema: deja el rastro en la razón del reembolso.
      system_source: "svc-cancel-request",
    }),
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    payload = { raw: "unparseable_response" };
  }
  return { httpStatus: response.status, ok: response.ok, payload };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) throw new Error("SUPABASE_ENV_MISSING");

    const user = await requireUser(req, supabaseUrl, anonKey);
    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || body.requestId || "").trim();
    const reason = String(body.reason || "cancelled_from_ui").trim();
    if (!assertUuid(requestId)) return json({ ok: false, error: "request_id_invalid" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Datos que necesitamos ANTES de cancelar: después la solicitud ya está cerrada
    // y el prestador asignado puede haberse limpiado.
    const { data: requestBefore } = await admin
      .from("svc_requests")
      .select("id,client_user_id,selected_provider_id,accepted_provider_id,status")
      .eq("id", requestId)
      .maybeSingle();

    if (!requestBefore) return json({ ok: false, error: "request_not_found" }, 404);

    // ── 1. Cancelar (estado + cargo + ledger, todo dentro de una transacción) ──
    const { data: result, error } = await admin.rpc("svc_cancel_request_atomic", {
      p_request_id: requestId,
      p_actor_user_id: user.id,
      p_reason: reason,
    });

    if (error) {
      const message = String(error.message || "");
      if (message.includes("cancellation_not_allowed_in_progress")) {
        return json({
          ok: false,
          error: "cancellation_not_allowed_in_progress",
          message: "El servicio ya arrancó. No se puede cancelar: se completa o se reclama.",
          claim_available: true,
        }, 409);
      }
      if (message.includes("forbidden")) return json({ ok: false, error: "forbidden" }, 403);
      if (message.includes("request_not_found")) return json({ ok: false, error: "request_not_found" }, 404);
      throw error;
    }

    if (result?.already_processed) {
      return json({ ok: false, error: "already_cancelled", message: "Esta solicitud ya estaba cancelada." }, 409);
    }

    const cancelledBy = String(result?.cancelled_by || "");
    const fee = money(result?.fee);
    const refundDue = money(result?.refund_due);
    const providerShare = money(result?.provider_share);
    const platformShare = money(result?.platform_share);
    const statusAtCancel = String(result?.status_at_cancel || "");

    // ── 2. Devolverle el resto al cliente ──────────────────────────────────────
    let refund: Record<string, unknown> = { attempted: false, amount: 0 };

    if (refundDue > 0) {
      const { data: payment } = await admin
        .from("payments")
        .select("id,status,total_amount")
        .eq("service_request_id", requestId)
        .in("status", REFUNDABLE_PAYMENT_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (payment?.id) {
        // Cuánto queda realmente por devolver de ese pago: el total menos lo ya
        // reembolsado. Nunca pedimos más que eso, porque refund-payment lo rechaza.
        const { data: priorRefunds } = await admin
          .from("refunds")
          .select("amount,status")
          .eq("payment_id", payment.id)
          .in("status", COUNTED_REFUND_STATUSES);
        const alreadyRefunded = (priorRefunds || []).reduce(
          (sum: number, row: { amount: unknown }) => sum + money(row.amount),
          0,
        );
        const remaining = Math.max(money(payment.total_amount) - alreadyRefunded, 0);
        const amount = Math.min(refundDue, remaining);

        if (amount > 0) {
          const outcome = await requestRefund(
            supabaseUrl,
            serviceRoleKey,
            payment.id,
            amount,
            fee > 0 ? `cancelacion_con_cargo:${reason}` : `cancelacion:${reason}`,
            `cancel-refund:${requestId}`,
          );
          refund = {
            attempted: true,
            amount,
            ok: outcome.ok,
            http_status: outcome.httpStatus,
            response: outcome.payload,
          };
          if (!outcome.ok) {
            console.error("[svc-cancel-request] refund failed", { requestId, amount, outcome });
          }
        } else {
          refund = { attempted: false, amount: 0, skipped: "nothing_left_to_refund", refund_due: refundDue };
        }
      } else {
        // Sin pago aprobado no hay nada que devolver (p. ej. servicios con modelo QUOTE).
        refund = { attempted: false, amount: 0, skipped: "no_refundable_payment" };
      }
    }

    // ── 3. Avisar a las dos partes, con el número exacto ──────────────────────
    const providerId = requestBefore?.accepted_provider_id || requestBefore?.selected_provider_id || null;
    let providerUserId: string | null = null;
    if (providerId) {
      const { data: provider } = await admin
        .from("svc_providers")
        .select("user_id")
        .eq("id", providerId)
        .maybeSingle();
      providerUserId = provider?.user_id ?? null;
    }

    try {
      if (cancelledBy === "CLIENT") {
        // El prestador necesita saber cuánto se le reconoce por el viaje perdido.
        if (providerUserId) {
          const providerBody = fee > 0
            ? `El cliente canceló (${statusAtCancel}). Se te reconocen ${formatArs(providerShare)} por el viaje.`
            : "El cliente canceló la solicitud antes de que salieras. No corresponde cargo.";
          await createUserNotificationWithPush(admin, {
            userId: providerUserId,
            type: "REQUEST_CANCELLED",
            title: fee > 0 ? "Cancelaron el servicio" : "Solicitud cancelada",
            body: providerBody,
            fallbackTag: `svc-request-${requestId}-CANCELLED`,
            data: {
              request_id: requestId,
              status: "CANCELLED",
              cancelled_by: "CLIENT",
              cancellation_fee: fee,
              provider_share: providerShare,
              url: "/mimi-servicios/prestador.html",
            },
          });
        }
        // El cliente recibe el comprobante con lo que se le devuelve.
        await createUserNotificationWithPush(admin, {
          userId: user.id,
          type: "REQUEST_CANCELLED",
          title: "Solicitud cancelada",
          body: fee > 0
            ? `Se descontó ${formatArs(fee)} por cancelación y se te devuelven ${formatArs(refundDue)}.`
            : "Se te devuelve el total. No hubo cargo.",
          fallbackTag: `svc-request-${requestId}-CANCELLED-CLIENT`,
          data: {
            request_id: requestId,
            status: "CANCELLED",
            cancelled_by: "CLIENT",
            cancellation_fee: fee,
            refund_due: refundDue,
            url: "/mimi-servicios/cliente.html",
          },
        });
      } else {
        // Canceló el prestador: el cliente tiene que enterarse de que se le devuelve todo.
        if (requestBefore?.client_user_id) {
          await createUserNotificationWithPush(admin, {
            userId: requestBefore.client_user_id,
            type: "REQUEST_CANCELLED",
            title: "El prestador canceló",
            body: `Se te devuelve el 100% (${formatArs(refundDue)}). No pagás nada por esta cancelación.`,
            fallbackTag: `svc-request-${requestId}-CANCELLED-PROVIDER`,
            data: {
              request_id: requestId,
              status: "CANCELLED",
              cancelled_by: "PROVIDER",
              refund_due: refundDue,
              url: "/mimi-servicios/cliente.html",
            },
          });
        }
      }
    } catch (notifyError) {
      // La cancelación ya está hecha y la plata ya se devolvió: un aviso que falla
      // no puede tirar abajo la operación.
      console.error("[svc-cancel-request] notification failed", { requestId, notifyError });
    }

    return json({
      ok: true,
      request_id: requestId,
      cancelled_by: cancelledBy,
      status_at_cancel: statusAtCancel,
      cancellation_fee: fee,
      refund_due: refundDue,
      provider_share: providerShare,
      platform_share: platformShare,
      refund,
    });
  } catch (error) {
    console.error("svc-cancel-request error:", error);
    const message = error instanceof Error ? error.message : "unexpected_error";
    return json({ ok: false, error: message }, message === "AUTH_REQUIRED" ? 401 : 400);
  }
});
