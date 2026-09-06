import { NextRequest, NextResponse } from "next/server";
import {
  assertPublicHttpUrl,
  fetchThroughEgress,
} from "@/lib/read/fetch-page";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const UNAVAILABLE_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#f4f4f5"/><path d="M176 432l104-112 72 72 56-56 96 96H176z" fill="#d4d4d8"/><circle cx="242" cy="230" r="38" fill="#d4d4d8"/></svg>';

async function fetchImage(url: string): Promise<Response | null> {
  const headers = {
    "User-Agent": UA,
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    // Empty referrer reduces hotlink blocks from Baidu/Bing CDNs
    Referer: "",
  };

  try {
    return await fetchThroughEgress(url, {
      headers,
      timeoutMs: 12_000,
    });
  } catch {
    return null;
  }
}

function unavailableImageResponse() {
  return new NextResponse(UNAVAILABLE_IMAGE_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

/**
 * Same-origin proxy for search thumbnails — avoids CDN hotlink / Referer blocks.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }

  try {
    await assertPublicHttpUrl(raw);
  } catch {
    return NextResponse.json({ error: "不允许的主机" }, { status: 403 });
  }

  const upstream = await fetchImage(raw);
  if (!upstream || !upstream.ok) {
    return unavailableImageResponse();
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    return unavailableImageResponse();
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return unavailableImageResponse();
  }
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    !contentType.includes("octet-stream")
  ) {
    return unavailableImageResponse();
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType.startsWith("image/")
        ? contentType
        : "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
