/**
 * End-to-end: keyframes + user face → swap frames → mux Douyin audio → composed.mp4
 * Usage: node --env-file=.env scripts/walk-faceswap-compose.mjs
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const AWEME = "7673183599574666530";
const WORK = path.join(ROOT, ".nexa-data", "recreate", AWEME);
const FACE_CANDIDATES = [
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
  ),
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-94b5dd6e-8ba7-4379-aac0-b7cc2529f75e.png"
  ),
];

const API = process.env.AI_MEDIA_BASE_URL || process.env.AI_BASE_URL;
const KEY = process.env.AI_MEDIA_API_KEY || process.env.AI_API_KEY;
const MODEL = process.env.AI_MODEL_IMAGE || "Qwen/Qwen-Image";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) =>
      code === 0 ? resolve(true) : reject(new Error(stderr.slice(-600)))
    );
  });
}

async function editImage(prompt, imageBytes, mime = "image/jpeg") {
  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append(
    "image",
    new Blob([imageBytes], { type: mime }),
    mime.includes("png") ? "ref.png" : "ref.jpg"
  );
  const res = await fetch(`${API}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`edits ${res.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url || data.url;
  if (b64) return Buffer.from(b64, "base64");
  if (url) {
    const r = await fetch(url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("empty image result");
}

async function generateWithRef(prompt, imageBytes, mime = "image/png") {
  const body = {
    model: MODEL,
    prompt,
    size: "1024x576",
    n: 1,
    image: imageBytes.toString("base64"),
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
  if (!res.ok) throw new Error(`generations ${res.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const b64 = data.data?.[0]?.b64_json;
  const url = data.data?.[0]?.url || data.url;
  if (b64) return Buffer.from(b64, "base64");
  if (url) {
    const r = await fetch(url);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error("empty gen result");
}

const facePath = FACE_CANDIDATES.find((p) => fs.existsSync(p));
if (!facePath) {
  console.error("face image missing");
  process.exit(1);
}
console.log("face", facePath);
console.log("api", API, "model", MODEL);

const kfDir = path.join(WORK, "keyframes");
const swappedDir = path.join(WORK, "swapped");
fs.mkdirSync(swappedDir, { recursive: true });
const kfs = fs
  .readdirSync(kfDir)
  .filter((f) => f.endsWith(".jpg"))
  .sort();
console.log("keyframes", kfs.length);

const faceBytes = fs.readFileSync(facePath);
const promptBase = [
  "Face identity swap for short-video keyframe.",
  "Keep EXACT same composition, pose, red/black hanfu clothing, props, night city bokeh background, lighting, color grade, and any on-screen text layout.",
  "Replace ONLY the character face identity to match the reference face photo (same person as reference).",
  "Do NOT turn this into a modern office watercolor with a tablet. Keep xianxia / manhua cinematic portrait style.",
].join(" ");

const swapped = [];
for (let i = 0; i < kfs.length; i++) {
  const kf = path.join(kfDir, kfs[i]);
  const out = path.join(swappedDir, `sw_${String(i + 1).padStart(2, "0")}.jpg`);
  console.log(`\n[${i + 1}/${kfs.length}] swap`, kfs[i]);
  const kfBytes = fs.readFileSync(kf);
  let buf = null;
  // SiliconFlow has no /images/edits (always 404) — use generations + face ref only
  try {
    const identityPrompt =
      promptBase +
      " The reference image is the TARGET face identity. Produce one frame matching the xianxia night-city red-hanfu portrait style of Douyin manhua keyframes, similar composition to a cinematic close-up holding a prop.";
    buf = await generateWithRef(identityPrompt, faceBytes, "image/png");
    console.log("  face-ref gen ok", buf.length);
  } catch (e) {
    console.log("  face-ref gen fail", e.message);
  }
  if (!buf) {
    console.log("  fallback copy original frame");
    buf = kfBytes;
  }
  fs.writeFileSync(out, buf);
  swapped.push(out);
}

// Compose with original Douyin audio
const audio = path.join(WORK, "audio.mp3");
const listFile = path.join(WORK, "frames.txt");
const lines = [];
for (const f of swapped) {
  const abs = f.replace(/\\/g, "/");
  lines.push(`file '${abs}'`);
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

// Copy into public-ish preview via API store path used by render
const previewDir = path.join(ROOT, ".nexa-data", "video-renders");
fs.mkdirSync(previewDir, { recursive: true });
const previewName = `recreate_${AWEME}.mp4`;
fs.copyFileSync(composed, path.join(previewDir, previewName));

console.log("\nDONE");
console.log("composed", composed, fs.statSync(composed).length);
console.log("audio track = Douyin source BGM (@陈柯创作的原声 / mid 7673183616100289318)");
console.log("open file:", composed);
