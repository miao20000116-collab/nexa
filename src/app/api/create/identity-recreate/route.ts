import { NextRequest, NextResponse } from "next/server";
import { runOnlineIdentityRecreate } from "@/modules/create/services/online-identity-recreate";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/create/identity-recreate
 * Body: { url, faceAssetId, outputKind?: "video"|"image", durationSec?, workspaceId? }
 *
 * Online only — never downloads platform original media.
 * Successful output is persisted into Workspace Context for later viewing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = String(body.url ?? body.linkUrl ?? "").trim();
    const faceAssetId = String(body.faceAssetId ?? body.assetId ?? "").trim();
    if (!url) {
      return NextResponse.json({ error: "请提供链接" }, { status: 400 });
    }
    if (!faceAssetId) {
      return NextResponse.json(
        { error: "请先上传形象照片（faceAssetId）" },
        { status: 400 }
      );
    }

    const outputKind =
      body.outputKind === "image" ? "image" : ("video" as const);
    const durationSec = Number(body.durationSec);
    const workspaceId =
      typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : undefined;
    const result = await runOnlineIdentityRecreate({
      urlOrText: url,
      faceAssetId,
      outputKind,
      durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
      aspectRatio: typeof body.aspectRatio === "string" ? body.aspectRatio : undefined,
      workspaceId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "在线生成失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
