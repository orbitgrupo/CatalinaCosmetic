import fs from "node:fs";
const root = new URL("..", import.meta.url);
const html = fs.readFileSync(new URL("catalina.html", root), "utf8");
const admin = fs.readFileSync(new URL("admin.html", root), "utf8");
const auth = fs.readFileSync(new URL("auth.html", root), "utf8");
const resetPassword = fs.readFileSync(new URL("reset-password.html", root), "utf8");
const schema = fs.readFileSync(new URL("supabase-schema.sql", root), "utf8");
const seed = fs.readFileSync(new URL("supabase-seed.sql", root), "utf8");
const siteContentSql = fs.readFileSync(new URL("supabase-site-content.sql", root), "utf8");
const productImagesSql = fs.readFileSync(new URL("supabase-product-images.sql", root), "utf8");
const productManagementSql = fs.readFileSync(new URL("supabase-product-management.sql", root), "utf8");
const customerEngagementSql = fs.readFileSync(new URL("supabase-customer-engagement.sql", root), "utf8");
const customerUniquenessSql = fs.readFileSync(new URL("supabase-customer-uniqueness.sql", root), "utf8");
const customerAddressesSql = fs.readFileSync(new URL("supabase-customer-addresses.sql", root), "utf8");
const realtimeSql = fs.readFileSync(new URL("supabase-realtime-sync.sql", root), "utf8");
const vendorRolesSql = fs.readFileSync(new URL("supabase-vendor-roles.sql", root), "utf8");
const vendorApplicationsSql = fs.readFileSync(new URL("supabase-vendor-applications.sql", root), "utf8");
const setup = fs.readFileSync(new URL("SUPABASE_SETUP.md", root), "utf8");
const favicon = fs.readFileSync(new URL("assets/favicon.svg", root), "utf8");
const faviconAdmin = fs.readFileSync(new URL("assets/favicon-admin.svg", root), "utf8");
const siteManifest = fs.readFileSync(new URL("assets/site.webmanifest", root), "utf8");
const distServer = new URL("dist/server/", root);
const distOpenAI = new URL("dist/.openai/", root);

fs.mkdirSync(distServer, { recursive: true });
fs.mkdirSync(distOpenAI, { recursive: true });
fs.copyFileSync(new URL(".openai/hosting.json", root), new URL("hosting.json", distOpenAI));

