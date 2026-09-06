/**
 * Face-swap using local Douyin source.mp4 + user face image.
 * Keeps original audio / shot timing as closely as keyframe swap allows.
 *
 * Usage: node --env-file=.env scripts/run-faceswap-local.mjs
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createHash, createHmac } from "crypto";

const AWEME = "7673183599574666530";
const WORK = path.join(process.cwd(), ".nexa-data", "recreate", AWEME);
const SOURCE = path.join(WORK, "source.mp4");
const FACE = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-8ec5de29-2fbb-40d6-8c9a-20eb8a6f7092.png"
);

const API = (process.env.AI_MEDIA_BASE_URL || process.env.AI_BASE_URL || "").replace(
  /\/$/,
  ""
);
const KEY = process.env.AI_MEDIA_API_KEY || process.env.AI_API_KEY;
const IMG_MODEL = process.env.AI_MODEL_IMAGE || "Qwen/Qwen-Image";
const VISION = process.env.AI_MODEL_VISION || process.env.AI_MODEL_MAIN;
const FPS = Number(process.env.FACESWAP_FPS || "2");

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
  const HOST = "visual.volcengineapi.com";
  const bodyStr = new URLSearchParams({
    image_base64: faceB64,
    template_base64: templateB64,
    action_id: "faceswap",
    version: "2.0",
  }).toString();
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

if (!fs.existsSync(SOURCE)) {
  console.error("missing source.mp4 — need Douyin original video at", SOURCE);
  process.exit(1);
}
if (!fs.existsSync(FACE)) {
  console.error("missing face", FACE);
  process.exit(1);
}
if (!API || !KEY) {
  console.error("missing AI media key");
  process.exit(1);
}

console.log("source", SOURCE, fs.statSync(SOURCE).size);
console.log("face", FACE);
console.log("fps", FPS);

const audio = path.join(WORK, "audio.mp3");
const kfDir = path.join(WORK, "keyframes_v2");
fs.mkdirSync(kfDir, { recursive: true });
for (const f of fs.readdirSync(kfDir)) fs.unlinkSync(path.join(kfDir, f));

console.log("1) extract audio + keyframes…");
await run("ffmpeg", ["-y", "-i", SOURCE, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audio]);
await run("ffmpeg", [
  "-y",
  "-i",
  SOURCE,
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

console.log("2) describe face…");
const faceDesc = await describeFace(FACE);
console.log("faceDesc", faceDesc);
const faceB64 = fs.readFileSync(FACE).toString("base64");

console.log("3) probe Volc FaceSwap…");
const probe = await volcFaceSwap(
  faceB64,
  fs.readFileSync(path.join(kfDir, kfs[0])).toString("base64")
);
const useVolc = Buffer.isBuffer(probe);
console.log(
  useVolc ? "Volc FaceSwap OK" : "Volc unavailable → SiliconFlow I2I",
  useVolc ? "" : JSON.stringify(probe?.error || probe).slice(0, 200)
);

const swappedDir = path.join(WORK, "swapped_newface");
fs.mkdirSync(swappedDir, { recursive: true });
const swapped = [];

console.log("4) swap frames (keep scene, replace face only)…");
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
        "KEEP exact same: composition, camera angle, pose, costume (red/black hanfu), props, night city bokeh background, lighting, color grade, any text overlays.",
        `REPLACE only the face identity with this woman: ${faceDesc}`,
        "Must remain the same Douyin shot flow — only face changes. No tablet, no watercolor office, no Douyin UI.",
      ].join(" ");
      buf = await genSwapFrame(prompt, fs.readFileSync(kfPath));
    }
    fs.writeFileSync(out, buf);
    console.log("ok", buf.length);
    swapped.push(out);
  } catch (e) {
    console.log("fail", e.message);
    fs.copyFileSync(kfPath, out);
    swapped.push(out);
  }
}

console.log("5) compose with original audio…");
const listFile = path.join(WORK, "frames_newface.txt");
const dur = 1 / FPS;
const lines = [];
for (const f of swapped) {
  lines.push(`file '${f.replace(/\\/g, "/")}'`);
  lines.push(`duration ${dur}`);
}
lines.push(`file '${swapped[swapped.length - 1].replace(/\\/g, "/")}'`);
fs.writeFileSync(listFile, lines.join("\n"));

const composed = path.join(WORK, "composed_faceswap_newface.mp4");
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

const projectId = `faceswap_${AWEME}`;
const renderDir = path.join(process.cwd(), ".nexa-data", "renders", projectId);
fs.mkdirSync(renderDir, { recursive: true });
fs.copyFileSync(composed, path.join(renderDir, "export.mp4"));

console.log("\nDONE");
console.log("engine", useVolc ? "volc-faceswap" : "siliconflow-i2i");
console.log("composed", composed, fs.statSync(composed).size);
console.log("preview", `http://localhost:3000/api/video/render/file/${projectId}`);
