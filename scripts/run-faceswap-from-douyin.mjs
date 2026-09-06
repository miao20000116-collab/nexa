/**
 * True path the user wants:
 * face image + Douyin URL → download original → denser keyframes →
 * face identity swap (keep scene/pose) → mux original audio.
 *
 * Usage:
 *   node --env-file=.env scripts/run-faceswap-from-douyin.mjs
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createHash, createHmac } from "crypto";

const PASTE =
  "6.69 复制打开抖音，看看【陈柯的作品】是否爱上一个人不问明天过后 # 聚宝仙盆之杂灵根才... https://v.douyin.com/JXmDmiKtuW0/ l@P.kC 06/12 VYm:/ :6pm";
const SHORT = "https://v.douyin.com/JXmDmiKtuW0/";
const FACE = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-8ec5de29-2fbb-40d6-8c9a-20eb8a6f7092.png"
);

const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const API = (process.env.AI_MEDIA_BASE_URL || process.env.AI_BASE_URL || "").replace(
  /\/$/,
  ""
);
const KEY = process.env.AI_MEDIA_API_KEY || process.env.AI_API_KEY;
const IMG_MODEL = process.env.AI_MODEL_IMAGE || "Qwen/Qwen-Image";
const VISION = process.env.AI_MODEL_VISION || process.env.AI_MODEL_MAIN;
const FPS = Number(process.env.FACESWAP_FPS || "2"); // denser than 1fps for closer motion

const VOLC_AK = process.env.JIMENG_ACCESS_KEY || process.env.VOLC_ACCESS_KEY;
const VOLC_SK = process.env.JIMENG_SECRET_KEY || process.env.VOLC_SECRET_KEY;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) =>
      code === 0 ? resolve(true) : reject(new Error(stderr.slice(-1200)))
    );
  });
}

async function expandShort(url) {
  let cur = url;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(cur, {
      redirect: "manual",
      headers: {
        "User-Agent": MOBILE,
        Referer: "https://www.douyin.com/",
      },
    });
    const loc = res.headers.get("location");
    if (!loc) break;
    cur = new URL(loc, cur).toString();
    const id = cur.match(/\/video\/(\d{8,})/)?.[1];
    if (id) return { awemeId: id, canonical: cur };
  }
  const id = cur.match(/\/video\/(\d{8,})/)?.[1];
  return { awemeId: id || null, canonical: cur };
}

function extractRouterData(html) {
  const marker = "window._ROUTER_DATA";
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
      if (depth === 0) return JSON.parse(html.slice(i, j + 1));
    }
  }
  return null;
}

function pickPlayUrl(item) {
  const candidates = [];
  const pushList = (list) => {
    if (Array.isArray(list)) {
      for (const u of list) if (typeof u === "string" && u.startsWith("http")) candidates.push(u);
    }
  };
  pushList(item?.video?.play_addr?.url_list);
  pushList(item?.video?.download_addr?.url_list);
  pushList(item?.video?.play_addr_lowbr?.url_list);
  pushList(item?.video?.bit_rate?.[0]?.play_addr?.url_list);
  // prefer non-watermark if present
  const preferred =
    candidates.find((u) => /playwm|watermark/i.test(u) === false) ||
    candidates[0] ||
    null;
  return preferred;
}

async function fetchItem(awemeId) {
  const urls = [
    `https://www.iesdouyin.com/share/video/${awemeId}/`,
    `https://www.iesdouyin.com/share/note/${awemeId}/`,
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": MOBILE,
        Accept: "text/html",
        Referer: "https://www.douyin.com/",
      },
    });
    const html = await res.text();
    const router = extractRouterData(html);
    if (!router) continue;
    const loader =
      router?.loaderData?.["video_(id)/page"] ||
      router?.loaderData?.["note_(id)/page"] ||
      Object.values(router?.loaderData || {})[0];
    const item =
      loader?.videoInfoRes?.item_list?.[0] ||
      loader?.noteInfoRes?.item_list?.[0] ||
      loader?.item ||
      null;
    if (item) return item;
  }
  return null;
}

async function download(url, outPath) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DESKTOP,
      Referer: "https://www.douyin.com/",
    },
  });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function hmacHex(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

async function volcFaceSwap(faceB64, templateB64) {
  if (!VOLC_AK || !VOLC_SK) return null;
  // Visual OpenAPI FaceSwap (form-urlencoded historically; try JSON CV too)
  const HOST = "visual.volcengineapi.com";
  const bodyObj = {
    image_base64: faceB64,
    template_base64: templateB64,
    action_id: "faceswap",
    version: "2.0",
  };
  // Try Action=FaceSwap Version=2020-08-26
  const bodyStr = new URLSearchParams(bodyObj).toString();
  const VERSION = "2020-08-26";
  const action = "FaceSwap";
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const contentSha = sha256Hex(bodyStr);
  const canonicalHeaders =
    `content-type:application/x-www-form-urlencoded\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${contentSha}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalQuery = `Action=${action}&Version=${VERSION}`;
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    contentSha,
  ].join("\n");
  const credentialScope = `${shortDate}/cn-north-1/cv/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(VOLC_SK, shortDate);
  const kRegion = hmac(kDate, "cn-north-1");
  const kService = hmac(kRegion, "cv");
  const kSigning = hmac(kService, "request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = `HMAC-SHA256 Credential=${VOLC_AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${HOST}/?${canonicalQuery}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Host: HOST,
      "X-Date": xDate,
      "X-Content-Sha256": contentSha,
      Authorization: authorization,
    },
    body: bodyStr,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
  const b64 =
    json?.data?.image ||
    json?.Result?.Image ||
    json?.binary_data_base64?.[0] ||
    null;
  if (b64) return Buffer.from(b64, "base64");
  return { error: json };
}

async function describeFace(facePath) {
  const b64 = fs.readFileSync(facePath).toString("base64");
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "用中文详细描述此人面部身份（性别、脸型、五官、发型、气质）。只要外貌，不要背景。80字内。",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${b64}` },
            },
          ],
        },
      ],
      max_tokens: 220,
    }),
  });
  const j = await res.json();
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`vision fail ${JSON.stringify(j).slice(0, 200)}`);
  return text;
}

async function genSwapFrame(prompt, keyframeBytes) {
  const body = {
    model: IMG_MODEL,
    prompt,
    size: "1024x576",
    n: 1,
    image: keyframeBytes.toString("base64"),
  };
  const res = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`gen ${res.status} ${text.slice(0, 250)}`);
  const data = JSON.parse(text);
  const item = data.images?.[0] || data.data?.[0] || {};
  if (item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item.url || data.url) {
    const r = await fetch(item.url || data.url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("empty image");
}

// ── main ──
if (!fs.existsSync(FACE)) {
  console.error("face missing", FACE);
  process.exit(1);
}
if (!API || !KEY) {
  console.error("missing AI_MEDIA / AI_API");
  process.exit(1);
}

console.log("1) expand Douyin short link…");
const { awemeId, canonical } = await expandShort(SHORT);
if (!awemeId) {
  console.error("cannot resolve aweme id", canonical);
  process.exit(1);
}
console.log("awemeId", awemeId, canonical.slice(0, 120));

const WORK = path.join(process.cwd(), ".nexa-data", "recreate", awemeId);
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, "paste.txt"), PASTE);

console.log("2) fetch item / play url…");
const item = await fetchItem(awemeId);
if (!item) {
  console.error("no item from iesdouyin share page");
  process.exit(1);
}
const playUrl = pickPlayUrl(item);
const title = item.desc || item.share_info?.share_title || "";
console.log("title", title.slice(0, 80));
console.log("playUrl", playUrl?.slice(0, 120));
if (!playUrl) {
  console.error("no playable url");
  process.exit(1);
}

const source = path.join(WORK, "source.mp4");
console.log("3) download source…");
const bytes = await download(playUrl, source);
console.log("saved source", bytes);

const audio = path.join(WORK, "audio.mp3");
console.log("4) extract audio + keyframes @", FPS, "fps…");
await run("ffmpeg", ["-y", "-i", source, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audio]);
const kfDir = path.join(WORK, "keyframes");
fs.mkdirSync(kfDir, { recursive: true });
for (const f of fs.readdirSync(kfDir)) fs.unlinkSync(path.join(kfDir, f));
await run("ffmpeg", [
  "-y",
  "-i",
  source,
  "-vf",
  `fps=${FPS}`,
  "-q:v",
  "2",
  path.join(kfDir, "kf_%03d.jpg"),
]);
const kfs = fs
  .readdirSync(kfDir)
  .filter((f) => f.endsWith(".jpg"))
  .sort();
console.log("keyframes", kfs.length);

console.log("5) describe face…");
const faceDesc = await describeFace(FACE);
console.log("faceDesc", faceDesc);
const faceB64 = fs.readFileSync(FACE).toString("base64");

// Probe Volc FaceSwap once
console.log("6) probe Volc FaceSwap…");
const probe = await volcFaceSwap(faceB64, fs.readFileSync(path.join(kfDir, kfs[0])).toString("base64"));
const useVolc = Buffer.isBuffer(probe);
console.log(useVolc ? "Volc FaceSwap OK" : "Volc FaceSwap unavailable → SiliconFlow I2I", probe?.error ? JSON.stringify(probe.error).slice(0, 180) : "");

const swappedDir = path.join(WORK, "swapped");
fs.mkdirSync(swappedDir, { recursive: true });
const swapped = [];
console.log("7) swap frames…");
for (let i = 0; i < kfs.length; i++) {
  const kfPath = path.join(kfDir, kfs[i]);
  const out = path.join(swappedDir, `sw_${String(i + 1).padStart(3, "0")}.jpg`);
  process.stdout.write(`[${i + 1}/${kfs.length}] `);
  try {
    let buf = null;
    if (useVolc) {
      const r = await volcFaceSwap(
        faceB64,
        fs.readFileSync(kfPath).toString("base64")
      );
      if (Buffer.isBuffer(r)) buf = r;
    }
    if (!buf) {
      const prompt = [
        "Image-to-image face identity swap on the provided keyframe.",
        "KEEP exact same: composition, camera angle, pose, costume, props, background, lighting, color grade, any text overlays, framing.",
        `REPLACE only the face identity with this woman: ${faceDesc}`,
        "Same scene flow as original Douyin shot — only the face changes.",
        "No tablet, no office watercolor background, no Douyin UI chrome.",
      ].join(" ");
      buf = await genSwapFrame(prompt, fs.readFileSync(kfPath));
    }
    fs.writeFileSync(out, buf);
    console.log("ok", buf.length);
    swapped.push(out);
  } catch (e) {
    console.log("fail", e.message, "→ keep original");
    fs.copyFileSync(kfPath, out);
    swapped.push(out);
  }
}

console.log("8) compose MP4 with original audio…");
const listFile = path.join(WORK, "frames.txt");
const dur = 1 / FPS;
const lines = [];
for (const f of swapped) {
  lines.push(`file '${f.replace(/\\/g, "/")}'`);
  lines.push(`duration ${dur}`);
}
lines.push(`file '${swapped[swapped.length - 1].replace(/\\/g, "/")}'`);
fs.writeFileSync(listFile, lines.join("\n"));

const composed = path.join(WORK, "composed_faceswap.mp4");
await run("ffmpeg", [
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  listFile,
  "-i",
  audio,
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(FPS),
  "-c:a",
  "aac",
  "-shortest",
  "-movflags",
  "+faststart",
  composed,
]);

const projectId = `faceswap_${awemeId}`;
const renderDir = path.join(process.cwd(), ".nexa-data", "renders", projectId);
fs.mkdirSync(renderDir, { recursive: true });
fs.copyFileSync(composed, path.join(renderDir, "export.mp4"));

console.log("\nDONE");
console.log("engine", useVolc ? "volc-faceswap" : "siliconflow-i2i");
console.log("composed", composed, fs.statSync(composed).size);
console.log("preview", `http://localhost:3000/api/video/render/file/${projectId}`);
