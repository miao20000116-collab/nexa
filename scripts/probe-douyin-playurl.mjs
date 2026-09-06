/**
 * Probe how to get playable Douyin URL for faceswap pipeline.
 */
import fs from "fs";
import path from "path";

const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const id = process.argv[2] || "7673183599574666530";

function extractRouterData(html) {
  const marker = "window._ROUTER_DATA";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  let i = eq + 1;
  while (/\s/.test(html[i])) i++;
  if (html[i] !== "{") i = html.indexOf("{", i);
  let depth = 0,
    inStr = false,
    esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
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
      if (depth === 0) return JSON.parse(html.slice(i, j + 1));
    }
  }
  return null;
}

function walk(obj, fn, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 10) return;
  if (Array.isArray(obj)) {
    for (const v of obj) walk(v, fn, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    fn(k, v);
    walk(v, fn, depth + 1);
  }
}

const url = `https://www.iesdouyin.com/share/video/${id}/`;
const res = await fetch(url, {
  headers: { "User-Agent": MOBILE, "Accept-Language": "zh-CN" },
});
const html = await res.text();
const outDir = path.join(".nexa-data", "recreate", id);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "share.html"), html);
console.log("status", res.status, "len", html.length);
console.log("ROUTER", html.includes("_ROUTER_DATA"));
console.log("play_addr", html.includes("play_addr"));
console.log("playwm", html.includes("playwm"));
console.log("douyinvod", html.includes("douyinvod"));

const decoded = html
  .replace(/\\u002F/g, "/")
  .replace(/\\\//g, "/")
  .replace(/&amp;/g, "&");
const mp4s = [...decoded.matchAll(/https:\/\/[^\s"'<>]+?\.mp4[^\s"'<>]*/gi)].map(
  (m) => m[0]
);
const unique = [...new Set(mp4s)].slice(0, 15);
console.log("mp4 urls", unique.length);
for (const u of unique) console.log(" -", u.slice(0, 180));

const router = extractRouterData(html);
console.log("loader keys", Object.keys(router?.loaderData || {}));
const playCandidates = [];
walk(router, (k, v) => {
  if (typeof v === "string" && /^https?:/.test(v) && /\.mp4|play|video/i.test(v)) {
    playCandidates.push({ k, v: v.slice(0, 160) });
  }
  if (k === "url_list" && Array.isArray(v)) {
    for (const u of v) if (typeof u === "string") playCandidates.push({ k, v: u.slice(0, 160) });
  }
});
console.log("router url-ish", playCandidates.slice(0, 20));

const apis = [
  `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`,
  `https://www.iesdouyin.com/web/api/v2/aweme/detail/?aweme_id=${id}`,
  `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}&device_platform=webapp&aid=6383`,
];
for (const api of apis) {
  try {
    const r = await fetch(api, {
      headers: {
        "User-Agent": MOBILE,
        Referer: url,
        Accept: "application/json",
      },
    });
    const t = await r.text();
    console.log("\nAPI", r.status, api.slice(0, 70), "len", t.length, t.slice(0, 180).replace(/\s+/g, " "));
  } catch (e) {
    console.log("API err", e.message);
  }
}
