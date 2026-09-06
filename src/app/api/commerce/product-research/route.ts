import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runProductResearch } from "@/modules/commerce/capability/product-research";
import { parseProfitFromBody } from "@/modules/commerce/capability/profit";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/commerce/product-research
 * V4.5-A Product Research — real Search + selection_analysis + Opportunity.
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
    const body = (await request.json()) as Record<string, unknown>;
    const platformHint =
      typeof body.marketplace === "string" &&
      body.marketplace.toLowerCase().includes("tiktok")
        ? ("TikTok Shop" as const)
        : ("Amazon" as const);
    const storeContext = await bindStoreFromBody(body, platformHint);

    const compareRaw = body.compareProducts ?? body.compare;
    const compareProducts = Array.isArray(compareRaw)
      ? compareRaw.map(String)
      : typeof compareRaw === "string"
        ? compareRaw.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
        : undefined;

    const numOrNull = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const result = await runProductResearch({
      query: String(body.query ?? body.goal ?? "").trim(),
      marketplace:
        typeof body.marketplace === "string"
          ? body.marketplace
          : storeContext.marketplace,
      country:
        typeof body.country === "string" ? body.country : storeContext.country,
      category: typeof body.category === "string" ? body.category : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
      existingProduct:
        typeof body.existingProduct === "string"
          ? body.existingProduct
          : undefined,
      targetPrice: numOrNull(body.targetPrice),
      targetProfit: numOrNull(body.targetProfit),
      profit: parseProfitFromBody(body),
      compareProducts,
      workspaceId:
        typeof body.workspaceId === "string" ? body.workspaceId : undefined,
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
      return NextResponse.json({ ...result, storeContext }, { status });
    }

    return NextResponse.json({ ...result, storeContext });
  } catch (err) {
    console.error("[product-research API]", err);
    return NextResponse.json(
      { ok: false, code: "invalid_query", message: "选品调研失败，请稍后重试" },
      { status: 500 }
    );
  }
}
