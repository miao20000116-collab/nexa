/**
 * Probe social parse endpoints (read-only). Run:
 * npx tsx --env-file=.env scripts/probe-social-parse.ts
 */
import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function probe(
  label: string,
  url: string,
  opts?: { bypassProxy?: boolean }
) {
  try {
    const res = await fetchThroughEgress(url, {
      timeoutMs: 20000,
      userAgent: MOBILE,
      bypassProxy: opts?.bypassProxy ?? true,
      headers: { "Accept-Language": "zh-CN,en;q=0.9" },
    });
    const html = await res.text();
    const ogTitle =
      html.match(/property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
      html.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
    const ogImage = html.match(
      /property=["']og:image["'][^>]+content=["']([^"']+)/i
    )?.[1];
    console.log("---", label);
    console.log("status", res.status, "url", res.url, "len", html.length);
    console.log("og:title", ogTitle?.slice(0, 100) || null);
    console.log("og:image", ogImage?.slice(0, 120) || null);
    console.log("markers", {
      ROUTER: html.includes("_ROUTER_DATA"),
      RENDER: html.includes("RENDER_DATA"),
      INITIAL: html.includes("__INITIAL_STATE__"),
      videoInfo: html.includes("videoInfoRes"),
      item_list: html.includes("item_list"),
      aweme_detail: html.includes("aweme_detail"),
    });
    if (html.trim().startsWith("{") || html.trim().startsWith("[")) {
      console.log("json_head", html.replace(/\s+/g, " ").slice(0, 220));
    }
  } catch (e) {
    console.log("---", label, "ERR", e instanceof Error ? e.message : e);
  }
}

async function main() {
  const id = "7673183599574666530";
  await probe("douyin_share", `https://www.iesdouyin.com/share/video/${id}/`, {
    bypassProxy: true,
  });
  await probe(
    "douyin_iteminfo",
    `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${id}`,
    { bypassProxy: true }
  );
  await probe("douyin_www", `https://www.douyin.com/video/${id}`, {
    bypassProxy: true,
  });
  await probe(
    "tt_oembed_sample",
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(
      "https://www.tiktok.com/@scout2015/video/6718339397238705413"
    )}`,
    { bypassProxy: false }
  );
  await probe("xhs_home", "https://www.xiaohongshu.com/", {
    bypassProxy: true,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
