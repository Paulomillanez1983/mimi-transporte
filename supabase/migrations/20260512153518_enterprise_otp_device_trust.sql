create or replace function public.auth_risk_level_is_valid(value text)
returns boolean
language sql
immutable
as $$
  select value in ('low', 'medium', 'high', 'blocked')
$$;

alter table public.svc_client_profiles
  add column if not exists trusted_device boolean not null default false,
  add column if not exists trusted_until timestamptz,
  add column if not exists last_otp_sent_at timestamptz,
  add column if not exists otp_send_count integer not null default 0,
  add column if not exists otp_last_ip text,
  add column if not exists otp_last_channel text,
  add column if not exists auth_risk_level text not null default 'low',
  add column if not exists last_verified_device_id text;

alter table public.svc_provider_profiles
  add column if not exists phone_number text,
  add column if not exists phone_country_code text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_updated_at timestamptz,
  add column if not exists phone_last_change_at timestamptz,
  add column if not exists trusted_device boolean not null default false,
  add column if not exists trusted_until timestamptz,
  add column if not exists last_otp_sent_at timestamptz,
  add column if not exists otp_send_count integer not null default 0,
  add column if not exists otp_last_ip text,
  add column if not exists otp_last_channel text,
  add column if not exists auth_risk_level text not null default 'medium',
  add column if not exists last_verified_device_id text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'svc_provider_profiles_phone_e164_chk'
  ) then
    alter table public.svc_provider_profiles
      add constraint svc_provider_profiles_phone_e164_chk
      check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'svc_provider_profiles_phone_country_code_chk'
  ) then
    alter table public.svc_provider_profiles
      add constraint svc_provider_profiles_phone_country_code_chk
      check (phone_country_code is null or phone_country_code ~ '^\+[1-9][0-9]{0,3}$');
  end if;
end;
$$;

create table if not exists public.auth_device_trust (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  fingerprint_hash text not null,
  trusted boolean not null default false,
  trusted_until timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  platform text,
  app_version text,
  actor_role text not null default 'client',
  risk_level text not null default 'low',
  trust_reason text,
  metadata_json jsonb not null default '{}'::jsonb,
  constraint auth_device_trust_actor_role_chk
    check (actor_role in ('client', 'provider')),
  constraint auth_device_trust_device_id_len_chk
    check (length(device_id) between 12 and 180),
  constraint auth_device_trust_risk_level_chk
    check (public.auth_risk_level_is_valid(risk_level))
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'auth_device_trust_risk_level_chk'
  ) then
    alter table public.auth_device_trust
      drop constraint auth_device_trust_risk_level_chk;
  end if;

  alter table public.auth_device_trust
    add constraint auth_device_trust_risk_level_chk
    check (public.auth_risk_level_is_valid(risk_level));
end;
$$;

alter table public.auth_device_trust enable row level security;

create unique index if not exists ux_auth_device_trust_user_device
  on public.auth_device_trust (user_id, device_id);

create index if not exists idx_auth_device_trust_user_trusted_until
  on public.auth_device_trust (user_id, trusted, trusted_until desc);

create index if not exists idx_auth_device_trust_fingerprint
  on public.auth_device_trust (fingerprint_hash);

create index if not exists idx_auth_device_trust_last_seen
  on public.auth_device_trust (last_seen_at desc);

alter table public.svc_phone_verification_attempts
  add column if not exists actor_role text not null default 'client',
  add column if not exists provider_id uuid,
  add column if not exists purpose text not null default 'phone_verification',
  add column if not exists device_id text,
  add column if not exists fingerprint_hash text,
  add column if not exists risk_level text not null default 'medium',
  add column if not exists risk_score integer not null default 0,
  add column if not exists country_iso text,
  add column if not exists carrier text,
  add column if not exists blocked_until timestamptz,
  add column if not exists cooldown_until timestamptz;

create index if not exists idx_svc_phone_attempts_device_created
  on public.svc_phone_verification_attempts (device_id, created_at desc)
  where device_id is not null;

create index if not exists idx_svc_phone_attempts_ip_created
  on public.svc_phone_verification_attempts (ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists idx_svc_client_profiles_auth_risk
  on public.svc_client_profiles (auth_risk_level, trusted_until);

create index if not exists idx_svc_provider_profiles_auth_risk
  on public.svc_provider_profiles (auth_risk_level, trusted_until);

create unique index if not exists ux_svc_provider_profiles_verified_phone
  on public.svc_provider_profiles (phone_number)
  where phone_verified = true and phone_number is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'svc_phone_attempt_actor_role_chk'
  ) then
    alter table public.svc_phone_verification_attempts
      add constraint svc_phone_attempt_actor_role_chk
      check (actor_role in ('client', 'provider'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'svc_phone_attempt_purpose_chk'
  ) then
    alter table public.svc_phone_verification_attempts
      add constraint svc_phone_attempt_purpose_chk
      check (purpose in ('signup', 'login_new_device', 'phone_change', 'account_recovery', 'high_risk_action', 'first_real_service', 'suspicious_activity', 'phone_verification'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'svc_phone_attempt_provider_id_fkey'
  ) then
    alter table public.svc_phone_verification_attempts
      add constraint svc_phone_attempt_provider_id_fkey
      foreign key (provider_id) references public.svc_providers(id) on delete set null;
  end if;
end;
$$;

drop policy if exists auth_device_trust_select_own on public.auth_device_trust;
create policy auth_device_trust_select_own
on public.auth_device_trust
for select
to authenticated
using (auth.uid() = user_id);

revoke all on table public.auth_device_trust from anon;
revoke insert, update, delete, truncate, references, trigger on table public.auth_device_trust from authenticated;
grant select on table public.auth_device_trust to authenticated;
grant all on table public.auth_device_trust to service_role;

create or replace function public.set_updated_at_auth_device_trust()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.last_seen_at := coalesce(new.last_seen_at, now());
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_auth_device_trust on public.auth_device_trust;
create trigger trg_set_updated_at_auth_device_trust
before update on public.auth_device_trust
for each row execute function public.set_updated_at_auth_device_trust();
