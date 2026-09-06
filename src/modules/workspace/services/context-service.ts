/**
 * V3.0 — Workspace Context Intelligence
 * Builds unified WorkspaceContext; AI only reads included items.
 */

import type {
  ContextItem,
  ContextItemKind,
  ContextSourceRole,
  ContextVersion,
  Workspace,
  WorkspaceContext,
  WorkspaceSource,
} from "@/modules/workspace/types";
import {
  getWorkspace,
  updateWorkspaceRecord,
} from "@/modules/workspace/services/workspace-service";

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const ASSET_KINDS: ContextItemKind[] = [
  "image",
  "video",
  "pdf",
  "docx",
  "txt",
  "user_upload",
];

export function defaultSourceRole(source: Pick<WorkspaceSource, "sourceType">): ContextSourceRole {
  if (source.sourceType === "video") return "visual_reference";
  if (source.sourceType === "image") return "image_reference";
  return "fact";
}

export function sourceRoleFromItem(
  item: ContextItem | undefined,
  source: Pick<WorkspaceSource, "sourceType">
): ContextSourceRole {
  const role = item?.payload?.contextRole;
  if (
    role === "fact" ||
    role === "visual_reference" ||
    role === "image_reference"
  ) {
    return role;
  }
  return defaultSourceRole(source);
}

function sourceToItem(s: WorkspaceSource, index: number): ContextItem {
  const now = s.addedAt || new Date().toISOString();
  return {
    id: `ctx_src_${s.id}`,
    kind: "search_result",
    title: s.title || s.url,
    summary: s.snippet ?? null,
    refId: s.id,
    url: s.url,
    includedInContext: true,
    sortOrder: index,
    payload: {
      platform: s.platform,
      sourceType: s.sourceType,
      contextRole: s.contextRole ?? defaultSourceRole(s),
      author: s.author,
      thumbnail: s.thumbnail,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Ensure legacy sources are mirrored into items without destroying custom items. */
export function ensureWorkspaceItems(ws: Workspace): ContextItem[] {
  const existing = [...(ws.items ?? [])];
  const byRef = new Set(
    existing
      .filter((i) => i.kind === "search_result" && i.refId)
      .map((i) => i.refId as string)
  );
  const mirrored = ws.sources
    .filter((s) => !byRef.has(s.id))
    .map((s, i) => sourceToItem(s, existing.length + i));
  // Drop search_result items whose source was removed
  const sourceIds = new Set(ws.sources.map((s) => s.id));
  const pruned = existing.filter(
    (i) => i.kind !== "search_result" || !i.refId || sourceIds.has(i.refId)
  );
  return [...pruned, ...mirrored].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function buildWorkspaceContext(ws: Workspace): WorkspaceContext {
  const items = ensureWorkspaceItems(ws);
  const selected = items.filter((i) => i.includedInContext);
  const assets = selected.filter((i) => ASSET_KINDS.includes(i.kind));
  const research = selected.filter((i) => i.kind === "research_report");
  const commerce = selected.filter((i) => i.kind === "commerce_diagnosis");
  const drafts = selected.filter((i) => i.kind === "creation_draft");
  const sources = ws.sources.filter((s) => {
    const item = items.find((i) => i.refId === s.id && i.kind === "search_result");
    return item ? item.includedInContext : true;
  });

  const sourceCount = sources.length + research.length;
  const assetCount = assets.length;
  const summary = `本次生成参考了 ${sourceCount} 个来源和 ${assetCount} 个素材。`;

  return {
    workspaceId: ws.id,
    userId: ws.userId ?? null,
    items: selected,
    sources,
    assets,
    research,
    commerce,
    drafts,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    explainability: {
      sourceCount,
      assetCount,
      researchCount: research.length,
      commerceCount: commerce.length,
      draftCount: drafts.length,
      summary,
    },
  };
}

export async function getWorkspaceContext(
  workspaceId: string
): Promise<WorkspaceContext | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  return buildWorkspaceContext(ws);
}

export async function addContextItem(
  workspaceId: string,
  input: {
    kind: ContextItemKind;
    title: string;
    summary?: string | null;
    refId?: string | null;
    url?: string | null;
    payload?: Record<string, unknown> | null;
    includedInContext?: boolean;
  }
): Promise<{ workspace: Workspace; item: ContextItem } | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const items = ensureWorkspaceItems(ws);
  const now = new Date().toISOString();
  const item: ContextItem = {
    id: uid("ctx"),
    kind: input.kind,
    title: input.title,
    summary: input.summary ?? null,
    refId: input.refId ?? null,
    url: input.url ?? null,
    includedInContext: input.includedInContext ?? true,
    sortOrder: items.length,
    payload: input.payload ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const updated = await updateWorkspaceRecord(workspaceId, {
    items: [...items, item],
  });
  return updated ? { workspace: updated, item } : null;
}

export async function removeContextItem(
  workspaceId: string,
  itemId: string
): Promise<Workspace | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const items = ensureWorkspaceItems(ws).filter((i) => i.id !== itemId);
  return updateWorkspaceRecord(workspaceId, { items });
}

export async function setContextItemIncluded(
  workspaceId: string,
  itemId: string,
  included: boolean
): Promise<Workspace | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const items = ensureWorkspaceItems(ws).map((i) =>
    i.id === itemId
      ? { ...i, includedInContext: included, updatedAt: new Date().toISOString() }
      : i
  );
  return updateWorkspaceRecord(workspaceId, { items });
}

export async function setContextItemSourceRole(
  workspaceId: string,
  itemId: string,
  contextRole: ContextSourceRole
): Promise<Workspace | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const items = ensureWorkspaceItems(ws).map((item) =>
    item.id === itemId
      ? {
          ...item,
          payload: { ...(item.payload ?? {}), contextRole },
          updatedAt: new Date().toISOString(),
        }
      : item
  );
  return updateWorkspaceRecord(workspaceId, { items });
}

