-- Remove direct anonymous access from internal public-schema tables and views.
-- The public website does not use Supabase anonymous table access; checkout uses
-- the private backend service role, and KDS/staff tools use authenticated users.

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
    execute format('revoke all privileges on table %I.%I from anon', obj.schemaname, obj.objectname);
  end loop;

  for obj in
    select schemaname, viewname as objectname
    from pg_views
    where schemaname = 'public'
  loop
    execute format('revoke all privileges on table %I.%I from anon', obj.schemaname, obj.objectname);
  end loop;
end $$;

commit;
