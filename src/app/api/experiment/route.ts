import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import {
  concludeExperiment,
  createExperiment,
  getExperiment,
  recordExperimentMetrics,
} from "@/modules/experiment/service";

/** V4.4 Experimentation */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const experiment = await getExperiment(id, session.user.id);
  if (!experiment) {
    return NextResponse.json({ error: "不存在" }, { status: 404 });
  }
  return NextResponse.json({ experiment });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const action = body.action as string;

  if (action === "create") {
    const experiment = await createExperiment({
      userId: session.user.id,
      hypothesis: body.hypothesis || "新 Hook 能提升 CTR",
      variants: body.variants,
    });
    return NextResponse.json({ experiment });
  }

  if (action === "record_metrics") {
    try {
      const experiment = await recordExperimentMetrics({
        userId: session.user.id,
        experimentId: body.experimentId,
        variantId: body.variantId,
        metrics: body.metrics,
      });
      return NextResponse.json({ experiment });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "失败" },
        { status: 400 }
      );
    }
  }

  if (action === "conclude") {
    try {
      const experiment = await concludeExperiment({
        userId: session.user.id,
        experimentId: body.experimentId,
      });
      return NextResponse.json({ experiment });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "失败" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
