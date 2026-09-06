import { NextRequest, NextResponse } from "next/server";
import { persistRenderToWorkspace } from "@/modules/create/services/persist-render-to-workspace";

export const runtime = "nodejs";

/**
 * POST /api/create/save-render
 * Explicitly store a generated preview into a workspace.
 * Body: { jobId, mediaUrl, title?, kind?, workspaceId?, platform?, sourceUrl? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobId = String(body.jobId ?? "").trim();
    const mediaUrl = String(body.mediaUrl ?? body.previewUrl ?? "").trim();
    if (!jobId || !mediaUrl) {
      return NextResponse.json(
        { error: "缺少 jobId 或 mediaUrl" },
        { status: 400 }
      );
    }
    const kind = body.kind === "image" ? "image" : "video";
    const title =
      String(body.title ?? "").trim() ||
      (kind === "image" ? "二创出图" : "二创成片");
    const workspaceId =
      typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : undefined;

    const saved = await persistRenderToWorkspace({
      workspaceId,
      jobId,
      title,
      mediaUrl,
      kind,
      platform: typeof body.platform === "string" ? body.platform : null,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : null,
      promptUsed: typeof body.promptUsed === "string" ? body.promptUsed : null,
      summary:
        typeof body.summary === "string"
          ? body.summary
          : "用户手动存入工作区的成片",
    });

    return NextResponse.json({
      ok: true,
      workspaceId: saved.workspaceId,
      workspaceName: saved.workspaceName,
      itemId: saved.item.id,
      workspaceHref: `/workspace/${saved.workspaceId}`,
      message: `已存入工作区「${saved.workspaceName}」`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "存入工作区失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
