import { NextRequest, NextResponse } from "next/server";
import {
  createResearchJob,
  getResearchJob,
  listResearchJobs,
} from "@/modules/workspace/services/workspace-service";
import type {
  ResearchScope,
  ResearchTimeRange,
  ResearchReportType,
} from "@/modules/workspace/types";
import { requireLogin } from "@/lib/guest-guard";

function encodeTimeRange(
  timeRange: ResearchTimeRange,
  customFrom?: string,
  customTo?: string
): string {
  if (timeRange === "custom" && customFrom && customTo) {
    return `custom:${customFrom}:${customTo}`;
  }
  return timeRange;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId,
      goal,
      scope,
      timeRange,
      reportType,
      customFrom,
      customTo,
      confirm,
      jobId,
    } = body;

    if (!workspaceId || !goal) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const auth = await requireLogin("high_cost_generation");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { resolveCreditsAccount } = await import(
      "@/modules/account/credits/account"
    );
    const { gateAiUsage } = await import(
      "@/modules/account/credits/usage-guard"
    );
    const account = await resolveCreditsAccount();
    const gate = await gateAiUsage({
      account,
      capability: "research",
      confirm: Boolean(confirm),
      jobId: jobId ? String(jobId) : undefined,
    });

    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: gate.code,
          message: gate.message,
          estimate: gate.estimate,
          jobId: gate.jobId,
        },
        { status: gate.code === "insufficient_credits" ? 402 : 400 }
      );
    }

    const job = await createResearchJob({
      workspaceId,
      goal,
      scope: (scope ?? "workspace") as ResearchScope,
      timeRange: encodeTimeRange(
        (timeRange ?? "all") as ResearchTimeRange,
        customFrom,
        customTo
      ),
      reportType: (reportType ?? "quick") as ResearchReportType,
    });

    return NextResponse.json({ ...job, creditJobId: gate.jobId });
  } catch (err) {
    console.error("[Research API]", err);
    return NextResponse.json({ error: "创建研究任务失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  if (id) {
    const job = await getResearchJob(id);
    if (!job) {
      return NextResponse.json({ error: "研究任务不存在" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  if (workspaceId) {
    const jobs = await listResearchJobs(workspaceId);
    return NextResponse.json({ jobs });
  }

  return NextResponse.json({ error: "参数不完整" }, { status: 400 });
}
