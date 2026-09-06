/**
 * One-shot: register an existing local render into Workspace 「创作成片」.
 * Uses file-store only (no Next request/cookies).
 * Usage: npx tsx scripts/backfill-render-to-workspace.mts [jobId]
 */
import {
  fileStoreCreateWorkspace,
  fileStoreListWorkspaces,
  fileStoreUpdateWorkspace,
} from "../src/lib/workspace/file-store";

const jobId = process.argv[2] || "idrec_7673183599574666530_mtmpfcd7";
const mediaUrl = `/api/video/render/file/${jobId}`;
const NAME = "创作成片";

const list = await fileStoreListWorkspaces(null);
let ws = list.find((w) => w.name === NAME || w.name.includes("成片"));
if (!ws) {
  ws = await fileStoreCreateWorkspace(NAME, undefined, null);
}

const now = new Date().toISOString();
const item = {
  id: `ctx_backfill_${Date.now().toString(36)}`,
  kind: "video" as const,
  title: `二创成片 · ${jobId}`,
  summary: "历史成片回填（本地已生成）",
  refId: jobId,
  url: mediaUrl,
  includedInContext: true,
  sortOrder: (ws.items?.length ?? 0),
  payload: {
    jobId,
    mediaKind: "video",
    previewUrl: mediaUrl,
    backfilled: true,
  },
  createdAt: now,
  updatedAt: now,
};

const items = [...(ws.items ?? []), item];
const updated = await fileStoreUpdateWorkspace(ws.id, { items });

console.log(
  JSON.stringify(
    {
      workspaceId: updated?.id,
      workspaceName: updated?.name,
      itemId: item.id,
      href: `/workspace/${updated?.id}`,
      mediaUrl,
    },
    null,
    2
  )
);
