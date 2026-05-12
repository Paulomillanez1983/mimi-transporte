create table if not exists public.svc_client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  phone_number text,
  country_code text,
  phone_verified boolean not null default false,
  phone_verified_at timestamptz,
  phone_updated_at timestamptz,
  phone_last_change_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_client_profiles_phone_e164_chk
    check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint svc_client_profiles_country_code_chk
    check (country_code is null or country_code ~ '^\+[1-9][0-9]{0,3}$')
);

create table if not exists public.svc_phone_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  country_code text not null,
  channel text not null default 'sms',
  provider text not null default 'twilio_verify',
  provider_verification_sid text,
  status text not null default 'pending',
  reason text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  sent_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  ip_hash text,
  user_agent_hash text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint svc_phone_attempt_phone_e164_chk
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint svc_phone_attempt_country_code_chk
    check (country_code ~ '^\+[1-9][0-9]{0,3}$'),
  constraint svc_phone_attempt_channel_chk
    check (channel in ('sms', 'whatsapp', 'call')),
  constraint svc_phone_attempt_status_chk
    check (status in ('pending', 'sent', 'approved', 'failed', 'expired', 'cancelled', 'rate_limited'))
);

alter table public.svc_client_profiles enable row level security;
alter table public.svc_phone_verification_attempts enable row level security;

create index if not exists idx_svc_client_profiles_user_id
  on public.svc_client_profiles (user_id);

create unique index if not exists ux_svc_client_profiles_verified_phone
  on public.svc_client_profiles (phone_number)
  where phone_verified = true and phone_number is not null;

create index if not exists idx_svc_phone_attempts_user_status_created
  on public.svc_phone_verification_attempts (user_id, status, created_at desc);

create index if not exists idx_svc_phone_attempts_phone_status_created
  on public.svc_phone_verification_attempts (phone_number, status, created_at desc);

create index if not exists idx_svc_phone_attempts_expires_at
  on public.svc_phone_verification_attempts (expires_at);

drop policy if exists svc_client_profiles_select_own on public.svc_client_profiles;
create policy svc_client_profiles_select_own
on public.svc_client_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists svc_client_profiles_insert_own on public.svc_client_profiles;
create policy svc_client_profiles_insert_own
on public.svc_client_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

revoke all on table public.svc_client_profiles from anon;
revoke all on table public.svc_phone_verification_attempts from anon;
revoke insert, update, delete, truncate, references, trigger on table public.svc_client_profiles from authenticated;
revoke all on table public.svc_phone_verification_attempts from authenticated;
grant select on table public.svc_client_profiles to authenticated;
grant all on table public.svc_client_profiles to service_role;
grant all on table public.svc_phone_verification_attempts to service_role;

create or replace function public.set_updated_at_svc_client_profiles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_svc_client_profiles on public.svc_client_profiles;
create trigger trg_set_updated_at_svc_client_profiles
before update on public.svc_client_profiles
for each row execute function public.set_updated_at_svc_client_profiles();

create or replace function public.set_updated_at_svc_phone_verification_attempts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_svc_phone_verification_attempts on public.svc_phone_verification_attempts;
create trigger trg_set_updated_at_svc_phone_verification_attempts
before update on public.svc_phone_verification_attempts
for each row execute function public.set_updated_at_svc_phone_verification_attempts();
