-- Controlled E2E admin fixture for MIMI Servicios.
-- This is intentionally not a production migration. Run manually only for the
-- dedicated test auth user below.

insert into public.admin_users (
  user_id,
  email,
  role,
  active
)
select
  u.id,
  u.email,
  'ADMIN',
  true
from auth.users u
where u.id = '7fb288d5-3b74-4884-a7f1-67060f783020'
  and lower(u.email) = lower('admintest@mimi-go.app')
on conflict (user_id) do update
set email = excluded.email,
    role = 'ADMIN',
    active = true,
    updated_at = now();

select
  au.user_id,
  au.email,
  au.role,
  au.active,
  public.is_admin_user(au.user_id) as is_admin
from public.admin_users au
where au.user_id = '7fb288d5-3b74-4884-a7f1-67060f783020';
