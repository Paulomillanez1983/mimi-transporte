-- MIMI provider setup: rubros y reglas para sugerencias reales desde el onboarding.
-- Seguro e idempotente: no borra datos ni renombra columnas.

alter table public.svc_categories
  add column if not exists allowed_service_modes text[] not null default array['IN_PERSON'],
  add column if not exists requires_professional_license boolean not null default false,
  add column if not exists requires_background_check boolean not null default false;

with seed(code, name, description, aliases, keywords, pricing_model, provider_quote, sort_order) as (
  values
    ('REPARACIONES_HOGAR', 'Reparaciones del hogar', 'Arreglos generales, mantenimiento y soluciones simples del hogar.', '["arreglos","mantenimiento","reparaciones","arreglo paredes"]'::jsonb, array['arreglo','arreglos','mantenimiento','pared','paredes','hogar','reparaciones'], 'QUOTE', true, 320),
    ('COLOCACION_CERAMICOS', 'Colocacion de ceramicos', 'Colocacion, reparacion y terminaciones con ceramicos.', '["ceramicos","azulejos","colocar ceramicos"]'::jsonb, array['ceramico','ceramicos','azulejo','azulejos','colocacion','colocar'], 'SQUARE_METER', false, 321),
    ('LIMPIEZA_OFICINAS', 'Limpieza de oficinas', 'Limpieza y mantenimiento de espacios comerciales u oficinas.', '["oficina","oficinas","limpieza oficinas","comercial"]'::jsonb, array['limpieza','oficina','oficinas','comercial','mantenimiento'], 'HOURLY', false, 122),
    ('ACOMPANAMIENTO_DOMICILIARIO', 'Acompanamiento domiciliario', 'Acompanamiento no medico y asistencia cotidiana a coordinar.', '["acompanante","acompanamiento","domiciliario","adultos mayores"]'::jsonb, array['acompanante','acompanamiento','domiciliario','adulto mayor','anciano','cuidador'], 'HOURLY', false, 242),
    ('PESTANAS', 'Pestanas', 'Pestanas, lifting, extensiones y servicios relacionados.', '["pestanas","pestañas","lifting","extensiones"]'::jsonb, array['pestanas','pestañas','lifting','extensiones','belleza'], 'UNIT', false, 422),
    ('MAQUILLAJE', 'Maquillaje', 'Maquillaje social, eventos y servicios de belleza.', '["maquillaje","makeup","maquilladora"]'::jsonb, array['maquillaje','makeup','maquilladora','evento','belleza'], 'UNIT', false, 423)
)
insert into public.svc_categories (
  code, name, description, aliases, search_keywords, default_pricing_model,
  requires_provider_quote, allowed_service_modes, sort_order, active
)
select
  code, name, description, aliases, keywords, pricing_model,
  provider_quote, array['IN_PERSON'], sort_order, true
from seed
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  aliases = excluded.aliases,
  search_keywords = (
    select array(
      select distinct keyword
      from unnest(coalesce(public.svc_categories.search_keywords, '{}'::text[]) || excluded.search_keywords) as keyword
    )
  ),
  default_pricing_model = excluded.default_pricing_model,
  requires_provider_quote = excluded.requires_provider_quote,
  active = true,
  updated_at = now();

with rules(code, phrase, keywords, weight) as (
  values
    ('PINTURA', 'arreglo paredes pinto hago revoques', array['pinto','pintar','pintura','pared','paredes','revoque','revoques'], 1.45),
    ('ALBANILERIA', 'arreglo paredes hago revoques', array['albanil','albanileria','pared','paredes','revoque','revoques','obra'], 1.35),
    ('REPARACIONES_HOGAR', 'arreglo paredes mantenimiento hogar', array['arreglo','arreglos','paredes','mantenimiento','hogar','reparaciones'], 1.3),
    ('COLOCACION_CERAMICOS', 'coloco ceramicos', array['ceramico','ceramicos','coloco','colocar','azulejo','azulejos'], 1.4),
    ('CUIDADO_NINOS', 'cuido ninos', array['cuido','cuidar','ninos','niños','chicos','bebe','ninera'], 1.45),
    ('CUIDADO_ADULTOS', 'cuido adultos mayores', array['adultos mayores','ancianos','cuidador','cuido','cuidar','adultos'], 1.45),
    ('ACOMPANAMIENTO_DOMICILIARIO', 'acompanamiento domiciliario adultos mayores', array['acompanamiento','acompanante','domiciliario','adultos mayores'], 1.25),
    ('LIMPIEZA', 'limpieza de casas', array['limpieza','limpiar','casas','casa','departamento','hogar'], 1.35),
    ('LIMPIEZA_OFICINAS', 'limpieza de oficinas', array['limpieza','oficina','oficinas','comercial'], 1.35),
    ('ELECTRICIDAD', 'electricista instalaciones arreglos', array['electricista','electricidad','instalaciones','instalacion','arreglos','enchufe','termica','disyuntor'], 1.5),
    ('BELLEZA', 'hago unas pestanas maquillaje', array['belleza','estetica','unas','uñas','pestanas','pestañas','maquillaje'], 1.25),
    ('MANICURIA', 'hago unas', array['unas','uñas','manicura','manicuria','esmaltado','nails'], 1.5),
    ('PESTANAS', 'hago pestanas', array['pestanas','pestañas','lifting','extensiones'], 1.45),
    ('MAQUILLAJE', 'hago maquillaje', array['maquillaje','makeup','maquilladora'], 1.45)
)
insert into public.svc_service_intent_rules (category_id, locale, phrase, keywords, weight, active)
select c.id, 'es-AR', r.phrase, r.keywords, r.weight, true
from rules r
join public.svc_categories c on c.code = r.code
where not exists (
  select 1
  from public.svc_service_intent_rules existing
  where existing.category_id = c.id
    and existing.phrase = r.phrase
    and existing.locale = 'es-AR'
);
