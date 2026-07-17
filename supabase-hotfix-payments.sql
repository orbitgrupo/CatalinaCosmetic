-- Catalina Cosmetic payment hardening hotfix.
-- Run this in Supabase SQL Editor if checkout reports:
-- "Could not find the 'payment_status' column of 'orders' in the schema cache"

alter table public.orders
add column if not exists payment_status text not null default 'Pendiente';

alter table public.orders
add column if not exists stripe_session_id text;

alter table public.orders
drop constraint if exists orders_payment_status_check;

alter table public.orders
add constraint orders_payment_status_check
check (payment_status in ('Pendiente', 'Pagado', 'Fallido', 'Reembolsado'));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'stripe',
  provider_session_id text not null unique,
  status text not null default 'pending',
  amount numeric(10,2) not null default 0 check (amount >= 0),
  currency text not null default 'usd',
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_payment_status
on public.orders (payment_status, created_at desc);

create index if not exists idx_payments_order
on public.payments (order_id);

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

drop policy if exists "Customers create own orders" on public.orders;
drop policy if exists "Customers create own order items" on public.order_items;
drop policy if exists "Customers create initial shipment event" on public.shipment_events;

drop policy if exists "Customers read own payments" on public.payments;
create policy "Customers read own payments"
on public.payments for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = payments.order_id
      and (orders.customer_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists "Admins manage payments" on public.payments;
create policy "Admins manage payments"
on public.payments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant all on public.payments to authenticated;

-- Force PostgREST to refresh Supabase Data API schema cache.
select pg_notify('pgrst', 'reload schema');
