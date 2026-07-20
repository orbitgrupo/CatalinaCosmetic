-- Catalina Cosmetic product image uploads.
-- Run once in Supabase SQL Editor for existing projects.
-- This creates product image metadata and a public Storage bucket named product-images.

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  storage_path text,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product_sort
on public.product_images (product_id, sort_order);

alter table public.product_images enable row level security;

drop policy if exists "Anyone can read product images" on public.product_images;
create policy "Anyone can read product images"
on public.product_images for select
to anon, authenticated
using (true);

drop policy if exists "Admins manage product images" on public.product_images;
create policy "Admins manage product images"
on public.product_images for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.product_images to anon;
grant all on public.product_images to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.product_images;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when undefined_table then null;
end $$;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can read product image files" on storage.objects;
create policy "Anyone can read product image files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admins upload product image files" on storage.objects;
create policy "Admins upload product image files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins update product image files" on storage.objects;
create policy "Admins update product image files"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins delete product image files" on storage.objects;
create policy "Admins delete product image files"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_admin());

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
