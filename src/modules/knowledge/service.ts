/**
 * V4.5 — Knowledge / Research Graph (background capability)
 * Topic → Source → Research → Insight → Creation → Performance
 * Strict userId isolation. Not a user-managed knowledge base product.
 */

import { promises as fs } from "fs";
import path from "path";
import { fileStoreListWorkspaces } from "@/lib/workspace/file-store";
import { fileStoreListProjects } from "@/lib/creation/file-store";
import { fileStoreListResearchJobs } from "@/lib/workspace/file-store";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "knowledge");

export interface KnowledgeNode {
  id: string;
  type: "topic" | "source" | "research" | "insight" | "creation" | "performance";
  title: string;
  refId?: string;
  snippet?: string;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  relation: string;
}

export interface KnowledgeRecallResult {
  query: string;
  userId: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  summary: string;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function scoreText(text: string, query: string): number {
  const tokens = query
    .toLowerCase()
    .split(/[\s,，。、]+/)
    .filter((t) => t.length > 1);
  const blob = text.toLowerCase();
  if (!tokens.length) return 0;
  return tokens.filter((t) => blob.includes(t)).length / tokens.length;
}

export async function recallKnowledge(input: {
  userId: string;
  query: string;
}): Promise<KnowledgeRecallResult> {
  const q = input.query.trim();
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  const topicId = uid("topic");
  nodes.push({ id: topicId, type: "topic", title: q || "相关主题" });

  const workspaces = await fileStoreListWorkspaces(input.userId);
  for (const ws of workspaces.slice(0, 30)) {
    const text = `${ws.name} ${ws.description || ""} ${ws.sources
      .map((s) => `${s.title} ${s.snippet}`)
      .join(" ")}`;
    if (scoreText(text, q) < 0.2 && q) continue;

    for (const s of ws.sources.slice(0, 8)) {
      if (q && scoreText(`${s.title} ${s.snippet}`, q) < 0.15) continue;
      const sid = uid("src");
      nodes.push({
        id: sid,
        type: "source",
        title: s.title || s.url,
        refId: s.id,
        snippet: s.snippet || undefined,
      });
      edges.push({ from: topicId, to: sid, relation: "has_source" });
    }

    const jobs = await fileStoreListResearchJobs(ws.id);
    for (const job of jobs.slice(0, 5)) {
      if (job.status !== "completed") continue;
      if (q && scoreText(`${job.goal} ${JSON.stringify(job.report || {})}`, q) < 0.15)
        continue;
      const rid = uid("research");
      nodes.push({
        id: rid,
        type: "research",
        title: job.goal,
        refId: job.id,
        snippet: (job.report?.executiveSummary as string) || undefined,
      });
      edges.push({ from: topicId, to: rid, relation: "has_research" });

      const opps = (job.report?.opportunities as string[] | undefined) ?? [];
      for (const opp of opps.slice(0, 3)) {
        const iid = uid("insight");
        nodes.push({
          id: iid,
          type: "insight",
          title: opp.slice(0, 80),
          refId: job.id,
        });
        edges.push({ from: rid, to: iid, relation: "yields_insight" });
      }
    }
  }

  const projects = await fileStoreListProjects(input.userId);
  for (const p of projects.slice(0, 40)) {
    const text = `${p.title} ${p.goal || ""} ${JSON.stringify(p.content || {})}`;
    if (q && scoreText(text, q) < 0.2) continue;
    const cid = uid("creation");
    nodes.push({
      id: cid,
      type: "creation",
      title: p.title,
      refId: p.id,
      snippet: p.goal || undefined,
    });
    edges.push({ from: topicId, to: cid, relation: "has_creation" });
  }

  // Persist lightweight recall log (not a user-facing KB)
  await fs.mkdir(DATA_DIR, { recursive: true });
  const result: KnowledgeRecallResult = {
    query: q,
    userId: input.userId,
    nodes,
    edges,
    summary:
      nodes.length <= 1
        ? "未召回相关历史 Context。"
        : `召回 ${nodes.length - 1} 条历史节点（Research / Workspace / Creation），仅限当前用户。`,
  };
  await fs.writeFile(
    path.join(DATA_DIR, `recall_${Date.now()}.json`),
    JSON.stringify(result, null, 2)
  );
  return result;
}
