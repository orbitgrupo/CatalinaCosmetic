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
CATALINA_SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_test_or_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

7. Mark `CATALINA_SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` as secrets in Sites. Never place them in `catalina.html`.

8. In Stripe, create a webhook endpoint pointing to:

```text
https://YOUR_SITE_URL/api/stripe-webhook
```

Subscribe it to `checkout.session.completed`, then copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

9. Redeploy the latest Sites version after setting the variables.

Customers can create accounts from the site with the `Crear` button. After signing in, they should use `Usar mi sesion` in the profile form, complete their shipping details, and save the profile before placing an order.

Checkout security:

- The browser sends only product identifiers and quantities.
- The server reads active products from Supabase, calculates prices, creates the pending order, and then creates the Stripe session.
- Customers can read their own orders, but cannot create or update orders directly through the browser.
- Stripe confirms payment through `/api/stripe-webhook` before the order changes to `Pagado`.

The public client must only use the publishable key. Do not place the service role key in `catalina.html`; keep it only as a secret environment variable for the server/webhook.
