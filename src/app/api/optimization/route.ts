import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  analyzePerformance,
  getOptimization,
} from "@/modules/optimization/service";

/** V3.6 AI Optimization API */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const record = await getOptimization(id, session.user.id);
  if (!record) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const record = await analyzePerformance({
    userId: session.user.id,
    creationId: body.creationId,
    publishId: body.publishId,
    performance: body.performance,
  });
  return NextResponse.json(record);
}
