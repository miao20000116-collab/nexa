import { readFileSync, writeFileSync } from "fs";

const html = readFileSync(".nexa-data/probe-douyin-share.html", "utf8");
const marker = "window._ROUTER_DATA";
const idx = html.indexOf(marker);
const eq = html.indexOf("=", idx);
let i = eq + 1;
while (/\s/.test(html[i]!)) i++;
let depth = 0;
let inStr = false;
let esc = false;
let end = -1;
for (let j = i; j < html.length; j++) {
  const c = html[j]!;
  if (inStr) {
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') {
    inStr = true;
    continue;
  }
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      end = j;
      break;
    }
  }
}
const json = html.slice(i, end + 1);
const data = JSON.parse(json) as { loaderData?: Record<string, unknown> };
writeFileSync(
  ".nexa-data/probe-douyin-router.json",
  JSON.stringify(data, null, 2),
  "utf8"
);
const loader = data.loaderData || {};
console.log("loader keys", Object.keys(loader));
for (const [k, v] of Object.entries(loader)) {
  console.log("KEY", k, v === null ? "null" : typeof v);
  if (v && typeof v === "object") {
    const s = JSON.stringify(v);
    console.log(" keys", Object.keys(v as object));
    console.log(" len", s.length);
    console.log(s.slice(0, 2000));
  }
}
