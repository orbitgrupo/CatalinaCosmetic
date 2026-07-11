import fs from "node:fs";

const files = ["catalina.html", "admin.html"];
let total = 0;

for (const file of files) {
  const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  for (const script of scripts) {
    new Function(script);
  }
  total += scripts.length;
  console.log(`${file}: inline js syntax ok (${scripts.length})`);
}

console.log(`inline js syntax ok: ${total}`);
