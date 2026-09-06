import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  confirmMemory,
  editMemory,
  listMemories,
  proposeMemory,
  removeMemory,
} from "@/modules/memory/services/memory-service";
import type { MemoryType } from "@/modules/memory/types";

export async function GET() {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const memories = await listMemories(session.user.id);
  return NextResponse.json({ memories });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await request.json();
  const action = body.action as string;

  if (action === "create" || action === "propose") {
    const result = await proposeMemory(userId, {
      type: body.type as MemoryType,
      key: body.key || body.label || "preference",
      label: body.label,
      value: body.value,
      meta: body.meta,
      requireConfirm: body.requireConfirm !== false,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ memory: result.memory });
  }

  if (action === "confirm") {
    const memory = await confirmMemory(userId, body.memoryId);
    if (!memory) {
      return NextResponse.json({ error: "记忆不存在" }, { status: 404 });
    }
    return NextResponse.json({ memory });
  }

  if (action === "update" || action === "edit") {
    const result = await editMemory(userId, body.memoryId, {
      label: body.label,
      value: body.value,
      meta: body.meta,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ memory: result.memory });
  }

  if (action === "delete") {
    const ok = await removeMemory(userId, body.memoryId);
    if (!ok) {
      return NextResponse.json({ error: "记忆不存在" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
