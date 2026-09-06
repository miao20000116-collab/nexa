import { getProject, updateProject, setProjectAssets } from "@/modules/create/services/creation-service";
import type { CreationProject, StructuredContent } from "@/modules/create/types";
import { UI } from "@/lib/ui-copy";
import { toUserErrorMessage } from "@/lib/user-errors";
import { estimateCredits } from "@/modules/account/credits/service";
import {
  createOwnedMediaAsset,
  getOwnedAsset,
} from "@/modules/assets/asset-service";
import { assetStoragePath } from "@/lib/assets/file-store";
import {
  analyzeMaterialCoverage,
  createDraftStoryboard,
  fillOwnedCoverageWhenAiUnavailable,
  normalizeStoryboardDuration,
  timelineFromStoryboard,
  emptyTimeline,
} from "../material-strategy";
import {
  applyAiShotPlans,
  createReferenceAlignedStoryboard,
  extractReferenceSignals,
  type AiShotPlan,
} from "../reference-storyboard";
import {
  readReferencePackage,
  storyboardFromReferencePackage,
} from "@/modules/create/services/reference-storyboard-package";
import { regenerateSceneInTimeline, renderTimeline } from "../timeline-engine";
import type {
  AspectRatio,
  MaterialStrategyMode,
  Storyboard,
  TimelineDocument,
  VideoCostEstimate,
  VideoJobStatus,
  VideoProjectState,
} from "../types";
import type { TimelineScene } from "../types";
import { createHash } from "crypto";
import path from "path";
import { promises as fs } from "fs";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";

const VIDEO_KEY = "__videoProject";

type ContentWithVideo = StructuredContent & {
  [VIDEO_KEY]?: VideoProjectState;
};

function readVideoState(project: CreationProject): VideoProjectState {
  const content = (project.content ?? {}) as ContentWithVideo;
  if (content[VIDEO_KEY]) return content[VIDEO_KEY]!;
  return {
    materialStrategy: "more_ai",
    coverage: null,
    storyboard: null,
    timeline: null,
    jobStatus: "draft",
    jobMessage: null,
    previewUrl: null,
    exportUrl: null,
    playheadSec: 0,
    costEstimate: null,
    lastGeneratedFingerprint: null,
  };
}

async function writeVideoState(
  projectId: string,
  state: VideoProjectState,
  project: CreationProject
): Promise<CreationProject | null> {
  const content = {
    ...((project.content ?? {}) as object),
    [VIDEO_KEY]: state,
  } as unknown as StructuredContent;
  return updateProject(projectId, { content });
}

type LinkedProductionAsset = {
  id: string;
  type: string;
  durationSec: number | null;
  autoBind: boolean;
};

function isAutoBindableAsset(usageSuggestion?: string | null) {
  return !/检索结果缩略图|封面参考|仅作.*参考|分镜 AI 生成画面/u.test(
    usageSuggestion ?? ""
  );
}

function videoGenerationFailureMessage(error?: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/access denied|accessdenied|权限|无权/i.test(raw)) {
    return "即梦拒绝访问：请检查火山引擎账号是否已开通该视频模型、当前 Access Key 是否拥有调用权限，以及所用 ReqKey 是否在当前账号可用。";
  }
  return "即梦未能生成该镜头。请稍后重试，或检查视频模型的账号权限与额度。";
}

async function resolveLinkedAssets(
  project: CreationProject
): Promise<LinkedProductionAsset[]> {
  const out: LinkedProductionAsset[] = [];
  for (const link of project.assets) {
    const owned = await getOwnedAsset(link.assetId);
    const type = owned?.assetType ?? link.asset?.type ?? "image";
    const durationSec =
      owned?.metadata?.duration_ms != null
        ? owned.metadata.duration_ms / 1000
        : type === "image"
          ? 3
          : type === "video"
            ? 8
            : null;
    out.push({
      id: link.assetId,
      type,
      durationSec,
      // Search covers are context, while AI shots already belong to a specific
      // storyboard slot. Neither may silently fill another slot.
      autoBind: isAutoBindableAsset(owned?.metadata?.usage_suggestion),
    });
  }
  return out;
}

/** Fill storyboard/timeline scenes that have no assetId with linked media.
 *  Never recycle a single image across every shot — leftover shots stay unbound for AI 补镜头.
 */
function bindOwnedAssetsToTimeline(
  timeline: TimelineDocument,
  assets: Array<{ id: string; type: string; autoBind?: boolean }>
): { timeline: TimelineDocument; rebound: number } {
  const media = assets.filter(
    (a) =>
      a.autoBind !== false && (a.type === "video" || a.type === "image")
  );
  if (!media.length) return { timeline, rebound: 0 };

  let idx = 0;
  let rebound = 0;
  const patch = (scenes: TimelineScene[]) =>
    scenes.map((scene) => {
      if (scene.assetId) return scene;
      if (scene.sourceType === "text" || scene.sourceType === "voice") {
        return scene;
      }
      if (idx >= media.length) return scene;
      const pick = media[idx];
      idx += 1;
      rebound += 1;
      return {
        ...scene,
        assetId: pick.id,
        sourceType:
          pick.type === "image"
            ? ("image_animation" as const)
            : ("owned_video" as const),
        track:
          pick.type === "image"
            ? ("image" as const)
            : scene.track === "text"
              ? scene.track
              : ("video" as const),
        animation: pick.type === "image" ? "kenburns" : scene.animation,
      };
    });

  return {
    rebound,
    timeline: {
      ...timeline,
      videoTrack: {
        ...timeline.videoTrack,
        scenes: patch(timeline.videoTrack.scenes),
      },
      imageTrack: {
        ...timeline.imageTrack,
        scenes: patch(timeline.imageTrack.scenes),
      },
    },
  };
}

