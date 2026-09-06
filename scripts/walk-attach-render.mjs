import fs from "fs";
import path from "path";
import os from "os";

const BASE = "http://localhost:3000";
const PROJECT = process.argv[2] || "cp_1788423132094_w0onkc8";
const img = path.join(
  os.homedir(),
  ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-94b5dd6e-8ba7-4379-aac0-b7cc2529f75e.png"
);

console.log("img", fs.existsSync(img), img);
const buf = fs.readFileSync(img);
const form = new FormData();
form.append("file", new Blob([buf], { type: "image/png" }), "character.png");

const up = await fetch(`${BASE}/api/assets`, { method: "POST", body: form });
const upData = await up.json();
console.log("upload", up.status, upData.asset?.id, upData.error);
if (!upData.asset?.id) process.exit(1);

const patch = await fetch(`${BASE}/api/create/${PROJECT}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "set_assets", assetIds: [upData.asset.id] }),
});
const patchData = await patch.json();
console.log(
  "set_assets",
  patch.status,
  Array.isArray(patchData.assets) ? patchData.assets.length : patchData.error || "ok"
);

const v1 = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: PROJECT,
    action: "material_strategy",
    mode: "prefer_owned",
    targetDurationSec: 15,
  }),
});
const vd1 = await v1.json();
console.log("coverage", vd1.video?.coverage?.summary);

const v2 = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: PROJECT,
    action: "plan_storyboard",
    targetDurationSec: 15,
  }),
});
const vd2 = await v2.json();
console.log(
  "shots",
  vd2.video?.storyboard?.shots?.map((s) => ({
    type: s.sourceType,
    dur: s.durationSec,
    desc: String(s.description || "").slice(0, 50),
  }))
);

const v3 = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: PROJECT,
    action: "build_timeline",
    aspectRatio: "9:16",
  }),
});
const vd3 = await v3.json();
console.log(
  "timeline",
  v3.status,
  vd3.message || vd3.error,
  "imgScenes",
  vd3.video?.timeline?.imageTrack?.scenes?.length,
  "vidScenes",
  vd3.video?.timeline?.videoTrack?.scenes?.length
);

const v4 = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: PROJECT,
    action: "render",
    confirm: true,
    allowWithoutMusic: true,
  }),
});
const vd4 = await v4.json();
console.log(
  "render",
  v4.status,
  vd4.message || vd4.error || vd4.video?.jobMessage,
  "preview",
  vd4.video?.previewUrl,
  "jobStatus",
  vd4.video?.jobStatus
);
