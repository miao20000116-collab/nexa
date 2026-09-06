import { NextRequest, NextResponse } from "next/server";
import { readMusicFile } from "@/modules/video/music/music-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const buf = await readMusicFile(name);
  if (!buf) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const lower = name.toLowerCase();
  const type = lower.endsWith(".wav")
    ? "audio/wav"
    : lower.endsWith(".mp3")
      ? "audio/mpeg"
      : "application/octet-stream";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
