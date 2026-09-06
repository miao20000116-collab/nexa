import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runComplianceIntelligence } from "@/modules/commerce/capability/compliance-intelligence";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/commerce/compliance-check
 * V4.5-E — Compliance Intelligence (Credits: compliance_check)
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
    const platform =
      body.platform === "TikTok Shop" || channel === "tiktok"
        ? ("TikTok Shop" as const)
        : ("Amazon" as const);
    const storeContext = await bindStoreFromBody(body, platform);
    const scenarioRaw = String(body.scenario || "auto");
    const scenario =
      scenarioRaw === "low" ||
      scenarioRaw === "mid" ||
      scenarioRaw === "high" ||
      scenarioRaw === "insufficient"
        ? scenarioRaw
        : "auto";

    const result = await runComplianceIntelligence({
      channel,
      platform,
      marketplace:
        typeof body.marketplace === "string"
          ? body.marketplace
          : storeContext.marketplace,
      country:
        typeof body.country === "string" ? body.country : storeContext.country,
      productTitle:
        typeof body.productTitle === "string"
          ? body.productTitle
          : typeof body.title === "string"
            ? body.title
            : undefined,
      productId:
        typeof body.productId === "string" ? body.productId : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
      adsNotes: typeof body.adsNotes === "string" ? body.adsNotes : undefined,
      imageNotes:
        typeof body.imageNotes === "string" ? body.imageNotes : undefined,
      videoNotes:
        typeof body.videoNotes === "string" ? body.videoNotes : undefined,
      listingText:
        typeof body.listingText === "string" ? body.listingText : undefined,
      demoFlags: Array.isArray(body.demoFlags)
        ? body.demoFlags.map(String)
        : undefined,
      demoClaimRisks: Array.isArray(body.demoClaimRisks)
        ? body.demoClaimRisks.map(String)
        : undefined,
      scenario,
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
    console.error("[compliance-check API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "合规分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
