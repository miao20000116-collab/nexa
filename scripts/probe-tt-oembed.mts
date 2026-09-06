import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const url =
  "https://www.tiktok.com/oembed?url=" +
  encodeURIComponent("https://www.tiktok.com/@scout2015/video/6718339392118795461");

for (const bypass of [false, true]) {
  for (const ua of [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet",
  ]) {
    try {
      const r = await fetchThroughEgress(url, {
        bypassProxy: bypass,
        userAgent: ua,
        timeoutMs: 15000,
        headers: { Accept: "application/json" },
      });
      const t = await r.text();
      console.log(
        JSON.stringify({
          bypass,
          ua: ua.slice(0, 20),
          status: r.status,
          t: t.slice(0, 180),
        })
      );
    } catch (e) {
      console.log(
        JSON.stringify({
          bypass,
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }
  }
}
