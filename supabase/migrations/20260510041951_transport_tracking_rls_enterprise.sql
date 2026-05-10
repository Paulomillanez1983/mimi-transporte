-- Enterprise transport tracking hardening.
-- Allows live driver tracking only for the assigned driver, trip client and admins.

alter table if exists public.viaje_tracking enable row level security;

revoke all on table public.viaje_tracking from anon;
grant select, insert on table public.viaje_tracking to authenticated;
grant all on table public.viaje_tracking to service_role;

drop policy if exists viaje_tracking_select_participants_or_admin on public.viaje_tracking;
drop policy if exists viaje_tracking_insert_assigned_driver on public.viaje_tracking;

create policy viaje_tracking_select_participants_or_admin
on public.viaje_tracking
for select
to authenticated
using (
  exists (
    select 1
    from public.viajes v
    where v.id = viaje_tracking.viaje_id
      and (
        v.cliente_auth_id = (select auth.uid())
        or exists (
          select 1
          from public.choferes c
          where c.user_id = (select auth.uid())
            and (
              c.id_uuid = viaje_tracking.chofer_id_uuid
              or c.id_uuid = v.chofer_id_uuid
              or c.id_uuid = v.assigned_driver_id
            )
        )
        or public.is_admin_user((select auth.uid()))
      )
  )
);

create policy viaje_tracking_insert_assigned_driver
on public.viaje_tracking
for insert
to authenticated
with check (
  exists (
    select 1
    from public.choferes c
    join public.viajes v
      on v.id = viaje_tracking.viaje_id
    where c.user_id = (select auth.uid())
      and c.id_uuid = viaje_tracking.chofer_id_uuid
      and (
        v.chofer_id_uuid = c.id_uuid
        or v.assigned_driver_id = c.id_uuid
      )
      and upper(coalesce(v.estado, '')) in (
        'ASIGNADO',
        'ACEPTADO',
        'EN_CAMINO',
        'EN_ORIGEN',
        'EN_CURSO',
        'ARRIVED',
        'PROVIDER_EN_ROUTE',
        'PROVIDER_ARRIVED'
      )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'viaje_tracking'
  ) then
    execute 'alter publication supabase_realtime add table public.viaje_tracking';
  end if;
end $$;
