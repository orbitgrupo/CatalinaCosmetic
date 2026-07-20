import fs from "node:fs";
const root = new URL("..", import.meta.url);
const html = fs.readFileSync(new URL("catalina.html", root), "utf8");
const admin = fs.readFileSync(new URL("admin.html", root), "utf8");
const schema = fs.readFileSync(new URL("supabase-schema.sql", root), "utf8");
const seed = fs.readFileSync(new URL("supabase-seed.sql", root), "utf8");
const siteContentSql = fs.readFileSync(new URL("supabase-site-content.sql", root), "utf8");
const productImagesSql = fs.readFileSync(new URL("supabase-product-images.sql", root), "utf8");
const productManagementSql = fs.readFileSync(new URL("supabase-product-management.sql", root), "utf8");
const realtimeSql = fs.readFileSync(new URL("supabase-realtime-sync.sql", root), "utf8");
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
const siteContentSql = ${JSON.stringify(siteContentSql)};
const productImagesSql = ${JSON.stringify(productImagesSql)};
const productManagementSql = ${JSON.stringify(productManagementSql)};
const realtimeSql = ${JSON.stringify(realtimeSql)};
const setup = ${JSON.stringify(setup)};

function withRuntimeConfig(body, env) {
  const config = {
    supabaseUrl: env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "",
    supabasePublishableKey: env.CATALINA_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
    stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    supabaseServiceConfigured: Boolean(env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY)
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

function cleanRequestedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map(item => ({
    productId: String(item.productId || ""),
    name: String(item.name || "").slice(0, 160),
    quantity: Math.max(1, Math.min(99, Math.round(Number(item.quantity || 1))))
  })).filter(item => item.productId || item.name);
}

function createOrderNumber() {
  const stamp = Date.now().toString().slice(-6);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return \`CAT-\${stamp}\${suffix}\`;
}

function createTrackingCode(orderNumber = "") {
  const clean = String(orderNumber || createOrderNumber()).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const checksum = clean.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0) % 997;
  return \`CAT\${clean.slice(-10)}\${String(checksum).padStart(3, "0")}\`;
}

async function getSupabaseUser(request, env) {
  const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.CATALINA_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";
  const auth = request.headers.get("authorization") || "";
  if (!url || !key || !auth.toLowerCase().startsWith("bearer ")) return null;
  const response = await fetch(\`\${url}/auth/v1/user\`, {
    headers: {
      "apikey": key,
      "authorization": auth
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function requireAdminUser(request, env) {
  const user = await getSupabaseUser(request, env);
  if (!user?.id) throw new Error("Inicia sesion admin.");
  if (user.app_metadata?.role !== "admin") throw new Error("Esta cuenta no tiene permisos de administrador.");
  return user;
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

async function getActiveProducts(env) {
  return supabaseRest(env, "products?select=id,name,price,stock,image_url,is_active&is_active=eq.true", { method: "GET" });
}

async function getCatalog(env) {
  let products;
  try {
    products = await supabaseRest(env, "products?select=id,name,category,description,sku,price,compare_at_price,discount_percent,stock,low_stock_threshold,image_url,is_active,product_images(id,image_url,storage_path,alt_text,sort_order),product_variants(id,name,value,sku,price_delta,stock,is_active,sort_order)&is_active=eq.true&order=created_at.desc", { method: "GET" });
  } catch {
    try {
      products = await supabaseRest(env, "products?select=id,name,category,description,price,stock,image_url,is_active,product_images(id,image_url,storage_path,alt_text,sort_order)&is_active=eq.true&order=created_at.desc", { method: "GET" });
    } catch {
      products = await supabaseRest(env, "products?select=id,name,category,description,price,stock,image_url,is_active&is_active=eq.true&order=created_at.desc", { method: "GET" });
    }
  }
  let categories = [];
  try {
    categories = await supabaseRest(env, "categories?select=id,name,slug,description,image_url,is_active&is_active=eq.true&order=name.asc", { method: "GET" });
  } catch {
    categories = [];
  }
  return { products: products || [], categories: categories || [] };
}

async function getAdminSnapshot(request, env) {
  await requireAdminUser(request, env);
  const customers = await supabaseRest(env, "customer_profiles?select=id,full_name,email,phone,house_number,street,sector,province,city,address_reference,shipping_address,created_at&order=created_at.desc", { method: "GET" });
  const orders = await supabaseRest(env, "orders?select=id,order_number,customer_id,status,payment_status,carrier,tracking_code,estimated_delivery,created_at,subtotal,shipping_amount,total,order_items(product_id,product_name,unit_price,quantity),shipment_events(status,note,event_at)&order=created_at.desc", { method: "GET" });
  return { customers: customers || [], orders: orders || [] };
}

function cleanAdminAccountPayload(payload = {}) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const fullName = String(payload.fullName || "").trim().slice(0, 160);
  if (!email || !email.includes("@")) throw new Error("Escribe un email valido.");
  if (password.length < 8) throw new Error("La contrasena debe tener minimo 8 caracteres.");
  return { email, password, fullName };
}

async function createAdminAccount(request, env) {
  try {
    await requireAdminUser(request, env);
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Solicitud invalida." }, 400);
    }
    const account = cleanAdminAccountPayload(payload);
    const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) return jsonResponse({ error: "Supabase service role no esta configurado en Sites." }, 503);

    const response = await fetch(\`\${url}/auth/v1/admin/users\`, {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "authorization": \`Bearer \${serviceKey}\`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        email_confirm: true,
        app_metadata: { role: "admin" },
        user_metadata: account.fullName ? { full_name: account.fullName } : {}
      })
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) return jsonResponse({ error: data?.msg || data?.message || data?.error_description || "Supabase no pudo crear el usuario." }, response.status);
    return jsonResponse({
      id: data.id || "",
      email: data.email || account.email,
      role: data.app_metadata?.role || "admin"
    }, 201);
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo crear el administrador." }, status);
  }
}

async function ensureProductImagesBucket(request, env) {
  try {
    await requireAdminUser(request, env);
    await ensureProductImagesBucketForEnv(env);
    return jsonResponse({ bucket: "product-images", ready: true });
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo preparar Storage." }, status);
  }
}

async function ensureProductImagesBucketForEnv(env) {
    const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) throw new Error("Supabase service role no esta configurado en Sites.");
    const bucketId = "product-images";
    const headers = {
      "apikey": serviceKey,
      "authorization": \`Bearer \${serviceKey}\`,
      "content-type": "application/json"
    };
    const existing = await fetch(\`\${url}/storage/v1/bucket/\${bucketId}\`, { headers });
    if (existing.ok) return;
    const created = await fetch(\`\${url}/storage/v1/bucket\`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: bucketId, name: bucketId, public: true })
    });
    if (created.ok || created.status === 409) return;
    const data = await created.json().catch(() => ({}));
    throw new Error(data?.message || "No se pudo crear el bucket product-images.");
}

function cleanProductPayload(product = {}) {
  return {
    id: String(product.id || crypto.randomUUID()),
    name: String(product.name || "").trim().slice(0, 180),
    category: String(product.category || "").trim().slice(0, 120),
    description: String(product.description || "").trim().slice(0, 2000),
    sku: String(product.sku || "").trim().slice(0, 120) || null,
    price: Math.max(0, Number(product.price || 0)),
    compare_at_price: Number(product.compareAtPrice || 0) > 0 ? Number(product.compareAtPrice || 0) : null,
    discount_percent: Math.max(0, Math.min(100, Number(product.discountPercent || 0))),
    stock: Math.max(0, Math.round(Number(product.stock || 0))),
    low_stock_threshold: Math.max(0, Math.round(Number(product.lowStockThreshold || 5))),
    image_url: String(product.image || "").trim().slice(0, 1200),
    is_active: true
  };
}

function isMissingSupabaseRelation(error) {
  return /schema cache|Could not find the table|relation .* does not exist|PGRST205/i.test(error?.message || "");
}

async function saveAdminProduct(request, env) {
  try {
    await requireAdminUser(request, env);
    const payload = await request.json().catch(() => null);
    if (!payload?.product) return jsonResponse({ error: "Producto invalido." }, 400);
    const product = cleanProductPayload(payload.product);
    if (!product.name || !product.category) return jsonResponse({ error: "Completa nombre y categoria." }, 400);

    if (payload.category?.name) {
      await supabaseRest(env, "categories?on_conflict=name", {
        method: "POST",
        headers: { "prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: payload.category.id || crypto.randomUUID(),
          name: String(payload.category.name || "").trim().slice(0, 120),
          slug: String(payload.category.slug || payload.category.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          description: String(payload.category.description || "").trim().slice(0, 600),
          image_url: String(payload.category.image || product.image_url || "").trim().slice(0, 1200),
          is_active: true
        })
      });
    }

    let savedProducts;
    try {
      savedProducts = await supabaseRest(env, "products?on_conflict=id", {
        method: "POST",
        headers: { "prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(product)
      });
    } catch {
      const fallback = {
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price,
        stock: product.stock,
        image_url: product.image_url,
        is_active: true
      };
      savedProducts = await supabaseRest(env, "products?on_conflict=id", {
        method: "POST",
        headers: { "prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(fallback)
      });
    }

    const uploadedImages = Array.isArray(payload.uploadedImages) ? payload.uploadedImages : [];
    if (uploadedImages.length) {
      const offset = Math.max(0, Number(payload.imageOffset || 0));
      await supabaseRest(env, "product_images", {
        method: "POST",
        headers: { "prefer": "return=minimal" },
        body: JSON.stringify(uploadedImages.slice(0, 25).map((image, index) => ({
          product_id: product.id,
          image_url: String(image.url || "").slice(0, 1200),
          storage_path: String(image.path || "").slice(0, 800),
          sort_order: offset + index
        })).filter(image => image.image_url))
      });
    }

    let variantsSkipped = false;
    if (Array.isArray(payload.variants)) {
      try {
        await supabaseRest(env, \`product_variants?product_id=eq.\${encodeURIComponent(product.id)}\`, {
          method: "DELETE",
          headers: { "prefer": "return=minimal" }
        });
        const variants = payload.variants.slice(0, 50).map((variant, index) => ({
          product_id: product.id,
          name: String(variant.name || "").trim().slice(0, 80),
          value: String(variant.value || "").trim().slice(0, 120),
          sku: String(variant.sku || "").trim().slice(0, 120) || null,
          price_delta: Number(variant.priceDelta || 0),
          stock: Math.max(0, Math.round(Number(variant.stock || 0))),
          is_active: variant.isActive !== false,
          sort_order: index
        })).filter(variant => variant.name && variant.value);
        if (variants.length) {
          await supabaseRest(env, "product_variants", {
            method: "POST",
            headers: { "prefer": "return=minimal" },
            body: JSON.stringify(variants)
          });
        }
      } catch (error) {
        if (!isMissingSupabaseRelation(error)) throw error;
        variantsSkipped = true;
      }
    }

    return jsonResponse({ product: savedProducts?.[0] || product, variantsSkipped });
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo guardar el producto." }, status);
  }
}

async function uploadAdminProductImage(request, env) {
  try {
    await requireAdminUser(request, env);
    await ensureProductImagesBucketForEnv(env);
    const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    const form = await request.formData();
    const file = form.get("file");
    const path = String(form.get("path") || "").replace(/^\\/+/, "");
    if (!file || typeof file.arrayBuffer !== "function") return jsonResponse({ error: "Archivo invalido." }, 400);
    if (!path || path.includes("..")) return jsonResponse({ error: "Ruta de imagen invalida." }, 400);
    const objectPath = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
    const response = await fetch(\`\${url}/storage/v1/object/product-images/\${objectPath}\`, {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "authorization": \`Bearer \${serviceKey}\`,
        "content-type": file.type || "image/jpeg",
        "cache-control": "3600",
        "x-upsert": "false"
      },
      body: await file.arrayBuffer()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return jsonResponse({ error: data?.message || "No se pudo subir la imagen." }, response.status);
    return jsonResponse({
      path,
      url: \`\${url}/storage/v1/object/public/product-images/\${objectPath}\`
    });
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo subir la imagen." }, status);
  }
}

function buildServerCheckoutItems(requestedItems, products) {
  const byId = new Map(products.map(product => [product.id, product]));
  const byName = new Map(products.map(product => [product.name, product]));
  return requestedItems.map(item => {
    const product = byId.get(item.productId) || byName.get(item.name);
    if (!product) throw new Error(\`Producto no disponible: \${item.name || item.productId}\`);
    const stock = Number(product.stock || 0);
    if (stock <= 0) throw new Error(\`Producto agotado: \${product.name}\`);
    if (item.quantity > stock) throw new Error(\`Solo quedan \${stock} unidades de \${product.name}\`);
    return {
      productId: product.id,
      name: product.name,
      price: Number(product.price || 0),
      priceCents: Math.round(Number(product.price || 0) * 100),
      quantity: item.quantity,
      image: product.image_url || ""
    };
  }).filter(item => item.priceCents > 0);
}

async function createPendingOrder(env, user, customer, items) {
  const orderNumber = createOrderNumber();
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + 3);

  await supabaseRest(env, "customer_profiles?on_conflict=id", {
    method: "POST",
    headers: { "prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: user.id,
      full_name: String(customer.name || user.email || "").slice(0, 200),
      email: String(customer.email || user.email || "").slice(0, 200),
      phone: String(customer.phone || "").slice(0, 80),
      house_number: String(customer.houseNumber || "").slice(0, 80),
      street: String(customer.street || "").slice(0, 180),
      sector: String(customer.sector || "").slice(0, 120),
      province: String(customer.province || "").slice(0, 120),
      city: String(customer.city || "").slice(0, 120),
      address_reference: String(customer.reference || "").slice(0, 240),
      shipping_address: String(customer.address || "").slice(0, 450)
    })
  });

  const orders = await supabaseRest(env, "orders", {
    method: "POST",
    headers: { "prefer": "return=representation" },
    body: JSON.stringify({
      order_number: orderNumber,
      customer_id: user.id,
      status: "Recibido",
      payment_status: "Pendiente",
      carrier: "Catalina Express",
      subtotal,
      shipping_amount: 0,
      estimated_delivery: estimated.toISOString().slice(0, 10)
    })
  });
  const order = orders?.[0];
  if (!order?.id) throw new Error("No se pudo crear el pedido.");

  await supabaseRest(env, "order_items", {
    method: "POST",
    headers: { "prefer": "return=minimal" },
    body: JSON.stringify(items.map(item => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.quantity
    })))
  });

  await supabaseRest(env, "shipment_events", {
    method: "POST",
    headers: { "prefer": "return=minimal" },
    body: JSON.stringify({
      order_id: order.id,
      status: "Recibido",
      note: "Pedido creado por servidor. Pago pendiente de confirmacion Stripe."
    })
  });

  return order;
}

async function decrementStockForPaidOrder(env, orderId) {
  if (!orderId) return;
  const items = await supabaseRest(env, \`order_items?select=product_id,quantity&order_id=eq.\${encodeURIComponent(orderId)}\`, { method: "GET" });
  for (const item of items || []) {
    if (!item.product_id) continue;
    const products = await supabaseRest(env, \`products?select=id,stock&id=eq.\${encodeURIComponent(item.product_id)}\`, { method: "GET" });
    const product = products?.[0];
    if (!product) continue;
    const nextStock = Math.max(0, Number(product.stock || 0) - Number(item.quantity || 0));
    await supabaseRest(env, \`products?id=eq.\${encodeURIComponent(item.product_id)}\`, {
      method: "PATCH",
      headers: { "prefer": "return=minimal" },
      body: JSON.stringify({ stock: nextStock })
    });
  }
}

async function markStripeCheckoutPaid(event, env) {
  const session = event.data?.object || {};
  const orderNumber = session.metadata?.order_number || "";
  if (!orderNumber) return;
  const existingOrders = await supabaseRest(env, \`orders?select=id,payment_status&order_number=eq.\${encodeURIComponent(orderNumber)}\`, { method: "GET" });
  const wasAlreadyPaid = (existingOrders?.[0]?.payment_status || "") === "Pagado";
  const updatedOrders = await supabaseRest(env, \`orders?order_number=eq.\${encodeURIComponent(orderNumber)}\`, {
    method: "PATCH",
    headers: { "prefer": "return=representation" },
    body: JSON.stringify({
      payment_status: "Pagado",
      status: "Preparando",
      stripe_session_id: session.id,
      tracking_code: createTrackingCode(orderNumber)
    })
  });
  const order = updatedOrders?.[0];
  if (!order?.id) return;
  if (!wasAlreadyPaid) await decrementStockForPaidOrder(env, order.id);
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
  if (!wasAlreadyPaid) {
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
}

async function retrieveStripeCheckoutSession(sessionId, env) {
  const secretKey = env.STRIPE_SECRET_KEY || "";
  if (!secretKey) throw new Error("Stripe no esta configurado.");
  const response = await fetch(\`https://api.stripe.com/v1/checkout/sessions/\${encodeURIComponent(sessionId)}\`, {
    headers: { "authorization": \`Bearer \${secretKey}\` }
  });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error?.message || "Stripe no pudo verificar la sesion.");
  return session;
}

async function confirmStripeCheckoutSession(request, env) {
  try {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Solicitud invalida." }, 400);
    }
    const sessionId = String(payload.sessionId || "").trim();
    if (!sessionId.startsWith("cs_")) return jsonResponse({ error: "Sesion de Stripe invalida." }, 400);
    const session = await retrieveStripeCheckoutSession(sessionId, env);
    if (session.payment_status !== "paid") return jsonResponse({ paid: false, status: session.payment_status || "pending" });
    await markStripeCheckoutPaid({ type: "checkout.session.completed", data: { object: session } }, env);
    return jsonResponse({ paid: true, orderNumber: session.metadata?.order_number || "", trackingCode: createTrackingCode(session.metadata?.order_number || "") });
  } catch (error) {
    return jsonResponse({ error: error.message || "No se pudo confirmar el pago." }, 500);
  }
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
  try {
    const secretKey = env.STRIPE_SECRET_KEY || "";
    if (!secretKey) return jsonResponse({ error: "Stripe no esta configurado. Agrega STRIPE_SECRET_KEY en Sites." }, 503);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Solicitud invalida." }, 400);
    }

    const user = await getSupabaseUser(request, env);
    if (!user?.id) return jsonResponse({ error: "Inicia sesion para comprar." }, 401);

    const requestedItems = cleanRequestedItems(payload.items);
    if (!requestedItems.length) return jsonResponse({ error: "El carrito esta vacio." }, 400);

    const products = await getActiveProducts(env);
    const items = buildServerCheckoutItems(requestedItems, products || []);
    if (!items.length) return jsonResponse({ error: "El carrito esta vacio." }, 400);

    const origin = new URL(request.url).origin;
    const customer = payload.customer || {};
    const order = await createPendingOrder(env, user, customer, items);
    const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    const taxCents = Math.round(subtotalCents * 0.08);
    const params = new URLSearchParams();

    params.set("mode", "payment");
    params.set("success_url", \`\${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}&order=\${encodeURIComponent(order.order_number || "")}\`);
    params.set("cancel_url", \`\${origin}/?checkout=cancel\`);
    params.set("billing_address_collection", "auto");
    params.set("phone_number_collection[enabled]", "true");
    params.set("metadata[source]", "catalina-cosmetic");
    if (order.order_number) params.set("metadata[order_number]", String(order.order_number).slice(0, 80));
    if (order.id) params.set("metadata[order_id]", String(order.id).slice(0, 80));
    params.set("metadata[customer_id]", String(user.id).slice(0, 80));
    if (customer.email) params.set("customer_email", String(customer.email).slice(0, 200));
    if (customer.name) params.set("metadata[customer_name]", String(customer.name).slice(0, 200));
    if (customer.address) params.set("metadata[shipping_address]", String(customer.address).slice(0, 450));

    items.forEach((item, index) => {
      params.set(\`line_items[\${index}][quantity]\`, String(item.quantity));
      params.set(\`line_items[\${index}][price_data][currency]\`, "usd");
      params.set(\`line_items[\${index}][price_data][unit_amount]\`, String(item.priceCents));
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
  } catch (error) {
    return jsonResponse({ error: error.message || "No se pudo preparar el pago." }, 500);
  }
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

    if (url.pathname === "/api/confirm-checkout-session" && request.method === "POST") {
      return confirmStripeCheckoutSession(request, env || {});
    }

    if (url.pathname === "/api/catalog" && request.method === "GET") {
      try {
        return jsonResponse(await getCatalog(env || {}));
      } catch (error) {
        return jsonResponse({ error: error.message || "No se pudo cargar el catalogo." }, 500);
      }
    }

    if (url.pathname === "/api/admin/snapshot" && request.method === "GET") {
      try {
        return jsonResponse(await getAdminSnapshot(request, env || {}));
      } catch (error) {
        return jsonResponse({ error: error.message || "No se pudo cargar el admin." }, 403);
      }
    }

    if (url.pathname === "/api/admin/create-user" && request.method === "POST") {
      return createAdminAccount(request, env || {});
    }

    if (url.pathname === "/api/admin/ensure-product-images-bucket" && request.method === "POST") {
      return ensureProductImagesBucket(request, env || {});
    }

    if (url.pathname === "/api/admin/save-product" && request.method === "POST") {
      return saveAdminProduct(request, env || {});
    }

    if (url.pathname === "/api/admin/upload-product-image" && request.method === "POST") {
      return uploadAdminProductImage(request, env || {});
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

    if (url.pathname === "/supabase-site-content.sql") {
      return new Response(siteContentSql, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/supabase-product-images.sql") {
      return new Response(productImagesSql, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/supabase-product-management.sql") {
      return new Response(productManagementSql, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/supabase-realtime-sync.sql") {
      return new Response(realtimeSql, {
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
