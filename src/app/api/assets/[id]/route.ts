import { NextRequest, NextResponse } from "next/server";
import {
  assertAssetAccess,
  getOwnedAsset,
  retryOwnedAsset,
} from "@/modules/assets/asset-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const asset = await getOwnedAsset(id);
    if (!asset) {
      return NextResponse.json({ error: "素材不存在" }, { status: 404 });
    }

    const access = await assertAssetAccess(asset);
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status });
    }

    return NextResponse.json({ asset });
  } catch (err) {
    console.error("[Assets API GET id]", err);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "retry") {
      return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
    }

    const result = await retryOwnedAsset(id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ asset: result.asset });
  } catch (err) {
    console.error("[Assets API POST id]", err);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
