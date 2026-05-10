-- Fix the production completion RPC after the enterprise ledger hardening.
-- The previous implementation wrote legacy ledger entry types
-- PLATFORM_FEE / PROVIDER_EARNING while the live constraint only allows
-- PLATFORM_FEE_ACCRUAL / PROVIDER_EARNING_ACCRUAL.

create or replace function public.svc_complete_service_atomic(
  p_request_id uuid,
  p_provider_user_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request public.svc_requests%rowtype;
  v_provider_id uuid;
  v_now timestamptz := now();
begin
  select id
  into v_provider_id
  from public.svc_providers
  where user_id = p_provider_user_id;

  if not found then
    raise exception 'provider_not_found';
  end if;

  select *
  into v_request
  from public.svc_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_request.accepted_provider_id is distinct from v_provider_id then
    raise exception 'request_forbidden';
  end if;

  if v_request.status = 'COMPLETED' then
    update public.svc_providers
    set status = 'ONLINE_IDLE',
        last_seen_at = v_now
    where id = v_provider_id
      and status = 'IN_SERVICE';

    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'request_id', p_request_id,
      'provider_id', v_provider_id,
      'status', v_request.status
    );
  end if;

  if v_request.status <> 'IN_PROGRESS' then
    return jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'request_id', p_request_id,
      'provider_id', v_provider_id,
      'status', v_request.status
    );
  end if;

  update public.svc_requests
  set status = 'COMPLETED',
      completed_at = v_now,
      updated_at = v_now
  where id = p_request_id;

  update public.svc_assignments
  set status = 'COMPLETED',
      completed_at = v_now,
      updated_at = v_now
  where request_id = p_request_id
    and provider_id = v_provider_id
    and status = 'ACTIVE';

  update public.svc_providers
  set status = 'ONLINE_IDLE',
      last_seen_at = v_now
  where id = v_provider_id;

  insert into public.svc_financial_ledger (
    entry_key,
    request_id,
    provider_id,
    entry_type,
    amount,
    currency,
    metadata_json
  )
  values
    (
      'req:' || p_request_id || ':escrow',
      p_request_id,
      v_provider_id,
      'ESCROW_RELEASE',
      coalesce(v_request.total_price_snapshot, 0),
      coalesce(v_request.currency, 'ARS'),
      jsonb_build_object('source', 'svc_complete_service_atomic')
    ),
    (
      'req:' || p_request_id || ':fee',
      p_request_id,
      v_provider_id,
      'PLATFORM_FEE_ACCRUAL',
      coalesce(v_request.platform_fee_snapshot, 0),
      coalesce(v_request.currency, 'ARS'),
      jsonb_build_object('source', 'svc_complete_service_atomic')
    ),
    (
      'req:' || p_request_id || ':provider',
      p_request_id,
      v_provider_id,
      'PROVIDER_EARNING_ACCRUAL',
      coalesce(v_request.provider_price_snapshot, 0),
      coalesce(v_request.currency, 'ARS'),
      jsonb_build_object('source', 'svc_complete_service_atomic')
    );

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'provider_id', v_provider_id,
    'status', 'COMPLETED',
    'ledger_entries', 3
  );
end;
$$;

revoke execute on function public.svc_complete_service_atomic(uuid, uuid) from public;
revoke execute on function public.svc_complete_service_atomic(uuid, uuid) from anon;
revoke execute on function public.svc_complete_service_atomic(uuid, uuid) from authenticated;
grant execute on function public.svc_complete_service_atomic(uuid, uuid) to service_role;
