/**
 * Dev probe: resolve Douyin share URL → _ROUTER_DATA item fields.
 * Usage: node scripts/probe-douyin-parse.mjs [url-or-awemeId]
 */
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

function extractAwemeId(url) {
  const patterns = [
    /\/(?:share\/)?video\/(\d{8,})/i,
    /\/(?:share\/)?note\/(\d{8,})/i,
    /aweme_id=(\d{8,})/i,
    /modal_id=(\d{8,})/i,
    /[?&]id=(\d{8,})/i,
    /\/(\d{15,})(?:\/|\?|$)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function resolveRedirectChain(startUrl) {
  const chain = [];
  let cur = startUrl;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(cur, {
      headers: {
        "User-Agent": MOBILE,
        Accept: "text/html",
        "Accept-Language": "zh-CN,zh;q=0.9",
        Referer: "https://www.douyin.com/",
      },
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    chain.push({ status: res.status, url: cur, loc });
    if (
      !loc ||
      ![301, 302, 303, 307, 308].includes(res.status)
    ) {
      break;
    }
    cur = new URL(loc, cur).toString();
  }
  return chain;
}

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

async function parseShare(awemeId) {
  const url = `https://www.iesdouyin.com/share/video/${awemeId}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": MOBILE, "Accept-Language": "zh-CN" },
    redirect: "follow",
  });
  const html = await res.text();
  const router = extractRouterData(html);
  if (!router) return { ok: false, reason: "no_router", len: html.length };
  const loader = router.loaderData || {};
  let item = null;
  for (const page of Object.values(loader)) {
    const list = page?.videoInfoRes?.item_list;
    if (Array.isArray(list) && list[0]) {
      item = list[0];
      break;
    }
  }
  if (!item) return { ok: false, reason: "no_item", keys: Object.keys(loader) };
  return {
    ok: true,
    desc: item.desc?.slice(0, 100),
    author: item.author?.nickname,
    cover: Boolean(item.video?.cover?.url_list?.[0]),
    duration: item.video?.duration,
    aweme: item.aweme_id,
  };
}

const arg = process.argv[2] || "7475598819415706931";
if (/^\d{8,}$/.test(arg)) {
  console.log(await parseShare(arg));
} else {
  const chain = await resolveRedirectChain(arg);
  console.log("redirect chain", chain);
  let id = null;
  for (const hop of chain) {
    id = extractAwemeId(hop.url) || (hop.loc ? extractAwemeId(hop.loc) : null);
    if (id) break;
  }
  console.log("resolved awemeId", id);
  if (id) console.log(await parseShare(id));
}
