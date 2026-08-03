-- Run this in Supabase SQL Editor to support multiple customer shipping addresses.

alter table public.customer_profiles
add column if not exists addresses jsonb not null default '[]'::jsonb;

alter table public.customer_profiles
add column if not exists selected_address_id text;
