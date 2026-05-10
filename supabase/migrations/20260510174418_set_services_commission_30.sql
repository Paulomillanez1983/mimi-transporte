-- Enterprise pricing rule for MIMI Servicios.
-- The provider defines their own amount. MIMI GO adds a 30% platform fee to
-- the amount shown/charged to the client.
do $$
begin
  if to_regclass('public.commission_rules') is not null then
    update public.commission_rules
       set percentage = 30,
           minimum_fee = 0,
           fixed_fee = 0,
           rounding = 'round',
           active = true
     where service_type = 'DEFAULT';

    if not exists (
      select 1
        from public.commission_rules
       where service_type = 'DEFAULT'
    ) then
      insert into public.commission_rules (
        service_type,
        percentage,
        minimum_fee,
        fixed_fee,
        rounding,
        active
      )
      values ('DEFAULT', 30, 0, 0, 'round', true);
    end if;
  end if;
end $$;
