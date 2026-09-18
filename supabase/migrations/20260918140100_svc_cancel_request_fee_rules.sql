-- 20260918140100_svc_cancel_request_fee_rules.sql
-- Lee `cancellation_rules` para calcular el cargo por cancelación y lo deja en el ledger.
--
-- ════════════════════════════════════════════════════════════════════════════
--  NO APLICAR ESTA MIGRACIÓN SOLA.
--
--  Sin el cambio en la edge function, el cargo se registra pero el resto del
--  pago del cliente NO se reembolsa: el status pasa a CANCELLED y la plata
--  queda retenida sin que nadie la devuelva. Eso es peor que el estado actual.
--  Va junto con la actualización de `svc-cancel-request` (ver el documento
--  CANCELACION-Y-PAGO-ANTICIPADO.md, sección "Plan de implementación").
-- ════════════════════════════════════════════════════════════════════════════
--
-- QUÉ CAMBIA respecto de la versión viva (la del dump 20260504135848):
--
--   ANTES  v_fee := platform_fee_snapshot  cuando el cliente cancelaba en
--          ACCEPTED o PROVIDER_EN_ROUTE.
--          -> o sea: se cobraba el 30% de comisión completo, en un estado donde
--             el prestador todavía no se había movido (ACCEPTED), y NO se cobraba
--             nada en PROVIDER_ARRIVED (el prestador en la puerta -> cancelación gratis).
--   AHORA  el cargo sale de `cancellation_rules`: 0% mientras nadie se movió,
--          25% en camino, 40% al llegar, con mínimo y con reparto prestador/plataforma.
--          Nada se cobra por fuera de esas reglas.
--
-- ANTES DE APLICAR (2 chequeos, 1 línea cada uno)
--
--  1) Confirmá que la definición viva no derivó del dump del repo:
--       select pg_get_functiondef('public.svc_cancel_request_atomic(uuid,uuid,text)'::regprocedure);
--     Si el cuerpo difiere de `supabase/migrations/20260504135848_remote_schema.sql:7117`,
--     fusioná los cambios a mano antes de correr esto (CREATE OR REPLACE pisa todo el cuerpo).
--
--  2) El hardening de search_path se re-aplica en esta misma definición, porque
--     CREATE OR REPLACE resetea los atributos no especificados. Si te olvidás del
--     `set search_path = public, pg_temp` del final, deshacés
--     docs/backend-hardening/hardening_security_definer_search_path.sql para esta función.
--
-- El ACL no se toca: sigue siendo 'internal' (solo service_role), igual que antes.
--
-- DECIDIDO (18-sep-2026): cancelar con el servicio IN_PROGRESS queda BLOQUEADO.
--   Una vez que el prestador validó el PIN con el cliente, el servicio arrancó:
--   no se cancela, se completa o se reclama. La RPC corta con
--   'cancellation_not_allowed_in_progress' y la app no debería ni mostrar el botón
--   (la RPC es la última línea de defensa, no la única).

begin;

