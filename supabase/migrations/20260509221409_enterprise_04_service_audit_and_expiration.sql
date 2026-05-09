-- MIMI enterprise hardening phase 04
-- Scope: service audit trail and stale request/offer expiration worker.
-- Risk: medium. Adds triggers/functions; does not remove data.

begin;

create index if not exists idx_svc_request_events_event_type_created_at
on public.svc_request_events (event_type, created_at desc);

create or replace function public.svc_log_request_event(
  p_request_id uuid,
  p_event_type text,
  p_actor_user_id uuid default null,
  p_provider_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  if p_request_id is null then
    raise exception 'request_id_required';
  end if;

  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event_type_required';
  end if;

  insert into public.svc_request_events (
    request_id,
    actor_user_id,
    provider_id,
    event_type,
    metadata
  )
  values (
    p_request_id,
    p_actor_user_id,
    p_provider_id,
    lower(trim(p_event_type)),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.svc_audit_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_provider_id uuid;
begin
  if tg_op = 'INSERT' then
    perform public.svc_log_request_event(
      new.id,
      'request_created',
      new.client_user_id,
      coalesce(new.accepted_provider_id, new.selected_provider_id),
      jsonb_build_object(
        'status', new.status,
        'request_type', new.request_type,
        'created_via', new.created_via
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_provider_id := coalesce(new.accepted_provider_id, new.selected_provider_id, old.accepted_provider_id, old.selected_provider_id);

    if new.status = 'IN_PROGRESS' then
      perform public.svc_log_request_event(
        new.id,
        'request_started',
        null,
        v_provider_id,
        jsonb_build_object('from_status', old.status, 'to_status', new.status)
      );
    elsif new.status = 'COMPLETED' then
      perform public.svc_log_request_event(
        new.id,
        'request_completed',
        null,
        v_provider_id,
        jsonb_build_object('from_status', old.status, 'to_status', new.status)
      );
    elsif new.status = 'CANCELLED' then
      perform public.svc_log_request_event(
        new.id,
        'request_cancelled',
        case when new.cancelled_by = 'CLIENT' then new.client_user_id else null end,
        v_provider_id,
        jsonb_build_object(
          'from_status', old.status,
          'to_status', new.status,
          'cancelled_by', new.cancelled_by,
          'reason', new.cancellation_reason
        )
      );
    elsif new.status = 'PROVIDER_EN_ROUTE' then
      perform public.svc_log_request_event(
        new.id,
        'request_provider_en_route',
        null,
        v_provider_id,
        jsonb_build_object('from_status', old.status, 'to_status', new.status)
      );
    elsif new.status = 'PROVIDER_ARRIVED' then
      perform public.svc_log_request_event(
        new.id,
        'request_provider_arrived',
        null,
        v_provider_id,
        jsonb_build_object('from_status', old.status, 'to_status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.svc_audit_offer_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_type text;
begin
  if tg_op = 'INSERT' then
    perform public.svc_log_request_event(
      new.request_id,
      'offer_created',
      null,
      new.provider_id,
      jsonb_build_object(
        'offer_id', new.id,
        'status', new.status,
        'expires_at', new.expires_at
      )
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_event_type := case new.status
      when 'ACCEPTED' then 'offer_accepted'
      when 'REJECTED' then 'offer_rejected'
      when 'EXPIRED' then 'offer_expired'
      when 'CANCELLED' then 'offer_cancelled'
      else null
    end;

    if v_event_type is not null then
      perform public.svc_log_request_event(
        new.request_id,
        v_event_type,
        null,
        new.provider_id,
        jsonb_build_object(
          'offer_id', new.id,
          'from_status', old.status,
          'to_status', new.status,
          'expires_at', new.expires_at,
          'responded_at', new.responded_at
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_svc_requests_audit_lifecycle on public.svc_requests;
create trigger trg_svc_requests_audit_lifecycle
after insert or update of status on public.svc_requests
for each row
execute function public.svc_audit_request_lifecycle();

drop trigger if exists trg_svc_request_offers_audit_lifecycle on public.svc_request_offers;
create trigger trg_svc_request_offers_audit_lifecycle
after insert or update of status on public.svc_request_offers
for each row
execute function public.svc_audit_offer_lifecycle();

create or replace function public.svc_expire_stale_service_requests(
  p_limit integer default 200
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_offers_expired integer := 0;
  v_requests_expired integer := 0;
begin
  with stale_offers as (
    select o.id
    from public.svc_request_offers o
    where o.status = 'PENDING'
      and o.expires_at is not null
      and o.expires_at < v_now
    order by o.expires_at asc
    for update skip locked
    limit v_limit
  ),
  updated_offers as (
    update public.svc_request_offers o
    set status = 'EXPIRED',
        responded_at = coalesce(o.responded_at, v_now),
        updated_at = v_now
    from stale_offers s
    where o.id = s.id
      and o.status = 'PENDING'
    returning o.id
  )
  select count(*) into v_offers_expired from updated_offers;

  with stale_requests as (
    select r.id
    from public.svc_requests r
    where r.status in ('SEARCHING', 'PENDING_PROVIDER_RESPONSE')
      and (
        (r.provider_response_deadline_at is not null and r.provider_response_deadline_at < v_now)
        or not exists (
          select 1
          from public.svc_request_offers o
          where o.request_id = r.id
            and o.status = 'PENDING'
        )
      )
    order by r.created_at asc
    for update skip locked
    limit v_limit
  ),
  updated_requests as (
    update public.svc_requests r
    set status = 'CANCELLED',
        cancelled_at = coalesce(r.cancelled_at, v_now),
        cancelled_by = coalesce(r.cancelled_by, 'ADMIN'),
        cancellation_reason = coalesce(r.cancellation_reason, 'provider_response_expired'),
        provider_response_deadline_at = null,
        updated_at = v_now
    from stale_requests s
    where r.id = s.id
      and r.status in ('SEARCHING', 'PENDING_PROVIDER_RESPONSE')
    returning r.id, r.selected_provider_id, r.accepted_provider_id
  ),
  logged_expirations as (
    insert into public.svc_request_events (
      request_id,
      provider_id,
      event_type,
      metadata
    )
    select
      u.id,
      coalesce(u.accepted_provider_id, u.selected_provider_id),
      'request_expired',
      jsonb_build_object('reason', 'provider_response_expired')
    from updated_requests u
    returning id
  )
  select count(*) into v_requests_expired from logged_expirations;

  return jsonb_build_object(
    'ok', true,
    'offers_expired', v_offers_expired,
    'requests_expired', v_requests_expired,
    'ran_at', v_now
  );
end;
$$;

revoke execute on function public.svc_log_request_event(uuid,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.svc_log_request_event(uuid,text,uuid,uuid,jsonb) to service_role;

revoke execute on function public.svc_expire_stale_service_requests(integer) from public, anon, authenticated;
grant execute on function public.svc_expire_stale_service_requests(integer) to service_role;

-- Trigger functions should not be called via PostgREST.
revoke execute on function public.svc_audit_request_lifecycle() from public, anon, authenticated;
revoke execute on function public.svc_audit_offer_lifecycle() from public, anon, authenticated;
grant execute on function public.svc_audit_request_lifecycle() to service_role;
grant execute on function public.svc_audit_offer_lifecycle() to service_role;

commit;
