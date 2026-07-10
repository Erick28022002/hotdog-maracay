-- Restrict owner/contact and owner-distribution financial data to approved admins.

begin;

drop policy if exists owners_read on public.owners;
create policy owners_read
on public.owners
for select
to authenticated
using (public.auth_is_admin());

drop policy if exists lo_sede_read on public.location_owners;
create policy lo_sede_read
on public.location_owners
for select
to authenticated
using (
  public.auth_is_admin()
  and (public.get_my_sede() is null or sede = public.get_my_sede())
);

drop policy if exists ot_sede_read on public.owner_transactions;
create policy ot_sede_read
on public.owner_transactions
for select
to authenticated
using (
  public.auth_is_admin()
  and (public.get_my_sede() is null or sede = public.get_my_sede())
);

drop policy if exists cod_sede_read on public.closing_owner_distributions;
create policy cod_sede_read
on public.closing_owner_distributions
for select
to authenticated
using (
  public.auth_is_admin()
  and (public.get_my_sede() is null or sede = public.get_my_sede())
);

commit;
