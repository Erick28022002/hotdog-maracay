-- Restrict schedule writes to approved admins.
-- Staff can read the schedule for their sede, but cannot edit weekly schedule
-- assignments directly through the browser role.

begin;

drop policy if exists horario_write_authenticated on public.horario_semanal;
drop policy if exists horario_sede_read on public.horario_semanal;
drop policy if exists horario_admin_write on public.horario_semanal;

create policy horario_sede_read
on public.horario_semanal
for select
to authenticated
using (public.auth_is_admin() or sede = public.get_my_sede());

create policy horario_admin_write
on public.horario_semanal
for all
to authenticated
using (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()))
with check (public.auth_is_admin() and (public.get_my_sede() is null or sede = public.get_my_sede()));

commit;
