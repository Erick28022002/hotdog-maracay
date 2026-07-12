-- Compatibility column used by the employee app when checking whether a cash
-- closing already exists for the selected business date.

alter table public.cierres_caja
  add column if not exists cierre_at timestamp without time zone;

update public.cierres_caja
set cierre_at = coalesce(cierre_at, updated_at, created_at)
where cierre_realizado_por is not null
  and cierre_at is null;
