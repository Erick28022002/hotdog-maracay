-- Restrict provider/contact visibility by location.
-- Approved admins can see all providers; employees only see providers for
-- their assigned sede.

begin;

drop policy if exists proveedores_read on public.proveedores;
create policy proveedores_read
on public.proveedores
for select
to authenticated
using (
  public.auth_is_admin()
  or public.get_my_sede() = any(coalesce(sedes_atiende, array[]::text[]))
);

drop policy if exists prov_sede_read on public.providers;
create policy prov_sede_read
on public.providers
for select
to authenticated
using (
  public.auth_is_admin()
  or sede = public.get_my_sede()
);

commit;
