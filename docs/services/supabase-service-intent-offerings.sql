-- MIMI Servicios - Intent resolver + flexible provider offerings
-- Project: xrphpqmutvadjrucqicn
-- Purpose:
-- 1. Resolve free-text client needs into service categories/professions.
-- 2. Let providers publish concrete jobs with pricing models beyond hourly.
-- 3. Keep MIMI as technology/intermediation platform, not service provider.

create extension if not exists pg_trgm with schema extensions;

alter table public.svc_categories
  add column if not exists aliases jsonb not null default '[]'::jsonb,
  add column if not exists search_keywords text[] not null default '{}'::text[],
  add column if not exists default_pricing_model text not null default 'HOURLY',
  add column if not exists requires_provider_quote boolean not null default false;

alter table public.svc_categories
  drop constraint if exists svc_categories_default_pricing_model_check;

alter table public.svc_categories
  add constraint svc_categories_default_pricing_model_check
  check (
    default_pricing_model in (
      'HOURLY',
      'BASE_VISIT',
      'QUOTE',
      'FIXED',
      'UNIT',
      'SQUARE_METER',
      'LINEAR_METER'
    )
  );

create table if not exists public.svc_service_intent_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.svc_categories(id) on delete cascade,
  locale text not null default 'es-AR',
  phrase text not null,
  keywords text[] not null default '{}'::text[],
  weight numeric not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_provider_service_offerings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  category_id uuid not null references public.svc_categories(id) on delete restrict,
  title text not null,
  description text,
  pricing_model text not null default 'HOURLY',
  currency text not null default 'ARS',
  price_per_hour numeric,
  base_visit_fee numeric,
  fixed_price numeric,
  unit_name text,
  unit_price numeric,
  minimum_charge numeric not null default 0,
  minimum_hours integer,
  maximum_hours integer,
  quote_required boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_provider_service_offerings_pricing_model_check
    check (
      pricing_model in (
        'HOURLY',
        'BASE_VISIT',
        'QUOTE',
        'FIXED',
        'UNIT',
        'SQUARE_METER',
        'LINEAR_METER'
      )
    ),
  constraint svc_provider_service_offerings_amounts_check
    check (
      coalesce(price_per_hour, 0) >= 0
      and coalesce(base_visit_fee, 0) >= 0
      and coalesce(fixed_price, 0) >= 0
      and coalesce(unit_price, 0) >= 0
      and coalesce(minimum_charge, 0) >= 0
    )
);

create index if not exists svc_categories_search_keywords_idx
  on public.svc_categories using gin (search_keywords);

create index if not exists svc_categories_name_trgm_idx
  on public.svc_categories using gin (name gin_trgm_ops);

create index if not exists svc_service_intent_rules_category_idx
  on public.svc_service_intent_rules(category_id)
  where active = true;

create index if not exists svc_service_intent_rules_keywords_idx
  on public.svc_service_intent_rules using gin (keywords);

create index if not exists svc_provider_service_offerings_provider_idx
  on public.svc_provider_service_offerings(provider_id)
  where active = true;

create index if not exists svc_provider_service_offerings_category_idx
  on public.svc_provider_service_offerings(category_id)
  where active = true;

alter table public.svc_service_intent_rules enable row level security;
alter table public.svc_provider_service_offerings enable row level security;

drop policy if exists "svc_service_intent_rules_read_active" on public.svc_service_intent_rules;
create policy "svc_service_intent_rules_read_active"
on public.svc_service_intent_rules
for select
to anon, authenticated
using (active = true);

drop policy if exists "svc_provider_service_offerings_read_active" on public.svc_provider_service_offerings;
create policy "svc_provider_service_offerings_read_active"
on public.svc_provider_service_offerings
for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1
    from public.svc_providers p
    where p.id = svc_provider_service_offerings.provider_id
      and p.approved = true
      and p.blocked = false
  )
);

drop policy if exists "svc_provider_service_offerings_provider_insert" on public.svc_provider_service_offerings;
create policy "svc_provider_service_offerings_provider_insert"
on public.svc_provider_service_offerings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.svc_providers p
    where p.id = provider_id
      and p.user_id = auth.uid()
      and p.blocked = false
  )
);

drop policy if exists "svc_provider_service_offerings_provider_update" on public.svc_provider_service_offerings;
create policy "svc_provider_service_offerings_provider_update"
on public.svc_provider_service_offerings
for update
to authenticated
using (
  exists (
    select 1
    from public.svc_providers p
    where p.id = provider_id
      and p.user_id = auth.uid()
      and p.blocked = false
  )
)
with check (
  exists (
    select 1
    from public.svc_providers p
    where p.id = provider_id
      and p.user_id = auth.uid()
      and p.blocked = false
  )
);

