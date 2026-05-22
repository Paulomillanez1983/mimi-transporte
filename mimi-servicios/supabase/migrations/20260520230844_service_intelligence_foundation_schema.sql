-- Service Intelligence Foundation - schema only.
--
-- Additive foundation for a versioned service catalog, dynamic questions,
-- pricing rules, quotes, discovery, regulated-service safeguards, and
-- feature flags. This migration intentionally does not activate any public UI
-- or pricing/AI flow.
--
-- Out of scope: Transporte, Mercado Pago, payment-webhook, payments,
-- historical requests, provider wallet, notifications, login, and existing
-- provider publication write path.

begin;

create table if not exists public.svc_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  scope text not null default 'global'
    check (scope in ('global', 'client', 'provider', 'admin', 'system')),
  description text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_service_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid null references public.svc_categories(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  macro_vertical text not null,
  service_family text not null,
  default_pricing_model text not null default 'QUOTE'
    check (default_pricing_model in ('HOURLY', 'FIXED', 'BASE_VISIT', 'SQUARE_METER', 'UNIT', 'SESSION', 'DAILY', 'QUOTE', 'VARIABLE')),
  default_quote_required boolean not null default true,
  regulated_level text not null default 'none'
    check (regulated_level in ('none', 'low', 'regulated', 'restricted')),
  sensitive_level text not null default 'none'
    check (sensitive_level in ('none', 'low', 'medium', 'high', 'critical')),
  requires_admin_approval boolean not null default false,
  requires_credentials boolean not null default false,
  default_question_strategy text not null default 'OPTIONAL_REFINEMENT'
    check (default_question_strategy in ('NO_QUESTION', 'OPTIONAL_REFINEMENT', 'REQUIRED_BEFORE_PRICE', 'REQUIRED_BEFORE_RESULTS', 'SAFETY_GATE')),
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_service_templates_slug_unique unique (slug)
);

create table if not exists public.svc_service_template_versions (
  id uuid primary key default gen_random_uuid(),
  service_template_id uuid not null references public.svc_service_templates(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'deprecated')),
  title text not null,
  description text,
  pricing_model text not null default 'QUOTE'
    check (pricing_model in ('HOURLY', 'FIXED', 'BASE_VISIT', 'SQUARE_METER', 'UNIT', 'SESSION', 'DAILY', 'QUOTE', 'VARIABLE')),
  quote_required_default boolean not null default true,
  question_strategy_default text not null default 'OPTIONAL_REFINEMENT'
    check (question_strategy_default in ('NO_QUESTION', 'OPTIONAL_REFINEMENT', 'REQUIRED_BEFORE_PRICE', 'REQUIRED_BEFORE_RESULTS', 'SAFETY_GATE')),
  metadata_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_service_template_versions_unique unique (service_template_id, version_number)
);

