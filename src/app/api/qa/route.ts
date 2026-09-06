import { NextRequest, NextResponse } from "next/server";
import { resolveCreditsAccount } from "@/modules/account/credits/account";
import { gateAiUsage } from "@/modules/account/credits/usage-guard";
import { assertProjectAccess } from "@/lib/creation-access";
import { getProject } from "@/modules/create/services/creation-service";
import {
  getLatestQAReport,
  runContentQA,
} from "@/modules/qa/services/content-qa-service";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "缺少项目 ID" }, { status: 400 });
  }
  const project = await getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  const access = await assertProjectAccess(project);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }
  const report = await getLatestQAReport(projectId);
  return NextResponse.json({ report });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = String(body.projectId ?? "");
    const confirm = Boolean(body.confirm);
    if (!projectId) {
      return NextResponse.json({ error: "缺少项目 ID" }, { status: 400 });
    }

    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const access = await assertProjectAccess(project);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status }
      );
    }

    const account = await resolveCreditsAccount();
    const gate = await gateAiUsage({
      account,
      capability: "qualityCheck",
      confirm,
      jobId: body.jobId ? String(body.jobId) : undefined,
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
        {
          status:
            gate.code === "insufficient_credits"
              ? 402
              : gate.code === "pricing_unavailable"
                ? 503
                : 400,
        }
      );
    }

    const report = await runContentQA({
      projectId,
      platform: body.platform ? String(body.platform) : undefined,
      accountId: account.accountId,
      userId: account.userId,
      jobId: gate.jobId,
    });
    return NextResponse.json({
      ok: true,
      report,
      jobId: gate.jobId,
      estimatedCredits: gate.estimatedCredits,
    });
  } catch (err) {
    console.error("[QA API]", err);
    return NextResponse.json({ error: "质检失败" }, { status: 500 });
  }
}
