import { NextRequest, NextResponse } from "next/server";
import { resolveCreditsAccount } from "@/modules/account/credits/account";
import { gateAiUsage } from "@/modules/account/credits/usage-guard";
import { generateOverview } from "@/modules/ai/router/ai-gateway";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import type { SearchResult } from "@/modules/search/types";

/**
 * POST /api/search/overview
 * AI Overview is free — generates immediately without Credits.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = String(body.query ?? "").trim();
    const results = (body.results ?? []) as SearchResult[];

    if (!query || !results.length) {
      return NextResponse.json({ error: "缺少搜索上下文" }, { status: 400 });
    }

    if (!AIGateway.isAvailable("generateText")) {
      return NextResponse.json(
        { code: "ai_unavailable", message: "AI 概览暂未接入" },
        { status: 503 }
      );
    }

    const account = await resolveCreditsAccount();
    const gate = await gateAiUsage({
      account,
      capability: "aiOverview",
      confirm: true,
    });

    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: gate.code,
          message: gate.message,
          estimate: gate.estimate,
          balance: gate.balance,
          jobId: gate.jobId,
        },
        { status: gate.code === "insufficient_credits" ? 402 : 400 }
      );
    }

    const overview = await generateOverview(query, results, {
      userId: account.userId,
      accountId: account.accountId,
      jobId: gate.jobId,
    });

    if (!overview) {
      return NextResponse.json(
        {
          ok: false,
          code: "ai_error",
          message: "AI 概览生成失败",
          jobId: gate.jobId,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      overview,
      overviewStatus: "ready" as const,
      jobId: gate.jobId,
      estimatedCredits: 0,
    });
  } catch (err) {
    console.error("[Search Overview API]", err);
    return NextResponse.json({ error: "概览生成失败" }, { status: 500 });
  }
}
