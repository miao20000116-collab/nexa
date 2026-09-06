/**
 * Re-run face swap: keyframe as layout ref + face identity from vision.
 * Then mux Douyin audio and expose via /api/video/render/file/...
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const AWEME = "7673183599574666530";
const WORK = path.join(ROOT, ".nexa-data", "recreate", AWEME);
const PROJECT_ID = `recreate_${AWEME}`;
const FACE = [
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
  ),
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-94b5dd6e-8ba7-4379-aac0-b7cc2529f75e.png"
  ),
].find((p) => fs.existsSync(p));

const API = (process.env.AI_MEDIA_BASE_URL || process.env.AI_BASE_URL || "").replace(
  /\/$/,
  ""
);
const KEY = process.env.AI_MEDIA_API_KEY || process.env.AI_API_KEY;
const IMG_MODEL = process.env.AI_MODEL_IMAGE || "Qwen/Qwen-Image";
const VISION = process.env.AI_MODEL_VISION || process.env.AI_MODEL_MAIN;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) =>
      code === 0 ? resolve(true) : reject(new Error(stderr.slice(-800)))
    );
  });
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
              text: "用中文详细描述此人面部身份（必须：女性、脸型、五官、发型、气质）。只要外貌，不要背景。60字内。",
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
  if (!text) throw new Error(`vision fail ${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  return text;
}

async function genFromKeyframe(prompt, keyframeBytes) {
  const body = {
    model: IMG_MODEL,
    prompt,
    size: "1024x576",
    n: 1,
    // image-to-image: preserve keyframe layout
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
  const b64 = item.b64_json;
  const url = item.url || data.url;
  if (b64) return Buffer.from(b64, "base64");
  if (url) {
    const r = await fetch(url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("empty image");
}

if (!FACE) {
  console.error("no face");
  process.exit(1);
}
console.log("face", FACE);
console.log("api", API);

const faceDesc = await describeFace(FACE);
console.log("faceDesc", faceDesc);

const kfDir = path.join(WORK, "keyframes");
const swappedDir = path.join(WORK, "swapped2");
fs.mkdirSync(swappedDir, { recursive: true });
const kfs = fs
  .readdirSync(kfDir)
  .filter((f) => f.endsWith(".jpg"))
  .sort();

const swapped = [];
for (let i = 0; i < kfs.length; i++) {
  const kfPath = path.join(kfDir, kfs[i]);
  const out = path.join(swappedDir, `sw_${String(i + 1).padStart(2, "0")}.jpg`);
  console.log(`\n[${i + 1}/${kfs.length}]`, kfs[i]);
  const kfBytes = fs.readFileSync(kfPath);
  const prompt = [
    "Image-to-image face identity swap on the provided keyframe.",
    "KEEP exact same: composition, camera angle, pose, red/black hanfu, props (CD etc), night city bokeh background, lighting, color grade, any text overlays.",
    `REPLACE only the face identity with this woman: ${faceDesc}`,
    "Must remain a young East Asian WOMAN (not a man). No tablet, no Douyin logo, no phone UI, no watercolor office scene.",
    "Output one cinematic portrait frame.",
  ].join(" ");
  try {
    const buf = await genFromKeyframe(prompt, kfBytes);
    fs.writeFileSync(out, buf);
    console.log("  ok", buf.length);
    swapped.push(out);
  } catch (e) {
    console.log("  fail", e.message);
    fs.copyFileSync(kfPath, out);
    swapped.push(out);
  }
}

const audio = path.join(WORK, "audio.mp3");
const listFile = path.join(WORK, "frames2.txt");
const lines = [];
for (const f of swapped) {
  lines.push(`file '${f.replace(/\\/g, "/")}'`);
  lines.push("duration 1");
}
lines.push(`file '${swapped[swapped.length - 1].replace(/\\/g, "/")}'`);
fs.writeFileSync(listFile, lines.join("\n"));

const composed = path.join(WORK, "composed.mp4");
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
  "-c:a",
  "aac",
  "-shortest",
  "-movflags",
  "+faststart",
  composed,
]);

const renderDir = path.join(ROOT, ".nexa-data", "renders", PROJECT_ID);
fs.mkdirSync(renderDir, { recursive: true });
fs.copyFileSync(composed, path.join(renderDir, "export.mp4"));

console.log("\nDONE");
console.log("composed", composed, fs.statSync(composed).size);
console.log("preview", `http://localhost:3000/api/video/render/file/${PROJECT_ID}`);
