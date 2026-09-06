/**
 * V4.0 — Resolve task context from real Memory + Workspace + Assets + Research
 */

import { fileStoreListAssets } from "@/lib/assets/file-store";
import { fileStoreListProjects } from "@/lib/creation/file-store";
import {
  fileStoreListResearchJobs,
  fileStoreListWorkspaces,
} from "@/lib/workspace/file-store";
import { getActiveMemoryForPrompt, listActiveMemories } from "@/modules/memory/services/memory-service";
import { loadPreferences, savePreferences } from "./preferences-store";
import type { ResolvedContextSource, ResolvedTaskContext } from "./types";

function scoreText(hay: string, needle: string): number {
  const q = needle.toLowerCase().trim();
  if (!q) return 0;
  const h = hay.toLowerCase();
  let score = 0;
  for (const token of q.split(/\s+/).filter((t) => t.length > 1)) {
    if (h.includes(token)) score += 1;
  }
  return score;
}

export async function setMemoryEnabled(
  userId: string,
  enabled: boolean
): Promise<{ memoryEnabled: boolean }> {
  const prefs = await savePreferences(userId, { memoryEnabled: enabled });
  return { memoryEnabled: prefs.memoryEnabled };
}

export async function getMemoryEnabled(userId: string): Promise<boolean> {
  const prefs = await loadPreferences(userId);
  return prefs.memoryEnabled;
}

/**
 * Auto-select relevant Memory / Workspace / Assets / Research for a task.
 * Never invents content — only returns what exists for this userId.
 */
export async function resolveTaskContext(opts: {
  userId: string;
  task: string;
  workspaceId?: string | null;
  limit?: number;
}): Promise<ResolvedTaskContext> {
  const { userId, task } = opts;
  const limit = opts.limit ?? 8;
  const prefs = await loadPreferences(userId);
  const sources: ResolvedContextSource[] = [];

  let memoriesUsed = 0;
  let memoryBlock: string | null = null;
  if (prefs.memoryEnabled) {
    const memories = await listActiveMemories(userId);
    memoriesUsed = memories.length;
    memoryBlock = await getActiveMemoryForPrompt(userId, { enabled: true });
    for (const m of memories.slice(0, 5)) {
      sources.push({
        kind: "memory",
        id: m.id,
        title: m.label,
        snippet: m.value.slice(0, 200),
        updatedAt: m.updatedAt,
      });
    }
  }

  const workspaces = await fileStoreListWorkspaces(userId);
  const rankedWs = workspaces
    .map((ws) => ({
      ws,
      score:
        (opts.workspaceId && ws.id === opts.workspaceId ? 100 : 0) +
        scoreText(`${ws.name} ${ws.description ?? ""}`, task),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, limit));

  for (const { ws } of rankedWs) {
    sources.push({
      kind: "workspace",
      id: ws.id,
      title: ws.name,
      snippet: ws.description ?? `${ws.sources?.length ?? 0} 个来源`,
      updatedAt: ws.updatedAt,
    });
  }

  const researchIds: string[] = [];
  for (const { ws } of rankedWs) {
    const jobs = await fileStoreListResearchJobs(ws.id);
    for (const job of jobs.slice(0, 3)) {
      researchIds.push(job.id);
      sources.push({
        kind: "research",
        id: job.id,
        title: job.goal || "研究报告",
        snippet: job.status,
        updatedAt: job.createdAt,
      });
    }
  }

  const assets = await fileStoreListAssets(userId);
  const rankedAssets = assets
    .map((a) => ({
      a,
      score: scoreText(
        `${a.fileName} ${a.metadata?.subject ?? ""} ${(a.metadata?.visual_tags ?? []).join(" ")}`,
        task
      ),
    }))
    .sort((a, b) => b.score - a.score || b.a.updatedAt.localeCompare(a.a.updatedAt))
    .slice(0, Math.min(4, limit));

  for (const { a } of rankedAssets) {
    sources.push({
      kind: "asset",
      id: a.id,
      title: a.fileName || a.id,
      snippet: a.mimeType ?? a.assetType ?? null,
      updatedAt: a.updatedAt,
    });
  }

  const creations = await fileStoreListProjects(userId);
  const rankedCreations = creations
    .map((c) => ({
      c,
      score: scoreText(`${c.title} ${c.goal} ${c.brief ?? ""}`, task),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, limit));

  for (const { c } of rankedCreations) {
    sources.push({
      kind: "creation",
      id: c.id,
      title: c.title,
      snippet: c.goal?.slice(0, 160) ?? null,
      updatedAt: c.updatedAt,
    });
  }

  const parts: string[] = [];
  if (memoryBlock) parts.push(memoryBlock);
  if (rankedWs.length) {
    parts.push(
      `【工作区上下文】\n${rankedWs
        .map(({ ws }) => `- ${ws.name} (${ws.id})`)
        .join("\n")}`
    );
  }
  if (researchIds.length) {
    parts.push(`【相关研究】${researchIds.join(", ")}`);
  }
  if (rankedAssets.length) {
    parts.push(
      `【素材】\n${rankedAssets.map(({ a }) => `- ${a.fileName || a.id}`).join("\n")}`
    );
  }
  if (rankedCreations.length) {
    parts.push(
      `【历史创作】\n${rankedCreations
        .map(({ c }) => `- ${c.title}`)
        .join("\n")}`
    );
  }

  const hasAnything = sources.length > 0;
  return {
    userId,
    task,
    memoryEnabled: prefs.memoryEnabled,
    memoriesUsed: prefs.memoryEnabled ? memoriesUsed : 0,
    workspaceIds: rankedWs.map(({ ws }) => ws.id),
    assetIds: rankedAssets.map(({ a }) => a.id),
    researchIds,
    creationIds: rankedCreations.map(({ c }) => c.id),
    sources,
    contextSummary: parts.join("\n\n"),
    message: hasAnything
      ? prefs.memoryEnabled
        ? `已根据任务自动选择 ${sources.length} 项真实上下文。`
        : `Memory 已关闭；已选择 ${sources.length} 项工作区/素材/研究上下文。`
      : "暂无可用历史上下文（未伪造）。",
  };
}
