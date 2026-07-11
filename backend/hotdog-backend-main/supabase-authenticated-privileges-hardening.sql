-- Remove schema-administration table privileges from browser-authenticated users.
-- RLS still controls row access for normal SELECT/INSERT/UPDATE/DELETE flows.

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
    execute format(
      'revoke truncate, references, trigger on table %I.%I from authenticated',
      obj.schemaname,
      obj.objectname
    );
  end loop;

  for obj in
    select schemaname, viewname as objectname
    from pg_views
    where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger on table %I.%I from authenticated',
      obj.schemaname,
      obj.objectname
    );
  end loop;
end $$;

commit;
