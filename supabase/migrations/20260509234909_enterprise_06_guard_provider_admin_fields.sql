-- MIMI enterprise hardening phase 06
-- Scope: protect admin-only columns in svc_providers from self-update abuse.
-- Rationale: RLS allows providers to update their own profile, but approved,
-- blocked and internal notes must remain admin/backend-controlled.

begin;

create or replace function public.svc_guard_provider_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_uid uuid := auth.uid();
  v_is_privileged boolean := false;
begin
  v_is_privileged :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or v_role = 'service_role'
    or public.is_admin_user(v_uid);

  if v_is_privileged then
    return new;
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'provider_approved_admin_only' using errcode = '42501';
  end if;

  if new.blocked is distinct from old.blocked then
    raise exception 'provider_blocked_admin_only' using errcode = '42501';
  end if;

  if new.notes_internal is distinct from old.notes_internal then
    raise exception 'provider_notes_internal_admin_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_svc_providers_guard_admin_fields on public.svc_providers;
create trigger trg_svc_providers_guard_admin_fields
before update on public.svc_providers
for each row
execute function public.svc_guard_provider_admin_fields();

revoke execute on function public.svc_guard_provider_admin_fields() from public, anon, authenticated;
grant execute on function public.svc_guard_provider_admin_fields() to service_role;

commit;
