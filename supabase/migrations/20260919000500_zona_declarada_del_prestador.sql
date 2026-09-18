-- 20260919000500_zona_declarada_del_prestador.sql
-- La zona declarada del prestador: para que le llegue el aviso aunque NO esté en línea.
--
-- EL PROBLEMA
--   Un plomero de Argüello quiere recibir trabajo aunque en ese momento no esté con la app
--   abierta. Hoy `svc_providers` solo tiene `last_lat` / `last_lng`, que es su ÚLTIMA
--   POSICIÓN: si no abrió la app, no se lo puede ubicar y no le llega nada. Y son 4 de 112
--   los que tienen coordenada cargada.
--
--   El formulario de alta SÍ pide la ubicación (GPS + domicilio), y la dirección queda en
--   `svc_provider_profiles.address_text` / `city`. Lo que falta es la COORDENADA de esa
--   zona declarada, separada de la posición en vivo.
--
-- LA SOLUCIÓN
--   1. `base_lat` / `base_lng` + `base_zone_label` en `svc_providers`: dónde trabaja.
--      `last_lat/lng` queda para lo que es: dónde está AHORA.
--   2. `service_radius_km`: hasta dónde quiere viajar. Como Uber: el prestador decide.
--   3. La difusión usa `coalesce(last_lat, base_lat)`, así que el que no está en línea
--      recibe el aviso igual. ESE es el punto del cambio.
--   4. El filtro por rubro pasa a mirar `svc_provider_categories` ADEMÁS de las ofertas
--      activas: así le llega a un psicólogo solo lo de psicología. Un pedido de gomería
--      nunca le llega a un psicólogo, ni al revés.
--
-- ADITIVO: columnas nuevas con default, y la función de difusión que ya existía.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La zona declarada
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.svc_providers
  add column if not exists base_lat double precision,
  add column if not exists base_lng double precision,
  add column if not exists base_zone_label text,
  add column if not exists base_zone_set_at timestamptz,
  -- Hasta dónde está dispuesto a viajar. Null = se usa el radio de la plataforma.
  add column if not exists service_radius_km numeric;

comment on column public.svc_providers.base_lat is
  'Latitud de la zona donde el prestador trabaja (declarada). Distinta de last_lat, que es dónde está ahora.';
comment on column public.svc_providers.service_radius_km is
  'Radio propio de cobertura. Null = usa el radio de la plataforma.';

-- Para que la difusión no recorra 112 filas sin índice.
create index if not exists ix_providers_base_zone
  on public.svc_providers (base_lat, base_lng)
  where base_lat is not null and base_lng is not null;

-- Backfill: donde ya hay una última posición conocida, sirve como zona declarada de
-- arranque. Es un punto de partida razonable, no una adivinanza: es el lugar donde ese
-- prestador estuvo trabajando.
update public.svc_providers p
set base_lat = p.last_lat,
    base_lng = p.last_lng,
    base_zone_set_at = coalesce(p.base_zone_set_at, now())
where p.base_lat is null
  and p.last_lat is not null
  and p.last_lng is not null;

-- Si además hay ciudad declarada en el perfil, se usa como etiqueta legible.
update public.svc_providers p
set base_zone_label = left(trim(pr.city), 80)
from public.svc_provider_profiles pr
where pr.provider_id = p.id
  and p.base_zone_label is null
  and pr.city is not null
  and trim(pr.city) <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Para que la app pueda guardar la zona (hoy la pide y no tiene dónde escribirla)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.svc_set_provider_base_zone(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_label text default null,
  p_radius_km numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
begin
  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'error', 'missing_coordinates');
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return jsonb_build_object('ok', false, 'error', 'coordinates_out_of_range');
  end if;
  -- Un radio absurdo deja al prestador fuera de toda difusión sin que se entere.
  if p_radius_km is not null and (p_radius_km < 1 or p_radius_km > 100) then
    return jsonb_build_object('ok', false, 'error', 'radius_out_of_range');
  end if;

  update public.svc_providers
  set base_lat = p_lat,
      base_lng = p_lng,
      base_zone_label = coalesce(nullif(left(trim(coalesce(p_label, '')), 80), ''), base_zone_label),
      service_radius_km = coalesce(p_radius_km, service_radius_km),
      base_zone_set_at = now()
  where user_id = p_user_id
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'provider_not_found');
  end if;

  return jsonb_build_object('ok', true, 'provider_id', v_id,
                            'base_lat', p_lat, 'base_lng', p_lng,
                            'radius_km', p_radius_km);
end;
$function$;

