/**
 * Assemble creation context from workspace / assets / search / commerce / memory.
 * V3.0: reads WorkspaceContext (selected items only). Users should not copy-paste.
 */

import type { CreationProject, CreationSourceRef } from "@/modules/create/types";
import { getWorkspace } from "@/modules/workspace/services/workspace-service";
import {
  buildWorkspaceContext,
  formatContextForPrompt,
} from "@/modules/workspace/services/context-service";
import { getOwnedAsset } from "@/modules/assets/asset-service";
import { getActiveMemoryForPrompt } from "@/modules/memory/services/memory-service";

export interface AssembledContext {
  text: string;
  sources: CreationSourceRef[];
  explainability?: {
    summary: string;
    sourceCount: number;
    assetCount: number;
  };
}

export async function assembleCreationContext(
  project: CreationProject
): Promise<AssembledContext> {
  const blocks: string[] = [];
  const sources: CreationSourceRef[] = [...(project.sources ?? [])];
  let explainability: AssembledContext["explainability"];

  const workspaceId =
    project.workspaceId ||
    sources.find((s) => s.workspaceId)?.workspaceId ||
    null;

  if (workspaceId) {
    const ws = await getWorkspace(workspaceId);
    if (ws) {
      // Ensure media/page recognition before creation (same signals as 分镜)
      try {
        const { ensureSourcesIngested } = await import(
          "@/modules/workspace/services/source-ingest"
        );
        await ensureSourcesIngested(workspaceId, ws.sources, { limit: 8 });
      } catch {
        /* non-blocking */
      }
      const fresh = (await getWorkspace(workspaceId)) ?? ws;
      const ctx = buildWorkspaceContext(fresh);
      const formatted = formatContextForPrompt(ctx);
      if (formatted && formatted !== "（当前未选择任何 Context）") {
        blocks.push(formatted);
      }
      explainability = {
        summary: ctx.explainability?.summary ?? "",
        sourceCount: ctx.explainability?.sourceCount ?? 0,
        assetCount: ctx.explainability?.assetCount ?? 0,
      };
      for (const s of ctx.sources.slice(0, 20)) {
        if (!sources.some((x) => x.url === s.url)) {
          sources.push({
            id: s.id,
            kind: "workspace_source",
            title: s.title ?? undefined,
            url: s.url,
            snippet:
              s.contentSummary?.slice(0, 400) ||
              s.snippet ||
              undefined,
            workspaceId,
          });
        }
      }
      for (const a of ctx.assets.slice(0, 12)) {
        if (a.refId && !sources.some((x) => x.assetId === a.refId)) {
          sources.push({
            id: a.id,
            kind: "asset",
            title: a.title,
            assetId: a.refId,
            url: a.url ?? undefined,
          });
        }
      }
    }
  }

  // Explicit source snippets already on project
  const inline = sources.filter(
    (s) => s.kind === "search_result" || s.kind === "link" || s.snippet
  );
  if (inline.length) {
    blocks.push("【已选资料】");
    for (const s of inline.slice(0, 15)) {
      blocks.push(
        `- ${s.title || s.url || s.id}\n  ${s.url || ""}\n  ${(s.snippet || "").slice(0, 280)}`
      );
    }
  }

  // Commerce context
  if (project.startMode === "commerce" && project.brief) {
    blocks.push("【商品诊断上下文】");
    blocks.push(project.brief.slice(0, 3000));
  }

  // Explicit research report (fuller than workspace summary alone)
  const researchIds = [
    project.researchId,
    ...(project.sources ?? [])
      .filter((s) => s.kind === "research_report")
      .map((s) => s.researchId || s.id.replace(/^research_/, "")),
  ].filter((id): id is string => Boolean(id));
  if (researchIds.length) {
    try {
      const { getResearchJob } = await import(
        "@/modules/workspace/services/workspace-service"
      );
      blocks.push("【研究报告（完整摘录）】");
      for (const rid of [...new Set(researchIds)].slice(0, 2)) {
        const job = await getResearchJob(rid);
        if (!job?.report) {
          blocks.push(`- 研究任务 ${rid}（报告尚未就绪）`);
          continue;
        }
        const report = job.report as Record<string, unknown>;
        const title =
          (typeof report.title === "string" && report.title) ||
          job.goal ||
          rid;
        const conclusion =
          typeof report.conclusion === "string"
            ? report.conclusion
            : typeof report.summary === "string"
              ? report.summary
              : "";
        const findings = Array.isArray(report.findings)
          ? report.findings
              .slice(0, 8)
              .map((f) =>
                typeof f === "string"
                  ? f
                  : typeof f === "object" && f && "text" in f
                    ? String((f as { text?: string }).text ?? "")
                    : JSON.stringify(f)
              )
              .filter(Boolean)
          : [];
        const sourcesList = Array.isArray(report.sources)
          ? report.sources.slice(0, 8)
          : [];
        blocks.push(`标题：${title}`);
        if (conclusion) blocks.push(`结论：${conclusion.slice(0, 1200)}`);
        if (findings.length) {
          blocks.push(`发现：\n- ${findings.join("\n- ").slice(0, 2000)}`);
        }
        if (sourcesList.length) {
          blocks.push(
            `证据来源：\n${sourcesList
              .map((s) =>
                typeof s === "string"
                  ? `- ${s}`
                  : `- ${JSON.stringify(s).slice(0, 200)}`
              )
              .join("\n")}`.slice(0, 1200)
          );
        }
      }
    } catch {
      /* research load optional */
    }
  }

  // Project-level assets
  if (project.assets?.length) {
    blocks.push("【项目素材】");
    for (const a of project.assets.slice(0, 12)) {
      const asset = a.asset
        ? a.asset
        : (await getOwnedAsset(a.assetId)) ?? null;
      if (!asset) {
        blocks.push(`- 素材 ${a.assetId}`);
        continue;
      }
      const title =
        "fileName" in asset
          ? (asset as { fileName?: string }).fileName
          : asset.title;
      const type =
        "assetType" in asset
          ? (asset as { assetType?: string }).assetType
          : asset.type;
      blocks.push(`- ${title || a.assetId}（${type || "file"}）`);
      if (!sources.some((x) => x.assetId === a.assetId || x.id === a.assetId)) {
        sources.push({
          id: a.assetId,
          kind: "asset",
          title: title ?? undefined,
          assetId: a.assetId,
        });
      }
    }
  }

  // V3.1 Memory (active preferences only) — respects V4.0 Memory toggle
  if (project.userId) {
    let memoryEnabled = true;
    try {
      const { getPersonalPrefs } = await import(
        "@/modules/personal-ai/service"
      );
      const prefs = await getPersonalPrefs(project.userId);
      memoryEnabled = prefs.memoryEnabled;
    } catch {
      /* default enabled */
    }
    const memoryBlock = await getActiveMemoryForPrompt(project.userId, {
      platform: project.platform ?? undefined,
      contentType: project.contentType ?? undefined,
      enabled: memoryEnabled,
    });
    if (memoryBlock) {
      blocks.push(memoryBlock);
    }
  }

  if (project.goal) {
    blocks.unshift(`【创作目标】\n${project.goal}`);
  }
  if (project.brief && project.startMode !== "commerce") {
    blocks.push(`【简报】\n${project.brief.slice(0, 2000)}`);
  }

  return {
    text: blocks.join("\n\n").slice(0, 14000) || "（无额外上下文）",
    sources: dedupeSources(sources),
    explainability,
  };
}

