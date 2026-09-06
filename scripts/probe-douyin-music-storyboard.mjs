/**
 * Probe Douyin aweme for music + visual structure signals.
 * Usage: node --env-file=.env scripts/probe-douyin-music-storyboard.mjs [awemeId]
 */
const awemeId = process.argv[2] || "7673183599574666530";
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

function extractJsonAfter(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  let i = eq + 1;
  while (/\s/.test(html[i])) i++;
  if (html[i] !== "{") {
    const brace = html.indexOf("{", i);
    if (brace < 0) return null;
    i = brace;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function pickMusic(item) {
  const m = item?.music || item?.music_info || item?.musicInfo || null;
  if (!m || typeof m !== "object") return null;
  return {
    id: m.id_str || m.id || m.mid || null,
    title: m.title || m.music_name || m.song_name || null,
    author: m.author || m.owner_nickname || m.artist || null,
    album: m.album || null,
    duration: m.duration || null,
    isOriginal: m.is_original ?? m.is_original_sound ?? null,
    playUrl: m.play_url?.url_list?.[0] || m.play_url || m.preview_url || null,
  };
}

function summarizeItem(item) {
  const video = item.video || {};
  return {
    desc: item.desc || item.caption || null,
    author: item.author?.nickname || item.author?.unique_id || null,
    durationMs: video.duration ?? item.duration ?? null,
    width: video.width ?? null,
    height: video.height ?? null,
    ratio: video.ratio || null,
    cover: video.cover?.url_list?.[0] || video.origin_cover?.url_list?.[0] || null,
    music: pickMusic(item),
    textExtra: Array.isArray(item.text_extra)
      ? item.text_extra
          .map((x) => x?.hashtag_name || x?.user_name)
          .filter(Boolean)
          .slice(0, 12)
      : [],
    interact:
      item.statistics
        ? {
            digg: item.statistics.digg_count,
            comment: item.statistics.comment_count,
            share: item.statistics.share_count,
            play: item.statistics.play_count,
          }
        : null,
  };
}

const urls = [
  `https://www.iesdouyin.com/share/video/${awemeId}/`,
  `https://www.iesdouyin.com/share/note/${awemeId}/`,
  `https://www.douyin.com/video/${awemeId}`,
];

const report = { awemeId, pages: [] };

for (const url of urls) {
  const entry = { url, status: null, hasRouter: false, music: null, summary: null, note: null };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": MOBILE,
        Referer: "https://www.douyin.com/",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const html = await res.text();
    entry.status = res.status;
    entry.finalUrl = res.url;
    entry.len = html.length;
    entry.hasRouter = html.includes("_ROUTER_DATA");
    entry.hasRENDER = html.includes("RENDER_DATA") || html.includes("__NEXT_DATA__");

    const router = extractJsonAfter(html, "_ROUTER_DATA");
    if (router) {
      const page =
        router.loaderData?.["video_(id)/page"] ||
        router.loaderData?.["note_(id)/page"] ||
        Object.values(router.loaderData || {})[0];
      const vir = page?.videoInfoRes;
      const item =
        vir?.item_list?.[0] ||
        page?.aweme_detail ||
        page?.awemeDetail ||
        null;
      if (item) {
        entry.summary = summarizeItem(item);
        entry.music = entry.summary.music;
      } else {
        entry.note = `router ok but no item; videoInfoRes=${Boolean(vir)} keys=${Object.keys(page || {}).slice(0, 12)}`;
        if (vir) entry.virSample = JSON.stringify(vir).slice(0, 500);
      }
    }

    // RENDER_DATA (desktop sometimes)
    if (!entry.music) {
      const render = extractJsonAfter(html, "RENDER_DATA");
      // sometimes it's URL-encoded after =
      if (!render) {
        const m = html.match(/RENDER_DATA["']?\s*[:=]\s*["']([^"']+)["']/);
        if (m?.[1]) {
          try {
            const decoded = decodeURIComponent(m[1]);
            const json = JSON.parse(decoded);
            entry.renderKeys = Object.keys(json).slice(0, 20);
          } catch {
            entry.note = (entry.note || "") + " RENDER_DATA decode fail";
          }
        }
      }
    }

    // Regex fallback for music title in HTML
    if (!entry.music) {
      const hits = [];
      for (const re of [
        /"music"[\s\S]{0,40}"title"\s*:\s*"([^"]{2,80})"/,
        /"title"\s*:\s*"([^"]{2,80})"[\s\S]{0,80}"author"\s*:\s*"([^"]{2,40})"/,
        /music_title["']?\s*[:=]\s*["']([^"']+)["']/,
      ]) {
        const m = html.match(re);
        if (m) hits.push(m[0].slice(0, 160));
      }
      entry.regexHits = hits.slice(0, 5);
      const ogTitle = html.match(/property="og:title" content="([^"]+)"/)?.[1];
      const ogDesc = html.match(/property="og:description" content="([^"]+)"/)?.[1];
      entry.og = { title: ogTitle, desc: ogDesc };
    }
  } catch (e) {
    entry.note = e.message;
  }
  report.pages.push(entry);
}

// Also try music mid from earlier share URL if present
const mid = "7673183616100289318";
report.knownMidFromShare = mid;
try {
  const musicUrl = `https://www.iesdouyin.com/share/music/${mid}/`;
  const res = await fetch(musicUrl, {
    redirect: "follow",
    headers: { "User-Agent": MOBILE, Referer: "https://www.douyin.com/" },
  });
  const html = await res.text();
  report.musicPage = {
    status: res.status,
    len: html.length,
    hasRouter: html.includes("_ROUTER_DATA"),
    titleHint:
      html.match(/property="og:title" content="([^"]+)"/)?.[1] ||
      html.match(/"title"\s*:\s*"([^"]{2,80})"/)?.[1] ||
      null,
    sample: html.includes("music")
      ? html.slice(html.indexOf("music"), html.indexOf("music") + 200)
      : null,
  };
} catch (e) {
  report.musicPage = { error: e.message };
}

console.log(JSON.stringify(report, null, 2));
