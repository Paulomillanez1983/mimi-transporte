-- Phase 2D ownership verification follow-up:
-- service-role-only RPC used by verify-provider-payout-account to update
-- provider KYC tax hash fields without storing plaintext CUIT/CUIL.

create or replace function public.provider_kyc_tax_id_admin_update(
  p_provider_id uuid,
  p_provider_user_id uuid,
  p_tax_hash text,
  p_tax_last4 text,
  p_tax_masked text,
  p_source text default 'finance_admin_verified_kyc',
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  notes_internal text,
  kyc_tax_id_last4 text,
  kyc_tax_id_masked text,
  kyc_tax_id_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_provider_id is null and p_provider_user_id is null then
    raise exception 'provider_required' using errcode = '22023';
  end if;

  if p_tax_hash is null or p_tax_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'kyc_tax_hash_invalid' using errcode = '22023';
  end if;

  if p_tax_last4 is null or p_tax_last4 !~ '^[0-9]{4}$' then
    raise exception 'kyc_tax_last4_invalid' using errcode = '22023';
  end if;

  if p_tax_masked is null or length(p_tax_masked) < 5 or p_tax_masked !~ '^\*+[0-9]{4}$' then
    raise exception 'kyc_tax_masked_invalid' using errcode = '22023';
  end if;

  -- The svc_providers trigger intentionally blocks direct KYC tax writes.
  -- This RPC is service-role-only and sets the local claim expected by that
  -- trigger for this transaction, without exposing plaintext tax data.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
  update public.svc_providers sp
  set
    kyc_tax_id_hash = p_tax_hash,
    kyc_tax_id_last4 = p_tax_last4,
    kyc_tax_id_masked = p_tax_masked,
    kyc_tax_id_status = 'verified',
    kyc_tax_id_verified_at = now(),
    kyc_tax_id_source = coalesce(nullif(p_source, ''), 'finance_admin_verified_kyc'),
    kyc_tax_id_metadata = coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  where
    (p_provider_id is not null and sp.id = p_provider_id)
    or (p_provider_user_id is not null and sp.user_id = p_provider_user_id)
  returning
    sp.id,
    sp.user_id,
    sp.email,
    sp.notes_internal,
    sp.kyc_tax_id_last4,
    sp.kyc_tax_id_masked,
    sp.kyc_tax_id_status;

  if not found then
    raise exception 'provider_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.provider_kyc_tax_id_admin_update(uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.provider_kyc_tax_id_admin_update(uuid, uuid, text, text, text, text, jsonb) from anon;
revoke all on function public.provider_kyc_tax_id_admin_update(uuid, uuid, text, text, text, text, jsonb) from authenticated;
grant execute on function public.provider_kyc_tax_id_admin_update(uuid, uuid, text, text, text, text, jsonb) to service_role;

comment on function public.provider_kyc_tax_id_admin_update(uuid, uuid, text, text, text, text, jsonb)
is 'Service-role-only KYC tax hash updater for payout account ownership verification. Does not accept or store plaintext CUIT/CUIL.';
