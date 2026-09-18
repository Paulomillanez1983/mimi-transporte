-- 20260919000400_radio_25km_y_difusion.sql
-- 1) Radio de búsqueda a 25 km.
-- 2) Difusión del pedido a los prestadores de la zona cuando no hay nadie disponible.
--
-- ── RADIO ────────────────────────────────────────────────────────────────────
--   La búsqueda (svc_search_providers_ranked) ya lee el radio de la plataforma:
--     select coalesce((config_value_json->>'search_radius_km')::numeric, 20)
--     from svc_platform_config where config_key = 'general'
--   Así que 25 km es un UPDATE, no hay que tocar la función. Sectorizado, como Uber:
--   llega a la zona, no a 100 km.
--
-- ── DIFUSIÓN ─────────────────────────────────────────────────────────────────
--   Cuando nadie en línea puede tomarlo, se avisa a los prestadores registrados de la
--   zona que hay demanda, sin exponer datos del cliente. Es la notificación tipo Uber:
--   "hay un pedido de plomería cerca tuyo", para que el que no está disponible ahora
--   se entere y decida.
--
--   Reusa lo que ya existe: svc_notifications (con data_json para el deep link) y
--   push_tokens para el envío. No inventa una infraestructura nueva.
--
--   ANTI-SPAM: un prestador no recibe más de una difusión de la MISMA categoría cada
--   p_cooldown_hours. Sin eso, dos pedidos de plomería en una hora significan dos
--   notificaciones, y a la tercera el prestador silencia la app.

begin;

-- ── 1. Radio a 25 km ─────────────────────────────────────────────────────────
update public.svc_platform_config
set config_value_json = jsonb_set(config_value_json, '{search_radius_km}', '25'::jsonb),
    updated_at = now()
where config_key = 'general'
  and config_value_json->>'search_radius_km' is distinct from '25';

-- ── 2. Difusión ──────────────────────────────────────────────────────────────
create or replace function public.svc_broadcast_service_demand(
  p_request_id uuid,
  p_radius_km numeric default null,
  p_max integer default 50,
  p_cooldown_hours integer default 4
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_req record;
  v_categoria text;
  v_radio numeric;
  v_enviadas integer := 0;
  v_sin_ubicacion integer := 0;
  v_candidatos integer := 0;
  v_prov record;
  v_cuerpo text;
begin
  select r.id, r.client_user_id, r.category_id, r.service_lat, r.service_lng, r.status,
         c.name as category_name
  into v_req
  from public.svc_requests r
  left join public.svc_categories c on c.id = r.category_id
  where r.id = p_request_id;

  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;

  if v_req.service_lat is null or v_req.service_lng is null then
    return jsonb_build_object('ok', false, 'error', 'request_without_location');
  end if;

  v_categoria := coalesce(v_req.category_name, 'tu rubro');
  v_radio := coalesce(
    p_radius_km,
    (select coalesce((config_value_json->>'search_radius_km')::numeric, 25)
     from public.svc_platform_config where config_key = 'general'),
    25
  );

  -- El texto NO dice quién ni dónde: solo que hay demanda del rubro cerca.
  v_cuerpo := 'Hay alguien buscando ' || lower(v_categoria) || ' cerca tuyo. Entrá para ver el pedido.';

  for v_prov in
    select p.id as provider_id, p.user_id,
           (6371 * acos(
              least(1, greatest(-1,
                cos(radians(v_req.service_lat)) * cos(radians(p.last_lat)) *
                cos(radians(p.last_lng) - radians(v_req.service_lng)) +
                sin(radians(v_req.service_lat)) * sin(radians(p.last_lat))
              ))
           )) as distance_km
    from public.svc_providers p
    where p.user_id is not null
      -- No le mandamos el aviso al propio cliente si además es prestador.
      and p.user_id <> v_req.client_user_id
      and p.last_lat is not null
      and p.last_lng is not null
      -- Tiene que haber una oferta publicada y activa de ese rubro: avisarle a alguien
      -- que no ofrece el servicio es spam.
      and exists (
        select 1 from public.svc_provider_service_offerings o
        where o.provider_id = p.id
          and o.active
          and o.category_id = v_req.category_id
      )
    order by distance_km asc
    limit greatest(1, least(p_max, 200))
  loop
    v_candidatos := v_candidatos + 1;

    if v_prov.distance_km is null or v_prov.distance_km > v_radio then
      continue;
    end if;

    -- Anti-spam por categoría y ventana de tiempo.
    if exists (
      select 1 from public.svc_notifications n
      where n.user_id = v_prov.user_id
        and n.type = 'SERVICE_DEMAND'
        and n.data_json->>'category_id' = v_req.category_id::text
        and n.created_at > now() - make_interval(hours => greatest(1, p_cooldown_hours))
    ) then
      continue;
    end if;

    insert into public.svc_notifications (user_id, type, title, body, data_json, delivery_status)
    values (
      v_prov.user_id,
      'SERVICE_DEMAND',
      'Pedido de ' || lower(v_categoria) || ' cerca tuyo',
      v_cuerpo,
      jsonb_build_object(
        'request_id', p_request_id,
        'category_id', v_req.category_id,
        'distance_km', round(v_prov.distance_km::numeric, 1),
        -- Sin datos del cliente: recién los ve si cotiza.
        'url', '/mimi-servicios/prestador.html'
      ),
      'PENDING'
    );

    v_enviadas := v_enviadas + 1;
  end loop;

  -- Cuántos quedaron afuera por no tener ubicación: es la señal de que la app tiene que
  -- pedirle la zona al prestador, porque hoy svc_providers solo guarda last_lat/last_lng.
  select count(*) into v_sin_ubicacion
  from public.svc_providers p
  where p.user_id is not null
    and (p.last_lat is null or p.last_lng is null)
    and exists (
      select 1 from public.svc_provider_service_offerings o
      where o.provider_id = p.id and o.active and o.category_id = v_req.category_id
    );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'category', v_categoria,
    'radius_km', v_radio,
    'enviadas', v_enviadas,
    'candidatos_evaluados', v_candidatos,
    'sin_ubicacion_cargada', v_sin_ubicacion,
    'mensaje', v_cuerpo
  );
end;
$function$;

comment on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) is
  'Avisa a los prestadores de la zona que hay demanda del rubro cuando nadie en línea puede tomarla. No expone datos del cliente.';

revoke all on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) to service_role;

commit;

-- Verificación después de aplicar:
--   select config_value_json->>'search_radius_km' from public.svc_platform_config
--   where config_key = 'general';                       -- tiene que decir 25
--   select public.svc_broadcast_service_demand('<request_id>');
