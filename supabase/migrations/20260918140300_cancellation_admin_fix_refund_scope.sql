-- 20260918140300_cancellation_admin_fix_refund_scope.sql
-- Corrige un problema real que apareció al probar la 20260918140200 contra producción.
--
-- QUÉ ESTABA MAL
--   La vista calculaba `refund_due = total_price_snapshot - cancellation_fee` y el resumen
--   lo sumaba como "refunded_to_clients". Sobre las cancelaciones que ya existen en la base
--   eso daba $6.231.740 ... pero NINGUNA de esas solicitudes tiene un pago capturado
--   (los pagos están en CHECKOUT_CREATED o CANCELLED, o sea nunca entró plata).
--   Un panel que dice "debés 6 millones" cuando no hay nada que devolver es peor que no
--   tener panel: el admin sale a buscar plata que no existe.
--
-- QUÉ CAMBIA
--   · refund_due  -> se mantiene, pero renombrado conceptualmente: es el reembolso TEÓRICO.
--   · payment_captured (nuevo) -> true solo si el pago está en un estado donde Mercado Pago
--     realmente retuvo plata (APPROVED/CAPTURED/SETTLED/PARTIALLY_REFUNDED).
--   · refund_owed (nuevo) -> el reembolso que REALMENTE se le debe al cliente. Es 0 salvo
--     que haya plata capturada. Este es el número que tiene que mirar el admin.
--   · el resumen deja de llamar "refunded_to_clients" a algo que no se reembolsó y separa
--     `refund_owed_captured` (plata real) de `refund_due_theoretical` (lo que se devolvería
--     si el pago hubiera entrado).
--
-- Nota: `CREATE OR REPLACE VIEW` solo permite AGREGAR columnas al final. Las dos nuevas van
-- al final, después de `provider_id`. Las existentes conservan nombre y orden.

begin;

create or replace view public.svc_admin_cancellations as
select
  r.id                                as request_id,
  r.status                            as status,
  r.cancelled_by                      as cancelled_by,
  r.cancelled_at                      as cancelled_at,
  r.cancellation_reason               as cancellation_reason,
  r.cancellation_fee                  as cancellation_fee,
  r.total_price_snapshot              as total_paid,
  greatest(coalesce(r.total_price_snapshot, 0) - coalesce(r.cancellation_fee, 0), 0) as refund_due,
  r.currency                          as currency,
  (l.metadata_json ->> 'status_at_cancel')                as status_at_cancel,
  (l.metadata_json ->> 'provider_share')::numeric         as provider_share,
  (l.metadata_json ->> 'platform_share')::numeric         as platform_share,
  (l.entry_key is not null)                               as fee_posted_to_ledger,
  (w.entry_key is not null)                               as fee_waived,
  -- Ojo: cuando se perdona el cargo, `svc_requests.cancellation_fee` queda en 0.
  -- El monto original perdonado solo existe en el ledger, así que se lee de ahí.
  (w.metadata_json ->> 'waived_amount')::numeric          as waived_amount,
  p.id                                as payment_id,
  p.status                            as payment_status,
  p.total_amount                      as payment_total,
  r.client_user_id                    as client_user_id,
  r.accepted_provider_id              as provider_id,
  -- ── nuevas ──────────────────────────────────────────────────────────────────
  (p.status in ('APPROVED','CAPTURED','SETTLED','PARTIALLY_REFUNDED')) as payment_captured,
  case
    when p.status in ('APPROVED','CAPTURED','SETTLED','PARTIALLY_REFUNDED')
      then greatest(coalesce(r.total_price_snapshot, 0) - coalesce(r.cancellation_fee, 0), 0)
    else 0
  end                                 as refund_owed
from public.svc_requests r
left join public.svc_financial_ledger l
  on l.entry_key = 'req:' || r.id || ':cancellation_fee'
left join public.svc_financial_ledger w
  on w.entry_key = 'req:' || r.id || ':cancellation_fee_waived'
left join lateral (
  select pm.id, pm.status, pm.total_amount
  from public.payments pm
  where pm.service_request_id = r.id
  order by pm.created_at desc
  limit 1
) p on true
where r.status = 'CANCELLED';

revoke all on public.svc_admin_cancellations from public, anon, authenticated;
grant select on public.svc_admin_cancellations to service_role;

create or replace function public.svc_admin_cancellation_summary()
returns jsonb
language sql
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'total_cancelled',        count(*),
    'by_client',              count(*) filter (where cancelled_by = 'CLIENT'),
    'by_provider',            count(*) filter (where cancelled_by = 'PROVIDER'),
    'with_fee',               count(*) filter (where coalesce(cancellation_fee, 0) > 0),
    'fees_collected',         coalesce(sum(cancellation_fee), 0),
    -- El número que importa: plata que hay que devolver de verdad.
    'refund_owed_captured',   coalesce(sum(refund_owed), 0),
    -- Referencia: lo que se devolvería si el pago hubiera entrado. NO es una deuda.
    'refund_due_theoretical', coalesce(sum(refund_due), 0),
    'with_captured_payment',  count(*) filter (where payment_captured),
    'paid_to_providers',      coalesce(sum(coalesce(provider_share, 0)), 0),
    'kept_by_platform',       coalesce(sum(coalesce(platform_share, 0)), 0),
    'waived_by_admin',        coalesce(sum(waived_amount), 0),
    -- Tiene que dar 0. Si da > 0 hay cancelaciones con cargo registrado en la solicitud
    -- pero sin entrada en el ledger: cobros viejos sin rastro contable, a revisar a mano.
    'fees_missing_ledger',    count(*) filter (where coalesce(cancellation_fee, 0) > 0 and not fee_posted_to_ledger),
    'detail', coalesce(
      (select jsonb_agg(row_to_json(t)) from (
         select coalesce(status_at_cancel, '(sin registro: cancelación anterior al cambio)') as estado,
                count(*) as cantidad,
                coalesce(sum(cancellation_fee), 0) as cargos
         from public.svc_admin_cancellations
         group by 1
         order by cantidad desc
       ) t),
      '[]'::jsonb
    )
  )
  from public.svc_admin_cancellations;
$function$;

revoke all on function public.svc_admin_cancellation_summary() from public, anon, authenticated;
grant execute on function public.svc_admin_cancellation_summary() to service_role;

commit;

-- Verificación:
--   select public.svc_admin_cancellation_summary();
--   Con los datos de hoy (18-sep-2026) tiene que dar:
--     refund_owed_captured = 0        <- no hay ningún pago capturado en cancelaciones
--     refund_due_theoretical = ~6.231.740   <- referencia, no deuda
--     fees_missing_ledger = 3         <- los 3 cargos viejos sin entrada en el ledger