export async function reorderContextItems(
  workspaceId: string,
  orderedIds: string[]
): Promise<Workspace | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const items = ensureWorkspaceItems(ws);
  const map = new Map(items.map((i) => [i.id, i]));
  const reordered: ContextItem[] = [];
  orderedIds.forEach((id, idx) => {
    const item = map.get(id);
    if (item) {
      reordered.push({ ...item, sortOrder: idx, updatedAt: new Date().toISOString() });
      map.delete(id);
    }
  });
  // Append any remaining
  for (const item of map.values()) {
    reordered.push({ ...item, sortOrder: reordered.length });
  }
  return updateWorkspaceRecord(workspaceId, { items: reordered });
}

export async function saveContextVersion(
  workspaceId: string,
  input: {
    label: string;
    kind: ContextVersion["kind"];
    refId?: string | null;
    snapshot: Record<string, unknown>;
  }
): Promise<Workspace | null> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) return null;
  const version: ContextVersion = {
    id: uid("ver"),
    label: input.label,
    kind: input.kind,
    refId: input.refId ?? null,
    snapshot: input.snapshot,
    createdAt: new Date().toISOString(),
  };
  const versions = [...(ws.versions ?? []), version].slice(-50);
  return updateWorkspaceRecord(workspaceId, { versions });
}

/** Serialize selected context for AI prompts (no fake data). */
export function formatContextForPrompt(ctx: WorkspaceContext): string {
  const blocks: string[] = [];
  if (ctx.explainability?.summary) {
    blocks.push(`【上下文说明】${ctx.explainability.summary}`);
  }
  if (ctx.sources.length) {
    const sourceItems = new Map(
      ctx.items
        .filter((item) => item.kind === "search_result" && item.refId)
        .map((item) => [item.refId as string, item])
    );
    const factSources = ctx.sources.filter(
      (source) => sourceRoleFromItem(sourceItems.get(source.id), source) === "fact"
    );
    const visualSources = ctx.sources.filter(
      (source) => sourceRoleFromItem(sourceItems.get(source.id), source) !== "fact"
    );
    if (factSources.length) {
      blocks.push("【事实依据：只可支持事实、步骤、数据等断言】");
      for (const s of factSources.slice(0, 20)) {
        const digest =
          s.contentSummary ||
          (s.keyExcerpts?.length ? s.keyExcerpts.join("\n") : "") ||
          s.snippet ||
          "";
        blocks.push(
          `- ${s.title || s.url}\n  URL: ${s.url}\n  ${String(digest).slice(0, 1200)}`
        );
      }
    }
    if (visualSources.length) {
      blocks.push(
        "【视觉参考：只用于镜头、构图、节奏、拍摄/剪辑风格；不得据此生成事实步骤或数据】"
      );
      for (const s of visualSources.slice(0, 20)) {
      const digest =
        s.contentSummary ||
        (s.keyExcerpts?.length ? s.keyExcerpts.join("\n") : "") ||
        s.snippet ||
        "";
      const mediaExtra =
        s.mediaSummary && !(s.contentSummary || "").includes("识别版本")
          ? `\n  媒体识别：${s.mediaSummary}`
          : "";
      blocks.push(
        `- ${s.title || s.url}\n  URL: ${s.url}\n  ${String(digest).slice(0, 1200)}${mediaExtra}`
      );
      }
    }
  }
  if (ctx.research.length) {
    blocks.push("【研究报告】");
    for (const r of ctx.research.slice(0, 5)) {
      const body =
        r.summary ||
        (r.payload ? JSON.stringify(r.payload) : "");
      blocks.push(`- ${r.title}\n  ${String(body).slice(0, 2500)}`);
    }
  }
  if (ctx.commerce.length) {
    blocks.push("【商业诊断】");
    for (const c of ctx.commerce.slice(0, 5)) {
      blocks.push(`- ${c.title}\n  ${(c.summary || JSON.stringify(c.payload || {})).slice(0, 800)}`);
    }
  }
  if (ctx.assets.length) {
    blocks.push("【参考素材】");
    for (const a of ctx.assets.slice(0, 12)) {
      blocks.push(`- ${a.title}（${a.kind}）${a.url ? `\n  ${a.url}` : ""}`);
    }
  }
  if (ctx.drafts.length) {
    blocks.push("【创作草稿】");
    for (const d of ctx.drafts.slice(0, 5)) {
      blocks.push(`- ${d.title}\n  ${(d.summary || "").slice(0, 500)}`);
    }
  }
  return blocks.join("\n\n").slice(0, 14000) || "（当前未选择任何 Context）";
}
