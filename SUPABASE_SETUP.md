# Catalina Cosmetic Supabase Setup

1. Create a Supabase project and enable Email/Password auth.
2. In the SQL editor, run `supabase-schema.sql`.
3. In the SQL editor, run `supabase-seed.sql` to load starter products.
4. Create an admin user in Supabase Auth.
5. Set the admin user's `app_metadata` to:

```json
{ "role": "admin" }
```

6. Add these Sites environment variables:

```text
CATALINA_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
CATALINA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
STRIPE_SECRET_KEY=sk_test_or_live_...
```

7. Mark `STRIPE_SECRET_KEY` as secret in Sites. Never place it in `catalina.html`.

8. Redeploy the latest Sites version after setting the variables.

Customers can create accounts from the site with the `Crear` button. After signing in, they should use `Usar mi sesion` in the profile form, complete their shipping details, and save the profile before placing an order.

The public client must only use the publishable key. Do not place the service role key in Sites or in `catalina.html`.
