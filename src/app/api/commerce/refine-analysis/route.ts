import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { refineCommerceAnalysis } from "@/modules/commerce/capability/refine-analysis";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/commerce/refine-analysis
 * Rewrite / optimize an existing smart-analysis insight per user intent.
 */
export async function POST(request: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const insight = body.insight;
    if (!insight || typeof insight !== "object") {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_input",
          message: "缺少当前智能分析内容",
        },
        { status: 400 }
      );
    }

    const result = await refineCommerceAnalysis({
      instruction: String(body.instruction || body.goal || ""),
      insight: {
        situation: String(insight.situation || ""),
        evidence: Array.isArray(insight.evidence)
          ? insight.evidence.map((e: unknown) => String(e))
          : [],
        diagnosis: String(insight.diagnosis || ""),
        opportunity: String(insight.opportunity || ""),
        recommendation: String(insight.recommendation || ""),
        dataNotice: insight.dataNotice
          ? String(insight.dataNotice)
          : undefined,
        aiAssisted: Boolean(insight.aiAssisted),
      },
      kind: typeof body.kind === "string" ? body.kind : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      confirm: Boolean(body.confirm),
      jobId: typeof body.jobId === "string" ? body.jobId : undefined,
    });

    if (!result.ok) {
      const status =
        result.code === "insufficient_credits"
          ? 402
          : result.code === "login_required"
            ? 401
            : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[refine-analysis API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "优化智能分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
