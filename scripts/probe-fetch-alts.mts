import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const id = "7673183599574666530";

async function probe(label: string, u: string, bypass: boolean) {
  try {
    const r = await fetchThroughEgress(u, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: bypass ? "https://www.douyin.com/" : "https://www.tiktok.com/",
      },
      bypassProxy: bypass,
      timeoutMs: 20000,
    });
    const t = await r.text();
    console.log(
      JSON.stringify({
        label,
        status: r.status,
        ok: r.ok,
        len: t.length,
        router: t.includes("_ROUTER_DATA"),
        RENDER: t.includes("RENDER_DATA"),
        INITIAL: t.includes("__INITIAL_STATE__"),
        jsonish: t.trim().startsWith("{") || t.trim().startsWith("["),
        title: (t.match(/<title[^>]*>([^<]+)/i) || [])[1]?.slice(0, 50),
        head: t.replace(/\s+/g, " ").slice(0, 140),
      })
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }
}

await probe("dy_share", `https://www.iesdouyin.com/share/video/${id}/`, true);
await probe("dy_www", `https://www.douyin.com/video/${id}`, true);
await probe(
  "dy_iteminfo",
  `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`,
  true
);
await probe(
  "tt_oembed",
  `https://www.tiktok.com/oembed?url=${encodeURIComponent("https://www.tiktok.com/@scout2015/video/6718339392118795461")}`,
  false
);
await probe(
  "xhs",
  "https://www.xiaohongshu.com/explore/67c8f0e0000000001d03e8a2",
  true
);
