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
    supabasePublishableKey: env.CATALINA_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || ""
  };
  const script = \`<script>window.__CATALINA_CONFIG__=\${JSON.stringify(config)};</script>\`;
  return body.replace("</head>", \`\${script}</head>\`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    return new Response(html, {
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
