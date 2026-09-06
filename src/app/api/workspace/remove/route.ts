import { NextRequest, NextResponse } from "next/server";
import { removeSourceFromWorkspace } from "@/modules/workspace/services/workspace-service";

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, sourceId } = body;

    if (!workspaceId || !sourceId) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const workspace = await removeSourceFromWorkspace(workspaceId, sourceId);
    if (!workspace) {
      return NextResponse.json({ error: "操作失败" }, { status: 404 });
    }

    return NextResponse.json({
      count: workspace.sources.length,
      workspace,
    });
  } catch {
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
