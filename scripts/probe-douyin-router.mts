import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const id = "7673183599574666530";
const url = `https://www.iesdouyin.com/share/video/${id}/`;

const r = await fetchThroughEgress(url, {
  headers: {
    "User-Agent": UA,
    Referer: "https://www.douyin.com/",
  },
  bypassProxy: true,
  timeoutMs: 20000,
});
const html = await r.text();
const idx = html.indexOf("window._ROUTER_DATA");
console.log("status", r.status, "len", html.length, "routerIdx", idx);

function extractRouterDataJson(html: string): unknown | null {
  const marker = "window._ROUTER_DATA";
  const i0 = html.indexOf(marker);
  if (i0 < 0) return null;
  const eq = html.indexOf("=", i0);
  if (eq < 0) return null;
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i]!)) i++;
  if (html[i] !== "{") {
    const brace = html.indexOf("{", i);
    if (brace < 0) return null;
    i = brace;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
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
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch (e) {
          console.log("json parse err", e instanceof Error ? e.message : e);
          console.log("slice head", html.slice(i, i + 200));
          return null;
        }
      }
    }
  }
  return null;
}

const router = extractRouterDataJson(html) as Record<string, unknown> | null;
if (!router) {
  console.log("no router parsed");
  process.exit(0);
}
console.log("keys", Object.keys(router));
const loader = router.loaderData as Record<string, unknown> | undefined;
console.log("loaderKeys", loader ? Object.keys(loader) : null);
if (loader) {
  for (const [k, v] of Object.entries(loader)) {
    const page = v as Record<string, unknown>;
    console.log("page", k, "keys", Object.keys(page || {}));
    const info = page?.videoInfoRes as Record<string, unknown> | undefined;
    if (info) {
      console.log("videoInfoRes keys", Object.keys(info));
      const list = info.item_list as unknown[];
      console.log("item_list len", Array.isArray(list) ? list.length : null);
      if (Array.isArray(list) && list[0] && typeof list[0] === "object") {
        const item = list[0] as Record<string, unknown>;
        console.log(
          JSON.stringify({
            desc: String(item.desc || "").slice(0, 100),
            author: (item.author as { nickname?: string })?.nickname,
            hasVideo: Boolean(item.video),
            aweme_id: item.aweme_id,
          })
        );
      } else {
        console.log("videoInfoRes sample", JSON.stringify(info).slice(0, 400));
      }
    }
  }
}