create table if not exists public.svc_service_attributes (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.svc_service_template_versions(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  data_type text not null
    check (data_type in ('text', 'number', 'boolean', 'enum', 'date', 'time', 'file', 'location')),
  unit text,
  required boolean not null default false,
  affects_price boolean not null default false,
  affects_matching boolean not null default false,
  can_be_extracted_from_text boolean not null default true,
  ask_only_if_missing boolean not null default true,
  enum_options jsonb not null default '[]'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint svc_service_attributes_code_unique unique (template_version_id, code)
);

create table if not exists public.svc_service_questions (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.svc_service_template_versions(id) on delete cascade,
  attribute_id uuid null references public.svc_service_attributes(id) on delete set null,
  question_text text not null,
  helper_text text,
  answer_type text not null
    check (answer_type in ('text', 'number', 'boolean', 'enum', 'date', 'time', 'file', 'location')),
  required boolean not null default false,
  question_strategy text not null default 'optional_refinement'
    check (question_strategy in ('blocking', 'optional_refinement', 'safety', 'price_only')),
  show_if_json jsonb not null default '{}'::jsonb,
  risk_check_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.svc_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.svc_service_template_versions(id) on delete cascade,
  pricing_model text not null
    check (pricing_model in ('HOURLY', 'FIXED', 'BASE_VISIT', 'SQUARE_METER', 'UNIT', 'SESSION', 'DAILY', 'QUOTE', 'VARIABLE')),
  rule_type text not null default 'base'
    check (rule_type in ('base', 'multiplier', 'addon', 'minimum', 'maximum', 'quote_gate', 'commission_preview')),
  condition_json jsonb not null default '{}'::jsonb,
  formula_json jsonb not null default '{}'::jsonb,
  min_price numeric(12,2),
  max_price numeric(12,2),
  currency text not null default 'ARS',
  quote_if_missing_attributes boolean not null default true,
  quote_if_low_confidence boolean not null default true,
  allow_search_without_full_price boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_provider_offering_attribute_values (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  offering_id uuid not null references public.svc_provider_service_offerings(id) on delete cascade,
  service_template_id uuid null references public.svc_service_templates(id) on delete set null,
  template_version_id uuid null references public.svc_service_template_versions(id) on delete set null,
  attribute_id uuid not null references public.svc_service_attributes(id) on delete restrict,
  value_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_provider_offering_attribute_values_unique unique (provider_id, offering_id, attribute_id)
);

create table if not exists public.svc_provider_offering_addons (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  offering_id uuid not null references public.svc_provider_service_offerings(id) on delete cascade,
  name text not null,
  description text,
  addon_code text,
  price numeric(12,2) not null default 0,
  pricing_model text not null default 'FIXED'
    check (pricing_model in ('FIXED', 'UNIT', 'HOURLY', 'SQUARE_METER', 'QUOTE')),
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_quote_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid null references public.svc_requests(id) on delete set null,
  client_id uuid,
  provider_id uuid null references public.svc_providers(id) on delete set null,
  service_template_id uuid null references public.svc_service_templates(id) on delete set null,
  template_version_id uuid null references public.svc_service_template_versions(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'sent_to_provider', 'quoted', 'accepted', 'declined', 'expired', 'cancelled')),
  input_snapshot jsonb not null default '{}'::jsonb,
  required_variables_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_quote_offers (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.svc_quote_requests(id) on delete cascade,
  provider_id uuid not null references public.svc_providers(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  description text,
  scope_json jsonb not null default '{}'::jsonb,
  conditions_json jsonb not null default '{}'::jsonb,
  valid_until timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.svc_quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.svc_quote_requests(id) on delete cascade,
  actor_user_id uuid,
  event_type text not null,
  previous_snapshot jsonb not null default '{}'::jsonb,
  new_snapshot jsonb not null default '{}'::jsonb,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.svc_intent_resolution_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  client_id uuid,
  raw_text text,
  detected_category_id uuid null references public.svc_categories(id) on delete set null,
  detected_service_template_id uuid null references public.svc_service_templates(id) on delete set null,
  confidence numeric(5,4),
  question_strategy text not null default 'OPTIONAL_REFINEMENT'
    check (question_strategy in ('NO_QUESTION', 'OPTIONAL_REFINEMENT', 'REQUIRED_BEFORE_PRICE', 'REQUIRED_BEFORE_RESULTS', 'SAFETY_GATE')),
  resolution_source text not null
    check (resolution_source in ('rules', 'ai', 'hybrid', 'admin')),
  variables_json jsonb not null default '{}'::jsonb,
  questions_json jsonb not null default '[]'::jsonb,
  suggested_result_mode text not null default 'show_results'
    check (suggested_result_mode in ('show_results', 'show_results_with_refinements', 'quote', 'safety_gate')),
  safety_flags_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.svc_pricing_decision_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid null references public.svc_requests(id) on delete set null,
  provider_id uuid null references public.svc_providers(id) on delete set null,
  offering_id uuid null references public.svc_provider_service_offerings(id) on delete set null,
  service_template_id uuid null references public.svc_service_templates(id) on delete set null,
  template_version_id uuid null references public.svc_service_template_versions(id) on delete set null,
  input_variables_json jsonb not null default '{}'::jsonb,
  pricing_rule_ids jsonb not null default '[]'::jsonb,
  provider_price numeric(12,2),
  platform_fee numeric(12,2),
  total_price numeric(12,2),
  quote_required boolean not null default true,
  pricing_confidence numeric(5,4),
  decision_source text not null default 'rules'
    check (decision_source in ('rules', 'ai_assisted', 'hybrid', 'manual_quote', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.svc_service_discovery_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  source text not null
    check (source in ('client_text', 'provider_text', 'admin', 'ai')),
  raw_text text not null,
  suggested_macro_vertical text,
  suggested_category_name text,
  suggested_service_name text,
  matched_existing_template_id uuid null references public.svc_service_templates(id) on delete set null,
  status text not null default 'new'
    check (status in ('new', 'duplicate', 'approved', 'rejected', 'merged')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.svc_regulated_service_requirements (
  id uuid primary key default gen_random_uuid(),
  service_template_id uuid null references public.svc_service_templates(id) on delete cascade,
  template_version_id uuid null references public.svc_service_template_versions(id) on delete cascade,
  requirement_type text not null
    check (requirement_type in ('credential', 'license', 'jurisdiction', 'admin_review', 'disclaimer', 'emergency_block', 'manual_quote')),
  requirement_label text not null,
  required_document_type text,
  jurisdiction_required boolean not null default false,
  admin_approval_required boolean not null default false,
  emergency_disclaimer_required boolean not null default false,
  blocks_auto_pricing boolean not null default false,
  blocks_results_without_disclaimer boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.svc_provider_service_offerings
  add column if not exists service_template_id uuid;

alter table public.svc_provider_service_offerings
  add column if not exists service_template_version_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'svc_provider_service_offerings_service_template_id_fkey'
      and conrelid = 'public.svc_provider_service_offerings'::regclass
  ) then
    alter table public.svc_provider_service_offerings
      add constraint svc_provider_service_offerings_service_template_id_fkey
      foreign key (service_template_id)
      references public.svc_service_templates(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'svc_provider_service_offerings_service_template_version_id_fkey'
      and conrelid = 'public.svc_provider_service_offerings'::regclass
  ) then
    alter table public.svc_provider_service_offerings
      add constraint svc_provider_service_offerings_service_template_version_id_fkey
      foreign key (service_template_version_id)
      references public.svc_service_template_versions(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_svc_service_templates_category on public.svc_service_templates(category_id);
create index if not exists idx_svc_service_templates_active_family on public.svc_service_templates(is_active, macro_vertical, service_family);
create index if not exists idx_svc_service_template_versions_active on public.svc_service_template_versions(service_template_id, status, version_number desc);
create index if not exists idx_svc_service_attributes_version on public.svc_service_attributes(template_version_id, sort_order);
create index if not exists idx_svc_service_questions_version on public.svc_service_questions(template_version_id, sort_order);
create index if not exists idx_svc_pricing_rules_version_active on public.svc_pricing_rules(template_version_id, is_active);
create index if not exists idx_svc_provider_attr_values_offering on public.svc_provider_offering_attribute_values(provider_id, offering_id);
create index if not exists idx_svc_provider_addons_offering on public.svc_provider_offering_addons(provider_id, offering_id, is_active);
create index if not exists idx_svc_quote_requests_status on public.svc_quote_requests(status, created_at desc);
create index if not exists idx_svc_quote_offers_request on public.svc_quote_offers(quote_request_id, status);
create index if not exists idx_svc_quote_events_request on public.svc_quote_events(quote_request_id, created_at desc);
create index if not exists idx_svc_intent_resolution_events_created on public.svc_intent_resolution_events(created_at desc);
create index if not exists idx_svc_pricing_decision_events_created on public.svc_pricing_decision_events(created_at desc);
create index if not exists idx_svc_service_discovery_events_status on public.svc_service_discovery_events(status, created_at desc);
create index if not exists idx_svc_regulated_requirements_template on public.svc_regulated_service_requirements(service_template_id, template_version_id);
create index if not exists idx_svc_provider_offerings_template on public.svc_provider_service_offerings(service_template_id, service_template_version_id);

alter table public.svc_feature_flags enable row level security;
alter table public.svc_service_templates enable row level security;
alter table public.svc_service_template_versions enable row level security;
alter table public.svc_service_attributes enable row level security;
alter table public.svc_service_questions enable row level security;
alter table public.svc_pricing_rules enable row level security;
alter table public.svc_provider_offering_attribute_values enable row level security;
alter table public.svc_provider_offering_addons enable row level security;
alter table public.svc_quote_requests enable row level security;
alter table public.svc_quote_offers enable row level security;
alter table public.svc_quote_events enable row level security;
alter table public.svc_intent_resolution_events enable row level security;
alter table public.svc_pricing_decision_events enable row level security;
alter table public.svc_service_discovery_events enable row level security;
alter table public.svc_regulated_service_requirements enable row level security;

grant select on table
  public.svc_feature_flags,
  public.svc_service_templates,
  public.svc_service_template_versions,
  public.svc_service_attributes,
  public.svc_service_questions,
  public.svc_pricing_rules,
  public.svc_regulated_service_requirements
to anon, authenticated;

grant insert, update, delete on table
  public.svc_feature_flags,
  public.svc_service_templates,
  public.svc_service_template_versions,
  public.svc_service_attributes,
  public.svc_service_questions,
  public.svc_pricing_rules,
  public.svc_regulated_service_requirements
to authenticated;

grant select on table
  public.svc_provider_offering_attribute_values,
  public.svc_provider_offering_addons,
  public.svc_quote_requests,
  public.svc_quote_offers,
  public.svc_quote_events,
  public.svc_intent_resolution_events,
  public.svc_pricing_decision_events,
  public.svc_service_discovery_events
to authenticated;

grant insert on table public.svc_service_discovery_events to authenticated;
grant update, delete on table public.svc_service_discovery_events to authenticated;

grant all privileges on table
  public.svc_feature_flags,
  public.svc_service_templates,
  public.svc_service_template_versions,
  public.svc_service_attributes,
  public.svc_service_questions,
  public.svc_pricing_rules,
  public.svc_provider_offering_attribute_values,
  public.svc_provider_offering_addons,
  public.svc_quote_requests,
  public.svc_quote_offers,
  public.svc_quote_events,
  public.svc_intent_resolution_events,
  public.svc_pricing_decision_events,
  public.svc_service_discovery_events,
  public.svc_regulated_service_requirements
to service_role;

drop policy if exists svc_feature_flags_public_read on public.svc_feature_flags;
create policy svc_feature_flags_public_read
on public.svc_feature_flags
for select
to anon, authenticated
using (true);

drop policy if exists svc_feature_flags_admin_all on public.svc_feature_flags;
create policy svc_feature_flags_admin_all
on public.svc_feature_flags
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_service_templates_public_read_active on public.svc_service_templates;
create policy svc_service_templates_public_read_active
on public.svc_service_templates
for select
to anon, authenticated
using (is_active = true);

drop policy if exists svc_service_templates_admin_all on public.svc_service_templates;
create policy svc_service_templates_admin_all
on public.svc_service_templates
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_service_template_versions_public_read_active on public.svc_service_template_versions;
create policy svc_service_template_versions_public_read_active
on public.svc_service_template_versions
for select
to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.svc_service_templates t
    where t.id = svc_service_template_versions.service_template_id
      and t.is_active = true
  )
);

drop policy if exists svc_service_template_versions_admin_all on public.svc_service_template_versions;
create policy svc_service_template_versions_admin_all
on public.svc_service_template_versions
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_service_attributes_public_read_active on public.svc_service_attributes;
create policy svc_service_attributes_public_read_active
on public.svc_service_attributes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.svc_service_template_versions v
    join public.svc_service_templates t on t.id = v.service_template_id
    where v.id = svc_service_attributes.template_version_id
      and v.status = 'active'
      and t.is_active = true
  )
);

drop policy if exists svc_service_attributes_admin_all on public.svc_service_attributes;
create policy svc_service_attributes_admin_all
on public.svc_service_attributes
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_service_questions_public_read_active on public.svc_service_questions;
create policy svc_service_questions_public_read_active
on public.svc_service_questions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.svc_service_template_versions v
    join public.svc_service_templates t on t.id = v.service_template_id
    where v.id = svc_service_questions.template_version_id
      and v.status = 'active'
      and t.is_active = true
  )
);

drop policy if exists svc_service_questions_admin_all on public.svc_service_questions;
create policy svc_service_questions_admin_all
on public.svc_service_questions
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_pricing_rules_public_read_active on public.svc_pricing_rules;
create policy svc_pricing_rules_public_read_active
on public.svc_pricing_rules
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.svc_service_template_versions v
    join public.svc_service_templates t on t.id = v.service_template_id
    where v.id = svc_pricing_rules.template_version_id
      and v.status = 'active'
      and t.is_active = true
  )
);

