-- Catalina Cosmetic editable site content.
-- Run once in Supabase SQL Editor for existing projects.

create table if not exists public.site_content (
  key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_site_content_updated_at on public.site_content;
create trigger set_site_content_updated_at
before update on public.site_content
for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;

drop policy if exists "Anyone can read site content" on public.site_content;
create policy "Anyone can read site content"
on public.site_content for select
to anon, authenticated
using (true);

drop policy if exists "Admins manage site content" on public.site_content;
create policy "Admins manage site content"
on public.site_content for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.site_content to anon;
grant all on public.site_content to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.site_content;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

select pg_notify('pgrst', 'reload schema');
