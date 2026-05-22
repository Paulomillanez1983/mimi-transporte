begin;

alter table public.svc_provider_service_change_events
  drop constraint if exists svc_provider_service_change_events_change_type_check;

alter table public.svc_provider_service_change_events
  add constraint svc_provider_service_change_events_change_type_check
  check (
    change_type = any (
      array[
        'created'::text,
        'updated'::text,
        'activated'::text,
        'deactivated'::text,
        'price_changed'::text,
        'deleted_soft'::text,
        'reactivated'::text
      ]
    )
  );

commit;
