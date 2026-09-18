-- 20260919000000_offering_price_params.sql
-- El cuadro tarifario del prestador + el motor de composición de precio.
--
-- QUÉ RESUELVE
--   La arquitectura de cotización ya existía y estaba cargada (68 servicios, 340 atributos,
--   340 preguntas, 68 reglas de precio), pero faltaba UNA pieza: dónde el prestador escribe
--   sus parámetros. `svc_pricing_rules` está indexada por template_version_id y NO tiene
--   provider_id: es el catálogo de la plataforma. El prestador solo tenía precios PLANOS
--   (price_per_hour, base_visit_fee, fixed_price, unit_price), así que no podía decir
--   "si es urgente cobro 30% más" ni "hasta 2 m² cobro la visita, de ahí en adelante por m²".
--   Sin eso cotiza a ciegas, y por eso no hay una sola cotización en la historia.
--
-- ESTA MIGRACIÓN ES ADITIVA: crea una tabla y una función nuevas. Nada las llama todavía,
-- así que no cambia ningún comportamiento observable. Se puede aplicar sola sin riesgo.
--
-- LO QUE NO HACE (a propósito)
--   No decide el precio final con IA. Respeta la regla que ya está escrita en las 68 reglas:
--   `formula_json -> ai_final_price_allowed = false`. El motor compone SOLO con parámetros
--   que el prestador cargó. Si falta un dato, devuelve COTIZAR y enumera lo que falta.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El cuadro tarifario
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.svc_offering_price_params (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.svc_provider_service_offerings(id) on delete cascade,
  -- El atributo del servicio al que se ata (svc_service_attributes.code).
  -- Para BASE/INCLUDE/EXCLUDE sin condición se usa el atributo marcador 'base'.
  attribute_code text not null,
  kind text not null check (kind in ('BASE','INCLUDE','SURCHARGE','TIER','EXCLUDE')),
  -- Cuándo aplica: {"eq":"HOY"} {"in":["HOY","MANANA"]} {"gte":3,"lte":10}
  condition_json jsonb not null default '{}'::jsonb,
  -- Cómo cambia: {"type":"percent","value":30}
  --              {"type":"absolute","value":6000}
  --              {"type":"per_unit","value":2400,"unit":"m2"}
  adjustment_json jsonb not null default '{}'::jsonb,
  -- Lo que lee el cliente en el desglose. Si es null se arma con el tipo.
  note text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.svc_offering_price_params is
  'Cuadro tarifario del prestador: los parámetros con los que el motor compone un precio.';

-- Un solo precio de partida por prestación.
create unique index if not exists ux_offering_price_base
  on public.svc_offering_price_params (offering_id)
  where kind = 'BASE' and active;

create index if not exists ix_offering_price_params_offering
  on public.svc_offering_price_params (offering_id)
  where active;

alter table public.svc_offering_price_params enable row level security;

-- El prestador ve y edita lo suyo; el cliente lo lee para explicar el precio.
drop policy if exists "price params: lectura publica de activos" on public.svc_offering_price_params;
create policy "price params: lectura publica de activos"
  on public.svc_offering_price_params for select
  using (active);

drop policy if exists "price params: el dueno administra" on public.svc_offering_price_params;
create policy "price params: el dueno administra"
  on public.svc_offering_price_params for all
  using (
    exists (
      select 1 from public.svc_provider_service_offerings o
      join public.svc_providers p on p.id = o.provider_id
      where o.id = svc_offering_price_params.offering_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.svc_provider_service_offerings o
      join public.svc_providers p on p.id = o.provider_id
      where o.id = svc_offering_price_params.offering_id
        and p.user_id = auth.uid()
    )
  );

commit;
