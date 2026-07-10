-- Harden profile self-service access.
-- Non-admin users may keep their own basic profile updated, but they cannot
-- change role, sede, account status, PIN, approval, or employee linkage fields.

begin;

revoke all privileges on table public.profiles from anon;
revoke delete, truncate, references, trigger on table public.profiles from authenticated;

drop policy if exists own_profile on public.profiles;
drop policy if exists authenticated_read on public.profiles;
drop policy if exists profiles_self_insert_limited on public.profiles;

create policy profiles_self_insert_limited
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and coalesce(role, 'employee') = 'employee'
  and coalesce(account_status, 'pending') = 'pending'
);

create or replace function public.prevent_profile_sensitive_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() = 'authenticated' and not public.auth_is_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.employee_role is distinct from old.employee_role
       or new.sede is distinct from old.sede
       or new.account_status is distinct from old.account_status
       or new.active is distinct from old.active
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.tip_employee_id is distinct from old.tip_employee_id
       or new.pin is distinct from old.pin then
      raise exception 'No autorizado' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_sensitive_self_update on public.profiles;
create trigger profiles_prevent_sensitive_self_update
before update on public.profiles
for each row
execute function public.prevent_profile_sensitive_self_update();

revoke all on function public.prevent_profile_sensitive_self_update() from public;
revoke all on function public.prevent_profile_sensitive_self_update() from anon;
revoke all on function public.prevent_profile_sensitive_self_update() from authenticated;

commit;
