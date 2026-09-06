/**
 * Walk user path: share paste → expand short link → ingest → create project
 * Usage: node --env-file=.env scripts/walk-douyin-recreate.mjs
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";
import fs from "fs";
import path from "path";

const PASTE =
  "6.69 复制打开抖音，看看【陈柯的作品】是否爱上一个人不问明天过后 # 聚宝仙盆之杂灵根才... https://v.douyin.com/JXmDmiKtuW0/ l@P.kC 06/12 VYm:/ :6pm";
const SHORT = "https://v.douyin.com/JXmDmiKtuW0/";
const BASE = process.env.NEXA_BASE || "http://localhost:3000";
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const findings = [];

function log(step, ok, detail) {
  findings.push({ step, ok, detail });
  console.log(`\n[${ok ? "OK" : "FAIL"}] ${step}`);
  console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

// 1) Direct expand (bypass proxy) — what app should do
{
  const res = await fetch(SHORT, {
    redirect: "manual",
    headers: { "User-Agent": MOBILE, Referer: "https://www.douyin.com/" },
  });
  const loc = res.headers.get("location");
  const id = loc?.match(/\/video\/(\d{8,})/)?.[1] || null;
  log("1. short-link expand (direct)", Boolean(id), { status: res.status, id, loc: loc?.slice(0, 160) });
}

// 2) Via configured proxy (current .env pitfall)
{
  const p =
    process.env.NEXA_FETCH_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    null;
  if (!p) {
    log("2. short-link via proxy", true, "no proxy configured");
  } else {
    try {
      const res = await undiciFetch(SHORT, {
        redirect: "manual",
        dispatcher: new ProxyAgent(p),
        headers: { "User-Agent": MOBILE, Referer: "https://www.douyin.com/" },
      });
      const loc = res.headers.get("location");
      const id = loc?.match(/\/video\/(\d{8,})/)?.[1] || null;
      log("2. short-link via proxy", Boolean(id), {
        proxy: p,
        status: res.status,
        id,
        loc: loc?.slice(0, 120),
      });
    } catch (e) {
      log("2. short-link via proxy", false, { proxy: p, error: e.message });
    }
  }
}

// 3) App ingest API
{
  try {
    const res = await fetch(`${BASE}/api/create/social-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: PASTE, mediaAssetCount: 1 }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    const ok =
      res.ok &&
      Boolean(data.canonicalUrl || data.awemeId) &&
      data.parseMethod !== "share_paste_fallback";
    log("3. POST /api/create/social-ingest", ok, {
      status: res.status,
      parseStatus: data.parseStatus,
      parseMethod: data.parseMethod,
      awemeId: data.awemeId,
      canonicalUrl: data.canonicalUrl?.slice?.(0, 120) || data.canonicalUrl,
      title: data.title,
      url: data.url?.slice?.(0, 120),
      reason: data.reason?.slice?.(0, 200),
      error: data.error,
    });
  } catch (e) {
    log("3. POST /api/create/social-ingest", false, e.message);
  }
}

// 4) Create project with link + note about image
{
  try {
    const brief = [
      "【同款二创·短视频】抖音",
      `参考：${PASTE}`,
      "用户自有素材：已提供角色立绘（水彩风女性+平板），须用该形象做二创，不用原片原声。",
    ].join("\n");
    const res = await fetch(`${BASE}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: "根据抖音参考做版权安全同款二创短视频（用上传的立绘）",
        title: "同款二创·陈柯作品结构",
        contentType: "short_video",
        platform: "douyin",
        startMode: "link",
        linkUrl: SHORT,
        brief,
      }),
    });
    const data = await res.json();
    log("4. POST /api/create", res.ok && Boolean(data.id), {
      status: res.status,
      id: data.id,
      error: data.error,
    });

    if (data.id) {
      // 5) Video material strategy
      const v1 = await fetch(`${BASE}/api/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.id,
          action: "material_strategy",
          mode: "prefer_owned",
          targetDurationSec: 15,
        }),
      });
      const vd1 = await v1.json();
      log("5. video material_strategy", v1.ok, {
        status: v1.status,
        message: vd1.message || vd1.video?.jobMessage,
        coverage: vd1.video?.coverage?.summary,
        error: vd1.error,
      });

      const v2 = await fetch(`${BASE}/api/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.id,
          action: "plan_storyboard",
          targetDurationSec: 15,
        }),
      });
      const vd2 = await v2.json();
      log("6. plan_storyboard", v2.ok && Boolean(vd2.video?.storyboard), {
        status: v2.status,
        shots: vd2.video?.storyboard?.shots?.length,
        script: vd2.video?.storyboard?.script?.slice?.(0, 120),
        error: vd2.error,
        message: vd2.message,
      });
    }
  } catch (e) {
    log("4-6 create/video", false, e.message);
  }
}

console.log("\n==== SUMMARY ====");
for (const f of findings) {
  console.log(`${f.ok ? "✓" : "✗"} ${f.step}`);
}
