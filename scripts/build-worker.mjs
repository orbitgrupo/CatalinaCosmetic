import fs from "node:fs";
const root = new URL("..", import.meta.url);
const html = fs.readFileSync(new URL("catalina.html", root), "utf8");
const admin = fs.readFileSync(new URL("admin.html", root), "utf8");
const schema = fs.readFileSync(new URL("supabase-schema.sql", root), "utf8");
const seed = fs.readFileSync(new URL("supabase-seed.sql", root), "utf8");
const setup = fs.readFileSync(new URL("SUPABASE_SETUP.md", root), "utf8");
const distServer = new URL("dist/server/", root);
const distOpenAI = new URL("dist/.openai/", root);

fs.mkdirSync(distServer, { recursive: true });
fs.mkdirSync(distOpenAI, { recursive: true });
fs.copyFileSync(new URL(".openai/hosting.json", root), new URL("hosting.json", distOpenAI));

const worker = `const html = ${JSON.stringify(html)};
const admin = ${JSON.stringify(admin)};
const schema = ${JSON.stringify(schema)};
const seed = ${JSON.stringify(seed)};
const setup = ${JSON.stringify(setup)};

function withRuntimeConfig(body, env) {
  const config = {
    supabaseUrl: env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "",
    supabasePublishableKey: env.CATALINA_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY)
  };
  const script = \`<script>window.__CATALINA_CONFIG__=\${JSON.stringify(config)};</script>\`;
  return body.replace("</head>", \`\${script}</head>\`);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanCheckoutItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map(item => ({
    name: String(item.name || "Catalina product").slice(0, 120),
    price: Math.max(0, Math.round(Number(item.price || 0) * 100)),
    quantity: Math.max(1, Math.min(99, Math.round(Number(item.quantity || 1)))),
    image: String(item.image || "")
  })).filter(item => item.price > 0);
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map(part => part.split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(\`\${timestamp}.\${rawBody}\`));
  return constantTimeEqual(bytesToHex(digest), signature);
}

async function supabaseRest(env, path, options = {}) {
  const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) throw new Error("Supabase service role no esta configurado.");
  const response = await fetch(\`\${url}/rest/v1/\${path}\`, {
    ...options,
    headers: {
      "apikey": serviceKey,
      "authorization": \`Bearer \${serviceKey}\`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || "Supabase no acepto la operacion.");
  return data;
}

async function markStripeCheckoutPaid(event, env) {
  const session = event.data?.object || {};
  const orderNumber = session.metadata?.order_number || "";
  if (!orderNumber) return;
  const updatedOrders = await supabaseRest(env, \`orders?order_number=eq.\${encodeURIComponent(orderNumber)}\`, {
    method: "PATCH",
    headers: { "prefer": "return=representation" },
    body: JSON.stringify({
      payment_status: "Pagado",
      status: "Preparando",
      stripe_session_id: session.id
    })
  });
  const order = updatedOrders?.[0];
  if (!order?.id) return;
  await supabaseRest(env, "payments?on_conflict=provider_session_id", {
    method: "POST",
    headers: { "prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      order_id: order.id,
      provider: "stripe",
      provider_session_id: session.id,
      status: session.payment_status || "paid",
      amount: Number(session.amount_total || 0) / 100,
      currency: session.currency || "usd",
      raw_event: event
    })
  });
  await supabaseRest(env, "shipment_events", {
    method: "POST",
    headers: { "prefer": "return=minimal" },
    body: JSON.stringify({
      order_id: order.id,
      status: "Preparando",
      note: "Pago confirmado por Stripe. Pedido enviado a preparacion."
    })
  });
}

async function handleStripeWebhook(request, env) {
  const secret = env.STRIPE_WEBHOOK_SECRET || "";
  const rawBody = await request.text();
  const verified = await verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret);
  if (!verified) return jsonResponse({ error: "Firma de Stripe invalida." }, 400);
  const event = JSON.parse(rawBody);
  if (event.type === "checkout.session.completed") {
    await markStripeCheckoutPaid(event, env);
  }
  return jsonResponse({ received: true });
}

async function createStripeCheckoutSession(request, env) {
  const secretKey = env.STRIPE_SECRET_KEY || "";
  if (!secretKey) return jsonResponse({ error: "Stripe no esta configurado. Agrega STRIPE_SECRET_KEY en Sites." }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Solicitud invalida." }, 400);
  }

  const items = cleanCheckoutItems(payload.items);
  if (!items.length) return jsonResponse({ error: "El carrito esta vacio." }, 400);

  const origin = new URL(request.url).origin;
  const customer = payload.customer || {};
  const order = payload.order || {};
  const subtotalCents = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const taxCents = Math.round(subtotalCents * 0.08);
  const params = new URLSearchParams();

  params.set("mode", "payment");
  params.set("success_url", \`\${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&order=\${encodeURIComponent(order.orderNumber || "")}\`);
  params.set("cancel_url", \`\${origin}/?checkout=cancel\`);
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "true");
  params.set("metadata[source]", "catalina-cosmetic");
  if (order.orderNumber) params.set("metadata[order_number]", String(order.orderNumber).slice(0, 80));
  if (order.id) params.set("metadata[order_id]", String(order.id).slice(0, 80));
  if (order.customerId) params.set("metadata[customer_id]", String(order.customerId).slice(0, 80));
  if (customer.email) params.set("customer_email", String(customer.email).slice(0, 200));
  if (customer.name) params.set("metadata[customer_name]", String(customer.name).slice(0, 200));
  if (customer.address) params.set("metadata[shipping_address]", String(customer.address).slice(0, 450));

  items.forEach((item, index) => {
    params.set(\`line_items[\${index}][quantity]\`, String(item.quantity));
    params.set(\`line_items[\${index}][price_data][currency]\`, "usd");
    params.set(\`line_items[\${index}][price_data][unit_amount]\`, String(item.price));
    params.set(\`line_items[\${index}][price_data][product_data][name]\`, item.name);
    if (item.image.startsWith("https://")) params.set(\`line_items[\${index}][price_data][product_data][images][0]\`, item.image);
  });

  if (taxCents > 0) {
    const taxIndex = items.length;
    params.set(\`line_items[\${taxIndex}][quantity]\`, "1");
    params.set(\`line_items[\${taxIndex}][price_data][currency]\`, "usd");
    params.set(\`line_items[\${taxIndex}][price_data][unit_amount]\`, String(taxCents));
    params.set(\`line_items[\${taxIndex}][price_data][product_data][name]\`, "Estimated taxes");
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "authorization": \`Bearer \${secretKey}\`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const session = await stripeResponse.json();
  if (!stripeResponse.ok) return jsonResponse({ error: session.error?.message || "Stripe no pudo crear el pago." }, 502);
  return jsonResponse({ id: session.id, url: session.url });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-checkout-session" && request.method === "POST") {
      return createStripeCheckoutSession(request, env || {});
    }

    if (url.pathname === "/api/stripe-webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env || {});
    }

    if (url.pathname === "/supabase-schema.sql") {
      return new Response(schema, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/supabase-seed.sql") {
      return new Response(seed, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/SUPABASE_SETUP.md") {
      return new Response(setup, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      return new Response(withRuntimeConfig(admin, env || {}), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    return new Response(withRuntimeConfig(html, env || {}), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    });
  }
};
`;

fs.writeFileSync(new URL("index.js", distServer), worker);
fs.mkdirSync(new URL("worker/", root), { recursive: true });
fs.writeFileSync(new URL("worker/index.js", root), worker);

console.log(`built worker with ${html.length} shop bytes, ${admin.length} admin bytes and ${schema.length} sql bytes`);