/** Bind unbound storyboard shots to owned image/video — one asset per shot, no recycle. */
function bindOwnedAssetsToStoryboard(
  storyboard: Storyboard,
  assets: Array<{ id: string; type: string; autoBind?: boolean }>
): { storyboard: Storyboard; rebound: number } {
  const media = assets.filter(
    (a) =>
      a.autoBind !== false && (a.type === "video" || a.type === "image")
  );
  if (!media.length) return { storyboard, rebound: 0 };

  let idx = 0;
  let rebound = 0;
  const shots = storyboard.shots.map((shot) => {
    if (shot.assetId) return shot;
    if (idx >= media.length) return shot;
    const pick = media[idx];
    idx += 1;
    rebound += 1;
    return {
      ...shot,
      assetId: pick.id,
      sourceType:
        pick.type === "image"
          ? ("image_animation" as const)
          : ("owned_video" as const),
      notes: shot.notes || "已绑定工作区/项目素材",
    };
  });

  return {
    rebound,
    storyboard: {
      ...storyboard,
      shots,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function persistGeneratedMedia(opts: {
  projectId: string;
  shotId: string;
  bytes: Buffer;
  kind: "image" | "video";
  mimeType: string;
  fileName: string;
}): Promise<string | null> {
  try {
    const created = await createOwnedMediaAsset({
      bytes: opts.bytes,
      fileName: opts.fileName,
      assetType: opts.kind,
      mimeType: opts.mimeType,
      usageSuggestion: "分镜 AI 生成画面",
    });
    return created.id;
  } catch (err) {
    console.error("[persistGeneratedMedia]", err);
    return null;
  }
}

function fingerprintPlan(input: {
  coverage?: VideoProjectState["coverage"];
  storyboard?: Storyboard | null;
  aiNeededSec?: number;
}): string {
  const raw = JSON.stringify({
    c: input.coverage,
    s: input.storyboard?.shots?.map((x) => ({
      id: x.id,
      d: x.durationSec,
      t: x.sourceType,
      p: x.description,
      a: x.assetId,
    })),
    n: input.aiNeededSec,
  });
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function estimateVideoProductionCost(
  video: VideoProjectState
): VideoCostEstimate {
  const aiShots =
    video.storyboard?.shots.filter((s) => s.sourceType === "ai_video")
      .length ?? 0;
  const aiSeconds =
    video.coverage?.aiRequiredCoverageSec ??
    video.coverage?.aiVideoNeededSec ??
    0;
  const unit = estimateCredits("generateVideo");
  const perShot =
    unit.available && unit.estimatedCredits != null
      ? unit.estimatedCredits
      : null;
  const shotCount = Math.max(aiShots, aiSeconds > 0 ? 1 : 0);
  const estimatedCredits =
    perShot != null ? Math.max(0, shotCount * perShot) : null;
  const planFingerprint = fingerprintPlan({
    coverage: video.coverage,
    storyboard: video.storyboard,
    aiNeededSec: aiSeconds,
  });

  if (aiSeconds <= 0 && aiShots === 0) {
    return {
      available: true,
      estimatedCredits: 0,
      aiShots: 0,
      aiSeconds: 0,
      message:
        "无需 AI 视频生成（已有素材已覆盖目标时长）。本地渲染不额外消耗 generateVideo Credits。",
      planFingerprint,
    };
  }

  return {
    available: perShot != null,
    estimatedCredits,
    aiShots,
    aiSeconds,
    message:
      perShot != null
        ? `预计消耗约 ${estimatedCredits} Credits（仅补 ${aiSeconds} 秒 / ${aiShots} 个 AI 镜头；确认后才执行）`
        : "预计消耗将在配置完成后显示。",
    planFingerprint,
  };
}

export async function getVideoProject(
  projectId: string
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  let project = await getProject(projectId);
  if (!project) return null;

  // Soft-import workspace media once when project has none (existing projects).
  if (
    project.assets.length === 0 &&
    (project.workspaceId ||
      project.sources?.some((s) => s.workspaceId || s.kind === "workspace_source"))
  ) {
    try {
      const { linkWorkspaceMediaToProject } = await import(
        "@/modules/create/services/link-workspace-media"
      );
      const imported = await linkWorkspaceMediaToProject(projectId);
      if (imported?.project) project = imported.project;
    } catch (err) {
      console.error("[getVideoProject] workspace media import failed", err);
    }
  }

  let video = readVideoState(project);

  // If we now have media but storyboard shots are unbound, bind them
  if (video.storyboard?.shots?.length && project.assets.length > 0) {
    const assets = await resolveLinkedAssets(project);
    const unbound = video.storyboard.shots.filter((s) => !s.assetId).length;
    if (
      unbound > 0 &&
      assets.some(
        (a) => a.autoBind && (a.type === "image" || a.type === "video")
      )
    ) {
      const { storyboard, rebound } = bindOwnedAssetsToStoryboard(
        video.storyboard,
        assets
      );
      if (rebound > 0) {
        let timeline = video.timeline;
        if (timeline) {
          const bound = bindOwnedAssetsToTimeline(timeline, assets);
          timeline = bound.timeline;
        }
        video = {
          ...video,
          storyboard,
          timeline,
          jobMessage: `已将 ${rebound} 个镜头绑定到工作区/项目素材，可生成时间线并导出。`,
        };
        video.costEstimate = estimateVideoProductionCost(video);
        const saved = await writeVideoState(projectId, video, project);
        if (saved) project = saved;
      }
    }
  }

  // Auto-seed storyboard from parsed link package so step 02 is never empty
  if (!video.storyboard?.shots?.length) {
    const pkg = readReferencePackage(project.content);
    if (pkg) {
      bootstrapAIProviders();
      const assets = await resolveLinkedAssets(project);
      const productionAssets = assets.filter((asset) => asset.autoBind);
      const mode = video.materialStrategy ?? "prefer_owned";
      const targetDurationSec =
        video.coverage?.targetDurationSec ??
        Math.max(12, Math.min(60, pkg.durationSec || 30));
      const coverage = fillOwnedCoverageWhenAiUnavailable(
        video.coverage ??
          analyzeMaterialCoverage({
            targetDurationSec,
            assets: productionAssets,
            mode,
          }),
        productionAssets,
        AIGateway.isAvailable("generateVideo"),
        AIGateway.isAvailable("generateImage")
      );
      const seeded = storyboardFromReferencePackage(
        pkg,
        coverage,
        productionAssets
      );
      video = {
        ...video,
        coverage,
        storyboard: seeded,
        jobStatus: "draft",
        jobMessage: `已从${pkg.platformLabel}解析结果写入 ${seeded.shots.length} 个分镜槽位，可编辑后生成时间线。`,
      };
      video.costEstimate = estimateVideoProductionCost(video);
      const saved = await writeVideoState(projectId, video, project);
      if (saved) project = saved;
      return { project, video };
    }
  }

  video.costEstimate = estimateVideoProductionCost(video);
  return { project, video };
}

export async function updateMaterialStrategy(
  projectId: string,
  options: {
    mode: MaterialStrategyMode;
    targetDurationSec: number;
    assets?: Array<{
      id: string;
      type: string;
      durationSec?: number | null;
      autoBind?: boolean;
    }>;
  }
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;

  const linkedAssets =
    options.assets ?? (await resolveLinkedAssets(loaded.project));
  const productionAssets = linkedAssets.filter(
    (asset) => asset.autoBind !== false
  );

  bootstrapAIProviders();
  const coverage = fillOwnedCoverageWhenAiUnavailable(
    analyzeMaterialCoverage({
      targetDurationSec: options.targetDurationSec,
      assets: productionAssets,
      mode: options.mode,
    }),
    productionAssets,
    AIGateway.isAvailable("generateVideo"),
    AIGateway.isAvailable("generateImage")
  );

  const video: VideoProjectState = {
    ...loaded.video,
    materialStrategy: options.mode,
    coverage,
    jobStatus: "draft",
    jobMessage: coverage.summary,
  };
  video.costEstimate = estimateVideoProductionCost(video);

  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function planStoryboard(
  projectId: string,
  targetDurationSec = 30
): Promise<{
  project: CreationProject;
  video: VideoProjectState;
  blocked?: string;
} | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;

  bootstrapAIProviders();
  const assets = await resolveLinkedAssets(loaded.project);
  const productionAssets = assets.filter((asset) => asset.autoBind);
  const hasOwnedVideo = productionAssets.some((a) => a.type === "video");
  // No owned video clips → prefer AI T2V for every narrative beat (not one still Ken Burns)
  const mode: MaterialStrategyMode =
    loaded.video.materialStrategy ??
    (hasOwnedVideo || !AIGateway.isAvailable("generateVideo")
      ? "prefer_owned"
      : "more_ai");
  const coverage = fillOwnedCoverageWhenAiUnavailable(
    analyzeMaterialCoverage({
      targetDurationSec,
      assets: productionAssets,
      mode,
    }),
    productionAssets,
    AIGateway.isAvailable("generateVideo"),
    AIGateway.isAvailable("generateImage")
  );

  const goal = loaded.project.goal || loaded.project.title || "短视频";
  const brief = loaded.project.brief ?? "";
  const signals = extractReferenceSignals(goal, brief);
  const content = (loaded.project.content ?? {}) as Record<string, unknown>;
  const scriptFields: Record<string, string> = {};
  for (const key of [
    "title",
    "hook",
    "opening",
    "body",
    "script",
    "content",
    "structure",
    "cta",
    "callToAction",
    "hashtags",
  ]) {
    const v = content[key];
    if (typeof v === "string" && v.trim()) scriptFields[key] = v.trim();
    else if (Array.isArray(v) && v.length)
      scriptFields[key] = v.map(String).join("，");
  }

  // Workspace / search context → storyboard analysis input
  let workspaceBrief = "";
  try {
    const { assembleCreationContext } = await import(
      "@/modules/create/services/context-assembler"
    );
    const assembled = await assembleCreationContext(loaded.project);
    workspaceBrief = (assembled.text || "").slice(0, 2200);
  } catch {
    /* optional */
  }

  const refPkg = readReferencePackage(content);
  let fromPackage = false;
  let storyboard = (() => {
    if (refPkg) {
      fromPackage = true;
      return storyboardFromReferencePackage(
        refPkg,
        coverage,
        productionAssets
      );
    }
    if (signals.isRecreate) {
      return createReferenceAlignedStoryboard({
        goal,
        brief,
        coverage,
        assets: productionAssets,
      });
    }
    return createDraftStoryboard({
      goal,
      coverage,
      assets: productionAssets,
      scriptFields,
    });
  })();

  // AI rewrite shot text when available — diversify every shot from script + workspace
  if (AIGateway.isAvailable("generateText")) {
    try {
      const plan = await AIGateway.generateText({
        system: [
          fromPackage || signals.isRecreate
            ? "你是版权安全「同款二创」分镜助手。禁止照抄原句、禁止要求原片画面。保持已有槽位顺序与角色节奏。"
            : "你是短视频分镜助手。根据口播文案与工作区资料，把每个镜头写成不同的画面/字幕/旁白。",
          "每个镜头必须有差异：禁止所有镜头复用同一句目标文案。",
          "若有工作区检索/研究报告，镜头画面描述要体现其中的关键证据、竞品差异或卖点，而不是空泛口号。",
          "按叙事推进：开场钩子 → 展开/对比 → 收尾互动。",
          '只输出 JSON：{"shots":[{"description":"画面","subtitle":"字幕","narration":"旁白","durationSec":3}]}',
          `镜头数量必须正好是 ${storyboard.shots.length} 个。`,
        ].join(""),
        prompt: [
          `目标：${goal}`,
          `标题：${scriptFields.title || "无"}`,
          `Hook：${scriptFields.hook || scriptFields.opening || "无"}`,
          `正文：${(scriptFields.body || scriptFields.script || "").slice(0, 800) || "无"}`,
          `结构：${scriptFields.structure || "无"}`,
          `CTA：${scriptFields.cta || scriptFields.callToAction || "无"}`,
          workspaceBrief
            ? `【工作区资料（检索/研究，用于分镜分析）】\n${workspaceBrief}`
            : "",
          fromPackage && refPkg
            ? [
                `参考分镜包（${refPkg.platformLabel}）：`,
                `标题：${refPkg.title ?? "无"}`,
                `文案：${(refPkg.caption ?? "").slice(0, 400) || "无"}`,
                `封面识别：${refPkg.coverVision ?? "无"}`,
                `结构线索：${refPkg.structureHints.join("；") || "无"}`,
                `槽位角色：${refPkg.shotSlots.map((s) => s.role).join(" → ")}`,
              ].join("\n")
            : signals.isRecreate
              ? [
                  `参考标题：${signals.title ?? "无"}`,
                  `参考文案：${signals.caption ?? "无"}`,
                  `话题：${signals.topics.join(" ") || "无"}`,
                ].join("\n")
              : "",
          `现有槽位（保持顺序与时长，只改写文案）：\n${JSON.stringify(
            storyboard.shots.map((s) => ({
              id: s.id,
              durationSec: s.durationSec,
              sourceType: s.sourceType,
              description: s.description,
            }))
          )}`,
        ]
          .filter(Boolean)
          .join("\n"),
        temperature: 0.4,
        maxTokens: 1800,
      });
      const match = plan.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { shots?: AiShotPlan[] };
        if (parsed.shots?.length) {
          storyboard = applyAiShotPlans(storyboard, parsed.shots);
        }
      }
    } catch {
      // keep deterministic diversified board
    }
  }

  // Re-bind after AI rewrite (assetIds preserved by applyAiShotPlans ideally)
  {
    const rebound = bindOwnedAssetsToStoryboard(storyboard, assets);
    if (rebound.rebound > 0) storyboard = rebound.storyboard;
  }
  storyboard = normalizeStoryboardDuration(storyboard, coverage.targetDurationSec);

  const video: VideoProjectState = {
    ...loaded.video,
    materialStrategy: mode,
    coverage,
    storyboard,
    jobStatus: "draft",
    jobMessage: fromPackage && refPkg
      ? `分镜已从链接解析包生成（${refPkg.platformLabel} · ${refPkg.shotSlots.length} 镜）：覆盖 ${coverage.existingCoverageSec}s，缺口 ${coverage.aiRequiredCoverageSec}s。可编辑后导出。`
      : workspaceBrief
        ? `分镜已结合工作区资料分析生成：覆盖 ${coverage.existingCoverageSec}s，缺口 ${coverage.aiRequiredCoverageSec}s。导出前将自动生成或绑定画面。`
        : signals.isRecreate
          ? `分镜已按参考链接生成（${signals.title || signals.awemeId || "已展开"}）：覆盖 ${coverage.existingCoverageSec}s，缺口 ${coverage.aiRequiredCoverageSec}s。`
          : `分镜已按口播结构拆分：覆盖 ${coverage.existingCoverageSec}s，缺口 ${coverage.aiRequiredCoverageSec}s。导出前将自动生成或绑定画面。`,
  };
  video.costEstimate = estimateVideoProductionCost(video);

  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function saveStoryboard(
  projectId: string,
  storyboard: Storyboard
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;
  const video: VideoProjectState = {
    ...loaded.video,
    storyboard: { ...storyboard, updatedAt: new Date().toISOString() },
  };
  video.costEstimate = estimateVideoProductionCost(video);
  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function buildTimelineFromStoryboard(
  projectId: string,
  aspectRatio: AspectRatio = "9:16"
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded?.video.storyboard) return null;

  const timeline = timelineFromStoryboard(
    loaded.video.storyboard,
    aspectRatio,
    loaded.video.timeline?.musicTrack
  );

  const video: VideoProjectState = {
    ...loaded.video,
    timeline,
    jobMessage: "时间线已根据分镜生成（Video / Image / Text / Music / Voice）。",
  };
  video.costEstimate = estimateVideoProductionCost(video);
  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function setAspectRatio(
  projectId: string,
  aspectRatio: AspectRatio
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;
  const timeline =
    loaded.video.timeline ??
    emptyTimeline(aspectRatio, loaded.video.coverage?.targetDurationSec ?? 30);
  timeline.aspectRatio = aspectRatio;
  timeline.updatedAt = new Date().toISOString();
  const video = { ...loaded.video, timeline };
  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function attachMusicTrack(
  projectId: string,
  musicTrack: NonNullable<TimelineDocument["musicTrack"]>
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;
  const timeline =
    loaded.video.timeline ??
    emptyTimeline("9:16", loaded.video.coverage?.targetDurationSec ?? 30);
  timeline.musicTrack = musicTrack;
  timeline.updatedAt = new Date().toISOString();
  const video = { ...loaded.video, timeline };
  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export async function regenerateScene(
  projectId: string,
  sceneId: string,
  opts?: { confirm?: boolean }
): Promise<{
  project?: CreationProject;
  video?: VideoProjectState;
  message: string;
  code: string;
}> {
  const loaded = await getVideoProject(projectId);
  if (!loaded?.video.timeline) {
    return { message: "请先生成时间线", code: "no_timeline" };
  }

  const scene: TimelineScene | undefined =
    loaded.video.timeline.videoTrack.scenes.find(
      (s: TimelineScene) => s.id === sceneId
    ) ||
    loaded.video.timeline.imageTrack.scenes.find(
      (s: TimelineScene) => s.id === sceneId
    );

  if (!scene) {
    return { message: "未找到镜头", code: "scene_not_found" };
  }

  if (scene.sourceType === "ai_video") {
    if (!opts?.confirm) {
      return {
        message: "高成本操作：请确认后再重新生成该 AI 镜头。",
        code: "confirm_required",
        video: {
          ...loaded.video,
          costEstimate: estimateVideoProductionCost(loaded.video),
        },
      };
    }
    try {
      const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
      if (!AIGateway.isAvailable("generateVideo")) {
        const video: VideoProjectState = {
          ...loaded.video,
          jobStatus: "blocked_ai_unavailable",
          jobMessage: `仅重新生成镜头 ${sceneId}。${UI.common.aiUnavailable}`,
        };
        const project = await writeVideoState(projectId, video, loaded.project);
        return {
          project: project ?? undefined,
          video,
          message: UI.common.aiUnavailable,
          code: "blocked_ai_unavailable",
        };
      }
      const durationSec = Math.max(1, scene.end - scene.start);
      const generated = await AIGateway.generateVideo({
        prompt:
          scene.prompt ||
          scene.text ||
          loaded.project.goal ||
          "补镜头",
        durationSec: Math.min(durationSec || 3, 8),
      });

      let assetId = generated.storageKey || scene.assetId || null;
      if (generated.url?.startsWith("http")) {
        try {
          const res = await fetch(generated.url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            const key = `ai_vid_${Date.now()}.mp4`;
            await fs.mkdir(path.dirname(assetStoragePath(key)), {
              recursive: true,
            });
            await fs.writeFile(assetStoragePath(key), buf);
            assetId = key;
          }
        } catch {
          assetId = generated.url;
        }
      }

      const timeline = regenerateSceneInTimeline(loaded.video.timeline, sceneId, {
        transition: scene.transition ?? "cut",
        prompt: scene.prompt || scene.text,
        assetId,
        sourceType: "ai_video",
      });
      const video: VideoProjectState = {
        ...loaded.video,
        timeline,
        jobStatus: "completed",
        jobMessage: `已仅重生成镜头 ${sceneId}（非整片）。`,
      };
      const project = await writeVideoState(projectId, video, loaded.project);
      return {
        project: project ?? undefined,
        video,
        message: video.jobMessage || "镜头已更新",
        code: "ok",
      };
    } catch (err) {
      const { CapabilityNotConfiguredError } = await import(
        "@/modules/ai/gateway/ai-gateway"
      );
      if (err instanceof CapabilityNotConfiguredError) {
        const video: VideoProjectState = {
          ...loaded.video,
          jobStatus: "blocked_ai_unavailable",
          jobMessage: `仅重新生成镜头 ${sceneId}。${UI.common.aiUnavailable}`,
        };
        const project = await writeVideoState(projectId, video, loaded.project);
        return {
          project: project ?? undefined,
          video,
          message: UI.common.aiUnavailable,
          code: "blocked_ai_unavailable",
        };
      }
      return {
        message: toUserErrorMessage(err, "镜头重生成失败，请稍后再试"),
        code: "ai_error",
      };
    }
  }

  const timeline = regenerateSceneInTimeline(loaded.video.timeline, sceneId, {
    transition: scene.transition ?? "cut",
  });
  const video: VideoProjectState = {
    ...loaded.video,
    timeline,
    jobMessage: `仅处理镜头 ${sceneId}，未重新生成整片。`,
  };
  const project = await writeVideoState(projectId, video, loaded.project);
  return {
    project: project ?? undefined,
    video,
    message: "已标记局部更新（非整片重生成）。",
    code: "ok",
  };
}

export async function requestAiFill(
  projectId: string,
  opts?: { confirm?: boolean; force?: boolean; allowImageFallback?: boolean }
): Promise<{ message: string; code: string; video?: VideoProjectState }> {
  let loaded = await getVideoProject(projectId);
  if (!loaded) return { message: "项目不存在", code: "not_found" };

  bootstrapAIProviders();

  // Prefer binding owned media before spending AI
  {
    const assets = await resolveLinkedAssets(loaded.project);
    if (
      !opts?.force &&
      loaded.video.storyboard &&
      assets.some((a) => a.type === "image" || a.type === "video")
    ) {
      const { storyboard, rebound } = bindOwnedAssetsToStoryboard(
        loaded.video.storyboard,
        assets
      );
      if (rebound > 0) {
        let timeline = loaded.video.timeline;
        if (timeline) {
          timeline = bindOwnedAssetsToTimeline(timeline, assets).timeline;
        } else {
          timeline = timelineFromStoryboard(
            storyboard,
            "9:16",
            loaded.video.timeline?.musicTrack
          );
        }
        const video: VideoProjectState = {
          ...loaded.video,
          storyboard,
          timeline,
          jobMessage: `已绑定 ${rebound} 个自有素材镜头。`,
        };
        await writeVideoState(projectId, video, loaded.project);
        loaded = (await getVideoProject(projectId)) ?? {
          ...loaded,
          video,
        };
      }
    }
  }

  const estimate = estimateVideoProductionCost(loaded.video);
  let storyboard = loaded.video.storyboard;
  if (!storyboard?.shots?.length) {
    return {
      message: "请先生成分镜",
      code: "no_storyboard",
      video: loaded.video,
    };
  }

  // force：清掉未标注「已生成」的绑定，允许重新 AI 补镜头
  if (opts?.force) {
    const cleared = storyboard.shots.map((s) => {
      if (s.notes?.includes("已生成")) return s;
      return {
        ...s,
        assetId: undefined,
        notes: undefined,
        sourceType: "ai_video" as const,
      };
    });
    storyboard = {
      ...storyboard,
      shots: cleared,
      updatedAt: new Date().toISOString(),
    };
    const timeline = timelineFromStoryboard(
      storyboard,
      loaded.video.timeline?.aspectRatio ?? "9:16",
      loaded.video.timeline?.musicTrack
    );
    await writeVideoState(
      projectId,
      {
        ...loaded.video,
        storyboard,
        timeline,
        // A forced regeneration invalidates the old render. Do not show a
        // previously exported still-image video as if it were the new result.
        previewUrl: null,
        exportUrl: null,
      },
      loaded.project
    );
    loaded = (await getVideoProject(projectId)) ?? loaded;
    storyboard = loaded.video.storyboard!;
  }

  const unbound = storyboard.shots.filter((s) => !s.assetId);
  if (unbound.length === 0) {
    return {
      message: "分镜画面已就绪，可直接导出。若要重做，请再点一次 AI 补镜头。",
      code: "no_gap",
      video: { ...loaded.video, costEstimate: estimate },
    };
  }

  if (!opts?.confirm) {
    return {
      message:
        estimate.message ||
        `将按分镜为 ${unbound.length} 个镜头生成 AI 画面`,
      code: "confirm_required",
      video: { ...loaded.video, costEstimate: estimate },
    };
  }

  const videoOk = AIGateway.isAvailable("generateVideo");
  const imageOk = AIGateway.isAvailable("generateImage");
  if (!videoOk && !imageOk) {
    const video: VideoProjectState = {
      ...loaded.video,
      jobStatus: "failed",
      jobMessage:
        "无法生成画面：请配置 AI 图片或视频能力，或在步骤 01 上传图片/视频素材后重新生成分镜。",
      costEstimate: estimate,
    };
    await writeVideoState(projectId, video, loaded.project);
    return {
      message: video.jobMessage || "",
      code: "ai_unavailable",
      video,
    };
  }

  try {
    const working: VideoProjectState = {
      ...loaded.video,
      jobStatus: "generating",
      jobMessage: `正在按分镜生成画面（0/${unbound.length}）…`,
    };
    await writeVideoState(projectId, working, loaded.project);

    type ShotFill = { assetId: string; asImage: boolean };
    const shotResults = new Map<string, ShotFill>();
    const generationErrors: unknown[] = [];
    let done = 0;
    const queue = unbound.slice(0, 12);
    const newAssetIds: string[] = [];

    for (const shot of queue) {
      const prompt = [
        shot.description,
        shot.narration ? `旁白感：${shot.narration}` : null,
        shot.subtitle ? `字幕：${shot.subtitle}` : null,
        loaded.project.goal ? `目标：${loaded.project.goal}` : null,
        "竖屏短视频画面，清晰主体，无水印无乱码文字",
      ]
        .filter(Boolean)
        .join("。")
        .slice(0, 500);

      let filled: ShotFill | null = null;

      // Prefer real T2V clips per shot. Do not pave the film with one Ken Burns still.
      if (videoOk) {
        for (let attempt = 0; attempt < 2 && !filled; attempt++) {
          try {
            const result = await AIGateway.generateVideo({
              prompt:
                (prompt || loaded.project.title || "短视频镜头") +
                (attempt > 0 ? "。动态镜头，主体运动，禁止静态壁纸感" : ""),
              durationSec: Math.min(Math.max(shot.durationSec || 3, 2), 8),
              aspectRatio: "9:16",
            });
            let assetId: string | null =
              (result as { storageKey?: string }).storageKey || null;
            const url = (result as { url?: string }).url;
            if (!assetId && url?.startsWith("http")) {
              const res = await fetch(url);
              if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                assetId = await persistGeneratedMedia({
                  projectId,
                  shotId: shot.id,
                  bytes: buf,
                  kind: "video",
                  mimeType: "video/mp4",
                  fileName: `ai_shot_${shot.id}.mp4`,
                });
              }
            } else if (assetId) {
              try {
                await fs.access(assetStoragePath(assetId));
              } catch {
                assetId = null;
              }
            }
            if (assetId) filled = { assetId, asImage: false };
          } catch (err) {
            generationErrors.push(err);
            console.error(
              "[requestAiFill] video shot failed",
              shot.id,
              "attempt",
              attempt,
              err
            );
          }
        }
      }

      // Image fallback only when T2V is not configured, or caller explicitly allows it.
      // Never use image fallback as the default path when Jimeng/video is on.
      const allowImage =
        Boolean(opts?.allowImageFallback) || (!videoOk && imageOk);
      if (!filled && allowImage && imageOk) {
        try {
          const result = await AIGateway.generateImage({
            prompt:
              (prompt || loaded.project.title || "短视频分镜画面") +
              `。镜头${shot.order || shot.id}专属画面，构图与前后镜明显不同`,
            size: "1024x1024",
            mode: "generate",
          });
          let bytes: Buffer | null = null;
          if (result.storageKey) {
            const candidates = [
              path.join(process.cwd(), ".nexa-data", "generated", result.storageKey),
              assetStoragePath(result.storageKey),
            ];
            for (const p of candidates) {
              try {
                bytes = await fs.readFile(/* turbopackIgnore: true */ p);
                if (bytes.length > 32) break;
              } catch {
                bytes = null;
              }
            }
          }
          if (!bytes && result.url?.startsWith("http")) {
            const res = await fetch(result.url);
            if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
          }
          if (!bytes && result.url?.startsWith("/")) {
            const name = result.url.replace(/^\/api\/ai\/files\//, "");
            try {
              bytes = await fs.readFile(
                path.join(process.cwd(), ".nexa-data", "generated", name)
              );
            } catch {
              bytes = null;
            }
          }
          if (bytes && bytes.length > 32) {
            const assetId = await persistGeneratedMedia({
              projectId,
              shotId: shot.id,
              bytes,
              kind: "image",
              mimeType: result.mimeType || "image/png",
              fileName: `ai_shot_${shot.id}.png`,
            });
            if (assetId) filled = { assetId, asImage: true };
          }
        } catch (err) {
          generationErrors.push(err);
          console.error("[requestAiFill] image shot failed", shot.id, err);
        }
      }

      if (filled) {
        shotResults.set(shot.id, filled);
        newAssetIds.push(filled.assetId);
      }

      done += 1;
      await writeVideoState(
        projectId,
        {
          ...working,
          jobMessage: `正在按分镜生成画面（${done}/${queue.length}）…`,
        },
        loaded.project
      );
    }

    if (newAssetIds.length) {
      const merged = [
        ...new Set([
          ...loaded.project.assets.map((a) => a.assetId),
          ...newAssetIds,
        ]),
      ];
      await setProjectAssets(projectId, merged);
      const refreshed = await getProject(projectId);
      if (refreshed) loaded = { ...loaded, project: refreshed };
    }

    const nextShots = storyboard.shots.map((s) => {
      const hit = shotResults.get(s.id);
      if (!hit) return s;
      return {
        ...s,
        assetId: hit.assetId,
        sourceType: hit.asImage
          ? ("image_animation" as const)
          : ("ai_video" as const),
        notes: hit.asImage ? "AI 图片画面已生成" : "AI 视频画面已生成",
      };
    });

    const nextStoryboard: Storyboard = {
      ...storyboard,
      shots: nextShots,
      updatedAt: new Date().toISOString(),
    };

    let nextTimeline = loaded.video.timeline;
    if (nextTimeline) {
      const patchScene = (scene: TimelineScene) => {
        const shot = nextShots.find((item) => item.id === scene.id);
        const hit =
          shotResults.get(scene.id) ||
          (shot?.assetId
            ? {
                assetId: shot.assetId,
                asImage: shot.sourceType === "image_animation",
              }
            : null);
        if (!hit) return scene;

        const isVideo = !hit.asImage;
        return {
          ...scene,
          assetId: hit.assetId,
          sourceType: isVideo
            ? ("ai_video" as const)
            : ("image_animation" as const),
          track: isVideo ? ("video" as const) : ("image" as const),
          animation: isVideo ? undefined : scene.animation ?? "kenburns",
        };
      };

      // A scene can start on the image track and later receive an AI MP4.
      // Rebuild the visual tracks so the media type controls rendering.
      const visualScenes = [
        ...nextTimeline.videoTrack.scenes,
        ...nextTimeline.imageTrack.scenes,
      ].map(patchScene);
      nextTimeline = {
        ...nextTimeline,
        videoTrack: {
          ...nextTimeline.videoTrack,
          scenes: visualScenes.filter((scene) => scene.track === "video"),
        },
        imageTrack: {
          ...nextTimeline.imageTrack,
          scenes: visualScenes.filter((scene) => scene.track === "image"),
        },
        updatedAt: new Date().toISOString(),
      };
    } else {
      nextTimeline = timelineFromStoryboard(
        nextStoryboard,
        "9:16",
        loaded.video.timeline?.musicTrack
      );
    }

    const attached = shotResults.size;
    const video: VideoProjectState = {
      ...loaded.video,
      storyboard: nextStoryboard,
      timeline: nextTimeline,
      lastGeneratedFingerprint: estimate.planFingerprint,
      jobStatus: attached > 0 ? "completed" : "failed",
      jobMessage:
        attached > 0
          ? `已生成 ${attached}/${queue.length} 个镜头画面（视频或图片动画），可导出成片。`
          : videoGenerationFailureMessage(generationErrors[0]),
      costEstimate: estimate,
    };
    await writeVideoState(projectId, video, loaded.project);
    return {
      message: video.jobMessage || "",
      code: attached > 0 ? "ok" : "ai_error",
      video,
    };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (err instanceof CapabilityNotConfiguredError) {
      const video: VideoProjectState = {
        ...loaded.video,
        jobStatus: "failed",
        jobMessage: "无法生成画面：请配置 AI 图片/视频能力，或上传自有素材。",
      };
      await writeVideoState(projectId, video, loaded.project);
      return {
        message: video.jobMessage || "",
        code: "ai_unavailable",
        video,
      };
    }
    return {
      message: toUserErrorMessage(err, "画面生成失败，请稍后再试"),
      code: "ai_error",
      video: loaded.video,
    };
  }
}

/**
 * 用每镜字幕（无字幕则旁白）合成 TTS，写入 voiceTrack.assetId，导出时混入成片。
 */
export async function requestSynthesizeVoice(
  projectId: string,
  opts?: { confirm?: boolean }
): Promise<{ message: string; code: string; video?: VideoProjectState }> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return { message: "项目不存在", code: "not_found" };
  if (!loaded.video.storyboard?.shots?.length) {
    return {
      message: "请先生成分镜",
      code: "no_storyboard",
      video: loaded.video,
    };
  }

  bootstrapAIProviders();
  if (!AIGateway.isAvailable("textToSpeech")) {
    return {
      message:
        "语音合成暂未接入。请配置 TTS 后重试，或导出时仅保留字幕烧录。",
      code: "ai_unavailable",
      video: loaded.video,
    };
  }

  const shots = loaded.video.storyboard.shots;
  const pending = shots.filter((s) => {
    const t = (s.subtitle || s.narration || "")
      .replace(/^旁白[：:]\s*/u, "")
      .trim();
    return Boolean(t);
  });
  if (!pending.length) {
    return {
      message: "分镜里没有可朗读的字幕/旁白，请先填写字幕。",
      code: "no_text",
      video: loaded.video,
    };
  }

  if (!opts?.confirm) {
    return {
      message: `将按字幕为 ${pending.length} 个镜头生成配音`,
      code: "confirm_required",
      video: loaded.video,
    };
  }

  try {
    await writeVideoState(
      projectId,
      {
        ...loaded.video,
        jobStatus: "generating",
        jobMessage: `正在根据字幕生成配音（0/${pending.length}）…`,
      },
      loaded.project
    );

    const existingMusic = loaded.video.timeline?.musicTrack;
    let timeline =
      loaded.video.timeline ||
      timelineFromStoryboard(
        loaded.video.storyboard,
        "9:16",
        existingMusic
      );

    // Rebuild voice scenes from current subtitles
    const voiceScenes: TimelineScene[] = [];
    let cursor = 0;
    for (const shot of shots) {
      const start = cursor;
      const end = cursor + (shot.durationSec || 3);
      cursor = end;
      const text = (shot.subtitle || shot.narration || "")
        .replace(/^旁白[：:]\s*/u, "")
        .trim();
      if (!text) continue;
      voiceScenes.push({
        id: `${shot.id}_voice`,
        track: "voice",
        start,
        end,
        sourceType: "voice",
        text,
      });
    }

    let done = 0;
    const dir = path.join(process.cwd(), ".nexa-data", "generated");
    await fs.mkdir(dir, { recursive: true });

    for (const scene of voiceScenes) {
      const text = (scene.text || "").trim();
      if (!text) continue;
      try {
        const result = await AIGateway.textToSpeech({ text });
        let storageKey = result.storageKey || null;
        if (!storageKey && result.url?.startsWith("http")) {
          const res = await fetch(result.url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            storageKey = `tts_${scene.id}_${Date.now()}.mp3`;
            await fs.writeFile(path.join(dir, storageKey), buf);
          }
        }
        if (!storageKey && result.url?.startsWith("/api/ai/files/")) {
          storageKey = result.url.replace(/^\/api\/ai\/files\//, "");
        }
        if (storageKey) {
          scene.assetId = storageKey;
        }
      } catch (err) {
        console.error("[requestSynthesizeVoice] shot failed", scene.id, err);
      }
      done += 1;
      await writeVideoState(
        projectId,
        {
          ...loaded.video,
          timeline: {
            ...timeline,
            voiceTrack: { id: "voice", scenes: voiceScenes },
          },
          jobStatus: "generating",
          jobMessage: `正在根据字幕生成配音（${done}/${voiceScenes.length}）…`,
        },
        loaded.project
      );
    }

    const attached = voiceScenes.filter((s) => s.assetId).length;
    timeline = {
      ...timeline,
      voiceTrack: { id: "voice", scenes: voiceScenes },
      updatedAt: new Date().toISOString(),
    };
    const video: VideoProjectState = {
      ...loaded.video,
      timeline,
      jobStatus: attached > 0 ? "completed" : "failed",
      jobMessage:
        attached > 0
          ? `已生成 ${attached}/${voiceScenes.length} 段配音（朗读字幕）。导出成片时会混入人声。`
          : "配音生成未成功，请检查 TTS 配置后重试。",
    };
    await writeVideoState(projectId, video, loaded.project);
    return {
      message: video.jobMessage || "",
      code: attached > 0 ? "ok" : "ai_error",
      video,
    };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (err instanceof CapabilityNotConfiguredError) {
      return {
        message: "语音合成暂未接入",
        code: "ai_unavailable",
        video: loaded.video,
      };
    }
    return {
      message: toUserErrorMessage(err, "配音生成失败"),
      code: "ai_error",
      video: loaded.video,
    };
  }
}

export async function requestRender(
  projectId: string,
  opts?: { confirm?: boolean; allowWithoutMusic?: boolean }
): Promise<{
  message: string;
  code: string;
  video?: VideoProjectState;
  logs?: string[];
}> {
  let loaded = await getVideoProject(projectId);
  if (!loaded?.video.timeline) {
    return { message: "请先完成分镜并生成时间线", code: "no_timeline" };
  }

  // Music is optional: export picture (+ voice) without BGM when none attached.
  // Do not hard-block the pipeline — callers may still pass allowWithoutMusic for clarity.
  void opts?.allowWithoutMusic;

  if (!opts?.confirm) {
    return {
      message: "确认后将按分镜生成缺失画面并导出成片。",
      code: "confirm_required",
      video: loaded.video,
    };
  }

  // Fix polluted projects: same asset recycled onto every shot → look like one still photo
  if (loaded.video.storyboard?.shots?.length) {
    const seen = new Set<string>();
    let cleared = 0;
    const shots = loaded.video.storyboard.shots.map((s) => {
      if (!s.assetId) return s;
      if (seen.has(s.assetId)) {
        cleared += 1;
        return {
          ...s,
          assetId: undefined,
          notes: undefined,
          sourceType: "ai_video" as const,
        };
      }
      seen.add(s.assetId);
      return s;
    });
    if (cleared > 0) {
      const storyboard = {
        ...loaded.video.storyboard,
        shots,
        updatedAt: new Date().toISOString(),
      };
      const timeline = timelineFromStoryboard(
        storyboard,
        loaded.video.timeline.aspectRatio || "9:16",
        loaded.video.timeline.musicTrack
      );
      await writeVideoState(
        projectId,
        {
          ...loaded.video,
          storyboard,
          timeline,
          jobMessage: `已解除 ${cleared} 个重复画面绑定，将为它们单独生成镜头…`,
        },
        loaded.project
      );
      loaded = (await getVideoProject(projectId)) ?? loaded;
    }
  }

  // Prefer owned media bind, then AI-fill remaining unbound shots
  const linkedBeforeFill = await resolveLinkedAssets(loaded.project);
  if (
    loaded.video.storyboard &&
    loaded.video.timeline &&
    linkedBeforeFill.length
  ) {
    const sb = bindOwnedAssetsToStoryboard(
      loaded.video.storyboard,
      linkedBeforeFill
    );
    const tl = bindOwnedAssetsToTimeline(
      loaded.video.timeline,
      linkedBeforeFill
    );
    if (sb.rebound > 0 || tl.rebound > 0) {
      await writeVideoState(
        projectId,
        {
          ...loaded.video,
          storyboard: sb.storyboard,
          timeline: tl.timeline,
          jobStatus: "rendering",
          jobMessage: "正在合成成片…",
        },
        loaded.project
      );
      loaded = (await getVideoProject(projectId)) ?? loaded;
    }
  }

  const unboundShots =
    loaded.video.storyboard?.shots?.filter((s) => !s.assetId) ?? [];
  const unboundScenes = [
    ...(loaded.video.timeline?.videoTrack.scenes ?? []),
    ...(loaded.video.timeline?.imageTrack.scenes ?? []),
  ].filter((s) => !s.assetId && s.sourceType !== "text");

  if (unboundShots.length > 0 || unboundScenes.length > 0) {
    const fill = await requestAiFill(projectId, { confirm: true });
    if (fill.code !== "ok" && fill.code !== "no_gap") {
      return {
        message:
          fill.message ||
          "画面尚未生成完成，无法导出。请重试生成或上传素材。",
        code: fill.code,
        video: fill.video,
      };
    }
    loaded = (await getVideoProject(projectId)) ?? loaded;
    if (!loaded?.video.timeline) {
      return { message: "时间线丢失，请重新生成", code: "no_timeline" };
    }
  }

  // Auto TTS from subtitles when voice track has text but no audio yet
  bootstrapAIProviders();
  const voiceNeedsAudio = (
    loaded.video.timeline?.voiceTrack?.scenes ?? []
  ).some((s) => (s.text || "").trim() && !s.assetId);
  const storyboardNeedsVoice = (
    loaded.video.storyboard?.shots ?? []
  ).some((s) => (s.subtitle || s.narration || "").trim());
  if (
    (voiceNeedsAudio || storyboardNeedsVoice) &&
    AIGateway.isAvailable("textToSpeech")
  ) {
    const voice = await requestSynthesizeVoice(projectId, { confirm: true });
    if (voice.video) {
      loaded = (await getVideoProject(projectId)) ?? {
        ...loaded,
        video: voice.video,
      };
    }
  }

  if (!loaded.video.timeline) {
    return { message: "请先完成分镜并生成时间线", code: "no_timeline" };
  }

  const videoWorking: VideoProjectState = {
    ...loaded.video,
    jobStatus: "rendering",
    jobMessage: "正在合成成片…",
  };
  await writeVideoState(projectId, videoWorking, loaded.project);

  const workDir = path.join(process.cwd(), ".nexa-data", "renders", projectId);
  const linkedAssets = await resolveLinkedAssets(loaded.project);
  const { timeline: boundTimeline, rebound } = bindOwnedAssetsToTimeline(
    loaded.video.timeline,
    linkedAssets
  );
  if (rebound > 0) {
    await writeVideoState(
      projectId,
      {
        ...videoWorking,
        timeline: boundTimeline,
        jobMessage: "正在合成成片…",
      },
      loaded.project
    );
  }

  // Never succeed with black synthetic placeholders — require real media
  const result = await renderTimeline(boundTimeline, workDir, {
    projectId,
    allowSyntheticForMissing: false,
    resolveAssetPath: async (assetId: string) => {
      const owned = await getOwnedAsset(assetId);
      if (owned) {
        try {
          const p = assetStoragePath(owned.storageKey);
          await fs.access(p);
          return p;
        } catch {
          return null;
        }
      }
      try {
        const p = assetStoragePath(assetId);
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    },
  });

  const previewUrl =
    result.previewRelativeUrl ||
    (result.ok
      ? `/api/video/render/file/${encodeURIComponent(projectId)}`
      : null);

  const video: VideoProjectState = {
    ...videoWorking,
    timeline: boundTimeline,
    jobStatus: result.status === "completed" ? "completed" : "failed",
    jobMessage: result.ok
      ? "成片已导出，可在下方预览播放。"
      : result.errorMessage ??
        "导出失败：镜头缺少可播放画面，请先生成 AI 画面或上传素材。",
    exportUrl: previewUrl,
    previewUrl,
  };
  await writeVideoState(projectId, video, loaded.project);

  return {
    message: video.jobMessage || "",
    code: result.status,
    video,
    logs: result.logs,
  };
}

export async function updatePlayhead(
  projectId: string,
  playheadSec: number
): Promise<VideoProjectState | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded) return null;
  const video = { ...loaded.video, playheadSec };
  await writeVideoState(projectId, video, loaded.project);
  return video;
}

export async function deleteScene(
  projectId: string,
  sceneId: string
): Promise<{ project: CreationProject; video: VideoProjectState } | null> {
  const loaded = await getVideoProject(projectId);
  if (!loaded?.video.timeline) return null;
  const t = loaded.video.timeline;
  const filter = <T extends { id: string }>(arr: T[]) =>
    arr.filter((s) => s.id !== sceneId && s.id !== `${sceneId}_sub`);
  const timeline: TimelineDocument = {
    ...t,
    videoTrack: { ...t.videoTrack, scenes: filter(t.videoTrack.scenes) },
    imageTrack: { ...t.imageTrack, scenes: filter(t.imageTrack.scenes) },
    textTrack: { ...t.textTrack, scenes: filter(t.textTrack.scenes) },
    voiceTrack: { ...t.voiceTrack, scenes: filter(t.voiceTrack.scenes) },
    updatedAt: new Date().toISOString(),
  };
  const video = { ...loaded.video, timeline };
  const project = await writeVideoState(projectId, video, loaded.project);
  return project ? { project, video } : null;
}

export type { VideoJobStatus };
