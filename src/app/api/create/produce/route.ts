import { NextRequest, NextResponse } from "next/server";
import { oneClickProduce } from "@/modules/create/services/one-click-produce";
import type {
  ContentType,
  CreationPlatform,
} from "@/modules/create/types";

export const runtime = "nodejs";
/** Jimeng + multi-shot fill can exceed default serverless limits */
export const maxDuration = 300;

/**
 * POST /api/create/produce
 * One-click: workspace → script → storyboard → AI fill → render.
 * Pass confirm:true after Credits gate (search/create CTA counts as intent).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = String(body.goal ?? "").trim();
    const workspaceId = body.workspaceId
      ? String(body.workspaceId)
      : undefined;
    const projectId = body.projectId ? String(body.projectId) : undefined;

    if (!goal && !projectId) {
      return NextResponse.json(
        { ok: false, error: "请填写创作目标或指定项目" },
        { status: 400 }
      );
    }

    const result = await oneClickProduce({
      goal: goal || "生成短视频成片",
      workspaceId,
      projectId,
      confirm: Boolean(body.confirm),
      jobId: body.jobId ? String(body.jobId) : undefined,
      contentType: (body.contentType as ContentType) || "short_video",
      platform: (body.platform as CreationPlatform) || "douyin",
      targetDurationSec: body.targetDurationSec
        ? Number(body.targetDurationSec)
        : 30,
    });

    return NextResponse.json(result, {
      status:
        result.code === "blocked_ai_unavailable" ||
        result.code === "ai_unavailable"
          ? 503
          : 200,
    });
  } catch (err) {
    console.error("[create/produce]", err);
    return NextResponse.json(
      { ok: false, error: "一键成片失败，请稍后重试" },
      { status: 500 }
    );
  }
}
