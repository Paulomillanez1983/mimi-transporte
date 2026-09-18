-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLA QA — deja un prestador listo para aparecer en búsquedas y aceptar.
-- ═══════════════════════════════════════════════════════════════════════════
-- Pegar COMPLETO en Supabase → SQL Editor → Run.
-- Corre con permisos de owner, así que ignora RLS (no lo corras desde la app).
--
-- ANTES: creá este usuario en Authentication → Users → Add user,
--        con la casilla "Auto Confirm User" marcada:
--           prestador.qa@qa.mimigo.com.ar
--        y también el cliente:
--           cliente.qa@qa.mimigo.com.ar
--
-- Este script SOLO toca al prestador identificado por ese email.
-- Es repetible: borra sus filas y las vuelve a crear.
--
-- Por qué cumple las 8 condiciones de svc_search_providers_ranked:
--   approved=true · blocked=false · last_location no nulo · accepts_immediate=true
--   status='ONLINE_IDLE' · horas dentro de min/max · dentro de los 20 km ·
--   y una ventana de disponibilidad activa para todos los días.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_email    text := 'prestador.qa@qa.mimigo.com.ar';
  v_user     uuid;
  v_provider uuid;
  v_category uuid;
  v_lat      double precision := -31.4201;   -- Córdoba Capital
  v_lng      double precision := -64.1888;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'No existe el usuario %. Creálo primero en Authentication → Users con "Auto Confirm User".', v_email;
  end if;

  select id into v_category
  from public.svc_categories
  where active = true
  order by sort_order, name
  limit 1;
  if v_category is null then
    raise exception 'No hay filas activas en svc_categories: la búsqueda no tiene nada que devolver.';
  end if;

  -- ── limpieza idempotente (hijos primero) ────────────────────────────────
  delete from public.svc_provider_availability
    where provider_id in (select id from public.svc_providers where user_id = v_user);
  delete from public.svc_provider_service_offerings
    where provider_id in (select id from public.svc_providers where user_id = v_user);
  delete from public.svc_provider_pricing
    where provider_id in (select id from public.svc_providers where user_id = v_user);
  delete from public.svc_provider_categories
    where provider_id in (select id from public.svc_providers where user_id = v_user);
  delete from public.svc_provider_profiles
    where provider_id in (select id from public.svc_providers where user_id = v_user);
  delete from public.svc_providers where user_id = v_user;

  -- ── 1) el prestador, aprobado y en línea ────────────────────────────────
  -- OJO: st_makepoint recibe (longitud, latitud) — al revés que "lat,lng".
  insert into public.svc_providers (
    user_id, full_name, email, status, approved, blocked,
    rating_avg, rating_count, last_lat, last_lng, last_location, last_seen_at
  )
  values (
    v_user, 'Prestador QA', v_email, 'ONLINE_IDLE', true, false,
    5.00, 0, v_lat, v_lng,
    st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography, now()
  )
  returning id into v_provider;

  -- ── 2) perfil: acepta inmediatos y agendados ────────────────────────────
  insert into public.svc_provider_profiles (
    provider_id, bio, city, province, country_code, pricing_mode,
    accepts_immediate, accepts_scheduled, max_hours_per_service,
    onboarding_completed, kyc_status, review_status, review_required
  )
  values (
    v_provider, 'Prestador de prueba (QA)', 'Córdoba', 'Córdoba', 'AR', 'HOURLY',
    true, true, 8,
    true, 'approved', 'approved', false
  );

  -- ── 3) categoría habilitada (la exige el join de la búsqueda) ───────────
  insert into public.svc_provider_categories (provider_id, category_id, active)
  values (v_provider, v_category, true);

  -- ── 4) precio (la búsqueda lo exige para calcular distancia/precio) ─────
  insert into public.svc_provider_pricing (
    provider_id, category_id, currency, price_per_hour, minimum_hours, maximum_hours, active
  )
  values (v_provider, v_category, 'ARS', 12000, 1, 8, true);

  -- ── 5) servicio ofrecido con modelo QUOTE ───────────────────────────────
  -- CLAVE: con pricing_model='QUOTE' las transiciones del prestador NO exigen
  -- pago aprobado (se evita el 402 de MercadoPago) y el flujo se puede
  -- recorrer completo: en camino → llegó → PIN → iniciar → completar.
  insert into public.svc_provider_service_offerings (
    provider_id, category_id, title, description, pricing_model, currency,
    quote_required, minimum_hours, maximum_hours, active
  )
  values (
    v_provider, v_category, 'Servicio de prueba (a presupuestar)',
    'Fila QA para el test automatizado', 'QUOTE', 'ARS',
    true, 1, 8, true
  );

  -- ── 6) disponibilidad todos los días, todo el día ───────────────────────
  insert into public.svc_provider_availability (provider_id, day_of_week, start_time, end_time, active)
  select v_provider, d, '00:00:00'::time, '23:59:59'::time, true
  from generate_series(0, 6) as d;

  raise notice 'Prestador QA listo → provider_id=%  categoria=%', v_provider, v_category;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (esto es lo importante)
-- Debe devolver 1 fila con el "Prestador QA". Si devuelve 0 filas,
-- la búsqueda NO lo ve y el test no puede avanzar.
-- ═══════════════════════════════════════════════════════════════════════════
select *
from public.svc_search_providers_ranked(
  (select id from public.svc_categories where active = true order by sort_order, name limit 1),
  -31.4201, -64.1888, 'IMMEDIATE', now(), 2, 10
);
