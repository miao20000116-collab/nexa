/**
 * Integration check: expand Douyin short link the same way the app does
 * (bypassProxy + manual redirect).
 *
 * Usage: node --env-file=.env scripts/verify-shortlink-expand.mjs [url]
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

const SHORT = process.argv[2] || "https://v.douyin.com/JXmDmiKtuW0/";
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

function proxyUrl() {
  return (
    process.env.NEXA_FETCH_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    null
  );
}

async function expandBypassProxy(url) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent": MOBILE,
      "Accept-Language": "zh-CN",
      Referer: "https://www.douyin.com/",
    },
  });
  const loc = res.headers.get("location");
  const id = loc?.match(/\/video\/(\d{8,})/)?.[1] || null;
  return { status: res.status, loc, id, via: "direct" };
}

async function expandViaProxy(url) {
  const p = proxyUrl();
  if (!p) return { via: "proxy", skipped: true };
  try {
    const res = await undiciFetch(url, {
      redirect: "manual",
      dispatcher: new ProxyAgent(p),
      headers: {
        "User-Agent": MOBILE,
        "Accept-Language": "zh-CN",
        Referer: "https://www.douyin.com/",
      },
    });
    const loc = res.headers.get("location");
    const id = loc?.match(/\/video\/(\d{8,})/)?.[1] || null;
    return { status: res.status, loc, id, via: "proxy", proxy: p };
  } catch (e) {
    return { via: "proxy", error: e.message, proxy: p };
  }
}

const direct = await expandBypassProxy(SHORT);
const proxied = await expandViaProxy(SHORT);
console.log(JSON.stringify({ SHORT, direct, proxied }, null, 2));
if (!direct.id) {
  console.error("FAIL: direct expand did not yield aweme id");
  process.exit(1);
}
console.log("OK real link:", direct.loc);
