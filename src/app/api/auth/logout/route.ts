import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  logoutSession,
} from "@/modules/account/auth/service";
import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await logoutSession(token);
  const res = NextResponse.json({ ok: true, message: "已退出登录" });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
