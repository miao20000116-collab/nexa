import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { runListingIntelligence } from "@/modules/commerce/capability/listing-intelligence";
import type {
  ListingMode,
  ListingPartialField,
  ListingRecommendation,
} from "@/modules/commerce/capability/listing-types";
import { bindStoreFromBody } from "@/modules/commerce/store/bind-from-body";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/commerce/listing-intelligence
 * V4.5-B — generate | review | partial + keyword_intelligence.
 * Credits: listing_intelligence (+ keyword_intelligence when generate/partial).
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

    const modeRaw = String(body.mode || "generate");
    const mode: ListingMode =
      modeRaw === "review" || modeRaw === "partial" ? modeRaw : "generate";

    const partialRaw = String(body.partialField || "");
    const partialField: ListingPartialField | undefined =
      partialRaw === "title" ||
      partialRaw === "bullets" ||
      partialRaw === "description"
        ? partialRaw
        : undefined;

    let baseListing: Partial<ListingRecommendation> | null = null;
    if (body.baseListing && typeof body.baseListing === "object") {
      baseListing = body.baseListing as Partial<ListingRecommendation>;
    }

    const result = await runListingIntelligence({
      productTitle: String(body.productTitle ?? body.title ?? "").trim(),
      sku: typeof body.sku === "string" ? body.sku : undefined,
      productDescription:
        typeof body.productDescription === "string"
          ? body.productDescription
          : undefined,
      imageNotes: Array.isArray(body.imageNotes)
        ? body.imageNotes.map(String)
        : typeof body.images === "string"
          ? body.images.split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean)
          : undefined,
      platform,
      marketplace:
        typeof body.marketplace === "string"
          ? body.marketplace
          : storeContext.marketplace,
      country:
        typeof body.country === "string" ? body.country : storeContext.country,
      category: typeof body.category === "string" ? body.category : undefined,
      features: Array.isArray(body.features)
        ? body.features.map(String)
        : undefined,
      currentListing:
        typeof body.currentListing === "string"
          ? body.currentListing
          : undefined,
      currentTitle:
        typeof body.currentTitle === "string" ? body.currentTitle : undefined,
      currentBullets: Array.isArray(body.currentBullets)
        ? body.currentBullets.map(String)
        : undefined,
      currentDescription:
        typeof body.currentDescription === "string"
          ? body.currentDescription
          : undefined,
      researchNotes:
        typeof body.researchNotes === "string" ? body.researchNotes : undefined,
      productResearchSummary:
        typeof body.productResearchSummary === "string"
          ? body.productResearchSummary
          : undefined,
      listingWeaknesses: Array.isArray(body.listingWeaknesses)
        ? body.listingWeaknesses.map(String)
        : undefined,
      listingChecklist: Array.isArray(body.listingChecklist)
        ? body.listingChecklist.map(String)
        : undefined,
      productId: typeof body.productId === "string" ? body.productId : undefined,
      channel,
      mode,
      partialField,
      baseListing,
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
    console.error("[listing-intelligence API]", err);
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        message: "Listing 分析失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
