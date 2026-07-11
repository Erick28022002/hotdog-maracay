-- Make audit logs append-only/read-only for browser-authenticated users.

begin;

revoke update, delete on table public.audit_log from authenticated;
revoke insert, update, delete on table public.clock_ins_audit from authenticated;

drop policy if exists sede_access_audit_log on public.audit_log;
drop policy if exists audit_log_sede_read on public.audit_log;
drop policy if exists audit_log_sede_insert on public.audit_log;

create policy audit_log_sede_read
on public.audit_log
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());

create policy audit_log_sede_insert
on public.audit_log
for insert
to authenticated
with check (public.auth_is_admin() or sede = public.get_my_sede());

drop policy if exists audit_solo_lectura on public.clock_ins_audit;
create policy audit_solo_lectura
on public.clock_ins_audit
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

commit;
