import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  controlWorkflow,
  createWorkflow,
  getWorkflow,
} from "@/modules/workflow/service";

/** V4.1 Intelligent Workflow */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const wf = await getWorkflow(id, session.user.id);
  if (!wf) {
    return NextResponse.json({ error: "不存在" }, { status: 404 });
  }
  return NextResponse.json({ workflow: wf });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const action = body.action as string;

  if (action === "create") {
    const workflow = await createWorkflow({
      userId: session.user.id,
      goal: body.goal || "分析产品并生成营销内容",
    });
    return NextResponse.json({ workflow });
  }

  if (
    action === "approve" ||
    action === "pause" ||
    action === "skip" ||
    action === "retry" ||
    action === "execute_next"
  ) {
    try {
      const workflow = await controlWorkflow({
        userId: session.user.id,
        workflowId: body.workflowId,
        action,
        stepId: body.stepId,
        confirm: Boolean(body.confirm),
      });
      return NextResponse.json({ workflow });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "失败" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
