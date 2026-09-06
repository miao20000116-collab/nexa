import { NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  googleOAuthConfigured,
} from "@/modules/account/auth/service";

export async function GET() {
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Google 登录暂未配置。V1 请使用邮箱登录。",
      },
      { status: 400 }
    );
  }
  const state = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const url = buildGoogleAuthorizeUrl(state);
  if (!url) {
    return NextResponse.json(
      { ok: false, message: "Google 登录暂未配置。V1 请使用邮箱登录。" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, authorizeUrl: url });
}
