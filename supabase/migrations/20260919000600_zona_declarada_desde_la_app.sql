-- 20260919000600_zona_declarada_desde_la_app.sql
-- Para que el panel del prestador pueda guardar su zona declarada.
--
-- EL PROBLEMA
--   La migración anterior creó `svc_set_provider_base_zone()` pero la dejó solo para
--   service_role, así que el panel del prestador no la podía llamar. La app pide el GPS,
--   lo usa en pantalla... y la coordenada se pierde. Resultado: el prestador da su
--   ubicación y sigue sin recibir la difusión de pedidos de su rubro.
--
-- QUÉ CAMBIA
--   1. `p_user_id` pasa a ser opcional: si no viene, se resuelve con `auth.uid()`. Así el
--      panel no necesita conocer su propio id para guardar su zona (menos código y menos
--      lugares donde equivocarse).
--   2. Se permite llamarla desde la sesión del prestador (`authenticated`), con un guard:
--      nadie puede escribir la zona de OTRO. Si hay sesión, `auth.uid()` tiene que ser el
--      dueño de la zona que se está guardando.
--   3. Sigue funcionando con service_role (para llamarla desde una edge function).

begin;

create or replace function public.svc_set_provider_base_zone(
  p_user_id uuid default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_label text default null,
  p_radius_km numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid;
  v_id uuid;
begin
  -- Si no me dicen de quién es la zona, la deduzco de la sesión.
  v_uid := coalesce(p_user_id, auth.uid());

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Con sesión abierta, nadie escribe la zona de otro.
  if auth.uid() is not null and auth.uid() <> v_uid then
    raise exception 'forbidden';
  end if;

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
  where user_id = v_uid
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'provider_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'provider_id', v_id,
    'base_lat', p_lat,
    'base_lng', p_lng,
    'radius_km', p_radius_km,
    'mensaje', 'Listo: tu zona quedo guardada. Ahora te van a llegar pedidos de tu rubro aunque no tengas la app abierta.'
  );
end;
$function$;

-- La sesión del prestador puede llamarla; el guard de arriba es el que protege.
revoke all on function public.svc_set_provider_base_zone(uuid, double precision, double precision, text, numeric) from public, anon;
grant execute on function public.svc_set_provider_base_zone(uuid, double precision, double precision, text, numeric) to authenticated, service_role;

commit;

-- Verificación después de aplicar:
--   select public.svc_set_provider_base_zone(null, -31.36, -64.25, 'Arguello, Cordoba', 25);
--     -> sin sesión tiene que devolver {"ok": false, "error": "not_authenticated"}
