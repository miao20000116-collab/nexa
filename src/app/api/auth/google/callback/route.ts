import { NextRequest, NextResponse } from "next/server";
import { handleGoogleCallback } from "@/modules/account/auth/service";

export async function GET(req: NextRequest) {
  const result = await handleGoogleCallback();
  return NextResponse.redirect(new URL(result.redirect, req.nextUrl.origin));
}
