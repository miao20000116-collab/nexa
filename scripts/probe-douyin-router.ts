/**
 * Inspect Douyin _ROUTER_DATA keys for a known aweme id.
 */
import { fetchThroughEgress } from "../src/lib/read/fetch-page";

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
      headers: { Referer: "https://www.douyin.com/" },
    }
  );
  const html = await res.text();
  const m = html.match(
    /<script[^>]*id="_ROUTER_DATA"[^>]*>([\s\S]*?)<\/script>/i
  );
  console.log("has_script", Boolean(m?.[1]), "html_len", html.length);
  if (!m?.[1]) {
    console.log("no router; snippet", html.replace(/\s+/g, " ").slice(0, 400));
    return;
  }
  const data = JSON.parse(m[1]);
  console.log("top_keys", Object.keys(data));
  const loader = data.loaderData || data;
  console.log("loader_keys", Object.keys(loader || {}));
  for (const [k, v] of Object.entries(loader || {})) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    console.log("loader", k, "keys", Object.keys(o).slice(0, 20));
    const blob = JSON.stringify(o);
    console.log(
      "  has desc/cover/author/aweme",
      /"desc"/.test(blob),
      /"cover"/.test(blob),
      /"nickname"/.test(blob),
      /"aweme_id"/.test(blob),
      "len",
      blob.length
    );
    if (blob.length < 2000) console.log("  blob", blob.slice(0, 800));
    else console.log("  blob_head", blob.slice(0, 500));
  }

  // Also scan www page for RENDER_DATA / SIGI
  const res2 = await fetchThroughEgress(`https://www.douyin.com/video/${id}`, {
    timeoutMs: 20000,
    userAgent: MOBILE,
    bypassProxy: true,
  });
  const html2 = await res2.text();
  for (const pat of [
    "RENDER_DATA",
    "SIGI_STATE",
    "__NEXT_DATA__",
    "universalData",
    "videoDetail",
  ]) {
    console.log("www has", pat, html2.includes(pat));
  }
  const rd = html2.match(
    /<script[^>]*id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (rd?.[1]) {
    try {
      const decoded = decodeURIComponent(rd[1]);
      console.log("RENDER_DATA len", decoded.length, "head", decoded.slice(0, 300));
    } catch {
      console.log("RENDER_DATA raw head", rd[1].slice(0, 300));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
