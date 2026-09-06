/**
 * Pack Chengdu + tomato showcase JSON (userId null) into data/showcase.
 * MP4s are uploaded separately to /opt/nexa/media/renders on the server.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const SHOWCASE = join("data", "showcase");
const now = new Date().toISOString();

function writeBoth(rel: string, obj: unknown) {
  const show = join(SHOWCASE, rel);
  const live = join(".nexa-data", rel);
  mkdirSync(dirname(show), { recursive: true });
  mkdirSync(dirname(live), { recursive: true });
  const text = JSON.stringify(obj, null, 2);
  writeFileSync(show, text);
  writeFileSync(live, text);
  console.log("wrote", rel);
}

function load(rel: string) {
  return JSON.parse(readFileSync(join(".nexa-data", rel), "utf8"));
}

const creations = [
  "creations/cp_1788673504290_eujpk2n.json",
  "creations/cp_1788676054120_1pbolrt.json",
  "creations/cp_1788713784199_bm290to.json",
];
const workspaces = [
  "workspaces/ws_1788673467325_j8uwym3.json",
  "workspaces/ws_1788675908892_llshfll.json",
  "workspaces/ws_1788713767021_05nb8th.json",
];

for (const rel of [...creations, ...workspaces]) {
  const obj = load(rel);
  obj.userId = null;
  obj.updatedAt = now;
  if (obj.content?.__videoProject) {
    const id = obj.id as string;
    const exportPath = join(".nexa-data", "renders", id, "export.mp4");
    if (existsSync(exportPath)) {
      obj.content.__videoProject.exportUrl = `/api/video/render/file/${id}`;
      obj.content.__videoProject.previewUrl = `/api/video/render/file/${id}`;
      obj.content.__videoProject.jobStatus = "completed";
      obj.content.__videoProject.jobMessage = "成片已导出，可在下方预览播放。";
      obj.status = "ready";
    }
  }
  writeBoth(rel, obj);
}

for (const id of [
  "ws_1788673467325_j8uwym3",
  "ws_1788675908892_llshfll",
  "ws_1788713767021_05nb8th",
]) {
  const src = join(".nexa-data", "source-ingest", `${id}.json`);
  if (existsSync(src)) {
    mkdirSync(join(SHOWCASE, "source-ingest"), { recursive: true });
    copyFileSync(src, join(SHOWCASE, "source-ingest", `${id}.json`));
    console.log("copied ingest", id);
  }
}

writeFileSync(
  join(SHOWCASE, "manifest.json"),
  JSON.stringify(
    {
      version: 2,
      description: "共享演示：西红柿炒鸡蛋 + 成都行程（含成片）",
      creations: creations.map((r) => r.split("/")[1].replace(".json", "")),
      workspaces: workspaces.map((r) => r.split("/")[1].replace(".json", "")),
      updatedAt: now,
    },
    null,
    2
  )
);
console.log("done");