/** Prefer first occurrence when the same id / assetId / link url appears twice. */
function dedupeSources(sources: CreationSourceRef[]): CreationSourceRef[] {
  const seen = new Set<string>();
  const out: CreationSourceRef[] = [];
  for (const s of sources) {
    const key =
      s.kind === "link" && s.url
        ? `link:${s.url}`
        : s.assetId
          ? `asset:${s.assetId}`
          : `id:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function buildDefaultSystemPrompt(
  platform: string | null | undefined,
  contentType: string | null | undefined
): string {
  return `你是 Nexa 内容创作助手，帮助用户把研究资料变成可发布内容。

硬性规则：
1. 默认使用简体中文（标题、正文、脚本、描述、标签）。专业词 Prompt / RAG / CVR / ACOS 可保留英文。
2. 只能依据提供的上下文写作，禁止编造无来源事实与虚假 URL。
3. 不要输出思维链；只输出最终 JSON。
4. 若用户本次明确要求其他语言/风格，必须覆盖长期偏好。
5. 平台：${platform || "通用"}；内容类型：${contentType || "social_post"}。

必须输出 JSON，字段（全部用中文内容）：
{
  "title": "标题",
  "hook": "开头钩子",
  "body": "正文或口播脚本",
  "structure": "内容结构说明（分点）",
  "cta": "行动号召",
  "hashtags": ["标签1", "标签2"],
  "coverSuggestion": "封面建议"
}

短视频时 body 写口播脚本，structure 写分镜要点。`;
}
