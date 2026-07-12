-- Allow active, assigned employees to register manual expenses for their own
-- location. Admin users keep their existing broader write policy.

begin;

drop policy if exists egresos_employee_insert on public.egresos;

create policy egresos_employee_insert
on public.egresos
for insert
to authenticated
with check (
  (select public.auth_is_admin())
  or (
    (select public.get_my_sede()) <> '__no_sede__'
    and sede = (select public.get_my_sede())
  )
);

commit;
