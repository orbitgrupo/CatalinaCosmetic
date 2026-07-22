import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");

function loadDotEnv() {
  if (!fs.existsSync(envPath)) return;
  const rows = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function getRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    request.on("error", reject);
  });
}

function requestUrl(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host || `127.0.0.1:${process.env.PORT || 3000}`;
  const basePath = normalizeBasePath(process.env.BASE_PATH || "");
  const rawUrl = request.url || "/";
  const pathname = rawUrl.split("?", 1)[0] || "/";
  const search = rawUrl.includes("?") ? `?${rawUrl.split("?").slice(1).join("?")}` : "";
  const cleanPath = basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
    ? pathname.slice(basePath.length) || "/"
    : pathname;
  return `${protocol}://${host}${cleanPath}${search}`;
}

function normalizeBasePath(value) {
  const clean = String(value || "").trim().replace(/\/+$/, "");
  if (!clean || clean === "/") return "";
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function stripBasePath(pathname, basePath) {
  if (!basePath) return pathname || "/";
  if (pathname === basePath) return "/";
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) || "/" : pathname;
}

function sendJson(response, payload, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function appendHeader(response, key, value) {
  if (Array.isArray(value)) {
    for (const item of value) response.appendHeader(key, item);
    return;
  }
  response.setHeader(key, value);
}

async function writeWebResponse(serverResponse, webResponse) {
  serverResponse.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => appendHeader(serverResponse, key, value));
  if (!webResponse.body) {
    serverResponse.end();
    return;
  }
  for await (const chunk of webResponse.body) {
    serverResponse.write(Buffer.from(chunk));
  }
  serverResponse.end();
}

async function requireAdmin(request) {
  const authHeader = request.headers.authorization || request.headers.Authorization || "";
  const supabaseUrl = process.env.CATALINA_SUPABASE_URL;
  const publishableKey = process.env.CATALINA_SUPABASE_PUBLISHABLE_KEY;
  if (!authHeader || !supabaseUrl || !publishableKey) {
    throw new Error("No autorizado.");
  }
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      authorization: authHeader
    }
  });
  if (!response.ok) throw new Error("No autorizado.");
  const user = await response.json();
  if (user?.app_metadata?.role !== "admin") throw new Error("Solo administradores pueden subir media.");
  return user;
}

function uploadPublicUrl(fileName) {
  const prefix = basePath ? `${basePath}/uploads/home-media` : "/uploads/home-media";
  return `${prefix}/${fileName}`;
}

function safeUploadFileName(fileName, mediaType) {
  const extension = path.extname(fileName || "").toLowerCase() || (mediaType === "video" ? ".mp4" : ".jpg");
  const cleanBase = path.basename(fileName || "media", extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "media";
  return `${Date.now()}-${cleanBase}${extension}`;
}

async function handleHomeMediaUpload(request, body) {
  await requireAdmin(request);
  const maxBytes = Number(process.env.CATALINA_HOME_MEDIA_MAX_BYTES || 80 * 1024 * 1024);
  if (!body || body.length > maxBytes) throw new Error("El archivo es demasiado grande.");
  const formRequest = new Request(requestUrl(request), {
    method: "POST",
    headers: request.headers,
    body
  });
  const form = await formRequest.formData();
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Selecciona una imagen o video.");
  const mimeType = String(file.type || "");
  const mediaType = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "";
  if (!mediaType) throw new Error("Solo se permiten imagenes o videos.");
  const uploadDir = path.join(__dirname, "public", "uploads", "home-media");
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const fileName = safeUploadFileName(file.name, mediaType);
  const filePath = path.join(uploadDir, fileName);
  await fs.promises.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return { url: uploadPublicUrl(fileName), mediaType, fileName };
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".webm": "video/webm",
    ".webp": "image/webp"
  }[ext] || "application/octet-stream";
}

async function serveHomeMedia(requestPath, response) {
  const relativePath = decodeURIComponent(requestPath.replace(/^\/uploads\/home-media\/+/, ""));
  const fileName = path.basename(relativePath);
  const filePath = path.join(__dirname, "public", "uploads", "home-media", fileName);
  if (!fileName || !fs.existsSync(filePath)) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }
  response.statusCode = 200;
  response.setHeader("content-type", contentTypeForFile(filePath));
  response.setHeader("cache-control", "public, max-age=31536000, immutable");
  fs.createReadStream(filePath).pipe(response);
}

loadDotEnv();

const workerPath = path.join(__dirname, "dist", "server", "index.js");
if (!fs.existsSync(workerPath)) {
  console.error("No existe dist/server/index.js. Ejecuta: npm run build");
  process.exit(1);
}

const worker = (await import(pathToFileURL(workerPath).href)).default;
const port = Number(process.env.PORT || 3000);
const basePath = normalizeBasePath(process.env.BASE_PATH || "");

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = (request.url || "/").split("?", 1)[0] || "/";
    const appPath = stripBasePath(requestPath, basePath);
    if (basePath && requestPath === basePath) {
      response.statusCode = 308;
      response.setHeader("location", `${basePath}/`);
      response.end();
      return;
    }
    if (request.method === "GET" && appPath.startsWith("/uploads/home-media/")) {
      await serveHomeMedia(appPath, response);
      return;
    }
    const body = ["GET", "HEAD"].includes(request.method || "GET") ? undefined : await getRequestBody(request);
    if (request.method === "POST" && appPath === "/api/admin/upload-home-media") {
      try {
        sendJson(response, await handleHomeMediaUpload(request, body));
      } catch (error) {
        sendJson(response, { error: error.message || "No se pudo subir el media." }, error.message === "No autorizado." ? 401 : 400);
      }
      return;
    }
    const webRequest = new Request(requestUrl(request), {
      method: request.method,
      headers: request.headers,
      body
    });
    const webResponse = await worker.fetch(webRequest, process.env, {});
    await writeWebResponse(response, webResponse);
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Error interno del servidor");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Catalina Cosmetic corriendo en http://127.0.0.1:${port}${basePath || "/"}`);
});
