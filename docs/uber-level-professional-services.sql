-- MIMI Servicios - soporte profesional/online "Uber level".
-- Aditivo y compatible hacia atras.
-- Objetivo:
-- - Profesionales online por sesion/unidad.
-- - Matching online sin exigir ubicacion/distancia.
-- - Credenciales profesionales, matriculas y certificado de antecedentes.
-- - Requisitos documentales por categoria.

alter table public.svc_categories
  add column if not exists allowed_service_modes text[] not null default array['IN_PERSON'],
  add column if not exists requires_professional_license boolean not null default false,
  add column if not exists requires_background_check boolean not null default true,
  add column if not exists public_profile_schema jsonb not null default '{}'::jsonb;

alter table public.svc_provider_profiles
  add column if not exists service_modes text[] not null default array['IN_PERSON'],
  add column if not exists public_headline text,
  add column if not exists professional_summary text,
  add column if not exists video_intro_url text,
  add column if not exists emergency_disclaimer text;

alter table public.svc_provider_documents
  add column if not exists issued_at date,
  add column if not exists expires_at date,
  add column if not exists external_verification_url text,
  add column if not exists verification_reference text;

alter table public.svc_provider_service_offerings
  add column if not exists service_mode text not null default 'IN_PERSON',
  add column if not exists duration_minutes integer,
  add column if not exists location_policy text not null default 'CLIENT_ADDRESS',
  add column if not exists public_summary text,
  add column if not exists client_instructions text;

alter table public.svc_requests
  add column if not exists offering_id uuid references public.svc_provider_service_offerings(id),
  add column if not exists service_mode text not null default 'IN_PERSON',
  add column if not exists session_duration_minutes integer,
  add column if not exists meeting_url text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create or replace function public.svc_requests_apply_offering_defaults()
returns trigger
language plpgsql
as $$
declare
  v_offering record;
begin
  if new.offering_id is not null then
    select id, service_mode, duration_minutes
      into v_offering
    from public.svc_provider_service_offerings
    where id = new.offering_id
    limit 1;
  elsif new.selected_provider_id is not null and new.category_id is not null then
    select id, service_mode, duration_minutes
      into v_offering
    from public.svc_provider_service_offerings
    where provider_id = new.selected_provider_id
      and category_id = new.category_id
      and active = true
    order by
      case when service_mode = 'ONLINE' then 0 else 1 end,
      updated_at desc nulls last,
      created_at desc nulls last
    limit 1;
  end if;

  if v_offering.id is not null then
    new.offering_id = coalesce(new.offering_id, v_offering.id);
    new.service_mode = coalesce(nullif(new.service_mode, ''), v_offering.service_mode, 'IN_PERSON');
    if new.service_mode = 'IN_PERSON' and v_offering.service_mode is not null then
      new.service_mode = v_offering.service_mode;
    end if;
    new.session_duration_minutes = coalesce(new.session_duration_minutes, v_offering.duration_minutes);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_svc_requests_apply_offering_defaults on public.svc_requests;
create trigger trg_svc_requests_apply_offering_defaults
before insert or update of selected_provider_id, category_id, offering_id, service_mode, session_duration_minutes
on public.svc_requests
for each row
execute function public.svc_requests_apply_offering_defaults();

create table if not exists public.svc_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  category_id uuid references public.svc_categories(id) on delete set null,
  credential_type text not null,
  license_number text,
  issuing_body text,
  jurisdiction text,
  holder_name text,
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING','VERIFIED','REJECTED','EXPIRED','MANUAL_REVIEW')),
  document_id uuid references public.svc_provider_documents(id) on delete set null,
  source_url text,
  verification_notes text,
  issued_at date,
  expires_at date,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists svc_provider_credentials_provider_idx
  on public.svc_provider_credentials(provider_id);

create index if not exists svc_provider_credentials_category_idx
  on public.svc_provider_credentials(category_id);

create table if not exists public.svc_provider_document_requirements (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.svc_categories(id) on delete cascade,
  document_type text not null,
  title text not null,
  description text,
  required boolean not null default true,
  renew_every_days integer,
  external_url text,
  applies_to_service_modes text[] not null default array['IN_PERSON','ONLINE'],
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, document_type)
);

alter table public.svc_provider_credentials enable row level security;
alter table public.svc_provider_document_requirements enable row level security;

