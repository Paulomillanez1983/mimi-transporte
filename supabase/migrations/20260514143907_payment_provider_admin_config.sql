-- Payment provider admin configuration foundation.
-- Public schema stores only non-sensitive operational metadata.
-- Secrets must remain in Supabase Edge Function Secrets / Vault and are
-- checked by Edge Functions through Deno.env without exposing values.

create table if not exists public.payment_provider_config (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mock','mercadopago','mobbex','stripe','manual')),
  environment text not null default 'test' check (environment in ('test','production')),
  is_active boolean not null default false,
  status text not null default 'draft' check (
    status in (
      'draft',
      'active',
      'inactive',
      'missing_secrets',
      'validation_failed',
      'validated',
      'disabled_real_payments'
    )
  ),
  last_validated_at timestamptz,
  last_validation_error text,
  webhook_url text,
  metadata_public jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment)
);

create unique index if not exists payment_provider_config_one_active_per_env
  on public.payment_provider_config(environment)
  where is_active;

create index if not exists idx_payment_provider_config_active
  on public.payment_provider_config(environment, is_active, provider);

create index if not exists idx_payment_provider_config_status
  on public.payment_provider_config(status, updated_at desc);

drop trigger if exists trg_financial_set_updated_at_payment_provider_config
  on public.payment_provider_config;

create trigger trg_financial_set_updated_at_payment_provider_config
before update on public.payment_provider_config
for each row execute function public.financial_set_updated_at();

alter table public.payment_provider_config enable row level security;

drop policy if exists payment_provider_config_finance_read
  on public.payment_provider_config;

create policy payment_provider_config_finance_read
on public.payment_provider_config
for select
to authenticated
using (public.is_financial_auditor(auth.uid()) or public.is_admin_user(auth.uid()));

-- No authenticated insert/update/delete policy on purpose. Mutations go only
-- through admin-payment-provider-config using service_role plus strict role checks.
revoke all on public.payment_provider_config from public, anon;
grant select on public.payment_provider_config to authenticated;
grant all on public.payment_provider_config to service_role;

insert into public.payment_provider_config (
  provider,
  environment,
  is_active,
  status,
  webhook_url,
  metadata_public
)
values (
  'mock',
  'test',
  true,
  'active',
  null,
  jsonb_build_object(
    'payments_real_enabled', false,
    'managed_by', 'phase_payment_provider_admin_config',
    'note', 'Default test provider. Real money remains disabled.'
  )
)
on conflict (provider, environment) do update
set
  is_active = public.payment_provider_config.is_active or excluded.is_active,
  status = case
    when public.payment_provider_config.is_active then public.payment_provider_config.status
    else excluded.status
  end,
  metadata_public = public.payment_provider_config.metadata_public || excluded.metadata_public,
  updated_at = now();

insert into public.audit_financial_events (
  event_key,
  event_type,
  actor_type,
  source,
  environment,
  is_test,
  fiscal_visibility,
  metadata
)
values (
  'payment_provider_config.foundation.created.20260514143907',
  'payment_provider_config.foundation_created',
  'system',
  'migration',
  'qa',
  true,
  'excluded_from_accounting',
  jsonb_build_object(
    'table', 'payment_provider_config',
    'secrets_storage', 'supabase_edge_function_secrets_or_vault',
    'payments_real_enabled_default', false,
    'payment_provider_default', 'mock',
    'payment_environment_default', 'test'
  )
)
on conflict (event_key) do nothing;
