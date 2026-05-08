-- MIMI marketplace: descubrimiento dinamico de categorias desde demanda real.
-- Idempotente y reversible: agrega metadatos y eventos, no elimina ni renombra datos existentes.

alter table public.svc_categories
  add column if not exists parent_category_id uuid references public.svc_categories(id) on delete set null,
  add column if not exists source text not null default 'system',
  add column if not exists discovery_status text not null default 'approved',
  add column if not exists auto_created boolean not null default false,
  add column if not exists created_from_query text,
  add column if not exists match_signature text,
  add column if not exists usage_count integer not null default 0,
  add column if not exists last_matched_at timestamptz;

alter table public.svc_categories
  drop constraint if exists svc_categories_source_check;

alter table public.svc_categories
  add constraint svc_categories_source_check
  check (source in ('system','admin','provider_discovery','client_discovery','import'));

alter table public.svc_categories
  drop constraint if exists svc_categories_discovery_status_check;

alter table public.svc_categories
  add constraint svc_categories_discovery_status_check
  check (discovery_status in ('approved','auto','needs_review','merged','rejected'));

create unique index if not exists svc_categories_match_signature_key
  on public.svc_categories(match_signature)
  where match_signature is not null;

create index if not exists svc_categories_parent_idx
  on public.svc_categories(parent_category_id);

create index if not exists svc_categories_discovery_status_idx
  on public.svc_categories(discovery_status, auto_created);

create table if not exists public.svc_category_discovery_events (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.svc_categories(id) on delete set null,
  parent_category_id uuid references public.svc_categories(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'provider',
  source_context text not null default 'provider_service_setup',
  query text not null,
  normalized_query text not null,
  extracted_label text,
  match_signature text,
  action text not null,
  confidence numeric not null default 0,
  matched_category_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.svc_category_discovery_events enable row level security;

drop policy if exists svc_category_discovery_events_admin_read on public.svc_category_discovery_events;
create policy svc_category_discovery_events_admin_read
on public.svc_category_discovery_events
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
  )
);

create index if not exists svc_category_discovery_events_category_idx
  on public.svc_category_discovery_events(category_id, created_at desc);

create index if not exists svc_category_discovery_events_signature_idx
  on public.svc_category_discovery_events(match_signature);

create index if not exists svc_category_discovery_events_action_idx
  on public.svc_category_discovery_events(action, created_at desc);
