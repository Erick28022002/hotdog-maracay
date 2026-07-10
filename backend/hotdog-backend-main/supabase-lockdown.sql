-- Run only after SUPABASE_SERVICE_ROLE_KEY is configured in Vercel and the
-- secured backend has been deployed successfully.
begin;

drop policy if exists "Permitir lectura" on public.web_orders;
drop policy if exists "Permitir insertar" on public.web_orders;
drop policy if exists "Permitir actualizar" on public.web_orders;
drop policy if exists web_orders_staff_read on public.web_orders;
drop policy if exists web_orders_staff_update on public.web_orders;

revoke all privileges on table public.web_orders from anon;
revoke insert, update, delete, truncate, references, trigger on table public.web_orders from authenticated;
grant select on table public.web_orders to authenticated;

create policy web_orders_staff_read
on public.web_orders
for select
to authenticated
using (public.auth_is_admin() or location = public.get_my_sede());

-- Staff/KDS must not receive direct UPDATE over the whole row. Use this RPC
-- to change only status, with an optimistic expected-status check.
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
