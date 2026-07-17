-- Catalina Cosmetic ecommerce schema for Supabase.
-- Run this in the Supabase SQL editor after enabling Auth.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products drop constraint if exists products_category_check;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  house_number text,
  street text,
  sector text,
  province text,
  city text,
  address_reference text,
  shipping_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  status text not null default 'Recibido' check (status in ('Recibido', 'Preparando', 'Enviado', 'En ruta', 'Entregado', 'Cancelado')),
  payment_status text not null default 'Pendiente' check (payment_status in ('Pendiente', 'Pagado', 'Fallido', 'Reembolsado')),
  stripe_session_id text,
  carrier text,
  tracking_code text,
  subtotal numeric(10,2) not null default 0 check (subtotal >= 0),
  shipping_amount numeric(10,2) not null default 0 check (shipping_amount >= 0),
  total numeric(10,2) generated always as (subtotal + shipping_amount) stored,
  estimated_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists payment_status text not null default 'Pendiente';
alter table public.orders add column if not exists stripe_session_id text;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

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

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('Recibido', 'Preparando', 'Enviado', 'En ruta', 'Entregado', 'Cancelado')),
  note text,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_products_active_category on public.products (is_active, category);
create index if not exists idx_categories_active_name on public.categories (is_active, name);
create index if not exists idx_orders_customer_created on public.orders (customer_id, created_at desc);
create index if not exists idx_orders_payment_status on public.orders (payment_status, created_at desc);
create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_payments_order on public.payments (order_id);
create index if not exists idx_shipment_events_order_event on public.shipment_events (order_id, event_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_profiles_updated_at on public.customer_profiles;
create trigger set_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipment_events enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
on public.products for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Anyone can read active categories" on public.categories;
create policy "Anyone can read active categories"
on public.categories for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
on public.categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own profile"
on public.customer_profiles for select
to authenticated
using ((select auth.uid()) = id or public.is_admin());

drop policy if exists "Customers update own profile" on public.customer_profiles;
create policy "Customers update own profile"
on public.customer_profiles for update
to authenticated
using ((select auth.uid()) = id or public.is_admin())
with check ((select auth.uid()) = id or public.is_admin());

drop policy if exists "Customers create own profile" on public.customer_profiles;
create policy "Customers create own profile"
on public.customer_profiles for insert
to authenticated
with check ((select auth.uid()) = id or public.is_admin());

drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders"
on public.orders for select
to authenticated
using (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "Customers create own orders" on public.orders;

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
on public.orders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

drop policy if exists "Customers read own order items" on public.order_items;
create policy "Customers read own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and (orders.customer_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists "Customers create own order items" on public.order_items;

drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
on public.order_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Customers read own shipment events" on public.shipment_events;
create policy "Customers read own shipment events"
on public.shipment_events for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = shipment_events.order_id
      and (orders.customer_id = (select auth.uid()) or public.is_admin())
  )
);

drop policy if exists "Customers create initial shipment event" on public.shipment_events;

drop policy if exists "Admins manage shipment events" on public.shipment_events;
create policy "Admins manage shipment events"
on public.shipment_events for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant select on public.categories to anon;
grant all on public.categories to authenticated;
grant select on public.products to anon;
grant all on public.products to authenticated;
grant all on public.customer_profiles to authenticated;
grant all on public.orders to authenticated;
grant all on public.order_items to authenticated;
grant all on public.payments to authenticated;
grant all on public.shipment_events to authenticated;
