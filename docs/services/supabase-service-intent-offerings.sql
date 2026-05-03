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
    ('PINTURA', 'quiero pintar el living', array['pintar','living','pared','pintor'], 9),
    ('PINTURA', 'tengo humedad en una pared', array['humedad','pared','pintura','pintor'], 8),
    ('JARDINERIA', 'quiero cortar el pasto', array['pasto','cortar','jardinero'], 9),
    ('JARDINERIA', 'necesito limpiar el jardin', array['jardin','poda','maleza','plantas','pasto'], 8),
    ('ENFERMERIA', 'necesito un enfermero', array['enfermero','enfermera','salud','cuidado'], 9),
    ('ENFERMERIA', 'un familiar enfermo necesita asistencia', array['familiar','enfermo','enfermera','medicacion','curacion'], 9),
    ('CUIDADO_ADULTOS', 'necesito cuidar a un adulto mayor', array['adulto mayor','anciano','abuelo','cuidador','acompanante'], 9),
    ('CUIDADO_NINOS', 'necesito una ninera', array['ninera','nino','nina','bebe','cuidar chico'], 9),
    ('ELECTRICIDAD', 'no tengo luz', array['luz','termica','disyuntor','electricista','corto'], 9),
    ('ELECTRICIDAD', 'se quemo un enchufe', array['enchufe','cable','electricidad','electricista'], 8),
    ('GASISTA', 'siento olor a gas', array['gas','olor','gasista','matriculado','calefon'], 10),
    ('INSTALACION_AIRE', 'quiero instalar un aire acondicionado', array['aire','split','instalar','acondicionado'], 9),
    ('REFRIGERACION', 'la heladera no enfria', array['heladera','freezer','no enfria','refrigeracion'], 9),
    ('LIMPIEZA', 'necesito limpiar mi casa', array['limpieza','casa','departamento','oficina','mucama'], 8),
    ('CERRAJERIA', 'me quede afuera sin llave', array['llave','cerradura','cerrajero','puerta','abrir'], 9),
    ('MUDANZAS', 'necesito hacer una mudanza', array['mudanza','flete','muebles','cajas','traslado'], 9),
    ('TECNICO_PC', 'mi computadora no funciona', array['computadora','pc','notebook','impresora','virus'], 9),
    ('TECNOLOGIA', 'necesito configurar el wifi', array['wifi','router','internet','camara','smart tv'], 8),
    ('CARPINTERIA', 'necesito arreglar un mueble', array['mueble','madera','carpintero','placard','puerta'], 8),
    ('ALBANILERIA', 'necesito un albanil', array['albanil','obra','cemento','pared','construccion'], 8),
    ('MASCOTAS', 'necesito pasear mi perro', array['perro','gato','mascota','paseador','cuidado'], 8),
    ('PELUQUERIA', 'necesito un corte de pelo', array['pelo','cabello','corte','peluquero','peinado'], 8),
    ('MANICURIA', 'necesito arreglarme las unas', array['unas','manicura','manicuria','esmaltado'], 8),
    ('MASAJISTA', 'me duele la espalda', array['masaje','contractura','espalda','dolor','masajista'], 8)
) as seed(code, phrase, keywords, weight)
join public.svc_categories c on c.code = seed.code
where not exists (
  select 1
  from public.svc_service_intent_rules r
  where r.category_id = c.id
    and lower(r.phrase) = lower(seed.phrase)
);

update public.svc_categories
set
  default_pricing_model = seed.default_pricing_model,
  requires_provider_quote = seed.requires_provider_quote,
  search_keywords = array(
    select distinct keyword
    from unnest(coalesce(public.svc_categories.search_keywords, '{}'::text[]) || seed.search_keywords) as keyword
  )
from (
  values
    ('PLOMERIA', 'HOURLY', false, array['plomero','cano','caneria','perdida','fuga','agua','griferia']),
    ('ELECTRICIDAD', 'HOURLY', false, array['electricista','luz','enchufe','termica','disyuntor','cable']),
    ('LIMPIEZA', 'HOURLY', false, array['limpieza','mucama','casa','departamento','oficina']),
    ('JARDINERIA', 'SQUARE_METER', false, array['jardinero','pasto','cesped','poda','jardin','maleza']),
    ('PINTURA', 'SQUARE_METER', false, array['pintor','pintura','pintar','pared','living','humedad']),
    ('MUDANZAS', 'QUOTE', true, array['mudanza','flete','muebles','cajas','traslado']),
    ('HERRERIA', 'QUOTE', true, array['herrero','reja','porton','soldadura','metal']),
    ('GOMERIA_MOVIL', 'BASE_VISIT', false, array['gomero','pinchadura','rueda','cubierta','neumatico','auxilio']),
    ('MECANICA_MOVIL', 'BASE_VISIT', false, array['mecanico','auto','bateria','motor','no arranca']),
    ('CERRAJERIA', 'BASE_VISIT', false, array['cerrajero','llave','cerradura','puerta']),
    ('GASISTA', 'HOURLY', false, array['gasista','gas','calefon','cocina','estufa']),
    ('INSTALACION_AIRE', 'FIXED', false, array['aire acondicionado','split','instalar aire','mantenimiento aire']),
    ('REFRIGERACION', 'BASE_VISIT', false, array['heladera','freezer','refrigeracion','no enfria']),
    ('ENFERMERIA', 'HOURLY', false, array['enfermero','enfermera','curacion','medicacion','salud']),
    ('CUIDADO_ADULTOS', 'HOURLY', false, array['adulto mayor','anciano','cuidador','acompanante']),
    ('CUIDADO_NINOS', 'HOURLY', false, array['ninera','nino','nina','bebe','cuidado infantil'])
) as seed(code, default_pricing_model, requires_provider_quote, search_keywords)
where public.svc_categories.code = seed.code;
