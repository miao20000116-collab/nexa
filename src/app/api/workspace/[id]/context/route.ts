import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/modules/workspace/services/workspace-service";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import {
  addContextItem,
  buildWorkspaceContext,
  ensureWorkspaceItems,
  getWorkspaceContext,
  removeContextItem,
  reorderContextItems,
  saveContextVersion,
  setContextItemIncluded,
  setContextItemSourceRole,
} from "@/modules/workspace/services/context-service";
import type { ContextItemKind, ContextSourceRole } from "@/modules/workspace/types";

/**
 * V3.0 Context API
 * GET  — WorkspaceContext (selected items only for AI)
 * POST — add / toggle / reorder / remove / version
 */
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
  const context = buildWorkspaceContext(workspace);
  return NextResponse.json({
    context,
    allItems: ensureWorkspaceItems(workspace),
    versions: workspace.versions ?? [],
  });
}

export async function POST(
  request: NextRequest,
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

  const body = await request.json();
  const action = body.action as string;

  if (action === "add") {
    const kind = body.kind as ContextItemKind;
    if (!kind || !body.title) {
      return NextResponse.json({ error: "缺少 kind 或 title" }, { status: 400 });
    }
    const result = await addContextItem(id, {
      kind,
      title: body.title,
      summary: body.summary,
      refId: body.refId,
      url: body.url,
      payload: body.payload,
      includedInContext: body.includedInContext,
    });
    if (!result) {
      return NextResponse.json({ error: "添加失败" }, { status: 500 });
    }
    return NextResponse.json({
      item: result.item,
      context: buildWorkspaceContext(result.workspace),
    });
  }

  if (action === "toggle") {
    if (!body.itemId || typeof body.included !== "boolean") {
      return NextResponse.json({ error: "缺少 itemId 或 included" }, { status: 400 });
    }
    const updated = await setContextItemIncluded(id, body.itemId, body.included);
    if (!updated) {
      return NextResponse.json({ error: "更新失败" }, { status: 404 });
    }
    return NextResponse.json({ context: buildWorkspaceContext(updated) });
  }

  if (action === "set_source_role") {
    const role = body.contextRole as ContextSourceRole;
    if (
      !body.itemId ||
      !["fact", "visual_reference", "image_reference"].includes(role)
    ) {
      return NextResponse.json({ error: "来源角色无效" }, { status: 400 });
    }
    const updated = await setContextItemSourceRole(id, body.itemId, role);
    if (!updated) {
      return NextResponse.json({ error: "更新失败" }, { status: 404 });
    }
    return NextResponse.json({ context: buildWorkspaceContext(updated) });
  }

  if (action === "remove") {
    if (!body.itemId) {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }
    const updated = await removeContextItem(id, body.itemId);
    if (!updated) {
      return NextResponse.json({ error: "删除失败" }, { status: 404 });
    }
    return NextResponse.json({ context: buildWorkspaceContext(updated) });
  }

  if (action === "reorder") {
    const orderedIds = body.orderedIds as string[];
    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: "缺少 orderedIds" }, { status: 400 });
    }
    const updated = await reorderContextItems(id, orderedIds);
    if (!updated) {
      return NextResponse.json({ error: "排序失败" }, { status: 404 });
    }
    return NextResponse.json({ context: buildWorkspaceContext(updated) });
  }

  if (action === "version") {
    if (!body.label || !body.kind || !body.snapshot) {
      return NextResponse.json({ error: "缺少 version 字段" }, { status: 400 });
    }
    const updated = await saveContextVersion(id, {
      label: body.label,
      kind: body.kind,
      refId: body.refId,
      snapshot: body.snapshot,
    });
    if (!updated) {
      return NextResponse.json({ error: "保存版本失败" }, { status: 404 });
    }
    return NextResponse.json({ versions: updated.versions ?? [] });
  }

  if (action === "get") {
    const ctx = await getWorkspaceContext(id);
    return NextResponse.json({ context: ctx });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
