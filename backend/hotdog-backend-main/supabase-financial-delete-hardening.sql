-- Prevent browser-authenticated users from deleting financial operating records.
-- Normal SELECT/INSERT/UPDATE flows remain governed by each table's RLS policy.

begin;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'bank_deposits',
    'cash_reconciliations',
    'cierres_caja',
    'delivery_platform_entries',
    'egresos',
    'financial_validation_issues',
    'platform_deductions',
    'reconciliation_adjustments',
    'ventas_diarias',
    'weekly_closings',
    'zelle_income_records'
  ]
  loop
    execute format('revoke delete on table public.%I from authenticated', tbl);
  end loop;
end $$;

commit;