drop policy if exists svc_pricing_rules_admin_all on public.svc_pricing_rules;
create policy svc_pricing_rules_admin_all
on public.svc_pricing_rules
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_regulated_requirements_public_read_active on public.svc_regulated_service_requirements;
create policy svc_regulated_requirements_public_read_active
on public.svc_regulated_service_requirements
for select
to anon, authenticated
using (
  (
    service_template_id is not null
    and exists (
      select 1 from public.svc_service_templates t
      where t.id = svc_regulated_service_requirements.service_template_id
        and t.is_active = true
    )
  )
  or (
    template_version_id is not null
    and exists (
      select 1
      from public.svc_service_template_versions v
      join public.svc_service_templates t on t.id = v.service_template_id
      where v.id = svc_regulated_service_requirements.template_version_id
        and v.status = 'active'
        and t.is_active = true
    )
  )
);

drop policy if exists svc_regulated_requirements_admin_all on public.svc_regulated_service_requirements;
create policy svc_regulated_requirements_admin_all
on public.svc_regulated_service_requirements
for all
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_provider_attr_values_provider_select on public.svc_provider_offering_attribute_values;
create policy svc_provider_attr_values_provider_select
on public.svc_provider_offering_attribute_values
for select
to authenticated
using (
  provider_id = svc_get_provider_id_by_user(auth.uid())
  or is_admin_user(auth.uid())
);

