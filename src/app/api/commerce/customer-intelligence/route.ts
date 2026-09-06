import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runCustomerIntelligence } from "@/modules/commerce/capability/customer-intelligence";
import type {
  CustomerReplyKind,
  CustomerReplyLanguage,
} from "@/modules/commerce/capability/customer-types";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 120;

const LANGS: CustomerReplyLanguage[] = [
  "English",
  "German",
  "French",
  "Spanish",
  "Chinese",
];

const KINDS: CustomerReplyKind[] = [
  "customer_reply",
  "review_reply",
  "email",
  "follow_up",
];

/**
 * POST /api/commerce/customer-intelligence
 * V4.5-D — Customer Intelligence (Credits: customer_intelligence)
 */
export async function POST(request: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "login_required",
        message: auth.message,
        error: auth.message,
      },
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
    const mode = body.mode === "reply" ? "reply" : "analyze";
    const langRaw = String(body.replyLanguage || "English");
    const replyLanguage = LANGS.includes(langRaw as CustomerReplyLanguage)
      ? (langRaw as CustomerReplyLanguage)
      : "English";
    const kindRaw = String(body.replyKind || "review_reply");
    const replyKind = KINDS.includes(kindRaw as CustomerReplyKind)
      ? (kindRaw as CustomerReplyKind)
      : "review_reply";

    const result = await runCustomerIntelligence({
      channel,
      platform,
      marketplace:
        typeof body.marketplace === "string"
          ? body.marketplace
          : storeContext.marketplace,
      country:
        typeof body.country === "string" ? body.country : storeContext.country,
      productTitle:
        typeof body.productTitle === "string" ? body.productTitle : undefined,
      productId:
        typeof body.productId === "string" ? body.productId : undefined,
      reviewsText:
        typeof body.reviewsText === "string" ? body.reviewsText : undefined,
      messagesText:
        typeof body.messagesText === "string" ? body.messagesText : undefined,
      emailsText:
        typeof body.emailsText === "string" ? body.emailsText : undefined,
      orderContext:
        typeof body.orderContext === "string" ? body.orderContext : undefined,
      useDemoSamples: body.useDemoSamples !== false,
      mode,
      replyKind,
      replyLanguage,
      focusTheme:
        typeof body.focusTheme === "string" ? body.focusTheme : undefined,
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
    console.error("[customer-intelligence API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "客户洞察分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
