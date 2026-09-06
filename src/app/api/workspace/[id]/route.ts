import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  removeSourceFromWorkspace,
} from "@/modules/workspace/services/workspace-service";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

export async function GET(
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
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  return NextResponse.json(workspace);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await getWorkspace(id);
  if (!existing) {
    return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
  }
  const access = await assertWorkspaceAccess(existing);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const body = await request.json();
  const workspace = await updateWorkspace(id, {
    name: body.name,
    description: body.description,
    status: body.status,
  });
  if (!workspace) {
    return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
  }
  return NextResponse.json(workspace);
}

/**
 * DELETE /api/workspace/[id]
 * - body.sourceId → remove one source (legacy)
 * - body.deleteWorkspace: true → delete entire workspace
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await getWorkspace(id);
  if (!existing) {
    return NextResponse.json({ error: "工作区不存在" }, { status: 404 });
  }
  const access = await assertWorkspaceAccess(existing);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { sourceId?: string; deleteWorkspace?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.sourceId) {
    const workspace = await removeSourceFromWorkspace(id, body.sourceId);
    if (!workspace) {
      return NextResponse.json({ error: "操作失败" }, { status: 404 });
    }
    return NextResponse.json(workspace);
  }

  if (body.deleteWorkspace === true || Object.keys(body).length === 0) {
    await deleteWorkspace(id);
    return NextResponse.json({ ok: true, id });
  }

  return NextResponse.json(
    { error: "请传 deleteWorkspace: true 或 sourceId" },
    { status: 400 }
  );
}
