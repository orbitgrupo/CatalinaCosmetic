# Catalina Cosmetic Supabase Setup

1. Create a Supabase project and enable Email/Password auth.
2. In the SQL editor, run `supabase-schema.sql`.
3. In the SQL editor, run `supabase-seed.sql` to load starter products.
4. If the database was created before Stripe payments were added and checkout reports `Could not find the 'payment_status' column of 'orders' in the schema cache`, run `supabase-hotfix-payments.sql` once in the SQL editor.
5. If the database already existed before the editable home studio was added, run `supabase-site-content.sql` once in the SQL editor.
6. If the database already existed before product image uploads were added, run `supabase-product-images.sql` once in the SQL editor. It creates the `product-images` Storage bucket and `product_images` table.
7. If the database already existed before product variants, discounts, SKU and stock alerts were added, run `supabase-product-management.sql` once in the SQL editor. If Supabase shows `Could not find the table 'public.product_variants' in the schema cache`, run this file and wait a few seconds for PostgREST cache reload.
8. Run `supabase-customer-engagement.sql` once in the SQL editor to activate product favorites and customer reviews. It creates `product_favorites` and `product_reviews` with RLS policies.
9. For immediate admin/storefront sync, run `supabase-realtime-sync.sql` once in the SQL editor. Without it, the site still refreshes from Supabase every 30 seconds.
10. Create an admin user in Supabase Auth.
11. Set the admin user's `app_metadata` to:

```json
{ "role": "admin" }
```

After that first admin can sign in at `/admin.html` and use `Supabase > Crear administrador` to create more admin users. That action runs on the server with `CATALINA_SUPABASE_SERVICE_ROLE_KEY`; the service role key must never be pasted into any public HTML file.

12. Add these Sites environment variables:

```text
CATALINA_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
CATALINA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CATALINA_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

13. Mark `CATALINA_SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` as secrets in Sites. Never place them in `catalina.html`.

14. In Stripe, create a webhook endpoint pointing to:

```text
https://YOUR_SITE_URL/api/stripe-webhook
```

Subscribe it to `checkout.session.completed`, then copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

15. Redeploy the latest Sites version after setting the variables.

Password recovery for admins:

- In Supabase Dashboard, add the production admin URL to Auth redirect URLs:

```text
https://YOUR_SITE_URL/admin.html
```

- Admins can click `Recuperar contrasena` in `/admin.html`. Supabase sends the email, redirects back to `/admin.html?recover=1`, and the admin panel shows the new password form.

Product image uploads:

- The admin uploads files to Supabase Storage bucket `product-images`.
- The server endpoint `/api/admin/ensure-product-images-bucket` can create that bucket automatically for an authenticated admin when `CATALINA_SUPABASE_SERVICE_ROLE_KEY` is configured in Sites.
- If Supabase still shows `bucket not found`, run `supabase-product-images.sql` in Supabase SQL Editor and confirm the Storage bucket is named exactly `product-images`.

Customers can create accounts from the site with the `Crear` button. After signing in, they should use `Usar mi sesion` in the profile form, complete their shipping details, and save the profile before placing an order.

Checkout security:

- The browser sends only product identifiers and quantities.
- The server reads active products from Supabase, calculates prices, creates the pending order, and then creates the Stripe session.
- Customers can read their own orders, but cannot create or update orders directly through the browser.
- Stripe confirms payment through `/api/stripe-webhook` before the order changes to `Pagado`.

The public client must only use the publishable key. Do not place the service role key in `catalina.html`; keep it only as a secret environment variable for the server/webhook.
