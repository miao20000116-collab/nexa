/**
 * Deep-scan Douyin share HTML / router for item payloads.
 */
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

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

function findKeys(obj, needle, path = "", out = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 8) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (k.toLowerCase().includes(needle)) out.push(p);
    if (v && typeof v === "object") findKeys(v, needle, p, out, depth + 1);
  }
  return out;
}

const awemeId = process.argv[2] || "7475598819415706931";
const url = `https://www.iesdouyin.com/share/video/${awemeId}/`;
const res = await fetch(url, {
  headers: { "User-Agent": MOBILE, "Accept-Language": "zh-CN" },
});
const html = await res.text();
const data = extractRouterData(html);
console.log("top keys", Object.keys(data || {}));
console.log("loader keys", Object.keys(data?.loaderData || {}));
const page = data?.loaderData?.["video_(id)/page"];
console.log("page.itemId", page?.itemId);
console.log("keys containing video/item/desc/cover/aweme:");
for (const n of ["video", "item", "desc", "cover", "aweme", "detail"]) {
  console.log(n, findKeys(data, n).slice(0, 20));
}

// Also search raw HTML for desc-like JSON fragments
const descHit = html.match(/"desc"\s*:\s*"([^"\\]{8,120})/);
const nickHit = html.match(/"nickname"\s*:\s*"([^"\\]{1,40})"/);
const coverHit = html.match(/"cover"\s*:\s*\{[^}]*"url_list"\s*:\s*\["(https:[^"]+)"/);
console.log({
  htmlDesc: descHit?.[1],
  htmlNick: nickHit?.[1],
  htmlCover: Boolean(coverHit?.[1]),
  ogTitle: html.match(/property="og:title"[^>]+content="([^"]+)"/)?.[1]
    || html.match(/content="([^"]+)"[^>]+property="og:title"/)?.[1],
  ogImage: Boolean(html.match(/property="og:image"/)),
  titleTag: html.match(/<title[^>]*>([^<]+)</i)?.[1]?.slice(0, 80),
});
