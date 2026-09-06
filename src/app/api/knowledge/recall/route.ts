import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import { recallKnowledge } from "@/modules/knowledge/service";

/** V4.5 Knowledge Graph recall (background capability) */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const query = String(body.query || body.q || "").trim();
  if (!query) {
    return NextResponse.json({ error: "缺少 query" }, { status: 400 });
  }
  const result = await recallKnowledge({
    userId: session.user.id,
    query,
  });
  return NextResponse.json(result);
}
