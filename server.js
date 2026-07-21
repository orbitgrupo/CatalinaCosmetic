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
  return `${protocol}://${host}${request.url || "/"}`;
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

loadDotEnv();

const workerPath = path.join(__dirname, "dist", "server", "index.js");
if (!fs.existsSync(workerPath)) {
  console.error("No existe dist/server/index.js. Ejecuta: npm run build");
  process.exit(1);
}

const worker = (await import(pathToFileURL(workerPath).href)).default;
const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (request, response) => {
  try {
    const body = ["GET", "HEAD"].includes(request.method || "GET") ? undefined : await getRequestBody(request);
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
  console.log(`Catalina Cosmetic corriendo en http://127.0.0.1:${port}`);
});
