-- Catalina Cosmetic: favoritos y resenas de clientes.
-- Ejecuta este archivo en Supabase SQL Editor despues de los SQL principales.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create table if not exists public.product_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text,
  comment text not null,
  status text not null default 'Publicado' check (status in ('Publicado', 'Oculto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists product_favorites_product_id_idx on public.product_favorites(product_id);
create index if not exists product_reviews_product_id_idx on public.product_reviews(product_id);
create index if not exists product_reviews_user_id_idx on public.product_reviews(user_id);
create index if not exists product_reviews_status_idx on public.product_reviews(status);

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at
before update on public.product_reviews
for each row execute function public.set_updated_at();

alter table public.product_favorites enable row level security;
alter table public.product_reviews enable row level security;

drop policy if exists "Customers read own favorites" on public.product_favorites;
create policy "Customers read own favorites"
on public.product_favorites
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers create own favorites" on public.product_favorites;
create policy "Customers create own favorites"
on public.product_favorites
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers remove own favorites" on public.product_favorites;
create policy "Customers remove own favorites"
on public.product_favorites
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Anyone reads published reviews" on public.product_reviews;
create policy "Anyone reads published reviews"
on public.product_reviews
for select
to anon, authenticated
using (status = 'Publicado' or public.is_admin() or (select auth.uid()) = user_id);

drop policy if exists "Customers create own reviews" on public.product_reviews;
create policy "Customers create own reviews"
on public.product_reviews
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own reviews" on public.product_reviews;
create policy "Customers update own reviews"
on public.product_reviews
for update
to authenticated
using ((select auth.uid()) = user_id or public.is_admin())
with check ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "Customers delete own reviews" on public.product_reviews;
create policy "Customers delete own reviews"
on public.product_reviews
for delete
to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.product_reviews to anon;
grant select, insert, update, delete on public.product_reviews to authenticated;
grant select, insert, delete on public.product_favorites to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.product_favorites;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_reviews;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
