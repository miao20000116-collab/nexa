/**
 * Full path: share paste → ingest (expand) → create with grounded brief
 * → attach image → plan_storyboard (must reflect reference) → timeline → render
 *
 * Usage: node --env-file=.env scripts/walk-reference-storyboard.mjs
 */
import fs from "fs";
import path from "path";
import os from "os";

const PASTE =
  "6.69 复制打开抖音，看看【陈柯的作品】是否爱上一个人不问明天过后 # 聚宝仙盆之杂灵根才... https://v.douyin.com/JXmDmiKtuW0/ l@P.kC 06/12 VYm:/ :6pm";
const BASE = process.env.NEXA_BASE || "http://localhost:3000";

const findings = [];
function log(step, ok, detail) {
  findings.push({ step, ok, detail });
  console.log(`\n[${ok ? "OK" : "FAIL"}] ${step}`);
  console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

const imgCandidates = [
  path.join(
    os.homedir(),
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-94b5dd6e-8ba7-4379-aac0-b7cc2529f75e.png"
  ),
];

// 1) Ingest
const ingestRes = await fetch(`${BASE}/api/create/social-ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: PASTE, mediaAssetCount: 1 }),
});
const ingest = await ingestRes.json();
const ingestOk =
  ingestRes.ok &&
  Boolean(ingest.canonicalUrl || ingest.awemeId) &&
  ingest.parseMethod !== "share_paste_fallback";
log("1. social-ingest expand", ingestOk, {
  parseMethod: ingest.parseMethod,
  awemeId: ingest.awemeId,
  title: ingest.title,
  topics: ingest.topics,
  structureHints: ingest.structureHints?.slice?.(0, 4),
  briefSnippet: ingest.briefSnippet?.slice?.(0, 180),
});
if (!ingestOk) {
  console.log("\n==== STOP: short link did not expand ====");
  process.exit(1);
}

// 2) Create with copyright-safe brief from ingest (same as UI)
const briefParts = [
  `【同款二创 · 短视频】${ingest.platformLabel}`,
  `参考链接（仅作结构/风格参考，不复制原作）：${ingest.canonicalUrl || ingest.url}`,
  `解析状态：${ingest.parseStatus}`,
  ingest.title ? `参考标题（需改写，不得原样使用）：${ingest.title}` : null,
  ingest.topics?.length
    ? `话题方向：${ingest.topics.map((t) => `#${t}`).join(" ")}`
    : null,
  ingest.structureHints?.length
    ? `结构线索：\n- ${ingest.structureHints.join("\n- ")}`
    : null,
  ingest.briefSnippet
    ? `参考文案线索（需原创改写）：\n${ingest.briefSnippet}`
    : null,
  "二创规则：成片必须使用自有素材，禁止原片原声原文案。",
].filter(Boolean);
const brief = briefParts.join("\n");

const createRes = await fetch(`${BASE}/api/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    goal: ingest.title
      ? `根据「${ingest.title}」做版权安全的同款短视频（${ingest.platformLabel}）`
      : `根据参考做版权安全的同款短视频（${ingest.platformLabel}）`,
    title: `同款二创·${ingest.title || ingest.awemeId}`,
    contentType: "short_video",
    platform: "douyin",
    startMode: "link",
    linkUrl: ingest.canonicalUrl || ingest.url,
    brief,
  }),
});
const created = await createRes.json();
log("2. create project", createRes.ok && Boolean(created.id), {
  id: created.id,
  error: created.error,
});
if (!created.id) process.exit(1);
const projectId = created.id;

// 3) Upload character image
let assetId = null;
const imgPath = imgCandidates.find((p) => fs.existsSync(p));
if (imgPath) {
  const buf = fs.readFileSync(imgPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/png" }), "character.png");
  const up = await fetch(`${BASE}/api/assets`, { method: "POST", body: form });
  const upData = await up.json();
  assetId = upData.asset?.id ?? null;
  log("3. upload asset", Boolean(assetId), {
    assetId,
    error: upData.error,
  });
  if (assetId) {
    const patch = await fetch(`${BASE}/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_assets", assetIds: [assetId] }),
    });
    const patchData = await patch.json();
    log("3b. set_assets", patch.ok, {
      count: Array.isArray(patchData.assets) ? patchData.assets.length : 0,
      error: patchData.error,
    });
  }
} else {
  log("3. upload asset", false, "character image not found locally");
}

// 4) material + storyboard
await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId,
    action: "material_strategy",
    mode: "prefer_owned",
    targetDurationSec: 15,
  }),
});

const planRes = await fetch(`${BASE}/api/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId,
    action: "plan_storyboard",
    targetDurationSec: 15,
  }),
});
const plan = await planRes.json();
const shots = plan.video?.storyboard?.shots ?? [];
const blob = JSON.stringify(plan.video?.storyboard ?? {});
const grounded =
  /爱上|不问明天|聚宝仙盆|陈柯|三幕|钩子|话题/.test(blob) &&
  !/^图片动画镜头：根据抖音参考/.test(shots[0]?.description ?? "");
log("4. plan_storyboard grounded on reference", planRes.ok && grounded, {
  script: plan.video?.storyboard?.script?.slice?.(0, 160),
  shots: shots.map((s) => ({
    dur: s.durationSec,
    type: s.sourceType,
    subtitle: String(s.subtitle || "").slice(0, 40),
    desc: String(s.description || "").slice(0, 60),
  })),
  jobMessage: plan.video?.jobMessage,
});

// 5) timeline + render if we have asset
if (assetId) {
  const tl = await fetch(`${BASE}/api/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      action: "build_timeline",
      aspectRatio: "9:16",
    }),
  });
  const tld = await tl.json();
  log("5. build_timeline", tl.ok, {
    imgScenes: tld.video?.timeline?.imageTrack?.scenes?.length,
    message: tld.message || tld.error,
  });

  const rd = await fetch(`${BASE}/api/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      action: "render",
      confirm: true,
      allowWithoutMusic: true,
    }),
  });
  const rdd = await rd.json();
  log("6. render", rd.ok && rdd.video?.jobStatus === "completed", {
    jobStatus: rdd.video?.jobStatus,
    preview: rdd.video?.previewUrl,
    message: rdd.message || rdd.error || rdd.video?.jobMessage,
  });
}

console.log("\n==== SUMMARY ====");
for (const f of findings) {
  console.log(`${f.ok ? "✓" : "✗"} ${f.step}`);
}
console.log(`\nproject: ${projectId}`);
console.log(`open: ${BASE}/create/${projectId}`);
