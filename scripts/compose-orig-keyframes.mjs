import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const WORK = path.resolve(".nexa-data", "recreate", "7673183599574666530");
const PROJECT = "recreate_7673183599574666530";
const kfs = fs
  .readdirSync(path.join(WORK, "keyframes"))
  .filter((f) => f.endsWith(".jpg"))
  .sort()
  .map((f) => path.resolve(WORK, "keyframes", f));

const list = path.join(WORK, "frames_orig.txt");
const lines = [];
for (const f of kfs) {
  const abs = f.replace(/\\/g, "/");
  lines.push(`file '${abs}'`);
  lines.push("duration 1");
}
lines.push(`file '${kfs.at(-1).replace(/\\/g, "/")}'`);
fs.writeFileSync(list, lines.join("\n"));

const out = path.join(WORK, "composed_orig_layout.mp4");
await new Promise((resolve, reject) => {
  const c = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-i",
      path.join(WORK, "audio.mp3"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      out,
    ],
    { windowsHide: true }
  );
  let err = "";
  c.stderr.on("data", (d) => (err += d));
  c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-500)))));
});

const dir = path.join(".nexa-data", "renders", PROJECT);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(out, path.join(dir, "export.mp4"));
console.log("ok", out, fs.statSync(out).size);
console.log("preview http://localhost:3000/api/video/render/file/" + PROJECT);
