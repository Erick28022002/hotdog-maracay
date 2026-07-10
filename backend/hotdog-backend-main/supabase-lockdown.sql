-- Run only after SUPABASE_SERVICE_ROLE_KEY is configured in Vercel and the
-- secured backend has been deployed successfully.
begin;

drop policy if exists "Permitir lectura" on public.web_orders;
drop policy if exists "Permitir insertar" on public.web_orders;
drop policy if exists "Permitir actualizar" on public.web_orders;
drop policy if exists web_orders_staff_read on public.web_orders;
drop policy if exists web_orders_staff_update on public.web_orders;
drop policy if exists web_orders_staff_update_limited on public.web_orders;

revoke all privileges on table public.web_orders from anon;
revoke insert, update, delete, truncate, references, trigger on table public.web_orders from authenticated;
grant select on table public.web_orders to authenticated;

-- Compatibility with the live KDS hosted at maracayos.duckdns.org/kds.
-- That app currently updates only status and sort_pos directly from the
-- browser. Keep the grant column-scoped so staff cannot update customer,
-- payment, item, or receipt fields from the client.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'web_orders'
      and column_name = 'sort_pos'
  ) then
    execute 'grant update (status, sort_pos) on table public.web_orders to authenticated';
  else
    execute 'grant update (status) on table public.web_orders to authenticated';
  end if;
end $$;

create policy web_orders_staff_read
on public.web_orders
for select
to authenticated
using (public.auth_is_admin() or location = public.get_my_sede());

create policy web_orders_staff_update_limited
on public.web_orders
for update
to authenticated
using (public.auth_is_admin() or location = public.get_my_sede())
with check (
  (public.auth_is_admin() or location = public.get_my_sede())
  and status in (
    'new', 'paid', 'pending', 'packing', 'preparing', 'ready',
    'completed', 'complete', 'done',
    'cancelled', 'canceled'
  )
);

-- Future KDS versions can use this RPC for safer status transitions with an
-- optimistic expected-status check.
create or replace function public.transition_web_order_status(
  p_order_id text,
  p_expected text,
  p_next text
)
returns public.web_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.web_orders;
  v_allowed_statuses constant text[] := array[
    'new', 'paid', 'pending', 'preparing', 'ready',
    'packing',
    'completed', 'complete', 'done',
    'cancelled', 'canceled'
  ];
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_next is null or not (p_next = any(v_allowed_statuses)) then
    raise exception 'invalid status';
  end if;

  update public.web_orders
     set status = p_next,
         version = coalesce(version, 0) + 1,
         updated_at = now()
   where id::text = p_order_id
     and status = p_expected
     and (public.auth_is_admin() or location = public.get_my_sede())
   returning * into v_order;

  if not found then
    raise exception 'order not found, not authorized, or stale status';
  end if;

  return v_order;
end;
$$;

revoke all on function public.transition_web_order_status(text, text, text) from public;
grant execute on function public.transition_web_order_status(text, text, text) to authenticated;

commit;
