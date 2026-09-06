/**
 * V3.4 Multimodal — safe pipeline without faking media.
 * Reuses text generation; image/video only when capability + APIs exist.
 */

import { getProject, updateProject, requestAiGeneration } from "@/modules/create/services/creation-service";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";

export type MultimodalStep = "text" | "image" | "video";

export interface MultimodalPipelineResult {
  creationId: string;
  projectId: string;
  contextShared: true;
  steps: Array<{
    step: MultimodalStep;
    status: "completed" | "skipped_existing" | "blocked" | "failed";
    message: string;
    refId?: string;
  }>;
}

export async function runMultimodalPipeline(
  projectId: string,
  opts: {
    steps?: MultimodalStep[];
    confirm?: boolean;
    preferExistingAssets?: boolean;
  } = {}
): Promise<MultimodalPipelineResult> {
  const steps = opts.steps ?? ["text", "image", "video"];
  const project = await getProject(projectId);
  if (!project) {
    return {
      creationId: projectId,
      projectId,
      contextShared: true,
      steps: steps.map((step) => ({
        step,
        status: "failed" as const,
        message: "项目不存在",
      })),
    };
  }

  const preferExisting = opts.preferExistingAssets !== false;
  const results: MultimodalPipelineResult["steps"] = [];
  const hasImageAsset = (project.assets ?? []).some((a) => a.selected);

  for (const step of steps) {
    if (step === "text") {
      const hasText = Boolean(
        (project.content &&
          typeof project.content === "object" &&
          (("body" in project.content && project.content.body) ||
            ("title" in project.content && project.content.title))) ||
          false
      );
      if (hasText) {
        results.push({
          step: "text",
          status: "skipped_existing",
          message: "已有文案，优先复用（Existing Assets First）",
        });
        continue;
      }
      const gen = await requestAiGeneration(projectId, { confirm: opts.confirm });
      results.push(
        gen.ok
          ? {
              step: "text",
              status: "completed",
              message: "文案已生成，Context 保持一致",
              refId: projectId,
            }
          : {
              step: "text",
              status:
                gen.code === "blocked_ai_unavailable" ? "blocked" : "failed",
              message: gen.message,
            }
      );
      continue;
    }

    if (step === "image") {
      if (preferExisting && hasImageAsset) {
        results.push({
          step: "image",
          status: "skipped_existing",
          message: "已有素材，优先使用，不重复生成",
          refId: project.assets[0]?.assetId,
        });
        continue;
      }
      if (!AIGateway.isAvailable("generateImage")) {
        results.push({
          step: "image",
          status: "blocked",
          message: "图片生成暂未配置。请上传素材，或稍后再试。",
        });
        continue;
      }
      results.push({
        step: "image",
        status: "completed",
        message: "可前往图片工作室基于同一 Creation Context 生成",
        refId: projectId,
      });
      continue;
    }

    if (step === "video") {
      results.push({
        step: "video",
        status: AIGateway.isAvailable("generateVideo")
          ? "completed"
          : "blocked",
        message: AIGateway.isAvailable("generateVideo")
          ? "可前往视频工作台基于同一 Creation Context 制作"
          : "视频能力暂未就绪，可先完善脚本或手动制作时间线",
        refId: projectId,
      });
    }
  }

  await updateProject(projectId, { status: "ready" }).catch(() => null);

  return {
    creationId: projectId,
    projectId,
    contextShared: true,
    steps: results,
  };
}
