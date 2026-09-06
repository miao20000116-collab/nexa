/**
 * One-click: workspace/goal → script → storyboard → AI fill → render.
 * No owned assets required — unbound shots use Jimeng T2V / image fallback.
 */

import {
  createProject,
  getProject,
  requestAiGeneration,
} from "@/modules/create/services/creation-service";
import type {
  ContentType,
  CreationPlatform,
  CreationProject,
} from "@/modules/create/types";
import {
  getWorkspace,
} from "@/modules/workspace/services/workspace-service";
import { ensureSourcesIngested } from "@/modules/workspace/services/source-ingest";
import {
  planStoryboard,
  buildTimelineFromStoryboard,
  requestAiFill,
  requestRender,
  getVideoProject,
} from "@/modules/video/services/video-project-service";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";

export type ProduceStepId =
  | "ingest"
  | "create_project"
  | "generate_text"
  | "plan_storyboard"
  | "build_timeline"
  | "ai_fill"
  | "render";

export type ProduceStep = {
  id: ProduceStepId;
  status: "ok" | "skipped" | "error" | "confirm_required" | "blocked";
  message: string;
};

export type OneClickProduceResult = {
  ok: boolean;
  code: string;
  message: string;
  projectId?: string;
  href?: string;
  exportUrl?: string | null;
  previewUrl?: string | null;
  steps: ProduceStep[];
  jobId?: string;
  estimate?: {
    available: boolean;
    estimatedCredits: number | null;
    message?: string;
  };
  videoJobStatus?: string | null;
};

function push(
  steps: ProduceStep[],
  id: ProduceStepId,
  status: ProduceStep["status"],
  message: string
) {
  steps.push({ id, status, message });
}

