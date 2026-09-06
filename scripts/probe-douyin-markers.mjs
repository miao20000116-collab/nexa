const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const awemeId = process.argv[2] || "7475598819415706931";
const urls = [
  `https://www.iesdouyin.com/share/video/${awemeId}/`,
  `https://www.douyin.com/video/${awemeId}`,
];
for (const url of urls) {
  const res = await fetch(url, {
    headers: { "User-Agent": MOBILE, "Accept-Language": "zh-CN" },
    redirect: "follow",
  });
  const html = await res.text();
  const markers = [
    "_ROUTER_DATA",
    "RENDER_DATA",
    "__UNIVERSAL_DATA",
    "SIGI_STATE",
    "itemInfo",
    "awemeDetail",
    "og:title",
    "og:image",
    "og:description",
  ];
  console.log(
    "\n",
    url,
    res.status,
    Object.fromEntries(markers.map((m) => [m, html.includes(m)]))
  );
}
