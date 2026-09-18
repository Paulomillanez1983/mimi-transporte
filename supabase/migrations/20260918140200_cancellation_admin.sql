-- 20260918140200_cancellation_admin.sql
-- Punta ADMIN del cargo por cancelación: ver, resumir y corregir.
--
-- Qué agrega:
--   · vista  svc_admin_cancellations          -> una fila por solicitud cancelada, con el reparto ya aplicado
--   · rpc    svc_admin_cancellation_summary() -> totales por estado y por quién canceló
--   · rpc    svc_admin_waive_cancellation_fee(...) -> perdona el cargo y deja el rastro en el ledger
--   · rpc    svc_admin_upsert_cancellation_rule(...) -> cambia 25%/40%/mínimos desde el panel, sin desplegar
--
-- Seguridad: las tres funciones y la vista quedan accesibles SOLO para service_role.
-- La autorización real (que quien llama sea ADMIN/SUPERADMIN/FINANCE) la sigue haciendo
-- la edge function contra `admin_users`, como ya hacen las demás funciones admin-*.
-- No se usan SECURITY DEFINER: service_role ya saltea RLS, no hace falta.
--
-- Nota importante sobre la vista: NO recalcula el reparto a partir de las reglas actuales.
-- Lo lee del `metadata_json` de la entrada de ledger, que es el reparto que efectivamente
-- se aplicó. Si mañana cambiás el 70/30, las cancelaciones viejas siguen mostrando lo suyo.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Vista
-- ─────────────────────────────────────────────────────────────────────────────
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
  r.accepted_provider_id              as provider_id
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Resumen para el panel
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.svc_admin_cancellation_summary()
returns jsonb
language sql
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'total_cancelled',      count(*),
    'by_client',            count(*) filter (where cancelled_by = 'CLIENT'),
    'by_provider',          count(*) filter (where cancelled_by = 'PROVIDER'),
    'with_fee',             count(*) filter (where coalesce(cancellation_fee, 0) > 0),
    'fees_collected',       coalesce(sum(cancellation_fee), 0),
    'refunded_to_clients',  coalesce(sum(refund_due), 0),
    'paid_to_providers',    coalesce(sum(coalesce(provider_share, 0)), 0),
    'kept_by_platform',     coalesce(sum(coalesce(platform_share, 0)), 0),
    'waived_by_admin',      coalesce(sum(waived_amount), 0),
    'fees_missing_ledger',  count(*) filter (where coalesce(cancellation_fee, 0) > 0 and not fee_posted_to_ledger),
    'detail', coalesce(
      (select jsonb_agg(row_to_json(t)) from (
         select status_at_cancel, count(*) as cantidad, sum(cancellation_fee) as cargos
         from public.svc_admin_cancellations
         group by status_at_cancel
         order by cantidad desc
       ) t),
      '[]'::jsonb
    )
  )
  from public.svc_admin_cancellations;
$function$;

revoke all on function public.svc_admin_cancellation_summary() from public, anon, authenticated;
grant execute on function public.svc_admin_cancellation_summary() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Perdonar el cargo (el caso "el prestador no llegó a moverse" / falla de la app)
-- ─────────────────────────────────────────────────────────────────────────────
-- No borra la entrada original: agrega una compensación negativa. El ledger es
-- append-only, así que el rastro de "acá había un cargo y alguien lo perdonó" queda.
create or replace function public.svc_admin_waive_cancellation_fee(
  p_request_id uuid,
  p_reason text default 'admin_waiver'
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_request record;
  v_previous numeric;
begin
  select * into v_request
  from public.svc_requests
  where id = p_request_id
  for update;

  if v_request is null then
    raise exception 'request_not_found';
  end if;

  if coalesce(v_request.cancellation_fee, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_fee_to_waive',
                              'request_id', p_request_id);
  end if;

  v_previous := v_request.cancellation_fee;

  update public.svc_requests
  set cancellation_fee = 0
  where id = p_request_id;

  insert into public.svc_financial_ledger
    (entry_key, request_id, provider_id, entry_type, amount, currency, metadata_json)
  values
    ('req:' || p_request_id || ':cancellation_fee_waived',
     p_request_id,
     v_request.accepted_provider_id,
     'CANCELLATION_FEE',
     -v_previous,
     coalesce(v_request.currency, 'ARS'),
     jsonb_build_object(
       'source', 'svc_admin_waive_cancellation_fee',
       'waived_amount', v_previous,
       'reason', p_reason
     ))
  on conflict (entry_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'waived_amount', v_previous,
    'refund_due', coalesce(v_request.total_price_snapshot, 0)
  );
end;
$function$;

revoke all on function public.svc_admin_waive_cancellation_fee(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_admin_waive_cancellation_fee(uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Editar las reglas desde el panel (sin desplegar)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.svc_admin_upsert_cancellation_rule(
  p_status text,
  p_cancelled_by text,
  p_fee_percentage numeric,
  p_fixed_fee numeric,
  p_provider_share_percentage numeric default 70,
  p_active boolean default true
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_actor text := upper(trim(coalesce(p_cancelled_by, '')));
  v_status text := upper(trim(coalesce(p_status, '')));
  v_id uuid;
begin
  if v_actor not in ('CLIENT', 'PROVIDER') then
    raise exception 'cancelled_by_must_be_CLIENT_or_PROVIDER';
  end if;
  if p_fee_percentage < 0 or p_fee_percentage > 100 then
    raise exception 'fee_percentage_out_of_range';
  end if;
  if p_fixed_fee < 0 then
    raise exception 'fixed_fee_out_of_range';
  end if;
  if p_provider_share_percentage < 0 or p_provider_share_percentage > 100 then
    raise exception 'provider_share_out_of_range';
  end if;

  select id into v_id
  from public.cancellation_rules
  where context_type = 'SERVICE_REQUEST'
    and status = v_status
    and cancelled_by = v_actor;

  if v_id is null then
    insert into public.cancellation_rules
      (context_type, status, cancelled_by, fee_percentage, fixed_fee,
       platform_share_percentage, provider_share_percentage, active)
    values
      ('SERVICE_REQUEST', v_status, v_actor, p_fee_percentage, p_fixed_fee,
       100 - p_provider_share_percentage, p_provider_share_percentage, p_active)
    returning id into v_id;
  else
    update public.cancellation_rules
    set fee_percentage = p_fee_percentage,
        fixed_fee = p_fixed_fee,
        platform_share_percentage = 100 - p_provider_share_percentage,
        provider_share_percentage = p_provider_share_percentage,
        active = p_active
    where id = v_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'status', v_status, 'cancelled_by', v_actor,
    'fee_percentage', p_fee_percentage, 'fixed_fee', p_fixed_fee,
    'provider_share_percentage', p_provider_share_percentage
  );
end;
$function$;

revoke all on function public.svc_admin_upsert_cancellation_rule(text, text, numeric, numeric, numeric, boolean) from public, anon, authenticated;
grant execute on function public.svc_admin_upsert_cancellation_rule(text, text, numeric, numeric, numeric, boolean) to service_role;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación después de aplicar
-- ─────────────────────────────────────────────────────────────────────────────
--   select * from public.svc_admin_cancellation_summary();
--   select request_id, status_at_cancel, cancelled_by, cancellation_fee,
--          refund_due, provider_share, platform_share, fee_posted_to_ledger
--   from public.svc_admin_cancellations
--   order by cancelled_at desc nulls last
--   limit 50;
--
-- El campo fees_missing_ledger tiene que dar 0. Si da > 0 hay cancelaciones viejas
-- con cargo cobrado que nunca quedó registrado, y hay que revisarlas a mano.
