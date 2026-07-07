-- Run only after SUPABASE_SERVICE_ROLE_KEY is configured in Vercel and the
-- secured backend has been deployed successfully.
begin;

drop policy if exists "Permitir lectura" on public.web_orders;
drop policy if exists "Permitir insertar" on public.web_orders;
drop policy if exists "Permitir actualizar" on public.web_orders;

revoke all privileges on table public.web_orders from anon;
revoke insert, delete, truncate, references, trigger on table public.web_orders from authenticated;
grant select, update on table public.web_orders to authenticated;

create policy web_orders_staff_read
on public.web_orders
for select
to authenticated
using (public.auth_is_admin() or location = public.get_my_sede());

create policy web_orders_staff_update
on public.web_orders
for update
to authenticated
using (public.auth_is_admin() or location = public.get_my_sede())
with check (public.auth_is_admin() or location = public.get_my_sede());

commit;
