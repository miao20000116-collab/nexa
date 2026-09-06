import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runFinancialInventoryIntelligence } from "@/modules/commerce/capability/financial-inventory-intelligence";
import type {
  FinancialInventoryMode,
  SupportedCurrency,
} from "@/modules/commerce/capability/financial-types";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/commerce/financial-inventory
 * V4.5-F — financial_analysis / inventory_intelligence / joint Business Diagnosis
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
    const storeContext = await bindStoreFromBody(
      body,
      body.channel === "tiktok" ? "TikTok Shop" : "Amazon"
    );
    const modeRaw = String(body.mode || "joint");
    const mode: FinancialInventoryMode =
      modeRaw === "financial" || modeRaw === "inventory" || modeRaw === "joint"
        ? modeRaw
        : "joint";

    const curRaw = String(
      body.displayCurrency || storeContext.currency || "USD"
    ).toUpperCase();
    const displayCurrency = (
      ["USD", "EUR", "GBP", "CNY"].includes(curRaw) ? curRaw : "USD"
    ) as SupportedCurrency;

    const lead =
      body.leadTimeDays == null || body.leadTimeDays === ""
        ? null
        : Number(body.leadTimeDays);

    const result = await runFinancialInventoryIntelligence({
      channel: body.channel === "tiktok" ? "tiktok" : "amazon",
      mode,
      range: typeof body.range === "string" ? body.range : undefined,
      displayCurrency,
      leadTimeDays: Number.isFinite(lead) ? lead : null,
        depth:
          body.depth === "deep" || body.confirm ? "deep" : "baseline",
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
    console.error("[financial-inventory API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "利润 / 库存智能分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
