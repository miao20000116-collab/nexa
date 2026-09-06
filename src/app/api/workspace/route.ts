import { NextRequest, NextResponse } from "next/server";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  addSourceToWorkspace,
} from "@/modules/workspace/services/workspace-service";
import { snapshotFromSearchResult } from "@/modules/workspace/utils/snapshot";

export async function GET() {
  const workspaces = await listWorkspaces();
  return NextResponse.json({
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      count:
        w.sources.length +
        (w.items?.filter((i) => i.kind === "video" || i.kind === "image")
          .length ?? 0),
      updatedAt: w.updatedAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, workspaceId, source, sources, name, query } = body;

    if (action === "create") {
      const ws = await createWorkspace(name, query);
      if (sources?.length) {
        for (const s of sources) {
          await addSourceToWorkspace(ws.id, s);
        }
        const updated = await getWorkspace(ws.id);
        return NextResponse.json(updated);
      }
      return NextResponse.json(ws);
    }

    if (!source?.url) {
      return NextResponse.json({ error: "资料信息不完整" }, { status: 400 });
    }

    let wsId = workspaceId;
    if (!wsId) {
      const ws = await createWorkspace(undefined, query);
      wsId = ws.id;
    }

    const snapshot = source.searchResultId
      ? snapshotFromSearchResult(source)
      : source;

    const result = await addSourceToWorkspace(wsId, snapshot);
    if (!result) {
      return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
    }

    return NextResponse.json({
      workspaceId: result.workspace.id,
      workspace: result.workspace,
      added: result.added,
      count: result.workspace.sources.length,
    });
  } catch (err) {
    console.error("[Workspace API]", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
