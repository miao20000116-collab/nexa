import { NextRequest, NextResponse } from "next/server";
import { UI } from "@/lib/ui-copy";
import {
  estimateImageCredits,
  generateImageProduction,
  listImageHistory,
  listPreferredReferenceAssets,
} from "@/modules/image/services/image-production-service";
import type { ImagePurpose } from "@/modules/image/types";
import { IMAGE_PURPOSE_OPTIONS } from "@/modules/image/constants";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "meta";

    if (view === "history") {
      const history = await listImageHistory(50);
      return NextResponse.json({ history });
    }

    if (view === "references") {
      const assets = await listPreferredReferenceAssets();
      return NextResponse.json({
        assets: assets.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          url: a.url,
          proxyUrl: a.proxyUrl,
          subject: a.metadata?.subject ?? null,
          scene: a.metadata?.scene ?? null,
          visualTags: a.metadata?.visual_tags ?? [],
        })),
      });
    }

    const estimate = estimateImageCredits();
    return NextResponse.json({
      available: AIGateway.isAvailable("generateImage"),
      purposes: IMAGE_PURPOSE_OPTIONS,
      estimate,
      message: AIGateway.isAvailable("generateImage")
        ? null
        : UI.common.aiUnavailable,
    });
  } catch (err) {
    console.error("[Image API GET]", err);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {

    const body = await request.json();
    const purpose = (body.purpose || "product_scene") as ImagePurpose;
    const confirm = Boolean(body.confirm);
    const result = await generateImageProduction({
      prompt: String(body.prompt ?? ""),
      purpose,
      referenceAssetIds: Array.isArray(body.referenceAssetIds)
        ? body.referenceAssetIds.map(String)
        : body.referenceAssetId
          ? [String(body.referenceAssetId)]
          : [],
      size: body.size ? String(body.size) : undefined,
      confirm,
      jobId: body.jobId ? String(body.jobId) : undefined,
    });

    if (!result.ok) {
      const status =
        result.code === "blocked_ai_unavailable"
          ? 503
          : result.code === "confirm_required" ||
              result.code === "login_required" ||
              result.code === "insufficient_credits"
            ? result.code === "insufficient_credits"
              ? 402
              : 400
            : result.code === "invalid"
              ? 400
              : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[Image API POST]", err);
    return NextResponse.json(
      { ok: false, code: "ai_error", message: "生成失败" },
      { status: 500 }
    );
  }
}
