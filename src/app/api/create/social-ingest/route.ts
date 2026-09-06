import { NextRequest, NextResponse } from "next/server";
import { ingestSocialLink } from "@/modules/create/services/social-recreate";

export const runtime = "nodejs";

/**
 * POST /api/create/social-ingest
 * Body: { url: string, mediaAssetCount?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body.url ?? body.linkUrl ?? "").trim();
    if (!url) {
      return NextResponse.json({ error: "请提供链接" }, { status: 400 });
    }

    const mediaAssetCount = Number(body.mediaAssetCount ?? 0);
    const result = await ingestSocialLink({
      urlOrText: url,
      mediaAssetCount: Number.isFinite(mediaAssetCount)
        ? Math.max(0, mediaAssetCount)
        : 0,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "链接解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
