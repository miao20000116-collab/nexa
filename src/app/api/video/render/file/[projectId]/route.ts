import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

/** Serve real rendered MP4 for browser preview — never a fake file. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  if (
    !projectId ||
    projectId.includes("..") ||
    projectId.includes("/") ||
    projectId.includes("\\")
  ) {
    return NextResponse.json({ error: "无效项目" }, { status: 400 });
  }

  const filePath = path.join(
    process.cwd(),
    ".nexa-data",
    "renders",
    projectId,
    "export.mp4"
  );

  try {
    const buf = await fs.readFile(filePath);
    if (buf.length < 1000) {
      return NextResponse.json({ error: "成片无效" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=60",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "成片不存在" }, { status: 404 });
  }
}
