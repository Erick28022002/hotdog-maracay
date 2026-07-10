-- Harden profile identity helpers used by RLS.
-- Only active, approved accounts can grant admin or sede-based access.

begin;

create or replace function public.auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(
    (
      select role = 'admin'::user_role
             and active = true
             and account_status = 'active'
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.get_my_sede()
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
    when exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'admin'::user_role
        and active = true
        and account_status = 'active'
    ) then null
    else coalesce(
      (
        select sede
        from public.profiles
        where id = auth.uid()
          and active = true
          and account_status = 'active'
      ),
      '__no_sede__'
    )
  end;
$$;

alter table public.profiles alter column active set default false;

drop policy if exists profiles_self_insert_limited on public.profiles;
create policy profiles_self_insert_limited
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and coalesce(role, 'employee'::user_role) = 'employee'::user_role
  and coalesce(active, false) = false
  and coalesce(account_status, 'pending_approval') in ('pending', 'pending_approval')
  and approved_at is null
  and approved_by is null
  and tip_employee_id is null
  and pin is null
  and employee_role is null
);

commit;
