-- Restrict payroll and tip writes to approved admins.
-- Staff can read records for their sede, but cannot edit payroll/tip amounts or
-- employee compensation data directly from the browser role.

begin;

drop policy if exists sede_access_payroll_records on public.payroll_records;
drop policy if exists payroll_records_sede_read on public.payroll_records;
drop policy if exists payroll_records_admin_write on public.payroll_records;
create policy payroll_records_sede_read
on public.payroll_records
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy payroll_records_admin_write
on public.payroll_records
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists sede_access_tip_attendance on public.tip_attendance;
drop policy if exists tip_attendance_sede_read on public.tip_attendance;
drop policy if exists tip_attendance_admin_write on public.tip_attendance;
create policy tip_attendance_sede_read
on public.tip_attendance
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy tip_attendance_admin_write
on public.tip_attendance
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists sede_access_tip_distribution on public.tip_distribution;
drop policy if exists tip_distribution_sede_read on public.tip_distribution;
drop policy if exists tip_distribution_admin_write on public.tip_distribution;
create policy tip_distribution_sede_read
on public.tip_distribution
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy tip_distribution_admin_write
on public.tip_distribution
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists sede_access_tip_employees on public.tip_employees;
drop policy if exists tip_employees_sede_read on public.tip_employees;
drop policy if exists tip_employees_admin_write on public.tip_employees;
create policy tip_employees_sede_read
on public.tip_employees
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy tip_employees_admin_write
on public.tip_employees
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

drop policy if exists sede_access_tip_pool_weeks on public.tip_pool_weeks;
drop policy if exists tip_pool_weeks_sede_read on public.tip_pool_weeks;
drop policy if exists tip_pool_weeks_admin_write on public.tip_pool_weeks;
create policy tip_pool_weeks_sede_read
on public.tip_pool_weeks
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());
create policy tip_pool_weeks_admin_write
on public.tip_pool_weeks
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

commit;