export async function oneClickProduce(input: {
  goal: string;
  workspaceId?: string;
  projectId?: string;
  confirm?: boolean;
  jobId?: string;
  contentType?: ContentType;
  platform?: CreationPlatform;
  targetDurationSec?: number;
}): Promise<OneClickProduceResult> {
  const steps: ProduceStep[] = [];
  const goal = input.goal.trim();
  if (!goal && !input.projectId) {
    return {
      ok: false,
      code: "needs_goal",
      message: "请填写创作目标",
      steps,
    };
  }

  let project: CreationProject | null = null;

  // 1) Ingest workspace sources (await — do not race)
  if (input.workspaceId) {
    const ws = await getWorkspace(input.workspaceId);
    if (!ws) {
      push(steps, "ingest", "error", "工作区不存在");
      return {
        ok: false,
        code: "workspace_not_found",
        message: "工作区不存在",
        steps,
      };
    }
    try {
      await ensureSourcesIngested(input.workspaceId, ws.sources, {
        limit: 8,
        force: true,
      });
      push(steps, "ingest", "ok", `已抓取并压缩 ${Math.min(8, ws.sources.length)} 条资料`);
    } catch (err) {
      push(
        steps,
        "ingest",
        "error",
        err instanceof Error ? err.message : "资料抓取失败"
      );
      // Continue with snippets — generation still has goal + meta
    }
  } else {
    push(steps, "ingest", "skipped", "无工作区，跳过资料抓取");
  }

  // 2) Create or load project
  if (input.projectId) {
    project = await getProject(input.projectId);
    if (!project) {
      push(steps, "create_project", "error", "创作项目不存在");
      return {
        ok: false,
        code: "project_not_found",
        message: "创作项目不存在",
        steps,
      };
    }
    push(steps, "create_project", "ok", `使用已有项目 ${project.id}`);
  } else {
    project = await createProject({
      goal,
      title: goal.slice(0, 40),
      contentType: input.contentType ?? "short_video",
      platform: input.platform ?? "douyin",
      startMode: input.workspaceId ? "workspace" : "idea",
      workspaceId: input.workspaceId,
    });
    push(steps, "create_project", "ok", `已创建项目 ${project.id}`);
  }

  const projectId = project.id;
  const href = `/create/${projectId}?panel=video`;

  // 3) Generate script (auto-confirm on one-click)
  const bodyRaw = project.content?.body;
  const hookRaw = project.content?.hook;
  const bodyText = Array.isArray(bodyRaw) ? bodyRaw.join("\n") : bodyRaw || "";
  const hookText = Array.isArray(hookRaw) ? hookRaw.join("\n") : hookRaw || "";
  const hasBody = Boolean(bodyText.trim() || hookText.trim());
  if (!hasBody) {
    const gen = await requestAiGeneration(projectId, {
      confirm: Boolean(input.confirm),
      jobId: input.jobId,
    });
    if (!gen.ok) {
      if (gen.code === "confirm_required") {
        push(steps, "generate_text", "confirm_required", gen.message);
        return {
          ok: false,
          code: "confirm_required",
          message: gen.message,
          projectId,
          href,
          steps,
          jobId: gen.jobId,
          estimate: gen.estimate
            ? {
                available: gen.estimate.available,
                estimatedCredits: gen.estimate.estimatedCredits ?? null,
                message: gen.estimate.message,
              }
            : undefined,
        };
      }
      push(steps, "generate_text", "error", gen.message);
      return {
        ok: false,
        code: gen.code || "generate_failed",
        message: gen.message,
        projectId,
        href,
        steps,
      };
    }
    project = gen.project;
    push(steps, "generate_text", "ok", "文案脚本已生成");
  } else {
    push(steps, "generate_text", "skipped", "项目已有文案");
  }

  // 4) Storyboard — force AI video path when no owned clips
  const duration = input.targetDurationSec ?? 30;
  try {
    const { updateMaterialStrategy } = await import(
      "@/modules/video/services/video-project-service"
    );
    await updateMaterialStrategy(projectId, {
      mode: "more_ai",
      targetDurationSec: duration,
    });
  } catch {
    /* optional */
  }
  const sb = await planStoryboard(projectId, duration);
  if (!sb) {
    push(steps, "plan_storyboard", "error", "分镜生成失败");
    return {
      ok: false,
      code: "storyboard_failed",
      message: "分镜生成失败",
      projectId,
      href,
      steps,
    };
  }
  push(
    steps,
    "plan_storyboard",
    "ok",
    `分镜 ${sb.video.storyboard?.shots.length ?? 0} 镜`
  );

  // 5) Timeline
  const tl = await buildTimelineFromStoryboard(projectId, "9:16");
  if (!tl?.video.timeline) {
    push(steps, "build_timeline", "error", "时间线生成失败");
    return {
      ok: false,
      code: "timeline_failed",
      message: "时间线生成失败",
      projectId,
      href,
      steps,
    };
  }
  push(steps, "build_timeline", "ok", "时间线已生成");

  // 6) AI fill when no owned media
  const canVideo = AIGateway.isAvailable("generateVideo");
  const canImage = AIGateway.isAvailable("generateImage");
  if (!canVideo && !canImage) {
    push(steps, "ai_fill", "blocked", "视频/图片生成能力未接入");
    return {
      ok: false,
      code: "blocked_ai_unavailable",
      message: "视频生成能力未接入：请配置即梦或 AI_MEDIA_*",
      projectId,
      href,
      steps,
    };
  }

  if (!input.confirm) {
    const loaded = await getVideoProject(projectId);
    const estimate = loaded?.video.costEstimate;
    push(steps, "ai_fill", "confirm_required", "确认后将生成 AI 镜头并导出");
    return {
      ok: false,
      code: "confirm_required",
      message: estimate?.message || "确认后将生成 AI 镜头并导出成片",
      projectId,
      href,
      steps,
      estimate: estimate
        ? {
            available: estimate.available,
            estimatedCredits: estimate.estimatedCredits ?? null,
            message: estimate.message,
          }
        : undefined,
    };
  }

  const fill = await requestAiFill(projectId, { confirm: true });
  const fillOk =
    fill.code === "ok" ||
    fill.code === "no_gap" ||
    fill.code === "completed" ||
    fill.code === "partial";
  if (!fillOk) {
    push(
      steps,
      "ai_fill",
      fill.code === "ai_unavailable" || fill.code === "blocked_ai_unavailable"
        ? "blocked"
        : "error",
      fill.message
    );
    if (
      fill.code === "ai_unavailable" ||
      fill.code === "blocked_ai_unavailable"
    ) {
      return {
        ok: false,
        code: fill.code,
        message: fill.message,
        projectId,
        href,
        steps,
        videoJobStatus: fill.video?.jobStatus,
      };
    }
  } else {
    push(steps, "ai_fill", "ok", fill.message || "AI 镜头已生成");
  }

  // 7) Render — music optional; engine exports without BGM when absent
  const render = await requestRender(projectId, {
    confirm: true,
    allowWithoutMusic: true,
  });
  if (render.code !== "ok" && render.code !== "completed") {
    push(steps, "render", "error", render.message);
    return {
      ok: false,
      code: render.code || "render_failed",
      message: render.message,
      projectId,
      href,
      steps,
      exportUrl: render.video?.exportUrl,
      previewUrl: render.video?.previewUrl,
      videoJobStatus: render.video?.jobStatus,
    };
  }

  push(steps, "render", "ok", render.message || "成片已导出");
  return {
    ok: true,
    code: "ok",
    message: "一键成片完成",
    projectId,
    href,
    steps,
    exportUrl: render.video?.exportUrl ?? null,
    previewUrl: render.video?.previewUrl ?? null,
    videoJobStatus: render.video?.jobStatus,
  };
}
