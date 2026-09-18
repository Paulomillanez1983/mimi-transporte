-- 20260919000700_trabajos_programados.sql
-- Los dos trabajos que hacen que lo construido deje de depender de que alguien lo llame.
--
-- POR QUÉ ASÍ Y NO DENTRO DE svc-create-request
--   El disparador de la difusión podía ir en la creación de la solicitud. Lo puse acá por
--   dos razones: (1) no tocar un flujo crítico — si la difusión falla, la creación del
--   pedido no puede romperse; (2) la lógica real es una escalera con espera: si nadie
--   respondió en unos minutos, ahí avisar a la zona. Un paso a paso cada 5 minutos hace
--   eso natural, y además reintenta solo.
--
--   pg_cron 1.6.4 y pg_net ya están instalados en el proyecto.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Escalera: pedidos sin respuesta -> avisar a la zona
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.svc_escalate_unanswered_requests(
  p_wait_minutes integer default 3,
  p_max integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_req record;
  v_res jsonb;
  v_intentados integer := 0;
  v_avisos integer := 0;
  v_detalle jsonb := '[]'::jsonb;
begin
  for v_req in
    select r.id
    from public.svc_requests r
    where r.status not in ('CANCELLED', 'COMPLETED')
      and r.accepted_provider_id is null
      and r.service_lat is not null
      and r.service_lng is not null
      and r.created_at < now() - make_interval(mins => greatest(1, p_wait_minutes))
      -- Nadie ofertó todavía: si alguien ofertó, el pedido está vivo y no hay que avisar.
      and not exists (
        select 1 from public.svc_request_offers o where o.request_id = r.id
      )
      -- No avisar dos veces por el mismo pedido. Esto es distinto del anti-spam por
      -- prestador que ya tiene la difusión: acá se protege al CLIENTE de que su pedido
      -- se difunda en cada corrida.
      and not exists (
        select 1 from public.svc_notifications n
        where n.type = 'SERVICE_DEMAND'
          and n.data_json->>'request_id' = r.id::text
      )
    order by r.created_at asc
    limit greatest(1, least(p_max, 50))
  loop
    v_intentados := v_intentados + 1;
    v_res := public.svc_broadcast_service_demand(v_req.id);
    v_avisos := v_avisos + coalesce((v_res->>'enviadas')::integer, 0);
    if coalesce((v_res->>'enviadas')::integer, 0) > 0 then
      v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
        'request_id', v_req.id,
        'rubro', v_res->>'category',
        'enviadas', v_res->>'enviadas',
        'por_zona_declarada', v_res->>'de_los_cuales_por_zona_declarada',
        'sin_zona_cargada', v_res->>'del_rubro_sin_zona_cargada'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'pedidos_evaluados', v_intentados,
    'avisos_enviados', v_avisos,
    'detalle', v_detalle
  );
end;
$function$;

comment on function public.svc_escalate_unanswered_requests(integer, integer) is
  'Avisa a la zona los pedidos que quedaron sin respuesta. No repite el aviso del mismo pedido.';

revoke all on function public.svc_escalate_unanswered_requests(integer, integer) from public, anon, authenticated;
grant execute on function public.svc_escalate_unanswered_requests(integer, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Los trabajos programados
-- ─────────────────────────────────────────────────────────────────────────────
-- Se envuelve en un bloque con manejo de error: si pg_cron no estuviera habilitado para
-- programar desde SQL, la migración no tiene que romper por eso. Se reporta.
do $$
declare
  v_pg_cron boolean := to_regnamespace('cron') is not null;
begin
  if not v_pg_cron then
    raise notice 'pg_cron no disponible: los trabajos no se programaron';
    return;
  end if;

  -- Borrado de fotos vencidas: cada 30 minutos. Es lo que sostiene la promesa de storage
  -- (la retención es una ventana móvil) sin depender de que nadie se acuerde.
  begin
    perform cron.unschedule('mimi-expirar-fotos');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'mimi-expirar-fotos',
    '*/30 * * * *',
    $cron$select public.svc_expire_request_photos(300)$cron$
  );

  -- Difusión de pedidos sin respuesta: cada 5 minutos.
  begin
    perform cron.unschedule('mimi-difundir-pedidos');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'mimi-difundir-pedidos',
    '*/5 * * * *',
    $cron$select public.svc_escalate_unanswered_requests(3, 10)$cron$
  );

  raise notice 'trabajos programados';
end $$;

commit;

-- Verificación después de aplicar:
--   select jobname, schedule, active from cron.job order by jobname;
--   select public.svc_escalate_unanswered_requests(3, 5);
