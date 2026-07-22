-- Run this in Supabase SQL Editor to prevent duplicate customer emails and phone numbers.
-- If this fails, remove or merge duplicate rows in public.customer_profiles first.

create unique index if not exists customer_profiles_email_unique
on public.customer_profiles (lower(email))
where email is not null and btrim(email) <> '';

create unique index if not exists customer_profiles_phone_unique
on public.customer_profiles ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
where regexp_replace(coalesce(phone, ''), '\D', '', 'g') <> '';
