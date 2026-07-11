-- Remove direct DELETE privileges from browser-authenticated users.
-- Destructive data removal should go through service-role backend code or
-- tightly reviewed admin procedures, not directly from the browser role.

begin;

do $$
declare
  obj record;
begin
  for obj in
    select schemaname, tablename as objectname
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke delete on table %I.%I from authenticated', obj.schemaname, obj.objectname);
  end loop;

  for obj in
    select schemaname, viewname as objectname
    from pg_views
    where schemaname = 'public'
  loop
    execute format('revoke delete on table %I.%I from authenticated', obj.schemaname, obj.objectname);
  end loop;
end $$;

commit;
