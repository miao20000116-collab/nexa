import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/modules/publish/services/connection-service";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const result = await handleOAuthCallback({
    state: searchParams.get("state"),
    code: searchParams.get("code"),
    error: searchParams.get("error"),
  });

  return NextResponse.redirect(new URL(result.redirect, req.nextUrl.origin));
}
