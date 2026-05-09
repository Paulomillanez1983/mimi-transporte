-- MIMI enterprise hardening phase 03
-- Scope: RLS and grants for push_tokens, svc_provider_intents, service event
-- visibility, and dangerous driver document storage policies.
-- Risk: medium. Run QA before/after with real client/provider/admin users.

begin;

-- 1) push_tokens: no anonymous access, authenticated owner/admin only.
revoke all on table public.push_tokens from anon;
revoke delete, truncate, references, trigger on table public.push_tokens from authenticated;
grant select, insert, update on table public.push_tokens to authenticated;
grant all on table public.push_tokens to service_role;

drop policy if exists "allow insert push tokens" on public.push_tokens;
drop policy if exists "allow select push tokens" on public.push_tokens;
drop policy if exists "allow update push tokens" on public.push_tokens;
drop policy if exists push_tokens_insert_own on public.push_tokens;
drop policy if exists push_tokens_select_own_or_admin on public.push_tokens;
drop policy if exists push_tokens_update_own_or_admin on public.push_tokens;

create policy push_tokens_insert_own
on public.push_tokens
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and token is not null
);

create policy push_tokens_select_own_or_admin
on public.push_tokens
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
);

create policy push_tokens_update_own_or_admin
on public.push_tokens
for update
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or public.is_admin_user((select auth.uid()))
);

-- 2) svc_provider_intents may exist only in remote semantic migrations.
do $$
begin
  if to_regclass('public.svc_provider_intents') is not null then
    revoke all on table public.svc_provider_intents from anon;
    revoke delete, truncate, references, trigger on table public.svc_provider_intents from authenticated;
    grant select, insert, update on table public.svc_provider_intents to authenticated;
    grant all on table public.svc_provider_intents to service_role;

    execute 'drop policy if exists providers_own_intents on public.svc_provider_intents';
    execute 'drop policy if exists svc_provider_intents_select_own_or_admin on public.svc_provider_intents';
    execute 'drop policy if exists svc_provider_intents_insert_own on public.svc_provider_intents';
    execute 'drop policy if exists svc_provider_intents_update_own_or_admin on public.svc_provider_intents';

    execute $sql$
      create policy svc_provider_intents_select_own_or_admin
      on public.svc_provider_intents
      for select
      to authenticated
      using (
        provider_id in (
          select p.id from public.svc_providers p where p.user_id = (select auth.uid())
        )
        or public.is_admin_user((select auth.uid()))
      )
    $sql$;

    execute $sql$
      create policy svc_provider_intents_insert_own
      on public.svc_provider_intents
      for insert
      to authenticated
      with check (
        provider_id in (
          select p.id from public.svc_providers p where p.user_id = (select auth.uid())
        )
      )
    $sql$;

    execute $sql$
      create policy svc_provider_intents_update_own_or_admin
      on public.svc_provider_intents
      for update
      to authenticated
      using (
        provider_id in (
          select p.id from public.svc_providers p where p.user_id = (select auth.uid())
        )
        or public.is_admin_user((select auth.uid()))
      )
      with check (
        provider_id in (
          select p.id from public.svc_providers p where p.user_id = (select auth.uid())
        )
        or public.is_admin_user((select auth.uid()))
      )
    $sql$;
  end if;
end;
$$;

-- 3) svc_request_events: participant/admin read only, writes by backend.
revoke all on table public.svc_request_events from anon;
revoke insert, update, delete, truncate, references, trigger on table public.svc_request_events from authenticated;
grant select on table public.svc_request_events to authenticated;
grant all on table public.svc_request_events to service_role;

drop policy if exists svc_request_events_read_participants_or_admin on public.svc_request_events;

create policy svc_request_events_read_participants_or_admin
on public.svc_request_events
for select
to authenticated
using (
  public.svc_is_request_participant(request_id, (select auth.uid()))
  or public.is_admin_user((select auth.uid()))
);

-- 4) Storage driver-documents: remove bucket-wide policies. Keep folder-owner
-- and admin policies that were already created elsewhere.
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "Allow read own documents" on storage.objects';
    execute 'drop policy if exists "Allow update own documents" on storage.objects';
    execute 'drop policy if exists "Allow upload own documents" on storage.objects';
    execute 'drop policy if exists driver_documents_storage_insert on storage.objects';
    execute 'drop policy if exists driver_documents_storage_select on storage.objects';
    execute 'drop policy if exists driver_documents_storage_update on storage.objects';
  end if;
end;
$$;

commit;
