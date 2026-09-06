import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/modules/workspace/services/workspace-service";
import { getAIResearchService } from "@/modules/ai/capability/unavailable-provider";
import type { SourceSnapshot, WorkspaceSource } from "@/modules/workspace/types";
import { toUserErrorMessage } from "@/lib/user-errors";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { ensureSourcesIngested } from "@/modules/workspace/services/source-ingest";
import {
  buildWorkspaceContext,
  sourceRoleFromItem,
} from "@/modules/workspace/services/context-service";

type ResearchAction =
  | "summarize"
  | "compare"
  | "extract"
  | "disagree"
  | "ask";

function toSnapshots(
  sources: WorkspaceSource[],
  roleBySourceId: Map<string, import("@/modules/workspace/types").ContextItem>
): SourceSnapshot[] {
  return sources.map((s) => ({
    searchResultId: s.searchResultId ?? undefined,
    title: s.title ?? undefined,
    url: s.url,
    platform: s.platform,
    sourceType: s.sourceType,
    snippet: s.snippet ?? undefined,
    author: s.author ?? undefined,
    publishedAt: s.publishedAt ?? undefined,
    thumbnail: s.thumbnail ?? undefined,
    contentSummary: s.contentSummary ?? undefined,
    keyExcerpts: s.keyExcerpts ?? undefined,
    mediaSummary: s.mediaSummary ?? undefined,
    ingestStatus: s.ingestStatus ?? undefined,
    ingestedAt: s.ingestedAt ?? undefined,
    contextRole: sourceRoleFromItem(roleBySourceId.get(s.id), s),
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as ResearchAction;
    const goal = body.goal as string | undefined;

    const workspace = await getWorkspace(id);
    if (!workspace) {
      return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
    }

    const access = await assertWorkspaceAccess(workspace);
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status });
    }

    const context = buildWorkspaceContext(workspace);
    if (context.sources.length === 0) {
      return NextResponse.json(
        { error: "请先在工作区中加入并勾选资料" },
        { status: 400 }
      );
    }

    // Fetch real page text → compress before AI action (token-bounded).
    const ingested = await ensureSourcesIngested(id, context.sources, {
      limit: 10,
    });
    const selectedUrls = new Set(context.sources.map((source) => source.url));
    const sources = ingested.filter((source) => selectedUrls.has(source.url));
    const roleBySourceId = new Map(
      context.items
        .filter((item) => item.kind === "search_result" && item.refId)
        .map((item) => [item.refId as string, item])
    );
    const readyCount = sources.filter(
      (s) => s.ingestStatus === "ready" || s.ingestStatus === "skipped_binary"
    ).length;

    const service = getAIResearchService();
    const req = {
      workspaceId: id,
      sources: toSnapshots(sources, roleBySourceId),
      goal,
    };

    let result;
    switch (action) {
      case "summarize":
        result = await service.summarizeSources(req);
        break;
      case "compare":
        result = await service.compareSources(req);
        break;
      case "extract":
        result = await service.extractKeyPoints(req);
        break;
      case "disagree":
        result = await service.findDisagreements(req);
        break;
      case "ask":
        result = await service.planResearch(req);
        break;
      default:
        return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
    }

    return NextResponse.json({
      action,
      sourceCount: sources.length,
      ingestedCount: readyCount,
      ...result,
    });
  } catch (err) {
    console.error("[Research Action API]", err);
    return NextResponse.json(
      { error: toUserErrorMessage(err, "操作失败，请稍后再试") },
      { status: 500 }
    );
  }
}