drop policy if exists svc_provider_credentials_self_rw on public.svc_provider_credentials;
create policy svc_provider_credentials_self_rw
  on public.svc_provider_credentials
  for all
  to authenticated
  using (
    exists (
      select 1 from public.svc_providers p
      where p.id = svc_provider_credentials.provider_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.svc_providers p
      where p.id = svc_provider_credentials.provider_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists svc_provider_document_requirements_read on public.svc_provider_document_requirements;
create policy svc_provider_document_requirements_read
  on public.svc_provider_document_requirements
  for select
  to anon, authenticated
  using (active = true);

update public.svc_categories
set
  default_pricing_model = 'UNIT',
  allowed_service_modes = array['ONLINE','IN_PERSON'],
  requires_professional_license = true,
  requires_background_check = true,
  public_profile_schema = jsonb_build_object(
    'primary_price_label', 'sesion',
    'needs_license', true,
    'show_license_to_client', true,
    'allows_online', true
  )
where code in ('PSICOLOGIA');

update public.svc_categories
set
  default_pricing_model = 'UNIT',
  allowed_service_modes = array['ONLINE','IN_PERSON'],
  requires_professional_license = true,
  requires_background_check = true,
  public_profile_schema = jsonb_build_object(
    'primary_price_label', 'sesion',
    'needs_license', true,
    'show_license_to_client', true,
    'allows_online', true
  )
where code in ('NUTRICION','ABOGACIA','CONTABILIDAD');

update public.svc_categories
set
  default_pricing_model = 'UNIT',
  allowed_service_modes = array['IN_PERSON','ONLINE'],
  requires_professional_license = true,
  requires_background_check = true,
  public_profile_schema = jsonb_build_object(
    'primary_price_label', 'sesion',
    'needs_license', true,
    'show_license_to_client', true,
    'allows_online', true
  )
where code in ('KINESIOLOGIA');

update public.svc_categories
set
  default_pricing_model = 'UNIT',
  allowed_service_modes = array['ONLINE','IN_PERSON'],
  requires_professional_license = false,
  requires_background_check = true,
  public_profile_schema = jsonb_build_object(
    'primary_price_label', 'clase',
    'needs_license', false,
    'show_license_to_client', false,
    'allows_online', true
  )
where code in ('CLASES_PARTICULARES');

update public.svc_categories
set allowed_service_modes = array['IN_PERSON']
where code not in ('PSICOLOGIA','NUTRICION','KINESIOLOGIA','ABOGACIA','CONTABILIDAD','CLASES_PARTICULARES')
  and allowed_service_modes = array['IN_PERSON'];

with requirement_rows as (
  select c.id as category_id, x.*
  from public.svc_categories c
  join lateral (
    values
      ('dni_front', 'DNI frente', 'Foto clara del frente del DNI.', true, null::integer, null::text, 10),
      ('dni_back', 'DNI dorso', 'Foto clara del dorso del DNI.', true, null::integer, null::text, 20),
      ('selfie', 'Selfie de identidad', 'Selfie actual para comparar identidad.', true, null::integer, null::text, 30),
      ('criminal_record_certificate', 'Certificado de antecedentes penales', 'Certificado oficial emitido por Registro Nacional de Reincidencia.', true, 90, 'https://www.argentina.gob.ar/justicia/reincidencia/antecedentespenales', 40)
  ) as x(document_type,title,description,required,renew_every_days,external_url,sort_order)
    on true
  where c.active = true
),
professional_requirement_rows as (
  select c.id as category_id, x.*
  from public.svc_categories c
  join lateral (
    values
      ('professional_license', 'Matricula profesional', 'Constancia o credencial de matricula profesional vigente.', true, 365, null::text, 50),
      ('degree_certificate', 'Titulo o constancia profesional', 'Titulo, certificado o constancia profesional relacionada con la categoria.', false, null::integer, null::text, 60)
  ) as x(document_type,title,description,required,renew_every_days,external_url,sort_order)
    on true
  where c.code in ('PSICOLOGIA','NUTRICION','KINESIOLOGIA','ABOGACIA','CONTABILIDAD')
)
insert into public.svc_provider_document_requirements (
  category_id,
  document_type,
  title,
  description,
  required,
  renew_every_days,
  external_url,
  sort_order,
  active
)
select category_id, document_type, title, description, required, renew_every_days, external_url, sort_order, true
from requirement_rows
union all
select category_id, document_type, title, description, required, renew_every_days, external_url, sort_order, true
from professional_requirement_rows
on conflict (category_id, document_type) do update set
  title = excluded.title,
  description = excluded.description,
  required = excluded.required,
  renew_every_days = excluded.renew_every_days,
  external_url = excluded.external_url,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

create or replace function public.svc_search_providers_ranked(
  p_category_id uuid,
  p_service_lat double precision,
  p_service_lng double precision,
  p_request_type text,
  p_scheduled_for timestamp with time zone,
  p_requested_hours integer,
  p_limit integer default 20
)
returns table(
  provider_id uuid,
  user_id uuid,
  full_name text,
  rating numeric,
  rating_count integer,
  distance_km numeric,
  provider_price numeric,
  currency text,
  score numeric
)
language plpgsql
stable
as $function$
declare
  v_search_radius_km numeric := 20;
  v_target_ts timestamptz;
  v_day_of_week integer;
  v_target_time time;
begin
  select coalesce((config_value_json->>'search_radius_km')::numeric, 20)
  into v_search_radius_km
  from public.svc_platform_config
  where config_key = 'general'
  limit 1;

  v_target_ts := coalesce(p_scheduled_for, now());
  v_day_of_week := extract(dow from v_target_ts);
  v_target_time := v_target_ts::time;

  return query
  with base as (
    select
      sp.id as provider_id,
      sp.user_id,
      sp.full_name,
      sp.rating_avg,
      sp.rating_count,
      coalesce(off.currency, spp.currency, 'ARS') as currency,
      coalesce(off.pricing_model, cat.default_pricing_model, 'HOURLY') as pricing_model,
      coalesce(off.service_mode, 'IN_PERSON') as service_mode,
      coalesce(off.price_per_hour, spp.price_per_hour, 0) as price_per_hour,
      coalesce(off.base_visit_fee, 0) as base_visit_fee,
      coalesce(off.fixed_price, 0) as fixed_price,
      coalesce(off.unit_price, 0) as unit_price,
      coalesce(off.minimum_charge, 0) as minimum_charge,
      coalesce(off.minimum_hours, spp.minimum_hours, 1) as minimum_hours,
      coalesce(off.maximum_hours, spp.maximum_hours, 24) as maximum_hours,
      case
        when coalesce(off.service_mode, 'IN_PERSON') = 'ONLINE' then 0::numeric
        when sp.last_location is not null and p_service_lat is not null and p_service_lng is not null then
          round(
            (st_distance(
              sp.last_location,
              st_setsrid(st_makepoint(p_service_lng, p_service_lat), 4326)::geography
            ) / 1000.0)::numeric
          , 2)
        else null::numeric
      end as distance_km
    from public.svc_providers sp
    join public.svc_provider_categories spc
      on spc.provider_id = sp.id
     and spc.category_id = p_category_id
     and spc.active = true
    join public.svc_categories cat
      on cat.id = spc.category_id
     and cat.active = true
    left join public.svc_provider_pricing spp
      on spp.provider_id = sp.id
     and spp.category_id = p_category_id
     and spp.active = true
    left join lateral (
      select o.*
      from public.svc_provider_service_offerings o
      where o.provider_id = sp.id
        and o.category_id = p_category_id
        and o.active = true
        and o.quote_required = false
      order by
        case when o.service_mode = 'ONLINE' then 0 else 1 end,
        o.updated_at desc
      limit 1
    ) off on true
    join public.svc_provider_profiles prof
      on prof.provider_id = sp.id
    where sp.approved = true
      and sp.blocked = false
      and (
        (p_request_type = 'IMMEDIATE' and prof.accepts_immediate = true and sp.status in ('ONLINE_IDLE'))
        or
        (p_request_type = 'SCHEDULED' and prof.accepts_scheduled = true and sp.status in ('ONLINE_IDLE','BOOKED_UPCOMING','OFFLINE'))
      )
      and p_requested_hours between coalesce(off.minimum_hours, spp.minimum_hours, 1)
        and coalesce(off.maximum_hours, spp.maximum_hours, 24)
      and (off.id is not null or spp.id is not null)
      and (
        coalesce(off.service_mode, 'IN_PERSON') = 'ONLINE'
        or (
          sp.last_location is not null
          and p_service_lat is not null
          and p_service_lng is not null
          and st_dwithin(
            sp.last_location,
            st_setsrid(st_makepoint(p_service_lng, p_service_lat), 4326)::geography,
            (v_search_radius_km * 1000)
          )
        )
      )
      and exists (
        select 1
        from public.svc_provider_availability a
        where a.provider_id = sp.id
          and a.active = true
          and a.day_of_week = v_day_of_week
          and v_target_time >= a.start_time
          and v_target_time < a.end_time
      )
  ),
  priced as (
    select
      b.*,
      greatest(
        b.minimum_charge,
        case b.pricing_model
          when 'UNIT' then b.unit_price
          when 'FIXED' then b.fixed_price
          when 'BASE_VISIT' then b.base_visit_fee
          when 'QUOTE' then b.minimum_charge
          else b.price_per_hour * greatest(1, p_requested_hours)
        end
      ) as effective_price
    from base b
  )
  select
    p.provider_id,
    p.user_id,
    p.full_name,
    p.rating_avg::numeric as rating,
    p.rating_count,
    coalesce(p.distance_km, 0)::numeric as distance_km,
    round(p.effective_price::numeric, 2) as provider_price,
    p.currency,
    round((
      case when p.service_mode = 'ONLINE' then 96 else (100 - least(coalesce(p.distance_km, 100), 100)) end * 0.40
      + least(coalesce(p.rating_avg, 0), 5) * 20 * 0.35
      + greatest(0, 100 - least(p.effective_price / 100, 100)) * 0.25
    )::numeric, 4) as score
  from priced p
  order by score desc, distance_km asc, rating_avg desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$function$;

create or replace function public.svc_prepare_request_pricing(
  p_client_user_id uuid,
  p_category_id uuid,
  p_provider_id uuid,
  p_service_lat double precision,
  p_service_lng double precision,
  p_request_type text,
  p_scheduled_for timestamp with time zone,
  p_requested_hours integer
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_provider record;
  v_pricing record;
  v_offering record;
  v_general jsonb;
  v_platform_fee_percent numeric := 0.15;
  v_platform_fee_min numeric := 500;
  v_scheduled_max_hours_ahead integer := 48;
  v_provider_price numeric := 0;
  v_platform_fee numeric := 0;
  v_total_price numeric := 0;
  v_visible_candidates jsonb := '[]'::jsonb;
  v_pricing_model text := 'HOURLY';
  v_unit_name text := null;
  v_service_mode text := 'IN_PERSON';
  v_session_duration_minutes integer := null;
begin
  if p_requested_hours is null or p_requested_hours < 1 or p_requested_hours > 24 then
    return jsonb_build_object('eligible', false, 'reason', 'requested_hours_invalid');
  end if;

  if p_request_type not in ('IMMEDIATE','SCHEDULED') then
    return jsonb_build_object('eligible', false, 'reason', 'request_type_invalid');
  end if;

  select config_value_json
  into v_general
  from public.svc_platform_config
  where config_key = 'general'
  limit 1;

  v_platform_fee_percent := coalesce((v_general->>'platform_fee_percent')::numeric, 0.15);
  v_platform_fee_min := coalesce((v_general->>'platform_fee_min')::numeric, 500);
  v_scheduled_max_hours_ahead := coalesce((v_general->>'scheduled_max_hours_ahead')::integer, 48);

  if p_request_type = 'SCHEDULED' then
    if p_scheduled_for is null then
      return jsonb_build_object('eligible', false, 'reason', 'scheduled_for_required');
    end if;
    if p_scheduled_for <= now() then
      return jsonb_build_object('eligible', false, 'reason', 'scheduled_for_in_past');
    end if;
    if p_scheduled_for > now() + make_interval(hours => v_scheduled_max_hours_ahead) then
      return jsonb_build_object('eligible', false, 'reason', 'scheduled_for_too_far');
    end if;
  end if;

  select sp.id, sp.user_id, sp.full_name, sp.approved, sp.blocked, sp.status
  into v_provider
  from public.svc_providers sp
  where sp.id = p_provider_id;

  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'provider_not_found');
  end if;

  if v_provider.approved is distinct from true or v_provider.blocked is true then
    return jsonb_build_object('eligible', false, 'reason', 'provider_not_allowed');
  end if;

  select o.*
  into v_offering
  from public.svc_provider_service_offerings o
  where o.provider_id = p_provider_id
    and o.category_id = p_category_id
    and o.active = true
    and o.quote_required = false
  order by
    case when o.service_mode = 'ONLINE' then 0 else 1 end,
    o.updated_at desc
  limit 1;

  select spp.*
  into v_pricing
  from public.svc_provider_pricing spp
  join public.svc_provider_categories spc
    on spc.provider_id = spp.provider_id
   and spc.category_id = spp.category_id
   and spc.active = true
  where spp.provider_id = p_provider_id
    and spp.category_id = p_category_id
    and spp.active = true;

  if v_offering.id is null and v_pricing.id is null then
    return jsonb_build_object('eligible', false, 'reason', 'provider_pricing_not_found');
  end if;

  if p_requested_hours < coalesce(v_offering.minimum_hours, v_pricing.minimum_hours, 1)
     or p_requested_hours > coalesce(v_offering.maximum_hours, v_pricing.maximum_hours, 24) then
    return jsonb_build_object('eligible', false, 'reason', 'requested_hours_out_of_range');
  end if;

  v_pricing_model := coalesce(v_offering.pricing_model, 'HOURLY');
  v_unit_name := v_offering.unit_name;
  v_service_mode := coalesce(v_offering.service_mode, 'IN_PERSON');
  v_session_duration_minutes := v_offering.duration_minutes;

  v_provider_price := greatest(
    coalesce(v_offering.minimum_charge, 0),
    case v_pricing_model
      when 'UNIT' then coalesce(v_offering.unit_price, 0)
      when 'FIXED' then coalesce(v_offering.fixed_price, 0)
      when 'BASE_VISIT' then coalesce(v_offering.base_visit_fee, 0)
      when 'QUOTE' then coalesce(v_offering.minimum_charge, 0)
      else coalesce(v_offering.price_per_hour, v_pricing.price_per_hour, 0) * p_requested_hours
    end
  );

  v_platform_fee := greatest(round((v_provider_price * v_platform_fee_percent)::numeric, 2), v_platform_fee_min);
  v_total_price := round((v_provider_price + v_platform_fee)::numeric, 2);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider_id', s.provider_id,
        'user_id', s.user_id,
        'full_name', s.full_name,
        'rating', s.rating,
        'rating_count', s.rating_count,
        'distance_km', s.distance_km,
        'provider_price', s.provider_price,
        'currency', s.currency,
        'score', s.score
      )
      order by s.score desc
    ),
    '[]'::jsonb
  )
  into v_visible_candidates
  from public.svc_search_providers_ranked(
    p_category_id,
    p_service_lat,
    p_service_lng,
    p_request_type,
    p_scheduled_for,
    p_requested_hours,
    10
  ) s;

  if not exists (
    select 1
    from jsonb_array_elements(v_visible_candidates) elem
    where (elem->>'provider_id')::uuid = p_provider_id
  ) then
    return jsonb_build_object('eligible', false, 'reason', 'provider_not_eligible_for_request');
  end if;

  return jsonb_build_object(
    'eligible', true,
    'provider_id', p_provider_id,
    'client_user_id', p_client_user_id,
    'provider_price', round(v_provider_price::numeric, 2),
    'platform_fee', v_platform_fee,
    'total_price', v_total_price,
    'currency', coalesce(v_offering.currency, v_pricing.currency, 'ARS'),
    'pricing_model', v_pricing_model,
    'unit_name', v_unit_name,
    'service_mode', v_service_mode,
    'offering_id', v_offering.id,
    'session_duration_minutes', v_session_duration_minutes,
    'price_label', case
      when v_pricing_model = 'UNIT' then coalesce(v_unit_name, 'sesion')
      when v_pricing_model = 'HOURLY' then 'hora'
      else lower(v_pricing_model)
    end,
    'visible_candidates', v_visible_candidates
  );
end;
$function$;

select
  'ok' as status,
  (select count(*) from public.svc_provider_document_requirements where active = true) as active_document_requirements,
  (select count(*) from public.svc_categories where 'ONLINE' = any(allowed_service_modes)) as online_categories;
