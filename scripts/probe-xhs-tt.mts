import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function dumpXhs() {
  const u = "https://www.xiaohongshu.com/explore/67c8f0e0000000001d03e8a2";
  const r = await fetchThroughEgress(u, {
    headers: { "User-Agent": UA, Referer: "https://www.xiaohongshu.com/" },
    bypassProxy: true,
    timeoutMs: 20000,
  });
  const html = await r.text();
  const idx = html.indexOf("__INITIAL_STATE__");
  console.log("xhs status", r.status, "len", html.length, "stateIdx", idx);
  const m =
    html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/) ||
    html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*(?:window\.|<\/script>)/);
  if (!m?.[1]) {
    console.log("no state match");
    console.log(html.slice(idx, idx + 300));
    return;
  }
  try {
    const raw = m[1].replace(/undefined/g, "null");
    const state = JSON.parse(raw) as Record<string, unknown>;
    console.log("top keys", Object.keys(state));
    console.log(JSON.stringify(state).slice(0, 500));
  } catch (e) {
    console.log("parse fail", e instanceof Error ? e.message : e);
    console.log(m[1].slice(0, 400));
  }
}

async function dumpTt() {
  const urls = [
    "https://www.tiktok.com/@tiktok/video/7234567890123456789",
    "https://www.tiktok.com/@scout2015/video/6718339392118795461",
    "https://vm.tiktok.com/ZMjdummy/",
  ];
  for (const start of urls) {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(start)}`;
    const r = await fetchThroughEgress(oembedUrl, {
      bypassProxy: false,
      timeoutMs: 15000,
      headers: { Accept: "application/json" },
    });
    const t = await r.text();
    console.log(JSON.stringify({ start: start.slice(0, 50), status: r.status, t: t.slice(0, 200) }));
  }
}

await dumpXhs();
await dumpTt();
