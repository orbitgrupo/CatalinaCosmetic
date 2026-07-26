-- Catalina Cosmetic collaborator/vendor roles.
-- Run this in Supabase SQL Editor after the main schema.

alter table public.products
add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_products_owner_active
on public.products (owner_user_id, is_active);

create or replace function public.is_vendor()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'vendor', false);
$$;

drop policy if exists "Vendors manage own products" on public.products;
create policy "Vendors manage own products"
on public.products for all
to authenticated
using (public.is_admin() or (public.is_vendor() and owner_user_id = (select auth.uid())))
with check (public.is_admin() or (public.is_vendor() and owner_user_id = (select auth.uid())));

drop policy if exists "Admins and vendors manage product images" on public.product_images;
create policy "Admins and vendors manage product images"
on public.product_images for all
to authenticated
using (
  public.is_admin()
  or (
    public.is_vendor()
    and exists (
      select 1 from public.products
      where products.id = product_images.product_id
        and products.owner_user_id = (select auth.uid())
    )
  )
)
with check (
  public.is_admin()
  or (
    public.is_vendor()
    and exists (
      select 1 from public.products
      where products.id = product_images.product_id
        and products.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Admins and vendors manage product variants" on public.product_variants;
create policy "Admins and vendors manage product variants"
on public.product_variants for all
to authenticated
using (
  public.is_admin()
  or (
    public.is_vendor()
    and exists (
      select 1 from public.products
      where products.id = product_variants.product_id
        and products.owner_user_id = (select auth.uid())
    )
  )
)
with check (
  public.is_admin()
  or (
    public.is_vendor()
    and exists (
      select 1 from public.products
      where products.id = product_variants.product_id
        and products.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Vendors read own product order items" on public.order_items;
create policy "Vendors read own product order items"
on public.order_items for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.customer_id = (select auth.uid())
  )
  or (
    public.is_vendor()
    and exists (
      select 1 from public.products
      where products.id = order_items.product_id
        and products.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Vendors read own product orders" on public.orders;
create policy "Vendors read own product orders"
on public.orders for select
to authenticated
using (
  customer_id = (select auth.uid())
  or public.is_admin()
  or (
    public.is_vendor()
    and exists (
      select 1
      from public.order_items
      join public.products on products.id = order_items.product_id
      where order_items.order_id = orders.id
        and products.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Vendors read own product shipment events" on public.shipment_events;
create policy "Vendors read own product shipment events"
on public.shipment_events for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = shipment_events.order_id
      and orders.customer_id = (select auth.uid())
  )
  or (
    public.is_vendor()
    and exists (
      select 1
      from public.order_items
      join public.products on products.id = order_items.product_id
      where order_items.order_id = shipment_events.order_id
        and products.owner_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Admins upload product image files" on storage.objects;
drop policy if exists "Admins update product image files" on storage.objects;
drop policy if exists "Admins delete product image files" on storage.objects;

create policy "Admins and vendors upload product image files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and (public.is_admin() or public.is_vendor()));

create policy "Admins and vendors update product image files"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and (public.is_admin() or public.is_vendor()))
with check (bucket_id = 'product-images' and (public.is_admin() or public.is_vendor()));

create policy "Admins and vendors delete product image files"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and (public.is_admin() or public.is_vendor()));

grant execute on function public.is_vendor() to authenticated;

notify pgrst, 'reload schema';
