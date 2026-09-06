import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  getMemoryEnabled,
  resolveTaskContext,
  setMemoryEnabled,
} from "@/modules/personal-ai/resolve-service";
import { loadPreferences } from "@/modules/personal-ai/preferences-store";
import { checkRateLimit, newRequestId } from "@/lib/reliability";

export async function GET() {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const prefs = await loadPreferences(session.user.id);
  return NextResponse.json({
    preferences: prefs,
    memoryEnabled: prefs.memoryEnabled,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const requestId = newRequestId("pai");
  const rl = checkRateLimit({ key: `personal-ai:${userId}`, limit: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试", requestId },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = (body.action as string) || "resolve";

  if (action === "setMemory" || action === "set_memory") {
    if (typeof body.memoryEnabled !== "boolean") {
      return NextResponse.json({ error: "需要 memoryEnabled 布尔值" }, { status: 400 });
    }
    const result = await setMemoryEnabled(userId, body.memoryEnabled);
    return NextResponse.json({ ...result, requestId });
  }

  if (action === "preferences") {
    return NextResponse.json({
      memoryEnabled: await getMemoryEnabled(userId),
      requestId,
    });
  }

  const task = String(body.task || body.goal || "").trim();
  if (!task) {
    return NextResponse.json({ error: "请提供任务描述 task" }, { status: 400 });
  }

  const resolved = await resolveTaskContext({
    userId,
    task,
    workspaceId: body.workspaceId ?? null,
    limit: typeof body.limit === "number" ? body.limit : undefined,
  });

  return NextResponse.json({ ...resolved, requestId });
}
