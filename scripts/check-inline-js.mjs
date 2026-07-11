import fs from "node:fs";

const html = fs.readFileSync(new URL("../catalina.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);

for (const script of scripts) {
  new Function(script);
}

console.log(`inline js syntax ok: ${scripts.length}`);
