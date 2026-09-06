/**
 * Compare native fetch vs undici (app path) for short-link Location.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

const SHORT = process.argv[2] || "https://v.douyin.com/JXmDmiKtuW0/";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

function proxy() {
  return (
    process.env.NEXA_FETCH_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    null
  );
}

function idFrom(u) {
  return u?.match(/\/(?:share\/)?video\/(\d{8,})/i)?.[1] || null;
}

const native = await fetch(SHORT, {
  redirect: "manual",
  headers: { "User-Agent": UA, "Accept-Language": "zh-CN", Referer: "https://www.douyin.com/" },
});
console.log("native", native.status, native.headers.get("location")?.slice(0, 120), "id", idFrom(native.headers.get("location")));

const p = proxy();
console.log("proxy", p);
const opts = {
  redirect: "manual",
  headers: { "User-Agent": UA, "Accept-Language": "zh-CN", Referer: "https://www.douyin.com/" },
};
if (p) opts.dispatcher = new ProxyAgent(p);
const u = await undiciFetch(SHORT, opts);
console.log("undici", u.status, u.headers.get("location")?.slice(0, 120), "id", idFrom(u.headers.get("location")));
