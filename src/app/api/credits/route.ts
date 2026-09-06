import { NextResponse } from "next/server";
import { resolveCreditsAccount } from "@/modules/account/credits/account";
import {
  CREDIT_CAPABILITIES,
  isSearchFree,
} from "@/modules/account/credits/policy";
import {
  estimateCredits,
  getCreditsSummary,
} from "@/modules/account/credits/service";
import {
  CREDIT_PACKS,
  grantDemoPack,
  refundCredits,
} from "@/modules/account/credits/monetization";

export async function GET(req: Request) {
  const account = await resolveCreditsAccount();
  const { searchParams } = new URL(req.url);
  const action =
    searchParams.get("estimate") ||
    searchParams.get("capability") ||
    searchParams.get("action");

  if (searchParams.get("packs") === "1") {
    return NextResponse.json({ packs: CREDIT_PACKS, isDemoCatalog: true });
  }

  if (action) {
    return NextResponse.json({
      capability: action,
      label:
        CREDIT_CAPABILITIES[action as keyof typeof CREDIT_CAPABILITIES] ??
        action,
      estimate: estimateCredits(action),
      searchFree: isSearchFree(),
    });
  }

  const summary = await getCreditsSummary(account.accountId, account.userRole, {
    isGuest: account.isGuest,
  });
  return NextResponse.json({
    authenticated: Boolean(account.userId),
    isGuest: account.isGuest,
    searchFree: isSearchFree(),
    capabilities: CREDIT_CAPABILITIES,
    credits: summary,
    packs: CREDIT_PACKS,
  });
}

/** V4.7 Monetization actions */
export async function POST(req: Request) {
  const account = await resolveCreditsAccount();
  if (!account.userId || account.isGuest) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await req.json();
  const action = body.action as string;

  if (action === "purchase_pack") {
    const result = await grantDemoPack({
      userId: account.userId,
      packId: body.packId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "refund") {
    const result = await refundCredits({
      userId: account.userId,
      amount: Number(body.amount || 0),
      reason: body.reason || "任务失败退款",
      referenceId: body.referenceId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "estimate") {
    return NextResponse.json({
      estimate: estimateCredits(String(body.capability || body.action || "")),
    });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
