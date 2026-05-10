-- Prepare the controlled provider account for the authenticated MIMI E2E gate.
-- Scope is intentionally limited to auth.users.email = 'testprestador@mimi-go.app'.
-- This is data preparation, not a schema migration.

begin;

do $$
declare
  v_user_id uuid;
  v_provider_id uuid;
  v_category_id uuid;
  v_now timestamptz := now();
begin
  select id
    into v_user_id
  from auth.users
  where lower(email) = lower('testprestador@mimi-go.app')
  limit 1;

  if v_user_id is null then
    raise exception 'e2e_test_provider_auth_user_not_found';
  end if;

  select id
    into v_category_id
  from public.svc_categories
  where active is true
    and code = 'PINTURA'
  limit 1;

  if v_category_id is null then
    raise exception 'e2e_test_category_pintura_not_found';
  end if;

  insert into public.svc_providers (
    user_id,
    full_name,
    email,
    status,
    approved,
    blocked,
    last_lat,
    last_lng,
    last_seen_at,
    notes_internal
  )
  values (
    v_user_id,
    'Prestador E2E MIMI',
    'testprestador@mimi-go.app',
    'ONLINE_IDLE',
    true,
    false,
    -31.3101063,
    -64.2753784,
    v_now,
    'E2E test account. Prepared for authenticated enterprise release gate. Do not use as real provider.'
  )
  on conflict (user_id) do update
  set full_name = coalesce(nullif(public.svc_providers.full_name, ''), excluded.full_name),
      email = excluded.email,
      status = 'ONLINE_IDLE',
      approved = true,
      blocked = false,
      last_lat = excluded.last_lat,
      last_lng = excluded.last_lng,
      last_seen_at = excluded.last_seen_at,
      notes_internal = excluded.notes_internal,
      updated_at = v_now
  returning id into v_provider_id;

  insert into public.svc_provider_profiles (
    provider_id,
    bio,
    address_text,
    city,
    province,
    country_code,
    pricing_mode,
    accepts_immediate,
    accepts_scheduled,
    max_hours_per_service,
    onboarding_completed,
    years_experience,
    kyc_status,
    review_status,
    ai_score,
    ai_score_label,
    review_required,
    risk_flags,
    reviewed_at,
    service_modes,
    public_headline,
    professional_summary,
    first_name
  )
  values (
    v_provider_id,
    'Cuenta controlada para pruebas E2E de MIMI Servicios.',
    'Ubicacion E2E controlada',
    'Cordoba',
    'Cordoba',
    'AR',
    'HOURLY',
    true,
    true,
    8,
    true,
    1,
    'approved',
    'approved',
    100,
    'e2e_test',
    false,
    '[]'::jsonb,
    v_now,
    array['IN_PERSON']::text[],
    'Pintura E2E',
    'Perfil controlado para validar el flujo autenticado cliente/prestador/admin.',
    'Test'
  )
  on conflict (provider_id) do update
  set bio = excluded.bio,
      address_text = excluded.address_text,
      city = excluded.city,
      province = excluded.province,
      country_code = excluded.country_code,
      pricing_mode = excluded.pricing_mode,
      accepts_immediate = excluded.accepts_immediate,
      accepts_scheduled = excluded.accepts_scheduled,
      max_hours_per_service = excluded.max_hours_per_service,
      onboarding_completed = excluded.onboarding_completed,
      years_experience = excluded.years_experience,
      kyc_status = excluded.kyc_status,
      review_status = excluded.review_status,
      ai_score = excluded.ai_score,
      ai_score_label = excluded.ai_score_label,
      review_required = excluded.review_required,
      risk_flags = excluded.risk_flags,
      reviewed_at = excluded.reviewed_at,
      service_modes = excluded.service_modes,
      public_headline = excluded.public_headline,
      professional_summary = excluded.professional_summary,
      first_name = excluded.first_name,
      updated_at = v_now;

  insert into public.svc_provider_categories (
    provider_id,
    category_id,
    active
  )
  values (
    v_provider_id,
    v_category_id,
    true
  )
  on conflict (provider_id, category_id) do update
  set active = true,
      updated_at = v_now;

  update public.svc_provider_service_offerings
  set title = 'Pintura E2E',
      description = 'Oferta controlada para validar el ciclo completo de solicitud de pintura.',
      pricing_model = 'SQUARE_METER',
      currency = 'ARS',
      price_per_hour = null,
      base_visit_fee = null,
      fixed_price = null,
      unit_name = 'm2',
      unit_price = 15000,
      minimum_charge = 15000,
      minimum_hours = null,
      maximum_hours = null,
      quote_required = false,
      active = true,
      metadata = jsonb_build_object(
        'e2e', true,
        'prepared_at', v_now,
        'source', 'enterprise_global_e2e'
      ),
      service_mode = 'IN_PERSON',
      duration_minutes = null,
      location_policy = 'CLIENT_ADDRESS',
      public_summary = 'Pintura E2E por metro cuadrado.',
      client_instructions = 'Cuenta de prueba controlada para QA enterprise.',
      updated_at = v_now
  where provider_id = v_provider_id
    and category_id = v_category_id;

  if not exists (
    select 1
    from public.svc_provider_service_offerings
    where provider_id = v_provider_id
      and category_id = v_category_id
  ) then
    insert into public.svc_provider_service_offerings (
      provider_id,
      category_id,
      title,
      description,
      pricing_model,
      currency,
      unit_name,
      unit_price,
      minimum_charge,
      quote_required,
      active,
      metadata,
      service_mode,
      location_policy,
      public_summary,
      client_instructions
    )
    values (
      v_provider_id,
      v_category_id,
      'Pintura E2E',
      'Oferta controlada para validar el ciclo completo de solicitud de pintura.',
      'SQUARE_METER',
      'ARS',
      'm2',
      15000,
      15000,
      false,
      true,
      jsonb_build_object(
        'e2e', true,
        'prepared_at', v_now,
        'source', 'enterprise_global_e2e'
      ),
      'IN_PERSON',
      'CLIENT_ADDRESS',
      'Pintura E2E por metro cuadrado.',
      'Cuenta de prueba controlada para QA enterprise.'
    );
  end if;
end $$;

commit;
