import { NextRequest, NextResponse } from "next/server";
import { runCreationAgent } from "@/modules/ai/agent/creation-agent";

export const runtime = "nodejs";

/**
 * POST /api/ai/agent
 * Intent → plan → execute one of the 4 priority chains (when matched).
 * Pass confirm:true after Credits confirm_required.
 * Always HTTP 200 on handled outcomes (including confirm_required) so UI can continue.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = String(body.goal || body.prompt || "").trim();
    if (!goal) {
      return NextResponse.json({ error: "请输入创作目标" }, { status: 400 });
    }

    const result = await runCreationAgent({
      goal,
      execute: body.execute !== false,
      enrich: body.enrich !== false,
      confirm: Boolean(body.confirm),
      jobId: body.jobId ? String(body.jobId) : undefined,
      linkUrl: body.linkUrl ? String(body.linkUrl) : undefined,
      workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    });

    return NextResponse.json({
      ok: !result.confirmRequired,
      ...result,
    });
  } catch (err) {
    console.error("[ai/agent]", err);
    return NextResponse.json(
      { ok: false, error: "Agent 执行失败，请稍后重试" },
      { status: 500 }
    );
  }
}
