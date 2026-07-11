-- Restrict integration and financial configuration tables to approved admins.
-- The backend service role still has direct access for webhook/order processing.

begin;

drop policy if exists pic_sede_read on public.pos_integration_config;
create policy pic_sede_read
on public.pos_integration_config
for select
to authenticated
using (public.auth_is_admin());

drop policy if exists pic_superadmin_write on public.pos_integration_config;
create policy pic_superadmin_write
on public.pos_integration_config
for all
to authenticated
using (public.auth_is_admin())
with check (public.auth_is_admin());

drop policy if exists fin_sede_read on public.accounting_config;
create policy fin_sede_read
on public.accounting_config
for select
to authenticated
using (public.auth_is_admin());

drop policy if exists fin_sede_read on public.location_financial_settings;
create policy fin_sede_read
on public.location_financial_settings
for select
to authenticated
using (public.auth_is_admin());

commit;