const worker = `const html = ${JSON.stringify(html)};
const admin = ${JSON.stringify(admin)};
const auth = ${JSON.stringify(auth)};
const resetPassword = ${JSON.stringify(resetPassword)};
const schema = ${JSON.stringify(schema)};
const seed = ${JSON.stringify(seed)};
const siteContentSql = ${JSON.stringify(siteContentSql)};
const productImagesSql = ${JSON.stringify(productImagesSql)};
const productManagementSql = ${JSON.stringify(productManagementSql)};
const customerEngagementSql = ${JSON.stringify(customerEngagementSql)};
const customerUniquenessSql = ${JSON.stringify(customerUniquenessSql)};
const customerAddressesSql = ${JSON.stringify(customerAddressesSql)};
const realtimeSql = ${JSON.stringify(realtimeSql)};
const vendorRolesSql = ${JSON.stringify(vendorRolesSql)};
const vendorApplicationsSql = ${JSON.stringify(vendorApplicationsSql)};
const setup = ${JSON.stringify(setup)};
const favicon = ${JSON.stringify(favicon)};
const faviconAdmin = ${JSON.stringify(faviconAdmin)};
const siteManifest = ${JSON.stringify(siteManifest)};

function withRuntimeConfig(body, env) {
  const basePath = normalizeBasePath(env.BASE_PATH || "");
  const config = {
    supabaseUrl: env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "",
    supabasePublishableKey: env.CATALINA_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "",
    stripeConfigured: Boolean(env.STRIPE_SECRET_KEY),
    stripeWebhookConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    supabaseServiceConfigured: Boolean(env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
    basePath
  };
  const script = \`<script>window.__CATALINA_CONFIG__=\${JSON.stringify(config)};</script>\`;
  return body.replace("</head>", \`\${script}</head>\`);
}

function normalizeBasePath(value) {
  const clean = String(value || "").trim().replace(/\\/+$/, "");
  if (!clean || clean === "/") return "";
  return clean.startsWith("/") ? clean : \`/\${clean}\`;
}

function securityHeaders(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
    ...extra
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: securityHeaders({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    })
  });
}

async function vendorSupabaseScript() {
  const sources = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
    "https://unpkg.com/@supabase/supabase-js@2"
  ];
  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) continue;
      return new Response(await response.text(), {
        headers: securityHeaders({
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400"
        })
      });
    } catch {
      // Try the next CDN.
    }
  }
  return new Response("console.error('Supabase client could not be loaded.');", {
    status: 503,
    headers: securityHeaders({
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store"
    })
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

async function requireAdminOrVendorUser(request, env) {
  const user = await getSupabaseUser(request, env);
  const role = user?.app_metadata?.role || "";
  if (!user?.id) throw new Error("Inicia sesion.");
  if (!["admin", "vendor"].includes(role)) throw new Error("Esta cuenta no tiene permisos para el dashboard.");
  return user;
}

async function requireCustomerUser(request, env) {
  const user = await getSupabaseUser(request, env);
  if (!user?.id) throw new Error("Inicia sesion.");
  return user;
}

function isVendorUser(user) {
  return user?.app_metadata?.role === "vendor";
}

function normalizeAccountEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeAccountPhone(value = "") {
  return String(value || "").replace(/\D/g, "");
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
  if (!response.ok) {
    const message = data?.message || "";
    if (data?.code === "23505" && /customer_profiles/i.test(message) && /email/i.test(message)) {
      throw new Error("Ya existe un cliente registrado con ese email.");
    }
    if (data?.code === "23505" && /customer_profiles/i.test(message) && /phone/i.test(message)) {
      throw new Error("Ya existe un cliente registrado con ese telefono.");
    }
    throw new Error(message || "Supabase no acepto la operacion.");
  }
  return data;
}

async function getActiveProducts(env) {
  return supabaseRest(env, "products?select=id,name,price,stock,image_url,is_active&is_active=eq.true", { method: "GET" });
}

async function listAuthUsersForDuplicateCheck(env) {
  const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return [];
  const response = await fetch(url + "/auth/v1/admin/users?page=1&per_page=1000", {
    headers: {
      "apikey": serviceKey,
      "authorization": "Bearer " + serviceKey
    }
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.users) ? data.users : Array.isArray(data) ? data : [];
}

async function checkAccountAvailability(request, env) {
  try {
    const payload = await request.json().catch(() => ({}));
    const email = normalizeAccountEmail(payload.email);
    const phone = normalizeAccountPhone(payload.phone);
    if (!email || !email.includes("@")) return jsonResponse({ available: false, field: "email", message: "Escribe un email valido." }, 400);
    if (!phone || phone.length < 7) return jsonResponse({ available: false, field: "phone", message: "Escribe un telefono valido." }, 400);

    const authUsers = await listAuthUsersForDuplicateCheck(env);
    if (authUsers.some(user => normalizeAccountEmail(user.email) === email)) {
      return jsonResponse({ available: false, field: "email", message: "Ya existe una cuenta con ese email. Inicia sesion o recupera tu contrasena. Si quieres vender, usa Conviertete en vendedor con esa cuenta." }, 409);
    }

    const profiles = await supabaseRest(env, "customer_profiles?select=id,email,phone&limit=5000", { method: "GET" });
    const duplicate = (profiles || []).find(profile => normalizeAccountEmail(profile.email) === email || normalizeAccountPhone(profile.phone) === phone);
    if (duplicate) {
      const field = normalizeAccountEmail(duplicate.email) === email ? "email" : "phone";
      return jsonResponse({ available: false, field, message: field === "email" ? "Ya existe una cuenta con ese email. Inicia sesion o recupera tu contrasena." : "Ya existe una cuenta con ese telefono. Inicia sesion o usa otro telefono." }, 409);
    }

    return jsonResponse({ available: true });
  } catch (error) {
    return jsonResponse({ available: false, message: error.message || "No se pudo verificar la cuenta." }, 500);
  }
}

async function getCatalog(env) {
  let products;
  try {
    products = await supabaseRest(env, "products?select=id,name,category,short_description,description,sku,price,compare_at_price,discount_percent,stock,low_stock_threshold,image_url,is_active,owner_user_id,product_images(id,image_url,storage_path,alt_text,sort_order),product_variants(id,name,value,sku,price_delta,stock,is_active,sort_order)&is_active=eq.true&order=created_at.desc", { method: "GET" });
  } catch {
    try {
      products = await supabaseRest(env, "products?select=id,name,category,description,price,stock,image_url,is_active,owner_user_id,product_images(id,image_url,storage_path,alt_text,sort_order)&is_active=eq.true&order=created_at.desc", { method: "GET" });
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
  const user = await requireAdminOrVendorUser(request, env);
  if (isVendorUser(user)) {
    const products = await supabaseRest(env, \`products?select=id&owner_user_id=eq.\${encodeURIComponent(user.id)}\`, { method: "GET" });
    const productIds = new Set((products || []).map(product => product.id).filter(Boolean));
    const ordersRaw = await supabaseRest(env, "orders?select=id,order_number,customer_id,status,payment_status,carrier,tracking_code,estimated_delivery,created_at,subtotal,shipping_amount,total,order_items(product_id,product_name,unit_price,quantity),shipment_events(status,note,event_at)&order=created_at.desc", { method: "GET" });
    const orders = (ordersRaw || []).map(order => ({
      ...order,
      order_items: (order.order_items || []).filter(item => productIds.has(item.product_id))
    })).filter(order => (order.order_items || []).length);
    const customerIds = [...new Set(orders.map(order => order.customer_id).filter(Boolean))];
    const customers = customerIds.length
      ? await supabaseRest(env, \`customer_profiles?select=id,full_name,email,phone,house_number,street,sector,province,city,address_reference,shipping_address,created_at&id=in.(\${customerIds.map(encodeURIComponent).join(",")})&order=created_at.desc\`, { method: "GET" })
      : [];
    let reviews = [];
    try {
      reviews = productIds.size
        ? await supabaseRest(env, \`product_reviews?select=id,product_id,user_id,rating,title,comment,status,created_at&product_id=in.(\${[...productIds].map(encodeURIComponent).join(",")})&order=created_at.desc\`, { method: "GET" })
        : [];
    } catch {
      reviews = [];
    }
    return { customers: customers || [], orders, reviews: reviews || [] };
  }
  const vendors = await listVendorAccounts(env);
  const vendorApplications = await listVendorApplications(env);
  const customers = await supabaseRest(env, "customer_profiles?select=id,full_name,email,phone,house_number,street,sector,province,city,address_reference,shipping_address,created_at&order=created_at.desc", { method: "GET" });
  const orders = await supabaseRest(env, "orders?select=id,order_number,customer_id,status,payment_status,carrier,tracking_code,estimated_delivery,created_at,subtotal,shipping_amount,total,order_items(product_id,product_name,unit_price,quantity),shipment_events(status,note,event_at)&order=created_at.desc", { method: "GET" });
  let reviews = [];
  try {
    reviews = await supabaseRest(env, "product_reviews?select=id,product_id,user_id,rating,title,comment,status,created_at&order=created_at.desc", { method: "GET" });
  } catch {
    reviews = [];
  }
  return { vendors, vendorApplications, customers: customers || [], orders: orders || [], reviews: reviews || [] };
}

async function listVendorApplications(env) {
  try {
    return await supabaseRest(env, "vendor_applications?select=*&order=created_at.desc", { method: "GET" });
  } catch {
    return [];
  }
}

async function listVendorAccounts(env) {
  const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return [];
  const response = await fetch(url + "/auth/v1/admin/users?page=1&per_page=200", {
    headers: {
      "apikey": serviceKey,
      "authorization": "Bearer " + serviceKey
    }
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const users = Array.isArray(payload.users) ? payload.users : [];
  return users
    .filter(user => user?.app_metadata?.role === "vendor")
    .map(user => ({
      id: user.id,
      email: user.email || "",
      fullName: user.user_metadata?.full_name || user.user_metadata?.name || "",
      created_at: user.created_at || ""
    }));
}

function cleanUserAccountPayload(payload = {}) {
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const fullName = String(payload.fullName || "").trim().slice(0, 160);
  const role = String(payload.role || "user").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Escribe un email valido.");
  if (password.length < 8) throw new Error("La contrasena debe tener minimo 8 caracteres.");
  if (!["user", "vendor"].includes(role)) throw new Error("Rol invalido.");
  return { email, password, fullName, role };
}

async function createUserAccount(request, env) {
  try {
    await requireAdminUser(request, env);
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "Solicitud invalida." }, 400);
    }
    const account = cleanUserAccountPayload(payload);
    const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) return jsonResponse({ error: "Supabase service role no esta configurado en Sites." }, 503);
    const existingUsers = await listAuthUsersForDuplicateCheck(env);
    if (existingUsers.some(user => normalizeAccountEmail(user.email) === account.email)) {
      return jsonResponse({ error: "Ya existe una cuenta con ese email. No crees otra cuenta; si quiere vender, debe solicitar ser vendedor desde su cuenta actual." }, 409);
    }

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
        app_metadata: { role: account.role },
        user_metadata: account.fullName ? { full_name: account.fullName } : {}
      })
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) return jsonResponse({ error: data?.msg || data?.message || data?.error_description || "Supabase no pudo crear el usuario." }, response.status);
    return jsonResponse({
      id: data.id || "",
      email: data.email || account.email,
      fullName: account.fullName,
      role: data.app_metadata?.role || account.role
    }, 201);
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo crear el usuario." }, status);
  }
}

function cleanVendorApplicationReviewPayload(payload = {}) {
  const id = String(payload.id || "").trim();
  const status = String(payload.status || "").trim();
  const notes = String(payload.notes || "").trim().slice(0, 1000);
  if (!id) throw new Error("Solicitud invalida.");
  if (!["Aprobado", "Rechazado", "En revision"].includes(status)) throw new Error("Estado invalido.");
  return { id, status, notes };
}

function cleanVendorApplicationPayload(payload = {}, user = {}) {
  const fullName = String(payload.full_name || payload.fullName || "").trim().slice(0, 180);
  const email = String(user.email || payload.email || "").trim().toLowerCase();
  const phone = String(payload.phone || "").trim().slice(0, 40);
  const businessName = String(payload.business_name || payload.businessName || "").trim().slice(0, 180);
  const sellerType = String(payload.seller_type || payload.sellerType || "independent").trim();
  const productCategories = String(payload.product_categories || payload.productCategories || "").trim().slice(0, 500);
  const productCount = Math.max(0, Number(payload.product_count || payload.productCount || 0));
  const experience = String(payload.experience || "").trim().slice(0, 1500);
  if (!fullName) throw new Error("Escribe tu nombre completo.");
  if (!email || !email.includes("@")) throw new Error("Tu cuenta no tiene email valido.");
  if (!businessName) throw new Error("Escribe el nombre de tu marca o negocio.");
  if (!["brand_owner", "independent", "both"].includes(sellerType)) throw new Error("Tipo de vendedor invalido.");
  if (!productCategories) throw new Error("Escribe las categorias que venderias.");
  if (!experience) throw new Error("Describe tu experiencia vendiendo productos.");
  return {
    user_id: user.id,
    full_name: fullName,
    email,
    phone,
    business_name: businessName,
    seller_type: sellerType,
    product_categories: productCategories,
    product_count: productCount,
    has_inventory: Boolean(payload.has_inventory ?? payload.hasInventory),
    has_registered_business: Boolean(payload.has_registered_business ?? payload.hasRegisteredBusiness),
    sells_online: Boolean(payload.sells_online ?? payload.sellsOnline),
    social_links: String(payload.social_links || payload.socialLinks || "").trim().slice(0, 800),
    experience,
    message: String(payload.message || "").trim().slice(0, 1500),
    status: "Pendiente"
  };
}

async function submitVendorApplication(request, env) {
  try {
    const user = await requireCustomerUser(request, env);
    const payload = cleanVendorApplicationPayload(await request.json().catch(() => ({})), user);
    const existing = await supabaseRest(env, "vendor_applications?select=id,status&user_id=eq." + encodeURIComponent(user.id) + "&status=in.(Pendiente,En%20revision,Aprobado)&limit=1", { method: "GET" });
    if (existing?.length) return jsonResponse({ error: "Ya tienes una solicitud activa o aprobada. Administracion la revisara desde el panel." }, 409);
    const rows = await supabaseRest(env, "vendor_applications", {
      method: "POST",
      headers: { "prefer": "return=representation" },
      body: JSON.stringify(payload)
    });
    return jsonResponse({ ok: true, application: rows?.[0] || payload }, 201);
  } catch (error) {
    const status = /sesion/i.test(error.message || "") ? 401 : /activa|aprobada/i.test(error.message || "") ? 409 : 400;
    return jsonResponse({ error: error.message || "No se pudo mandar la solicitud." }, status);
  }
}

function vendorDashboardUrl(request, env) {
  const requestUrl = new URL(request.url);
  return requestUrl.origin + normalizeBasePath(env.BASE_PATH || "") + "/admin.html";
}

async function sendVendorApprovalEmail(request, env, application) {
  const dashboardUrl = vendorDashboardUrl(request, env);
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.CATALINA_EMAIL_FROM || "";
  if (!apiKey || !from || !application?.email) return { sent: false, dashboardUrl };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": "Bearer " + apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [application.email],
      subject: "Bienvenido al panel de vendedores Catalina",
      html: "<p>Hola " + String(application.full_name || application.email) + ",</p><p>Tu solicitud para vender en Catalina fue aprobada.</p><p>Puedes acceder al panel de vendedor desde este enlace:</p><p><a href=\\"" + dashboardUrl + "\\">Entrar al panel de vendedor</a></p>"
    })
  });
  if (!response.ok) return { sent: false, dashboardUrl };
  return { sent: true, dashboardUrl };
}

async function reviewVendorApplication(request, env) {
  try {
    const admin = await requireAdminUser(request, env);
    const payload = cleanVendorApplicationReviewPayload(await request.json().catch(() => ({})));
    const applications = await supabaseRest(env, "vendor_applications?select=*&id=eq." + encodeURIComponent(payload.id), { method: "GET" });
    const application = applications?.[0];
    if (!application) return jsonResponse({ error: "Solicitud no encontrada." }, 404);

    await supabaseRest(env, "vendor_applications?id=eq." + encodeURIComponent(payload.id), {
      method: "PATCH",
      headers: { "prefer": "return=representation" },
      body: JSON.stringify({
        status: payload.status,
        admin_notes: payload.notes,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString()
      })
    });

    let vendor = null;
    let email = { sent: false, dashboardUrl: vendorDashboardUrl(request, env) };
    if (payload.status === "Aprobado") {
      vendor = await updateUserRole(env, application.user_id, "vendor");
      email = await sendVendorApprovalEmail(request, env, application);
    }
    return jsonResponse({ ok: true, status: payload.status, vendor, email });
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo revisar la solicitud." }, status);
  }
}

async function updateUserRole(env, userId, role) {
  const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) throw new Error("Supabase service role no esta configurado.");
  const getResponse = await fetch(url + "/auth/v1/admin/users/" + encodeURIComponent(userId), {
    headers: {
      "apikey": serviceKey,
      "authorization": "Bearer " + serviceKey
    }
  });
  const current = await getResponse.json().catch(() => ({}));
  if (!getResponse.ok) throw new Error(current?.msg || current?.message || "No se pudo leer el usuario.");
  const appMetadata = { ...(current.app_metadata || {}), role };
  const response = await fetch(url + "/auth/v1/admin/users/" + encodeURIComponent(userId), {
    method: "PUT",
    headers: {
      "apikey": serviceKey,
      "authorization": "Bearer " + serviceKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ app_metadata: appMetadata })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg || data?.message || "No se pudo actualizar el rol del usuario.");
  return {
    id: data.id || userId,
    email: data.email || current.email || "",
    fullName: data.user_metadata?.full_name || current.user_metadata?.full_name || "",
    created_at: data.created_at || current.created_at || ""
  };
}

async function ensureProductImagesBucket(request, env) {
  try {
    await requireAdminOrVendorUser(request, env);
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
    short_description: String(product.shortDescription || product.short_description || "").trim().slice(0, 220),
    description: String(product.description || "").trim().slice(0, 2000),
    sku: String(product.sku || "").trim().slice(0, 120) || null,
    price: Math.max(0, Number(product.price || 0)),
    compare_at_price: Number(product.compareAtPrice || 0) > 0 ? Number(product.compareAtPrice || 0) : null,
    discount_percent: Math.max(0, Math.min(100, Number(product.discountPercent || 0))),
    stock: Math.max(0, Math.round(Number(product.stock || 0))),
    low_stock_threshold: Math.max(0, Math.round(Number(product.lowStockThreshold || 5))),
    image_url: String(product.image || "").trim().slice(0, 1200),
    owner_user_id: String(product.ownerUserId || product.owner_user_id || "").trim() || null,
    is_active: true
  };
}

function isMissingSupabaseRelation(error) {
  return /schema cache|Could not find the table|relation .* does not exist|PGRST205/i.test(error?.message || "");
}

async function saveAdminProduct(request, env) {
  try {
    const user = await requireAdminOrVendorUser(request, env);
    const payload = await request.json().catch(() => null);
    if (!payload?.product) return jsonResponse({ error: "Producto invalido." }, 400);
    const product = cleanProductPayload(payload.product);
    if (!product.name || !product.category) return jsonResponse({ error: "Completa nombre y categoria." }, 400);
    if (isVendorUser(user)) {
      const existing = await supabaseRest(env, \`products?select=id,owner_user_id&id=eq.\${encodeURIComponent(product.id)}\`, { method: "GET" });
      const ownerId = existing?.[0]?.owner_user_id || "";
      if (existing?.length && ownerId && ownerId !== user.id) return jsonResponse({ error: "No puedes editar productos de otro vendedor." }, 403);
      product.owner_user_id = user.id;
    }

    if (payload.category?.name && !isVendorUser(user)) {
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

    let imagesSkipped = false;
    let insertedImages = [];
    const uploadedImages = Array.isArray(payload.uploadedImages) ? payload.uploadedImages : [];
    if (uploadedImages.length) {
      const offset = Math.max(0, Number(payload.imageOffset || 0));
      try {
        insertedImages = await supabaseRest(env, "product_images", {
          method: "POST",
          headers: { "prefer": "return=representation" },
          body: JSON.stringify(uploadedImages.slice(0, 25).map((image, index) => ({
            product_id: product.id,
            image_url: String(image.url || "").slice(0, 1200),
            storage_path: String(image.path || "").slice(0, 800),
            sort_order: offset + index
          })).filter(image => image.image_url))
        });
      } catch (error) {
        if (!isMissingSupabaseRelation(error)) throw error;
        imagesSkipped = true;
      }
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

    return jsonResponse({ product: savedProducts?.[0] || product, insertedImages: insertedImages || [], imagesSkipped, variantsSkipped });
  } catch (error) {
    const status = /admin|permisos|sesion/i.test(error.message || "") ? 403 : 500;
    return jsonResponse({ error: error.message || "No se pudo guardar el producto." }, status);
  }
}

async function uploadAdminProductImage(request, env) {
  try {
    await requireAdminOrVendorUser(request, env);
    await ensureProductImagesBucketForEnv(env);
    const url = env.CATALINA_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.CATALINA_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
    const form = await request.formData();
    const file = form.get("file");
    const path = String(form.get("path") || "").replace(/^\\/+/, "");
    if (!file || typeof file.arrayBuffer !== "function") return jsonResponse({ error: "Archivo invalido." }, 400);
    if (!path || path.includes("..")) return jsonResponse({ error: "Ruta de imagen invalida." }, 400);
    const maxBytes = Number(env.CATALINA_PRODUCT_IMAGE_MAX_BYTES || 12 * 1024 * 1024);
    const mimeType = String(file.type || "");
    const extension = String(path.split(".").pop() || "").toLowerCase();
    const allowedMimes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
    const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
    if (!allowedMimes.has(mimeType) || !allowedExtensions.has(extension)) {
      return jsonResponse({ error: "Solo se permiten imagenes JPG, PNG, WebP, GIF o AVIF." }, 400);
    }
    if (Number(file.size || 0) > maxBytes) return jsonResponse({ error: "La imagen es demasiado grande." }, 400);
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

    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const basePath = normalizeBasePath(env.BASE_PATH || "");
    const returnBase = \`\${origin}\${basePath || ""}/\`;
    const customer = payload.customer || {};
    const order = await createPendingOrder(env, user, customer, items);
    const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    const taxCents = Math.round(subtotalCents * 0.08);
    const params = new URLSearchParams();

    params.set("mode", "payment");
    params.set("success_url", \`\${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}&order=\${encodeURIComponent(order.order_number || "")}\`);
    params.set("cancel_url", \`\${returnBase}?checkout=cancel\`);
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

    if (url.pathname === "/api/check-account-availability" && request.method === "POST") {
      return checkAccountAvailability(request, env || {});
    }

    if (url.pathname === "/api/vendor/apply" && request.method === "POST") {
      return submitVendorApplication(request, env || {});
    }

    if (url.pathname === "/api/admin/snapshot" && request.method === "GET") {
      try {
        return jsonResponse(await getAdminSnapshot(request, env || {}));
      } catch (error) {
        return jsonResponse({ error: error.message || "No se pudo cargar el admin." }, 403);
      }
    }

    if (url.pathname === "/api/admin/create-user" && request.method === "POST") {
      return createUserAccount(request, env || {});
    }

    if (url.pathname === "/api/admin/review-vendor-application" && request.method === "POST") {
      return reviewVendorApplication(request, env || {});
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
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-seed.sql") {
      return new Response(seed, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-site-content.sql") {
      return new Response(siteContentSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-product-images.sql") {
      return new Response(productImagesSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-product-management.sql") {
      return new Response(productManagementSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-customer-engagement.sql") {
      return new Response(customerEngagementSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-customer-uniqueness.sql") {
      return new Response(customerUniquenessSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-customer-addresses.sql") {
      return new Response(customerAddressesSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-realtime-sync.sql") {
      return new Response(realtimeSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-vendor-roles.sql") {
      return new Response(vendorRolesSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/supabase-vendor-applications.sql") {
      return new Response(vendorApplicationsSql, {
        headers: securityHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/SUPABASE_SETUP.md") {
      return new Response(setup, {
        headers: securityHeaders({
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=300"
        })
      });
    }

    if (url.pathname === "/vendor/supabase.js") {
      return vendorSupabaseScript();
    }

    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      return new Response(withRuntimeConfig(admin, env || {}), {
        headers: securityHeaders({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        })
      });
    }

    if (url.pathname === "/auth" || url.pathname === "/auth.html" || url.pathname === "/login" || url.pathname === "/login.html" || url.pathname === "/cuenta" || url.pathname === "/cuenta.html") {
      return new Response(withRuntimeConfig(auth, env || {}), {
        headers: securityHeaders({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        })
      });
    }

    if (url.pathname === "/favicon.svg") {
      return new Response(favicon, {
        headers: securityHeaders({
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=86400"
        })
      });
    }

    if (url.pathname === "/favicon-admin.svg") {
      return new Response(faviconAdmin, {
        headers: securityHeaders({
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=86400"
        })
      });
    }

    if (url.pathname === "/site.webmanifest") {
      return new Response(siteManifest, {
        headers: securityHeaders({
          "content-type": "application/manifest+json; charset=utf-8",
          "cache-control": "public, max-age=86400"
        })
      });
    }

    if (url.pathname === "/reset-password" || url.pathname === "/reset-password.html" || url.pathname === "/recuperar-contrasena" || url.pathname === "/recuperar-contrasena.html") {
      return new Response(withRuntimeConfig(resetPassword, env || {}), {
        headers: securityHeaders({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        })
      });
    }

    return new Response(withRuntimeConfig(html, env || {}), {
      headers: securityHeaders({
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      })
    });
  }
};
`;

fs.writeFileSync(new URL("index.js", distServer), worker);
fs.mkdirSync(new URL("worker/", root), { recursive: true });
fs.writeFileSync(new URL("worker/index.js", root), worker);

console.log(`built worker with ${html.length} shop bytes, ${admin.length} admin bytes, ${auth.length} auth bytes, ${resetPassword.length} reset bytes and ${schema.length} sql bytes`);
