import { fetchThroughEgress } from "../src/lib/read/fetch-page";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const r = await fetchThroughEgress(
  "https://www.xiaohongshu.com/explore/67c8f0e0000000001d03e8a2",
  {
    headers: { "User-Agent": UA, Referer: "https://www.xiaohongshu.com/" },
    bypassProxy: true,
    timeoutMs: 20000,
  }
);
const html = await r.text();
const m = html.match(
  /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/
);
if (!m?.[1]) {
  console.log("no match");
  process.exit(1);
}
const state = JSON.parse(m[1].replace(/undefined/g, "null")) as Record<
  string,
  unknown
>;
const nd = state.noteData as Record<string, unknown> | null;
console.log("noteData keys", nd ? Object.keys(nd) : null);
console.log(JSON.stringify(nd, null, 2).slice(0, 2000));
