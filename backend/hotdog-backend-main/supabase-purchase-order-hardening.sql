-- Restrict purchase order writes to approved admins.
-- Staff can read purchase orders for their sede, but cannot create or edit them
-- directly through the browser role.

begin;

drop policy if exists ordenes_compra_sede_access on public.ordenes_compra;
drop policy if exists ordenes_compra_sede_read on public.ordenes_compra;
drop policy if exists ordenes_compra_admin_write on public.ordenes_compra;

create policy ordenes_compra_sede_read
on public.ordenes_compra
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());

create policy ordenes_compra_admin_write
on public.ordenes_compra
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

commit;
