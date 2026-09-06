import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runAdvertisingAnalysis } from "@/modules/commerce/capability/advertising-analysis";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/commerce/advertising-analysis
 * V4.5-C — Advertising Intelligence (Credits: advertising_analysis)
 */
export async function POST(request: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const channel = body.channel === "tiktok" ? "tiktok" : "amazon";
    const storeContext = await bindStoreFromBody(
      body,
      channel === "tiktok" ? "TikTok Shop" : "Amazon"
    );

    const result = await runAdvertisingAnalysis({
      channel,
      range: typeof body.range === "string" ? body.range : undefined,
      depth: body.depth === "deep" || body.confirm ? "deep" : "baseline",
      confirm: Boolean(body.confirm),
      jobId: typeof body.jobId === "string" ? body.jobId : undefined,
      workspaceId:
        typeof body.workspaceId === "string" ? body.workspaceId : undefined,
    });

    if (!result.ok) {
      const status =
        result.code === "insufficient_credits"
          ? 402
          : result.code === "login_required"
            ? 401
            : 400;
      return NextResponse.json({ ...result, storeContext }, { status });
    }

    return NextResponse.json({ ...result, storeContext });
  } catch (err) {
    console.error("[advertising-analysis API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "广告智能分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
