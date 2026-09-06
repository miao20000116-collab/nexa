import { NextRequest, NextResponse } from "next/server";
import {
  fileStoreFindByStorageKey,
  fileStoreReadBytes,
} from "@/lib/assets/file-store";
import { assertAssetAccess } from "@/modules/assets/asset-service";
import { prisma, isDatabaseAvailable } from "@/lib/db";

function mimeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const storageKey = decodeURIComponent(key);

    let owned = await fileStoreFindByStorageKey(storageKey);

    if (!owned && (await isDatabaseAvailable())) {
      try {
        const row = await prisma.asset.findFirst({
          where: { storageKey },
        });
        if (row) {
          owned = {
            id: row.id,
            userId: row.userId,
            assetType: row.type as "image" | "video" | "audio" | "document",
            fileName: row.title ?? storageKey,
            mimeType: row.mimeType ?? "application/octet-stream",
            sizeBytes: row.sizeBytes ?? 0,
            storageKey: row.storageKey ?? storageKey,
            status: row.status as "ready",
            url: row.url,
            metadata: (row.metadata as object) as never,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          };
        }
      } catch {
        /* ignore */
      }
    }

    if (!owned) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const access = await assertAssetAccess(owned);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status }
      );
    }

    const buf = await fileStoreReadBytes(storageKey);
    if (!buf) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": mimeFromKey(storageKey),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[Assets file API]", err);
    return NextResponse.json({ error: "读取失败" }, { status: 500 });
  }
}
