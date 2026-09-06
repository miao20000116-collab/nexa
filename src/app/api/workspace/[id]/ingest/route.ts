import { NextRequest, NextResponse } from "next/server";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { getWorkspace } from "@/modules/workspace/services/workspace-service";
import { ensureSourcesIngested } from "@/modules/workspace/services/source-ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Resolve selected search sources into AI-ready context before creation.
 * Media URLs use metadata, cover vision, and structure hints only.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) {
    return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
  }

  const access = await assertWorkspaceAccess(workspace);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  const sources = await ensureSourcesIngested(id, workspace.sources, {
    limit: 8,
    force: true,
  });
  const refreshed = (await getWorkspace(id)) ?? { ...workspace, sources };

  return NextResponse.json({
    workspace: refreshed,
    sourceCount: sources.length,
  });
}
