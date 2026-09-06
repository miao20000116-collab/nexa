import fs from "fs";

const mid = process.argv[2] || "7673183616100289318";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const url = `https://www.douyin.com/music/${mid}`;

const res = await fetch(url, {
  headers: { "User-Agent": UA, "Accept-Language": "zh-CN" },
  redirect: "follow",
});
const html = await res.text();
fs.writeFileSync("tmp-dy-music.html", html);

const m = html.match(/<script id="RENDER_DATA"[^>]*>([^<]+)<\/script>/);
console.log("status", res.status, "len", html.length, "render_script", Boolean(m));

let data = null;
if (m?.[1]) {
  try {
    data = JSON.parse(decodeURIComponent(m[1]));
  } catch (e) {
    console.log("decode fail", e.message);
  }
}

function walk(obj, path = "", out = [], depth = 0) {
  if (!obj || depth > 10) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, out, depth + 1));
    return out;
  }
  if (typeof obj === "object") {
    const title = obj.title || obj.musicName || obj.songName || obj.music_name;
    const author =
      obj.author || obj.authorName || obj.ownerNickname || obj.artist;
    if (typeof title === "string" && title.length > 1 && title.length < 100) {
      out.push({
        path,
        title,
        author: typeof author === "string" ? author : null,
        id: obj.id || obj.mid || obj.idStr || null,
        duration: obj.duration || obj.fullDuration || null,
      });
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
  return out;
}

if (data) {
  const hits = walk(data);
  // prefer ones near music
  const musicish = hits.filter(
    (h) =>
      /music|Music|原声|song/i.test(h.path + h.title) ||
      h.title.includes("原声")
  );
  console.log("musicish", JSON.stringify(musicish.slice(0, 15), null, 2));
  console.log("all_titles_sample", JSON.stringify(hits.slice(0, 30), null, 2));
  const s = JSON.stringify(data);
  const i = s.indexOf("原声");
  console.log("around", s.slice(Math.max(0, i - 200), i + 350));
} else {
  const i = html.indexOf("原声");
  console.log("html around", html.slice(Math.max(0, i - 150), i + 400));
}
