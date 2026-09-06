import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  loginWithEmail,
} from "@/modules/account/auth/service";
import { getCreditsSummary } from "@/modules/account/credits/service";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  if (!body.email) {
    return NextResponse.json(
      { ok: false, message: "请输入邮箱" },
      { status: 400 }
    );
  }

  const result = await loginWithEmail(body.email);
  if (!result.ok || !result.token || !result.user) {
    return NextResponse.json(result, { status: 400 });
  }

  // Ensure welcome credits ledger exists
  await getCreditsSummary(result.user.id, result.user.role);

  const res = NextResponse.json({
    ok: true,
    message: result.message,
    user: result.user,
  });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
