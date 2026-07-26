-- Catalina Cosmetic vendor application workflow.
-- Run this in Supabase SQL Editor to let customers request seller access.

create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  business_name text not null,
  seller_type text not null default 'independent' check (seller_type in ('brand_owner', 'independent', 'both')),
  product_categories text,
  product_count integer not null default 0 check (product_count >= 0),
  has_inventory boolean not null default false,
  has_registered_business boolean not null default false,
  sells_online boolean not null default false,
  social_links text,
  experience text,
  message text,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'En revision', 'Aprobado', 'Rechazado')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_applications_status_created
on public.vendor_applications (status, created_at desc);

create index if not exists idx_vendor_applications_user_created
on public.vendor_applications (user_id, created_at desc);

drop trigger if exists set_vendor_applications_updated_at on public.vendor_applications;
create trigger set_vendor_applications_updated_at
before update on public.vendor_applications
for each row execute function public.set_updated_at();

alter table public.vendor_applications enable row level security;

drop policy if exists "Customers create own vendor applications" on public.vendor_applications;
create policy "Customers create own vendor applications"
on public.vendor_applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers read own vendor applications" on public.vendor_applications;
create policy "Customers read own vendor applications"
on public.vendor_applications for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "Admins review vendor applications" on public.vendor_applications;
create policy "Admins review vendor applications"
on public.vendor_applications for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant all on public.vendor_applications to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.vendor_applications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
