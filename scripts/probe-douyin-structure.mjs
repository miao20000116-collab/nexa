/**
 * Inspect Douyin share page structure for a known aweme id.
 * Usage: node scripts/probe-douyin-structure.mjs [awemeId]
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
  if (html[i] !== "{") {
    const brace = html.indexOf("{", i);
    if (brace < 0) return null;
    i = brace;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
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

const awemeId = process.argv[2] || "7475598819415706931";
const url = `https://www.iesdouyin.com/share/video/${awemeId}/`;
const res = await fetch(url, {
  headers: { "User-Agent": MOBILE, "Accept-Language": "zh-CN" },
  redirect: "follow",
});
const html = await res.text();
console.log({ status: res.status, len: html.length, hasRouter: html.includes("_ROUTER_DATA") });
const data = extractRouterData(html);
if (!data) {
  console.log("no router");
  process.exit(1);
}
const page = data.loaderData?.["video_(id)/page"];
console.log("page keys", Object.keys(page || {}));
const vir = page?.videoInfoRes;
console.log("videoInfoRes keys", vir ? Object.keys(vir) : null);
console.log("status_code", vir?.status_code);
console.log("item_list len", vir?.item_list?.length);
console.log("filter_list", JSON.stringify(vir?.filter_list)?.slice(0, 300));
if (vir?.item_list?.[0]) {
  const item = vir.item_list[0];
  console.log({
    desc: item.desc?.slice(0, 80),
    author: item.author?.nickname,
    cover: item.video?.cover?.url_list?.[0]?.slice(0, 80),
    duration: item.video?.duration,
  });
} else {
  // dump shallow structure for debugging alternate shapes
  console.log("raw videoInfoRes sample", JSON.stringify(vir).slice(0, 800));
  // try alternate: aweme_detail
  if (page?.aweme_detail) {
    console.log("aweme_detail keys", Object.keys(page.aweme_detail));
  }
}
