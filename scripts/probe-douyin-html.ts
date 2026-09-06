import { fetchThroughEgress } from "../src/lib/read/fetch-page";
import { writeFileSync } from "fs";

const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const id = "7673183599574666530";

async function main() {
  const res = await fetchThroughEgress(
    `https://www.iesdouyin.com/share/video/${id}/`,
    {
      timeoutMs: 20000,
      userAgent: MOBILE,
      bypassProxy: true,
      headers: {
        Referer: "https://www.douyin.com/",
        Accept: "text/html,application/xhtml+xml",
      },
    }
  );
  const html = await res.text();
  writeFileSync(".nexa-data/probe-douyin-share.html", html, "utf8");
  console.log("saved len", html.length);
  const idx = html.indexOf("_ROUTER_DATA");
  console.log("idx", idx);
  if (idx >= 0) {
    console.log("around", html.slice(Math.max(0, idx - 80), idx + 400));
  }
  // Find all script id= patterns
  const ids = [...html.matchAll(/<script[^>]+id=["']([^"']+)["']/gi)].map(
    (m) => m[1]
  );
  console.log("script_ids", ids.slice(0, 30));
  // Look for JSON-ish aweme
  for (const needle of [
    "videoInfoRes",
    "loaderData",
    "aweme",
    "itemInfo",
    "share_info",
    "desc",
  ]) {
    console.log(needle, html.includes(needle), "count", (html.match(new RegExp(needle, "g")) || []).length);
  }
}

main().catch(console.error);
