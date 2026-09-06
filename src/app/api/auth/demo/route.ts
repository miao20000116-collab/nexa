import { NextResponse } from "next/server";
import { loginWithDemoTier } from "@/modules/account/auth/service";
import { SESSION_COOKIE } from "@/modules/account/auth/service";
import type { DemoTier } from "@/modules/account/permissions/demo-accounts";
import { getTierCapabilities } from "@/modules/account/permissions/tier-policy";

const VALID_TIERS: DemoTier[] = ["basic", "standard", "pro"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { tier?: string };
  const tier = body.tier as DemoTier | undefined;

  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json(
      { ok: false, message: "无效的演示账号类型" },
      { status: 400 }
    );
  }

  const result = await loginWithDemoTier(tier);
  if (!result.ok || !result.token || !result.user) {
    return NextResponse.json(result, { status: 400 });
  }

  const res = NextResponse.json({
    ok: true,
    message: result.message,
    user: result.user,
    tier: getTierCapabilities(tier),
  });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
