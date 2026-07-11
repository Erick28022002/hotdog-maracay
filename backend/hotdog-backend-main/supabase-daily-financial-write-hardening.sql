-- Restrict daily financial write access to approved admins.
-- Staff can read daily sales/cash/Zelle records for their sede, but cannot edit
-- financial totals directly through the browser role.

begin;

drop policy if exists sede_access_cierres_caja on public.cierres_caja;
drop policy if exists cierres_caja_sede_read on public.cierres_caja;
drop policy if exists cierres_caja_admin_write on public.cierres_caja;
create policy cierres_caja_sede_read
on public.cierres_caja
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy cierres_caja_admin_write
on public.cierres_caja
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists sede_access_ventas on public.ventas_diarias;
drop policy if exists ventas_diarias_sede_read on public.ventas_diarias;
drop policy if exists ventas_diarias_admin_write on public.ventas_diarias;
create policy ventas_diarias_sede_read
on public.ventas_diarias
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy ventas_diarias_admin_write
on public.ventas_diarias
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists zelle_sede_isolation on public.zelle_income_records;
drop policy if exists zelle_income_sede_read on public.zelle_income_records;
drop policy if exists zelle_income_admin_write on public.zelle_income_records;
create policy zelle_income_sede_read
on public.zelle_income_records
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy zelle_income_admin_write
on public.zelle_income_records
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

commit;