create or replace function public.svc_cancel_request_atomic(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
as $function$
declare
  v_request record;
  v_now timestamptz := now();
  v_actor text;                 -- 'CLIENT' | 'PROVIDER'
  v_rule record;
  v_base numeric := 0;
  v_fee numeric := 0;
  v_provider_share numeric := 0;
  v_platform_share numeric := 0;
  v_provider_id uuid;
begin
  select *
  into v_request
  from svc_requests
  where id = p_request_id
  for update;

  if v_request is null then
    raise exception 'request_not_found';
  end if;

  if v_request.status in ('CANCELLED', 'COMPLETED') then
    return jsonb_build_object('already_processed', true);
  end if;

  -- quién cancela
  if v_request.client_user_id = p_actor_user_id then
    v_actor := 'CLIENT';
  else
    select id into v_provider_id
    from svc_providers
    where user_id = p_actor_user_id;

    if v_provider_id is not null and v_provider_id = v_request.accepted_provider_id then
      v_actor := 'PROVIDER';
    else
      raise exception 'forbidden';
    end if;
  end if;

  -- El PIN ya se validó: el servicio arrancó. No se cancela, se completa o se reclama.
  -- El cliente cancela hasta PROVIDER_ARRIVED inclusive; el prestador, en cualquier
  -- estado (su cancelación nunca le cuesta nada al cliente y se le reembolsa el 100%).
  if v_request.status = 'IN_PROGRESS' and v_actor = 'CLIENT' then
    raise exception 'cancellation_not_allowed_in_progress'
      using hint = 'service_started_use_claim_instead';
  end if;

  -- 1) regla vigente: primero la del estado exacto, si no existe, la DEFAULT
  select *
  into v_rule
  from public.cancellation_rules
  where active
    and context_type = 'SERVICE_REQUEST'
    and cancelled_by = v_actor
    and status in (v_request.status, 'DEFAULT')
  order by (status = 'DEFAULT') asc, created_at asc
  limit 1;

  -- 2) cargo = LEAST(GREATEST(base * %, mínimo), base)
  if v_rule is not null then
    v_base := coalesce(v_request.total_price_snapshot, 0);

    v_fee := greatest(
               round(v_base * coalesce(v_rule.fee_percentage, 0) / 100.0, 2),
               coalesce(v_rule.fixed_fee, 0)
             );
    v_fee := least(v_fee, v_base);

    v_provider_share := round(v_fee * coalesce(v_rule.provider_share_percentage, 0) / 100.0, 2);
    v_platform_share := round(v_fee - v_provider_share, 2);
  end if;

  -- 3) estado de la solicitud (igual que antes)
  update svc_requests
  set status = 'CANCELLED',
      cancelled_at = v_now,
      cancelled_by = v_actor,
      cancellation_reason = p_reason,
      cancellation_fee = v_fee
  where id = p_request_id;

  update svc_request_offers
  set status = 'CANCELLED',
      responded_at = v_now
  where request_id = p_request_id
    and status = 'PENDING';

  update svc_assignments
  set status = 'CANCELLED',
      cancelled_at = v_now
  where request_id = p_request_id
    and status = 'ACTIVE';

  -- 4) ledger: una sola fila, con el reparto adentro. Idempotente por entry_key.
  if v_fee > 0 then
    insert into svc_financial_ledger
      (entry_key, request_id, provider_id, entry_type, amount, currency, metadata_json)
    values
      ('req:' || p_request_id || ':cancellation_fee',
       p_request_id,
       v_request.accepted_provider_id,
       'CANCELLATION_FEE',
       v_fee,
       coalesce(v_request.currency, 'ARS'),
       jsonb_build_object(
         'source', 'svc_cancel_request_atomic',
         'cancelled_by', v_actor,
         'status_at_cancel', v_request.status,
         'base_amount', v_base,
         'provider_share', v_provider_share,
         'platform_share', v_platform_share
       ))
    on conflict (entry_key) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'cancelled_by', v_actor,
    'status_at_cancel', v_request.status,
    'fee', v_fee,
    'provider_share', v_provider_share,
    'platform_share', v_platform_share,
    'refund_due', greatest(coalesce(v_request.total_price_snapshot, 0) - v_fee, 0)
  );
end;
$function$;

-- Re-aplicar el hardening de search_path (CREATE OR REPLACE lo resetea).
alter function public.svc_cancel_request_atomic(uuid, uuid, text)
  set search_path = public, pg_temp;

commit;

-- Verificación de que el cargo sale por regla y no por snapshot:
--   select * from public.cancellation_rules where context_type = 'SERVICE_REQUEST'
--   order by cancelled_by, status;
--
-- Prueba en seco del cálculo, sin tocar ninguna solicitud:
--   select
--     r.status,
--     r.fee_percentage,
--     r.fixed_fee,
--     31200 as base_ejemplo,
--     least(greatest(round(31200 * r.fee_percentage / 100.0, 2), r.fixed_fee), 31200) as cargo,
--     round(least(greatest(round(31200 * r.fee_percentage / 100.0, 2), r.fixed_fee), 31200)
--           * r.provider_share_percentage / 100.0, 2) as queda_prestador
--   from public.cancellation_rules r
--   where r.context_type = 'SERVICE_REQUEST' and r.cancelled_by = 'CLIENT'
--   order by r.status;
