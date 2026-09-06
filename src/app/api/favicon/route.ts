import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Local letter favicon — avoids Google favicon CDN (blocked in CN). */
export async function GET(request: NextRequest) {
  const domain = (request.nextUrl.searchParams.get("domain") ?? "?").trim();
  const letter = (domain.replace(/^www\./, "").charAt(0) || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#f4f4f5"/>
  <text x="16" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#71717a">${letter}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
