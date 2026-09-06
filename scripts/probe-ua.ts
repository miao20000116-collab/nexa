import { fetchThroughEgress } from "../src/lib/read/fetch-page";
import { writeFileSync } from "fs";

async function tryUa(label: string, ua: string) {
  const id = "7673183599574666530";
  const res = await fetchThroughEgress(
    `https://www.iesdouyin.com/share/video/${id}/`,
    {
      timeoutMs: 15000,
      userAgent: ua,
      bypassProxy: true,
      headers: { Referer: "https://www.douyin.com/" },
    }
  );
  const html = await res.text();
  writeFileSync(`.nexa-data/probe-ua-${label}.html`, html, "utf8");
  console.log(
    label,
    "len",
    html.length,
    "videoInfoRes",
    html.includes("videoInfoRes"),
    "item_list",
    html.includes("item_list"),
    "og:title",
    /og:title/i.test(html),
    "desc field",
    /"desc"\s*:/.test(html)
  );
}

async function main() {
  await tryUa(
    "iphone",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
  );
  await tryUa(
    "bot",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  );
  await tryUa(
    "desktop",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );
  // TikTok short expand
  try {
    const res = await fetchThroughEgress("https://vm.tiktok.com/", {
      timeoutMs: 10000,
      bypassProxy: false,
      redirect: "manual",
    });
    console.log("tiktok_vm status", res.status, "loc", res.headers.get("location"));
  } catch (e) {
    console.log("tiktok_vm err", e instanceof Error ? e.message : e);
  }
}

main().catch(console.error);
