import { readFileSync } from "fs";

for (const label of ["iphone", "bot", "desktop"]) {
  const html = readFileSync(`.nexa-data/probe-ua-${label}.html`, "utf8");
  console.log("===", label, "len", html.length);
  for (const n of [
    "videoInfoRes",
    "item_list",
    "RENDER_DATA",
    "__NEXT_DATA__",
    "og:title",
    "og:image",
    "og:description",
    "aweme_detail",
    "shareMeta",
    "desc",
  ]) {
    console.log(n, html.includes(n));
  }
  const idx = html.indexOf("window._ROUTER_DATA");
  if (idx >= 0) {
    const slice = html.slice(idx, idx + 2500);
    console.log("router_has_videoInfo", slice.includes("videoInfoRes"));
    console.log("router_head", slice.slice(0, 400).replace(/\s+/g, " "));
  }
  const og = html.match(/property=["']og:description["'][^>]+content=["']([^"']+)/i);
  console.log("og:desc", og?.[1]?.slice(0, 120) || null);
}