drop policy if exists "svc_provider_service_offerings_provider_delete" on public.svc_provider_service_offerings;
create policy "svc_provider_service_offerings_provider_delete"
on public.svc_provider_service_offerings
for delete
to authenticated
using (
  exists (
    select 1
    from public.svc_providers p
    where p.id = provider_id
      and p.user_id = auth.uid()
      and p.blocked = false
  )
);

create or replace function public.svc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_svc_service_intent_rules_updated_at on public.svc_service_intent_rules;
create trigger trg_svc_service_intent_rules_updated_at
before update on public.svc_service_intent_rules
for each row execute function public.svc_touch_updated_at();

drop trigger if exists trg_svc_provider_service_offerings_updated_at on public.svc_provider_service_offerings;
create trigger trg_svc_provider_service_offerings_updated_at
before update on public.svc_provider_service_offerings
for each row execute function public.svc_touch_updated_at();

insert into public.svc_categories (
  code,
  name,
  description,
  active,
  aliases,
  search_keywords,
  default_pricing_model,
  requires_provider_quote
)
values
  (
    'GOMERIA_MOVIL',
    'Gomeria movil',
    'Auxilio por pinchadura, cambio de rueda y reparaciones simples.',
    true,
    '["gomero","pinchadura","rueda","cubierta","neumatico","auxilio"]'::jsonb,
    array['gomero','pinchadura','rueda','cubierta','neumatico','auxilio','se pincho la rueda'],
    'BASE_VISIT',
    false
  ),
  (
    'MECANICA_MOVIL',
    'Mecanica movil',
    'Diagnostico, auxilio mecanico y reparaciones simples en sitio.',
    true,
    '["mecanico","auto no arranca","bateria","motor","auxilio mecanico"]'::jsonb,
    array['mecanico','auto','bateria','motor','no arranca','auxilio mecanico','mecanica movil'],
    'BASE_VISIT',
    false
  ),
  (
    'HERRERIA',
    'Herreria',
    'Rejas, portones, soldaduras, estructuras y presupuestos.',
    true,
    '["herrero","reja","porton","soldadura","estructura metalica"]'::jsonb,
    array['herrero','herreria','reja','porton','soldadura','metal','estructura metalica'],
    'QUOTE',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  active = true,
  aliases = excluded.aliases,
  search_keywords = excluded.search_keywords,
  default_pricing_model = excluded.default_pricing_model,
  requires_provider_quote = excluded.requires_provider_quote,
  updated_at = now();

insert into public.svc_service_intent_rules (category_id, phrase, keywords, weight)
select c.id, seed.phrase, seed.keywords, seed.weight
from (
  values
    ('GOMERIA_MOVIL', 'se pincho la rueda', array['pincho','rueda','cubierta','neumatico'], 10),
    ('GOMERIA_MOVIL', 'necesito una gomeria movil', array['gomeria','gomero','auxilio','rueda'], 10),
    ('GOMERIA_MOVIL', 'cambiar una rueda del auto', array['cambiar','rueda','auto'], 9),
    ('MECANICA_MOVIL', 'el auto no arranca', array['auto','no arranca','bateria','motor'], 10),
    ('MECANICA_MOVIL', 'necesito un mecanico', array['mecanico','mecanica','auto'], 9),
    ('MECANICA_MOVIL', 'me quede tirado con el auto', array['tirado','auto','auxilio','mecanico'], 9),
    ('HERRERIA', 'necesito una reja', array['reja','herrero','herreria'], 10),
    ('HERRERIA', 'hacer un porton', array['porton','metal','soldadura','herrero'], 9),
    ('HERRERIA', 'soldar una estructura', array['soldar','soldadura','estructura','metal'], 8),
    ('PLOMERIA', 'se pincho un cano', array['cano','agua','perdida','plomero'], 10),
    ('PINTURA', 'quiero pintar la casa', array['pintar','pintura','casa','pared'], 9),
    ('JARDINERIA', 'quiero cortar el pasto', array['pasto','cortar','jardinero'], 9),
    ('ENFERMERIA', 'necesito un enfermero', array['enfermero','enfermera','salud','cuidado'], 9)
) as seed(code, phrase, keywords, weight)
join public.svc_categories c on c.code = seed.code
where not exists (
  select 1
  from public.svc_service_intent_rules r
  where r.category_id = c.id
    and lower(r.phrase) = lower(seed.phrase)
);
