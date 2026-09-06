/**
 * True face-swap on Douyin keyframes using Qwen-Image-Edit-2509:
 * image = keyframe (layout), image2 = user face (identity).
 * Then mux original Douyin audio.
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
const EDIT_MODELS = [
  "Qwen/Qwen-Image-Edit-2509",
  "Qwen/Qwen-Image-Edit",
];

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

function dataUrl(buf, mime) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function editFaceSwap(keyframeBuf, faceBuf, model) {
  const prompt = [
    "只替换主画面人物和圆形小窗内人物的脸部身份为第二张参考人脸照片中的同一位女性。",
    "必须原样保留：蓝白花海背景、暗红黑汉服、FASHION/SELF-PORTRAIT 文字、圆形相框、左侧歌词、底部音乐播放器进度条与按钮、点赞评论图标、整体构图与光影。",
    "禁止：改成男的、城市夜景、平板、抖音logo、办公室、水彩立绘。",
    "Only swap face identity; keep every other pixel layout.",
  ].join("");

  const body = {
    model,
    prompt,
    batch_size: 1,
    num_inference_steps: 28,
    guidance_scale: 4.5,
    image: dataUrl(keyframeBuf, "image/jpeg"),
    image2: dataUrl(faceBuf, "image/png"),
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
  if (!res.ok) throw new Error(`${model} ${res.status} ${text.slice(0, 280)}`);
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

// Probe which edit model works
let MODEL = null;
{
  const kf = fs.readFileSync(path.join(WORK, "keyframes", "kf_03.jpg"));
  const face = fs.readFileSync(FACE);
  for (const m of EDIT_MODELS) {
    try {
      console.log("probe", m);
      const buf = await editFaceSwap(kf, face, m);
      fs.writeFileSync(path.join(WORK, "probe_edit.jpg"), buf);
      MODEL = m;
      console.log("probe ok", m, buf.length);
      break;
    } catch (e) {
      console.log("probe fail", e.message);
    }
  }
}
if (!MODEL) {
  console.error("no edit model available");
  process.exit(1);
}

const kfDir = path.join(WORK, "keyframes");
const outDir = path.join(WORK, "swapped_edit");
fs.mkdirSync(outDir, { recursive: true });
const kfs = fs
  .readdirSync(kfDir)
  .filter((f) => f.endsWith(".jpg"))
  .sort();
const faceBuf = fs.readFileSync(FACE);
const swapped = [];

for (let i = 0; i < kfs.length; i++) {
  const kfPath = path.join(kfDir, kfs[i]);
  const out = path.join(outDir, `sw_${String(i + 1).padStart(2, "0")}.jpg`);
  console.log(`\n[${i + 1}/${kfs.length}]`, kfs[i], MODEL);
  try {
    const buf = await editFaceSwap(fs.readFileSync(kfPath), faceBuf, MODEL);
    fs.writeFileSync(out, buf);
    console.log("  ok", buf.length);
    swapped.push(out);
  } catch (e) {
    console.log("  fail", e.message, "→ keep original keyframe");
    fs.copyFileSync(kfPath, out);
    swapped.push(out);
  }
}

const audio = path.join(WORK, "audio.mp3");
const listFile = path.join(WORK, "frames_edit.txt");
const lines = [];
for (const f of swapped) {
  lines.push(`file '${f.replace(/\\/g, "/")}'`);
  lines.push("duration 1");
}
lines.push(`file '${swapped.at(-1).replace(/\\/g, "/")}'`);
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
console.log("model", MODEL);
console.log("composed", composed, fs.statSync(composed).size);
console.log("preview http://localhost:3000/api/video/render/file/" + PROJECT_ID);
