-- Catalina Cosmetic product management upgrades.
-- Run this in Supabase SQL Editor for existing projects.

alter table public.products add column if not exists sku text;
alter table public.products add column if not exists short_description text;
alter table public.products add column if not exists compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price >= 0);
alter table public.products add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100);
alter table public.products add column if not exists low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  value text not null,
  sku text,
  price_delta numeric(10,2) not null default 0,
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_variants_product_sort on public.product_variants (product_id, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_product_variants_updated_at on public.product_variants;
create trigger set_product_variants_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

alter table public.product_variants enable row level security;

drop policy if exists "Anyone can read active product variants" on public.product_variants;
create policy "Anyone can read active product variants"
on public.product_variants for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins manage product variants" on public.product_variants;
create policy "Admins manage product variants"
on public.product_variants for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.product_variants to anon;
grant all on public.product_variants to authenticated;
grant select on public.products to anon;
grant all on public.products to authenticated;

update public.products
set short_description = left(description, 180)
where short_description is null
  and description is not null;

do $$
begin
  alter publication supabase_realtime add table public.product_variants;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
