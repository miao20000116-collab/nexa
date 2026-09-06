/**
 * Persist generated recreate output into a Workspace Context item
 * so users can reopen / play it from /workspace.
 */

import {
  addContextItem,
  saveContextVersion,
} from "@/modules/workspace/services/context-service";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
} from "@/modules/workspace/services/workspace-service";
import type { ContextItem, ContextItemKind } from "@/modules/workspace/types";

export const CREATIONS_WORKSPACE_NAME = "创作成片";

export type PersistRenderInput = {
  /** Prefer an explicit workspace; otherwise resolve/create 「创作成片」 */
  workspaceId?: string | null;
  jobId: string;
  title: string;
  summary?: string;
  /** Playable / openable URL (local render API or remote image) */
  mediaUrl: string;
  kind: "video" | "image";
  platform?: string | null;
  sourceUrl?: string | null;
  promptUsed?: string | null;
};

export type PersistRenderResult = {
  workspaceId: string;
  workspaceName: string;
  item: ContextItem;
};

async function resolveCreationsWorkspace(
  preferredId?: string | null
): Promise<{ id: string; name: string }> {
  if (preferredId) {
    const ws = await getWorkspace(preferredId);
    if (ws) return { id: ws.id, name: ws.name };
  }

  const list = await listWorkspaces();
  const existing = list.find(
    (w) =>
      w.status === "active" &&
      (w.name === CREATIONS_WORKSPACE_NAME || w.name.includes("成片"))
  );
  if (existing) return { id: existing.id, name: existing.name };

  const created = await createWorkspace(CREATIONS_WORKSPACE_NAME);
  return { id: created.id, name: created.name };
}

export async function persistRenderToWorkspace(
  input: PersistRenderInput
): Promise<PersistRenderResult> {
  const ws = await resolveCreationsWorkspace(input.workspaceId);
  const kind: ContextItemKind = input.kind === "image" ? "image" : "video";
  const summary =
    input.summary ||
    (input.kind === "video"
      ? "在线二创成片（仅结构参考，未下载平台原片）"
      : "在线二创出图（仅结构参考，未下载平台原片）");

  const added = await addContextItem(ws.id, {
    kind,
    title: input.title,
    summary,
    refId: input.jobId,
    url: input.mediaUrl,
    payload: {
      jobId: input.jobId,
      platform: input.platform ?? null,
      sourceUrl: input.sourceUrl ?? null,
      promptUsed: input.promptUsed ?? null,
      mediaKind: input.kind,
      previewUrl: input.mediaUrl,
    },
    includedInContext: true,
  });

  if (!added) {
    throw new Error("成片已生成，但写入工作区失败");
  }

  try {
    await saveContextVersion(ws.id, {
      label: input.title,
      kind: "creation",
      refId: input.jobId,
      snapshot: {
        jobId: input.jobId,
        mediaUrl: input.mediaUrl,
        kind: input.kind,
        platform: input.platform ?? null,
        sourceUrl: input.sourceUrl ?? null,
      },
    });
  } catch (err) {
    console.error("[persistRenderToWorkspace] version save failed", err);
  }

  return {
    workspaceId: ws.id,
    workspaceName: ws.name,
    item: added.item,
  };
}
