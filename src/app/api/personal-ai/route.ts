import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  getPersonalPrefs,
  resolveOperatingContext,
  setMemoryEnabled,
} from "@/modules/personal-ai/service";

/** V4.0 Personal AI Operating Layer */
export async function GET() {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const prefs = await getPersonalPrefs(session.user.id);
  return NextResponse.json({ prefs });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const action = body.action as string;

  if (action === "set_memory_enabled") {
    const prefs = await setMemoryEnabled(
      session.user.id,
      Boolean(body.enabled)
    );
    return NextResponse.json({ prefs });
  }

  if (action === "resolve") {
    const resolved = await resolveOperatingContext({
      userId: session.user.id,
      workspaceId: body.workspaceId,
      task: body.task,
    });
    return NextResponse.json({ resolved });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
