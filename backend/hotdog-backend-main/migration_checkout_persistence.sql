-- Apply in staging first. This file is intentionally not executed automatically.
begin;

create table if not exists public.web_checkout_attempts (
  checkout_attempt_id uuid primary key,
  square_order_id     text unique,
  payment_id          text unique,
  payment_status      text not null default 'processing'
                      check (payment_status in ('processing', 'approved', 'failed')),
  persistence_status  text not null default 'pending'
                      check (persistence_status in ('pending', 'persisted', 'failed')),
  persistence_error   text,
  customer             jsonb not null,
  items                jsonb not null,
  total                numeric(10,2) not null,
  receipt_url          text,
  order_type           text not null,
  location             text not null,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.web_checkout_attempts enable row level security;
revoke all on table public.web_checkout_attempts from anon, authenticated;

alter table public.web_orders
  add column if not exists checkout_attempt_id uuid,
  add column if not exists square_order_id text,
  add column if not exists payment_status text,
  add column if not exists persistence_error text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version integer not null default 0;

-- A full UNIQUE constraint is required for Postgres ON CONFLICT inference.
-- This deliberately fails and rolls back if historical duplicates exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.web_orders'::regclass
      and conname = 'web_orders_payment_id_unique'
  ) then
    alter table public.web_orders
      add constraint web_orders_payment_id_unique unique (payment_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.web_orders'::regclass
      and conname = 'web_orders_checkout_attempt_unique'
  ) then
    alter table public.web_orders
      add constraint web_orders_checkout_attempt_unique unique (checkout_attempt_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.web_orders'::regclass
      and conname = 'web_orders_square_order_unique'
  ) then
    alter table public.web_orders
      add constraint web_orders_square_order_unique unique (square_order_id);
  end if;
end $$;

create index if not exists web_checkout_attempts_reconcile_idx
  on public.web_checkout_attempts (persistence_status, updated_at)
  where payment_status = 'approved' and persistence_status <> 'persisted';

create index if not exists web_orders_kds_idx
  on public.web_orders (location, status, created_at desc);

commit;

-- Preflight before applying:
-- select payment_id, count(*) from public.web_orders
-- where payment_id is not null group by payment_id having count(*) > 1;