revoke all on function public.svc_set_provider_base_zone(uuid, double precision, double precision, text, numeric) from public, anon, authenticated;
grant execute on function public.svc_set_provider_base_zone(uuid, double precision, double precision, text, numeric) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. La difusión: ahora llega al que NO está en línea
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_radio_plataforma numeric;
  v_enviadas integer := 0;
  v_candidatos integer := 0;
  v_en_linea integer := 0;
  v_por_zona integer := 0;
  v_sin_zona integer := 0;
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
  v_radio_plataforma := coalesce(
    p_radius_km,
    (select coalesce((config_value_json->>'search_radius_km')::numeric, 25)
     from public.svc_platform_config where config_key = 'general'),
    25
  );

  v_cuerpo := 'Hay alguien buscando ' || lower(v_categoria) || ' en tu zona. Entrá para ver el pedido.';

  for v_prov in
    select
      p.id as provider_id,
      p.user_id,
      p.last_seen_at,
      -- Dónde está AHORA si lo sabemos; si no, dónde trabaja. Esta línea es todo el cambio:
      coalesce(p.last_lat, p.base_lat) as lat,
      coalesce(p.last_lng, p.base_lng) as lng,
      -- Hasta dónde quiere viajar él. Si no lo declaró, el radio de la plataforma.
      coalesce(p.service_radius_km, v_radio_plataforma) as su_radio,
      (6371 * acos(
         least(1, greatest(-1,
           cos(radians(v_req.service_lat)) * cos(radians(coalesce(p.last_lat, p.base_lat))) *
           cos(radians(coalesce(p.last_lng, p.base_lng)) - radians(v_req.service_lng)) +
           sin(radians(v_req.service_lat)) * sin(radians(coalesce(p.last_lat, p.base_lat)))
         ))
      )) as distance_km
    from public.svc_providers p
    where p.user_id is not null
      and p.user_id <> v_req.client_user_id
      -- Ubicable: o sabemos dónde está, o sabemos dónde trabaja.
      and (p.last_lat is not null or p.base_lat is not null)
      -- DEL RUBRO. Acá es donde un pedido de gomería deja de llegarle a un psicólogo:
      -- o declaró el rubro, o tiene una oferta activa de ese rubro. Con lo uno o lo otro.
      and (
        exists (
          select 1 from public.svc_provider_categories pc
          where pc.provider_id = p.id
            and pc.category_id = v_req.category_id
            and pc.active
        )
        or exists (
          select 1 from public.svc_provider_service_offerings o
          where o.provider_id = p.id
            and o.active
            and o.category_id = v_req.category_id
        )
      )
    order by distance_km asc
    limit greatest(1, least(p_max, 200))
  loop
    v_candidatos := v_candidatos + 1;

    if v_prov.distance_km is null or v_prov.distance_km > v_prov.su_radio then
      continue;
    end if;

    if exists (
      select 1 from public.svc_notifications n
      where n.user_id = v_prov.user_id
        and n.type = 'SERVICE_DEMAND'
        and n.data_json->>'category_id' = v_req.category_id::text
        and n.created_at > now() - make_interval(hours => greatest(1, p_cooldown_hours))
    ) then
      continue;
    end if;

    -- Para poder decirle al negocio cómo se reparte: cuántos son de zona declarada.
    if v_prov.last_seen_at is not null and v_prov.last_seen_at > now() - interval '15 minutes' then
      v_en_linea := v_en_linea + 1;
    else
      v_por_zona := v_por_zona + 1;
    end if;

    insert into public.svc_notifications (user_id, type, title, body, data_json, delivery_status)
    values (
      v_prov.user_id,
      'SERVICE_DEMAND',
      'Pedido de ' || lower(v_categoria) || ' en tu zona',
      v_cuerpo,
      jsonb_build_object(
        'request_id', p_request_id,
        'category_id', v_req.category_id,
        'distance_km', round(v_prov.distance_km::numeric, 1),
        'matched_by', case when v_prov.last_seen_at is not null
                            and v_prov.last_seen_at > now() - interval '15 minutes'
                           then 'ONLINE' else 'DECLARED_ZONE' end,
        'url', '/mimi-servicios/prestador.html'
      ),
      'PENDING'
    );

    v_enviadas := v_enviadas + 1;
  end loop;

  -- Cuántos del rubro quedaron afuera por no tener NINGUNA ubicación. Es el número que
  -- dice si el problema es la difusión o la carga de datos del prestador.
  select count(*) into v_sin_zona
  from public.svc_providers p
  where p.user_id is not null
    and p.last_lat is null
    and p.base_lat is null
    and (
      exists (select 1 from public.svc_provider_categories pc
              where pc.provider_id = p.id and pc.category_id = v_req.category_id and pc.active)
      or exists (select 1 from public.svc_provider_service_offerings o
                 where o.provider_id = p.id and o.active and o.category_id = v_req.category_id)
    );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'category', v_categoria,
    'radius_platform_km', v_radio_plataforma,
    'enviadas', v_enviadas,
    'candidatos_del_rubro', v_candidatos,
    'de_los_cuales_en_linea', v_en_linea,
    'de_los_cuales_por_zona_declarada', v_por_zona,
    'del_rubro_sin_zona_cargada', v_sin_zona,
    'mensaje', v_cuerpo
  );
end;
$function$;

comment on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) is
  'Avisa a los prestadores DEL RUBRO de la zona que hay demanda, estén o no en línea. No expone datos del cliente.';

revoke all on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.svc_broadcast_service_demand(uuid, numeric, integer, integer) to service_role;

commit;

-- Verificación después de aplicar:
--   select count(*) filter (where base_lat is not null) as con_zona,
--          count(*) filter (where last_lat is not null) as con_posicion
--   from public.svc_providers;
