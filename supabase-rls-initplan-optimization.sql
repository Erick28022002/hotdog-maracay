-- Optimiza politicas RLS para que auth.uid(), auth.role() y helpers de sede se
-- calculen una vez por consulta en vez de por cada fila. Conserva la misma
-- logica de permisos.

alter policy sede_access_clock_ins
on public.clock_ins
using (
  (select auth.role()) = 'authenticated'
  and (
    (select public.get_my_sede()) is null
    or sede = (select public.get_my_sede())
  )
)
with check (
  (select auth.role()) = 'authenticated'
  and (
    (select public.get_my_sede()) is null
    or sede = (select public.get_my_sede())
  )
);

alter policy empleado_lee_su_perfil
on public.profiles
using (id = (select auth.uid()));

alter policy empleado_actualiza_su_perfil
on public.profiles
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

alter policy profiles_self_insert_limited
on public.profiles
with check (
  id = (select auth.uid())
  and coalesce(role, 'employee'::user_role) = 'employee'::user_role
  and coalesce(active, false) = false
  and coalesce(account_status, 'pending_approval'::text) = any (array['pending'::text, 'pending_approval'::text])
  and approved_at is null
  and approved_by is null
  and tip_employee_id is null
  and pin is null
  and employee_role is null
);

alter policy service_write_tip_attendance
on public.tip_attendance
with check ((select auth.role()) = 'service_role');

alter policy tip_attendance_admin_write
on public.tip_attendance
using (
  (select public.auth_is_admin())
  and (
    (select public.get_my_sede()) is null
    or sede = (select public.get_my_sede())
  )
)
with check (
  (select public.auth_is_admin())
  and (
    (select public.get_my_sede()) is null
    or sede = (select public.get_my_sede())
  )
);

alter policy tip_attendance_sede_read
on public.tip_attendance
using (
  (select public.auth_is_admin())
  or sede = (select public.get_my_sede())
);
