import { NextRequest, NextResponse } from "next/server";
import { readBlob } from "@/lib/storage/blob-store";

/** Serve server-generated AI media files (never user-uploaded secrets). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "无效文件" }, { status: 400 });
  }
  try {
    const buf = await readBlob({ namespace: "generated", key: name });
    if (!buf) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".mp3"
            ? "audio/mpeg"
            : ext === ".mp4"
              ? "video/mp4"
              : "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
