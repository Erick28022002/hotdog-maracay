-- Operational safety check for critical authenticated employee flows.
-- Runs inside a transaction and rolls back every test write.
--
-- Purpose: run this after RLS/security changes before demonstrations or
-- production use. Any permission break should fail the script.

begin;

create temp table regression_context as
select id as employee_id, sede
from public.profiles
where role = 'employee'::public.user_role
  and active = true
  and account_status = 'active'
  and sede = 'nmb'
order by full_name
limit 1;

grant select on regression_context to authenticated;

do $$
begin
  if not exists (select 1 from regression_context) then
    raise exception 'No active nmb employee profile found for regression check';
  end if;
end $$;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  (select employee_id::text from regression_context),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select employee_id::text from regression_context),
    'role', 'authenticated'
  )::text,
  true
);

-- Read flows used by employee app and KDS.
select public.get_my_sede() as simulated_sede;
select count(*) as own_profile_visible from public.profiles where id = auth.uid();
select count(*) as clock_ins_visible from public.clock_ins where sede = public.get_my_sede();
select count(*) as expense_categories_visible from public.expense_categories;
select count(*) as providers_visible from public.providers;
select count(*) as proveedores_visible from public.proveedores;
select count(*) as tip_employees_visible from public.tip_employees;
select count(*) as tip_attendance_visible from public.tip_attendance;
select count(*) as payroll_records_visible from public.payroll_records;
select count(*) as schedule_visible from public.horario_semanal;
select count(*) as cierres_visible from public.cierres_caja;
select count(*) as web_orders_visible from public.web_orders where sede = public.get_my_sede();

-- Employee write flows that must keep working.
insert into public.egresos (
  sede,
  fecha,
  categoria,
  concepto,
  proveedor,
  monto,
  metodo_pago,
  recurrente,
  notas,
  usuario,
  estado,
  business_or_personal,
  paid_by,
  sin_comprobante
)
values (
  public.get_my_sede(),
  current_date,
  'prueba_permiso',
  'PRUEBA RLS - NO GUARDAR',
  'Codex Test',
  0.01,
  'manual',
  false,
  'Prueba revertida automaticamente',
  'Codex',
  'pagado',
  'negocio',
  'negocio',
  true
);

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values (
  'selfies',
  'codex-rls-test/no-guardar.jpg',
  auth.uid(),
  auth.uid()::text,
  '{"mimetype":"image/jpeg","size":1}'::jsonb
);

insert into public.clock_ins (
  empleado_email,
  empleado_nombre,
  fecha,
  hora_entrada,
  sede,
  selfie_url,
  usuario_app_id,
  origen
)
values (
  'codex-test@hotdogmaracay.com',
  'Codex Test',
  current_date,
  localtime(0),
  public.get_my_sede(),
  'selfies/codex-rls-test/no-guardar.jpg',
  auth.uid(),
  'mobile'
);

-- KDS staff update flow: status/sort_pos only, rolled back.
with target as (
  select id, status
  from public.web_orders
  where sede = public.get_my_sede()
  order by created_at desc nulls last
  limit 1
)
update public.web_orders w
set status = target.status
from target
where w.id = target.id;

select 'operational_regression_check_ok' as result;

rollback;
