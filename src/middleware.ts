import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (!origin) return res;
  const allowed = allowedOrigins();
  if (!allowed.includes(origin)) return res;

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    req.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization"
  );
  res.headers.set("Vary", "Origin");
  return res;
}

/**
 * CORS for Netlify (or other) frontends calling this host directly.
 * Prefer Netlify /api proxy (same-origin) when the API is HTTP-only.
 */
export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return applyCors(req, new NextResponse(null, { status: 204 }));
  }
  return applyCors(req, NextResponse.next());
}

export const config = {
  matcher: "/api/:path*",
};
