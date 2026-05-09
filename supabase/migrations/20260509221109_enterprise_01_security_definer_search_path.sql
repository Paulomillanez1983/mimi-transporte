-- MIMI enterprise hardening phase 01
-- Scope: pin search_path for application functions in public.
-- Risk: low. No data changes, no permission changes.
-- Rollback: ALTER FUNCTION <identity> RESET search_path;

begin;

do $$
declare
  r record;
  v_identity text;
begin
  for r in
    select
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    v_identity := format('%I.%I(%s)', r.nspname, r.proname, r.args);

    begin
      execute format(
        'alter function %s set search_path = public, pg_temp',
        v_identity
      );
    exception
      when undefined_function then
        raise notice 'Function not found while pinning search_path: %', v_identity;
      when others then
        raise notice 'Could not pin search_path for %: %', v_identity, sqlerrm;
    end;
  end loop;
end;
$$;

commit;
