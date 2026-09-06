/**
 * Exhaustive Douyin short-link expansion probes.
 * Goal: get Location / final URL containing /video/{awemeId}
 *
 * Usage: node scripts/probe-shortlink-expand.mjs "https://v.douyin.com/JXmDmiKtuW0/"
 */
const SHORT = process.argv[2] || "https://v.douyin.com/JXmDmiKtuW0/";

const UAS = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  douyinApp:
    "com.ss.android.ugc.aweme/280001 (Linux; U; Android 13; zh_CN; Pixel 7; Build/TQ3A; Cronet/TTNetVersion:xxx)",
  awemeIos:
    "Aweme 28.0.0 rv:280001 (iPhone; iOS 16.6; zh_CN) Cronet",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

function extractId(u) {
  if (!u) return null;
  const m =
    u.match(/\/(?:share\/)?video\/(\d{8,})/i) ||
    u.match(/\/(?:share\/)?note\/(\d{8,})/i) ||
    u.match(/modal_id=(\d{8,})/i) ||
    u.match(/aweme_id=(\d{8,})/i);
  return m?.[1] || null;
}

async function oneShot(label, url, init) {
  try {
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.headers.get("location");
    const setCookie = res.headers.getSetCookie?.() || [];
    console.log(
      JSON.stringify({
        label,
        status: res.status,
        loc,
        id: extractId(loc) || extractId(url),
        cookies: setCookie.length,
      })
    );
    return { res, loc, setCookie };
  } catch (e) {
    console.log(JSON.stringify({ label, err: e.message }));
    return null;
  }
}

async function followChain(label, start, headers, max = 12) {
  const chain = [];
  let cur = start;
  let cookie = "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(cur, {
      method: "GET",
      redirect: "manual",
      headers: {
        ...headers,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const loc = res.headers.get("location");
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const part = c.split(";")[0];
      if (part) cookie = cookie ? `${cookie}; ${part}` : part;
    }
    chain.push({ status: res.status, url: cur, loc, id: extractId(loc) });
    const id = extractId(loc) || extractId(cur);
    if (id) {
      console.log(JSON.stringify({ label, ok: true, id, chain }, null, 2));
      return id;
    }
    if (!loc || ![301, 302, 303, 307, 308].includes(res.status)) break;
    cur = new URL(loc, cur).toString();
  }
  console.log(JSON.stringify({ label, ok: false, chain }, null, 2));
  return null;
}

console.log("SHORT", SHORT);

// Variant URLs
const variants = [
  SHORT,
  SHORT.replace(/\/$/, ""),
  SHORT.replace("https://", "http://"),
  SHORT.includes("?") ? SHORT : `${SHORT.replace(/\/$/, "")}/`,
];

for (const [name, ua] of Object.entries(UAS)) {
  await oneShot(`oneshot:${name}`, SHORT, {
    method: "GET",
    headers: {
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Referer: "https://www.douyin.com/",
    },
  });
}

await oneShot("HEAD android", SHORT, {
  method: "HEAD",
  headers: { "User-Agent": UAS.android, "Accept-Language": "zh-CN" },
});

for (const v of variants) {
  await followChain(`chain:android:${v}`, v, {
    "User-Agent": UAS.android,
    Accept: "text/html",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Referer: "https://www.douyin.com/",
  });
}

await followChain("chain:douyinApp", SHORT, {
  "User-Agent": UAS.douyinApp,
  Accept: "*/*",
  "Accept-Language": "zh-CN",
});

await followChain("chain:awemeIos", SHORT, {
  "User-Agent": UAS.awemeIos,
  Accept: "*/*",
  "Accept-Language": "zh-CN",
});

// Session warm-up: homepage cookie then short link
{
  const home = await fetch("https://www.douyin.com/", {
    headers: { "User-Agent": UAS.android, "Accept-Language": "zh-CN" },
    redirect: "follow",
  });
  const cookies = home.headers.getSetCookie?.() || [];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  console.log("warmup cookies", cookies.length);
  await followChain("chain:warmed", SHORT, {
    "User-Agent": UAS.android,
    Accept: "text/html",
    "Accept-Language": "zh-CN",
    Referer: "https://www.douyin.com/",
    Cookie: cookie,
  });
}