drop policy if exists svc_provider_addons_provider_select on public.svc_provider_offering_addons;
create policy svc_provider_addons_provider_select
on public.svc_provider_offering_addons
for select
to authenticated
using (
  provider_id = svc_get_provider_id_by_user(auth.uid())
  or is_admin_user(auth.uid())
);

drop policy if exists svc_quote_requests_admin_select on public.svc_quote_requests;
create policy svc_quote_requests_admin_select
on public.svc_quote_requests
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_quote_offers_admin_select on public.svc_quote_offers;
create policy svc_quote_offers_admin_select
on public.svc_quote_offers
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_quote_events_admin_select on public.svc_quote_events;
create policy svc_quote_events_admin_select
on public.svc_quote_events
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_intent_resolution_events_admin_select on public.svc_intent_resolution_events;
create policy svc_intent_resolution_events_admin_select
on public.svc_intent_resolution_events
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_pricing_decision_events_admin_select on public.svc_pricing_decision_events;
create policy svc_pricing_decision_events_admin_select
on public.svc_pricing_decision_events
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_service_discovery_events_admin_select on public.svc_service_discovery_events;
create policy svc_service_discovery_events_admin_select
on public.svc_service_discovery_events
for select
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_service_discovery_events_admin_write on public.svc_service_discovery_events;
create policy svc_service_discovery_events_admin_write
on public.svc_service_discovery_events
for update
to authenticated
using (is_admin_user(auth.uid()))
with check (is_admin_user(auth.uid()));

