import { NextRequest, NextResponse } from "next/server";
import {
  deleteOwnedAsset,
  listOwnedAssets,
  uploadOwnedAsset,
} from "@/modules/assets/asset-service";

export async function GET() {
  try {
    const assets = await listOwnedAssets();
    return NextResponse.json({ assets });
  } catch (err) {
    console.error("[Assets API GET]", err);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    const result = await uploadOwnedAsset(file);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ asset: result.asset });
  } catch (err) {
    console.error("[Assets API POST]", err);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少素材 ID" }, { status: 400 });
    }

    const result = await deleteOwnedAsset(id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Assets API DELETE]", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
