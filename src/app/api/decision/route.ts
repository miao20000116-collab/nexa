import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  getDecision,
  makeDecision,
  type DecisionDomain,
} from "@/modules/decision/service";

/** V4.2 AI Decision Engine */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const decision = await getDecision(id, session.user.id);
  if (!decision) {
    return NextResponse.json({ error: "不存在" }, { status: 404 });
  }
  return NextResponse.json({ decision });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const decision = await makeDecision({
    userId: session.user.id,
    domain: (body.domain as DecisionDomain) || "content",
    situation: body.situation || body.goal || "需要决策",
    evidence: body.evidence,
    contextText: body.contextText,
  });
  return NextResponse.json({ decision });
}
