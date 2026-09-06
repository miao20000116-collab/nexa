import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  createAutomationRule,
  listAutomationRules,
  pauseAutomation,
  retryAutomationJob,
  runAutomationNow,
  type AutomationKind,
} from "@/modules/automation/service";

/** V3.7 Automation API */
export async function GET() {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const rules = await listAutomationRules(session.user.id);
  return NextResponse.json({ rules });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await request.json();
  const action = body.action as string;

  if (action === "create") {
    const rule = await createAutomationRule({
      userId,
      kind: body.kind as AutomationKind,
      name: body.name || "自动化任务",
      cronLike: body.cronLike === "daily" ? "daily" : "weekly",
      context: body.context,
    });
    return NextResponse.json({ rule });
  }

  if (action === "pause") {
    const rule = await pauseAutomation(userId, body.ruleId);
    if (!rule) {
      return NextResponse.json({ error: "规则不存在" }, { status: 404 });
    }
    return NextResponse.json({ rule });
  }

  if (action === "run") {
    try {
      const job = await runAutomationNow({
        userId,
        ruleId: body.ruleId,
        confirm: Boolean(body.confirm),
      });
      return NextResponse.json({ job });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "执行失败" },
        { status: 400 }
      );
    }
  }

  if (action === "retry") {
    try {
      const job = await retryAutomationJob({
        userId,
        jobId: body.jobId,
        confirm: Boolean(body.confirm),
      });
      return NextResponse.json({ job });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "重试失败" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