drop policy if exists svc_service_discovery_events_admin_delete on public.svc_service_discovery_events;
create policy svc_service_discovery_events_admin_delete
on public.svc_service_discovery_events
for delete
to authenticated
using (is_admin_user(auth.uid()));

drop policy if exists svc_service_discovery_events_actor_select on public.svc_service_discovery_events;
create policy svc_service_discovery_events_actor_select
on public.svc_service_discovery_events
for select
to authenticated
using (actor_user_id = auth.uid());

drop policy if exists svc_service_discovery_events_authenticated_insert_flagged on public.svc_service_discovery_events;
create policy svc_service_discovery_events_authenticated_insert_flagged
on public.svc_service_discovery_events
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and source in ('client_text', 'provider_text')
  and length(raw_text) between 3 and 2000
  and exists (
    select 1
    from public.svc_feature_flags f
    where f.key = 'MIMI_SERVICE_DISCOVERY_ENABLED'
      and f.enabled = true
  )
);

comment on table public.svc_service_templates is 'Versioned service catalog master templates. Seed rows are not the boundary of the marketplace.';
comment on table public.svc_service_template_versions is 'Published/draft/deprecated versions of service template definitions used for immutable request snapshots.';
comment on table public.svc_pricing_rules is 'Backend-only pricing rule definitions. AI may suggest variables but must not invent final prices.';
comment on table public.svc_regulated_service_requirements is 'Requirements and safeguards for sensitive or regulated services.';
comment on table public.svc_feature_flags is 'Runtime flags. Service Intelligence flags default to disabled.';

commit;

-- Manual rollback outline, not executed:
-- 1. Drop policies created in this migration.
-- 2. Drop optional columns service_template_id/service_template_version_id from
--    svc_provider_service_offerings only if no production data depends on them.
-- 3. Drop Service Intelligence tables in reverse dependency order.
-- This rollback must not touch historical requests, payments, Transporte, or
-- existing provider publication audit events.
