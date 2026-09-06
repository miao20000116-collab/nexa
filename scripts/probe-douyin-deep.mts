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

const markers = [
  "videoInfoRes",
  "item_list",
  "aweme_detail",
  "aweme/detail",
  "desc",
  "nickname",
  "digg_count",
  "RENDER_DATA",
  "SIGI_STATE",
  "__NEXT_DATA__",
  "playApi",
  "share_info",
  "itemId",
];
for (const m of markers) {
  console.log(m, html.includes(m) ? html.indexOf(m) : -1);
}

// dump meta tags
const metas = [...html.matchAll(/<meta[^>]+>/gi)].map((m) => m[0]).slice(0, 40);
console.log("--- metas ---");
for (const m of metas) console.log(m.slice(0, 200));

// try detail APIs
const apis = [
  `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`,
  `https://www.iesdouyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`,
  `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`,
  `https://www.iesdouyin.com/share/video/${id}/?isApp=1`,
];
for (const u of apis) {
  const res = await fetchThroughEgress(u, {
    headers: {
      "User-Agent": UA,
      Referer: url,
      Accept: "application/json,text/html,*/*",
    },
    bypassProxy: true,
    timeoutMs: 15000,
  });
  const t = await res.text();
  console.log(
    JSON.stringify({
      api: u.slice(0, 80),
      status: res.status,
      len: t.length,
      head: t.replace(/\s+/g, " ").slice(0, 180),
    })
  );
}
