-- MIMI Servicios: PIN validation and text-free reputation.
-- This migration extends the existing svc_requests/svc_reviews model instead of
-- creating parallel job/rating tables, keeping the current production flow stable.

alter table public.svc_requests
  add column if not exists service_pin_hash text,
  add column if not exists service_pin_ciphertext text,
  add column if not exists service_pin_expires_at timestamptz,
  add column if not exists service_pin_attempts integer not null default 0,
  add column if not exists service_pin_locked_until timestamptz,
  add column if not exists service_pin_verified_at timestamptz;

create index if not exists idx_svc_requests_pin_waiting
  on public.svc_requests (accepted_provider_id, status, service_pin_expires_at)
  where service_pin_hash is not null
    and status in ('ACCEPTED','SCHEDULED','PROVIDER_EN_ROUTE','PROVIDER_ARRIVED');

alter table public.svc_reviews
  add column if not exists stars integer;

update public.svc_reviews
set stars = rating
where stars is null
  and rating is not null;

alter table public.svc_reviews
  alter column stars set not null;

alter table public.svc_reviews
  drop constraint if exists svc_reviews_stars_check;

alter table public.svc_reviews
  add constraint svc_reviews_stars_check check (stars between 1 and 5);

alter table public.svc_reviews
  drop column if exists comment;

drop function if exists public.svc_accept_offer_atomic(uuid, uuid);

create or replace function public.svc_accept_offer_atomic(
  p_offer_id uuid,
  p_provider_user_id uuid,
  p_pin_hash text default null,
  p_pin_ciphertext text default null,
  p_pin_expires_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_offer record;
  v_request record;
  v_provider record;
  v_now timestamptz := now();
  v_assignment_id uuid;
  v_conversation_id uuid;
  v_new_request_status text;
begin
  select *
  into v_provider
  from public.svc_providers
  where user_id = p_provider_user_id
  limit 1;

  if v_provider is null then
    raise exception 'provider_not_found';
  end if;

  if coalesce(v_provider.approved, false) is not true or coalesce(v_provider.blocked, false) is true then
    raise exception 'provider_not_allowed';
  end if;

  select *
  into v_offer
  from public.svc_request_offers
  where id = p_offer_id
  for update;

  if v_offer is null then
    raise exception 'offer_not_found';
  end if;

  if v_offer.provider_id <> v_provider.id then
    raise exception 'offer_forbidden';
  end if;

  if v_offer.status <> 'PENDING' then
    return jsonb_build_object('ok', true, 'already_processed', true, 'reason', 'offer_not_pending');
  end if;

  if v_offer.expires_at is not null and v_offer.expires_at < v_now then
    update public.svc_request_offers
    set status = 'EXPIRED',
        responded_at = v_now,
        updated_at = v_now
    where id = v_offer.id
      and status = 'PENDING';

    return jsonb_build_object('ok', false, 'error', 'offer_expired');
  end if;

  select *
  into v_request
  from public.svc_requests
  where id = v_offer.request_id
  for update;

  if v_request is null then
    raise exception 'request_not_found';
  end if;

  if v_request.status not in ('SEARCHING', 'PENDING_PROVIDER_RESPONSE', 'SCHEDULED') then
    return jsonb_build_object('ok', true, 'already_processed', true, 'reason', 'request_not_assignable');
  end if;

  if exists (
    select 1
    from public.svc_assignments a
    where a.request_id = v_request.id
      and a.status = 'ACTIVE'
  ) then
    return jsonb_build_object('ok', true, 'already_processed', true, 'reason', 'assignment_already_exists');
  end if;

  v_new_request_status := case
    when v_request.request_type = 'SCHEDULED' then 'SCHEDULED'
    else 'ACCEPTED'
  end;

  update public.svc_request_offers
  set status = 'ACCEPTED',
      responded_at = v_now,
      updated_at = v_now
  where id = v_offer.id
    and status = 'PENDING';

  update public.svc_request_offers
  set status = 'CANCELLED',
      responded_at = v_now,
      updated_at = v_now
  where request_id = v_request.id
    and id <> v_offer.id
    and status = 'PENDING';

  insert into public.svc_assignments (
    request_id,
    provider_id,
    status,
    assigned_at
  )
  values (
    v_request.id,
    v_provider.id,
    'ACTIVE',
    v_now
  )
  on conflict do nothing
  returning id into v_assignment_id;

  if v_assignment_id is null then
    return jsonb_build_object('ok', true, 'already_processed', true, 'reason', 'assignment_conflict');
  end if;

  update public.svc_requests
  set status = v_new_request_status,
      accepted_provider_id = v_provider.id,
      accepted_at = v_now,
      provider_response_deadline_at = null,
      service_pin_hash = coalesce(p_pin_hash, service_pin_hash),
      service_pin_ciphertext = coalesce(p_pin_ciphertext, service_pin_ciphertext),
      service_pin_expires_at = coalesce(p_pin_expires_at, service_pin_expires_at),
      service_pin_attempts = 0,
      service_pin_locked_until = null,
      service_pin_verified_at = null,
      updated_at = v_now
  where id = v_request.id;

  insert into public.svc_conversations (
    request_id,
    client_user_id,
    provider_user_id,
    status
  )
  values (
    v_request.id,
    v_request.client_user_id,
    p_provider_user_id,
    'OPEN'
  )
  on conflict (request_id)
  do update set
    provider_user_id = excluded.provider_user_id
  returning id into v_conversation_id;

  perform public.svc_log_request_event(
    v_request.id,
    'service_pin_generated',
    p_provider_user_id,
    v_provider.id,
    jsonb_build_object(
      'pin_expires_at', coalesce(p_pin_expires_at, v_now + interval '2 hours'),
      'pin_storage', case when p_pin_hash is null then 'not_generated' else 'hash_and_ciphertext' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'accepted', true,
    'request_id', v_request.id,
    'provider_id', v_provider.id,
    'assignment_id', v_assignment_id,
    'conversation_id', v_conversation_id,
    'request_status', v_new_request_status,
    'pin_required', p_pin_hash is not null
  );
end;
$function$;

revoke execute on function public.svc_accept_offer_atomic(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.svc_accept_offer_atomic(uuid, uuid, text, text, timestamptz)
  to service_role;
