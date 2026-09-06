/**
 * Build storyboard grounded on Douyin/XHS/TikTok recreate brief —
 * not generic filler. Own assets supply faces/visuals; reference supplies structure.
 */

import type { MaterialCoverage, Storyboard, StoryboardShot } from "./types";
import type { OwnedAssetDurationInput } from "./material-strategy";

export type ReferenceSignals = {
  title: string | null;
  caption: string | null;
  topics: string[];
  structureHints: string[];
  awemeId: string | null;
  canonicalUrl: string | null;
  isRecreate: boolean;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Pull recreate signals from goal + copyright-safe brief. */
export function extractReferenceSignals(
  goal: string,
  brief: string
): ReferenceSignals {
  const blob = `${goal}\n${brief}`;
  const isRecreate =
    /同款二创|参考链接|参考文案|aweme|作品 ID|真实链接|分享口令/i.test(blob);

  const title =
    blob.match(/参考标题[^：:]*[：:]\s*(.+)/)?.[1]?.trim().split("\n")[0] ??
    blob.match(/根据「([^」]{2,80})」/)?.[1]?.trim() ??
    null;

  let caption: string | null = null;
  const captionBlock = blob.match(
    /参考文案线索[^：:]*[：:]\s*\n?([\s\S]+?)(?:\n二创规则|\n【用户补充|$)/
  );
  if (captionBlock?.[1]) {
    caption = captionBlock[1]
      .replace(/^分享口令(?:文案|补充)[：:]\s*/gm, "")
      .replace(/^真实链接[：:].+$/gm, "")
      .replace(/^作品 ID[：:].+$/gm, "")
      .replace(/^原作者.+$/gm, "")
      .replace(/^话题[：:].+$/gm, "")
      .replace(/^结构线索[：:][\s\S]*$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
    if (caption.length < 4) caption = null;
  }
  if (!caption) {
    const paste = blob.match(/分享口令(?:文案|补充)[：:]\s*(.+)/)?.[1]?.trim();
    if (paste && paste.length >= 4) caption = paste.slice(0, 200);
  }
  if (!caption) {
    // Walk / manual briefs: "参考：…看看【x】caption #tag … https://"
    const refLine = blob.match(/参考[：:]\s*(.+)/)?.[1]?.trim();
    if (refLine) {
      const fromShare = refLine
        .replace(/^\d+(?:\.\d+)?\s*/, "")
        .replace(/^复制打开抖音[，,\s]*/i, "")
        .replace(/看看【[^】]*】\s*/i, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\s+[a-zA-Z0-9@./:\-]{3,}\s*$/g, "")
        .trim();
      if (fromShare.length >= 4) caption = fromShare.slice(0, 200);
    }
  }

  const topics = [
    ...new Set(
      [
        ...(blob.match(/#[\s]*[\w\u4e00-\u9fff]+/g) ?? []).map((t) =>
          t.replace(/^#\s*/, "").slice(0, 30)
        ),
        ...(blob.match(/话题方向[：:]\s*(.+)/)?.[1]?.match(
          /[\w\u4e00-\u9fff]{2,20}/g
        ) ?? []),
      ].filter(Boolean)
    ),
  ].slice(0, 8);

  const structureHints = (
    blob.match(/结构线索[：:]\s*\n((?:[-•].+\n?)+)/)?.[1] ?? ""
  )
    .split("\n")
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  const coverVision = blob
    .match(/封面画面识别[^：:]*[：:]\s*\n?([\s\S]+?)(?:\n二创规则|\n【|$)/)?.[1]
    ?.trim()
    .slice(0, 300);
  if (coverVision && !structureHints.some((h) => h.includes("封面"))) {
    structureHints.unshift(`封面画面线索：${coverVision.slice(0, 100)}`);
  }

  const awemeId = blob.match(/作品 ID[：:]\s*(\d{8,})/)?.[1] ?? null;
  const canonicalUrl =
    blob.match(/真实链接[：:]\s*(https?:\/\/\S+)/)?.[1] ??
    blob.match(/参考链接[^：:]*[：:]\s*(https?:\/\/\S+)/)?.[1] ??
    null;

  return {
    title,
    caption: caption?.slice(0, 400) ?? null,
    topics,
    structureHints,
    awemeId,
    canonicalUrl,
    isRecreate,
  };
}

/** Rewrite reference caption into original subtitle (not verbatim copy). */
function rewriteHook(caption: string | null, title: string | null): string {
  const raw = (caption || title || "").replace(/#\s*[\w\u4e00-\u9fff]+/g, "").trim();
  if (!raw) return "开头留住注意力";
  // Soft rewrite: keep intent, change wording
  if (/是否|会不会|要不要/.test(raw)) {
    const core = raw.replace(/[？?。.!！…]+$/g, "").slice(0, 36);
    return `${core}？——用自己的故事回答`;
  }
  return `开场钩子（改写）：${raw.slice(0, 40)}`;
}

function topicLine(topics: string[]): string {
  if (!topics.length) return "中段展开主题";
  return `围绕 ${topics
    .slice(0, 3)
    .map((t) => `#${t}`)
    .join(" ")} 展开`;
}

type Beat = {
  role: "hook" | "develop" | "showcase" | "close";
  description: string;
  subtitle: string;
  narration: string;
  weight: number;
};

function buildBeats(signals: ReferenceSignals, goal: string): Beat[] {
  const hookSub = rewriteHook(signals.caption, signals.title);
  const topicSub = topicLine(signals.topics);
  const titleBit = signals.title ? `「${signals.title}」结构` : "参考结构";

  return [
    {
      role: "hook",
      weight: 1.2,
      description: `开场钩子镜头（对齐${titleBit}）：用自有形象抓住前 3 秒，情绪/问题向参考靠拢，勿用原片画面`,
      subtitle: hookSub.slice(0, 48),
      narration: signals.caption
        ? `旁白改写开场：${signals.caption.replace(/#\s*[\w\u4e00-\u9fff]+/g, "").trim().slice(0, 40)}`
        : `旁白：${goal.slice(0, 40)}`,
    },
    {
      role: "develop",
      weight: 1.4,
      description: `中段展开（对齐参考话题/节奏）：${topicSub}${
        signals.structureHints[0] ? `；${signals.structureHints[0]}` : ""
      }。画面用自有素材，禁止原声原文`,
      subtitle: topicSub.slice(0, 48),
      narration: signals.topics.length
        ? `旁白：带入 ${signals.topics.slice(0, 2).join("、")} 的情境`
        : "旁白：按参考节奏推进故事",
    },
    {
      role: "showcase",
      weight: 1.2,
      description:
        "角色/产品特写：用上传的自有形象完成视觉锚点（水彩立绘等），承接参考情绪但换脸换画面",
      subtitle: "自有形象入画",
      narration: "旁白：这是我的主角，不是原作者形象",
    },
    {
      role: "close",
      weight: 1,
      description: `收尾互动：呼应参考话题方向，引导关注/评论；结构对齐同款，文案原创`,
      subtitle: signals.topics[0]
        ? `你怎么看 #${signals.topics[0]}？`
        : "评论区聊聊你的看法",
      narration: "旁白：互动收尾，欢迎同款二创讨论",
    },
  ];
}

function allocateDurations(
  beats: Beat[],
  totalSec: number
): number[] {
  const sumW = beats.reduce((s, b) => s + b.weight, 0) || 1;
  const raw = beats.map((b) => (totalSec * b.weight) / sumW);
  // Ensure each beat >= 2s when total allows
  const min = totalSec >= beats.length * 2 ? 2 : 1;
  const durations = raw.map((d) => Math.max(min, d));
  let drift = totalSec - durations.reduce((a, b) => a + b, 0);
  // Distribute drift to largest slots
  let i = 0;
  while (Math.abs(drift) > 0.05 && i < 40) {
    const idx = i % durations.length;
    const next = durations[idx] + (drift > 0 ? 0.1 : -0.1);
    if (next >= min) {
      durations[idx] = next;
      drift = totalSec - durations.reduce((a, b) => a + b, 0);
    }
    i += 1;
  }
  return durations.map(round1);
}

/**
 * Deterministic storyboard aligned to reference signals.
 * Used when AI text is off, or as fallback after AI parse failure.
 */
export function createReferenceAlignedStoryboard(options: {
  goal: string;
  brief?: string | null;
  coverage: MaterialCoverage;
  assets?: OwnedAssetDurationInput[];
}): Storyboard {
  const signals = extractReferenceSignals(
    options.goal,
    options.brief ?? ""
  );
  const shots: StoryboardShot[] = [];
  let order = 1;

  const videoAssets = (options.assets ?? []).filter((a) => a.type === "video");
  const imageAssets = (options.assets ?? []).filter((a) => a.type === "image");
  let videoIdx = 0;
  let imageIdx = 0;

  const push = (
    durationSec: number,
    sourceType: StoryboardShot["sourceType"],
    description: string,
    assetId: string | null,
    subtitle: string,
    narration: string
  ) => {
    if (durationSec <= 0) return;
    shots.push({
      id: `shot_${order}`,
      order,
      durationSec: round1(durationSec),
      description,
      sourceType,
      assetId,
      subtitle,
      narration,
    });
    order += 1;
  };

  let remainingVideo = options.coverage.ownedVideoSec;
  let remainingImages = options.coverage.imageAnimationSec;
  let remainingAi = options.coverage.aiVideoNeededSec;

  while (remainingVideo > 0.05) {
    const chunk = Math.min(remainingVideo, 5);
    const asset = videoAssets[videoIdx++];
    push(
      chunk,
      "owned_video",
      signals.isRecreate
        ? `自有视频素材承接参考节奏：${signals.title || options.goal}`
        : `使用已有视频素材：${options.goal}`,
      asset?.id ?? null,
      rewriteHook(signals.caption, signals.title).slice(0, 48),
      signals.caption
        ? `旁白改写：${signals.caption.slice(0, 36)}`
        : `旁白：${options.goal.slice(0, 36)}`
    );
    remainingVideo -= chunk;
  }

  const imageBudget = remainingImages;
  if (signals.isRecreate && imageBudget > 0.05) {
    const beats = buildBeats(signals, options.goal);
    const durations = allocateDurations(beats, imageBudget);
    beats.forEach((beat, i) => {
      const asset = imageAssets[imageIdx % Math.max(imageAssets.length, 1)];
      if (imageAssets.length) imageIdx += 1;
      push(
        durations[i] ?? 3,
        "image_animation",
        beat.description,
        asset?.id ?? null,
        beat.subtitle,
        beat.narration
      );
    });
    remainingImages = 0;
  } else {
    while (remainingImages > 0.05) {
      const chunk = Math.min(remainingImages, 3);
      const asset = imageAssets[imageIdx % Math.max(imageAssets.length, 1)];
      if (imageAssets.length) imageIdx += 1;
      push(
        chunk,
        "image_animation",
        `图片动画镜头：${options.goal}`,
        asset?.id ?? null,
        `${options.goal} · 画面展示`,
        "旁白：看这张图"
      );
      remainingImages -= chunk;
    }
  }

  while (remainingAi > 0.05) {
    const chunk = Math.min(remainingAi, 5);
    push(
      chunk,
      "ai_video",
      signals.isRecreate
        ? `待补 AI 镜头（对齐参考结构，勿复刻原片）：${signals.title || options.goal}`
        : `待补 AI 镜头：${options.goal}`,
      null,
      rewriteHook(signals.caption, signals.title).slice(0, 48),
      "旁白：补充说明"
    );
    remainingAi -= chunk;
  }

  if (shots.length === 0) {
    push(
      options.coverage.targetDurationSec,
      "ai_video",
      `待规划镜头：${options.goal}`,
      null,
      options.goal.slice(0, 48),
      `旁白：${options.goal}`
    );
  }

  const refLine = signals.isRecreate
    ? `严格依据参考（${signals.title || signals.awemeId || "已解析链接"}）规划节奏与话题；字幕/旁白为原创改写，画面仅用自有素材。`
    : `围绕「${options.goal}」组织短视频。`;

  return {
    script: `${refLine} 目标时长约 ${options.coverage.targetDurationSec} 秒；已有覆盖 ${options.coverage.existingCoverageSec} 秒。${
      signals.caption ? `参考线索摘要：${signals.caption.slice(0, 80)}` : ""
    }`,
    shots,
    musicStrategy:
      "Music Track 必需。优先级：①用户上传 ②合法曲库 ③AI Music。禁止抓取版权音乐与平台原声。",
    subtitleStyle: "底部安全区，简体中文；不得照抄参考原文案",
    narrationNotes: "旁白须原创改写参考情绪与话题，禁止原句搬运。",
    updatedAt: new Date().toISOString(),
  };
}

export type AiShotPlan = {
  description: string;
  subtitle: string;
  narration: string;
  durationSec?: number;
};

/** Merge AI-planned shot text onto coverage-backed slots (keeps asset binding). */
export function applyAiShotPlans(
  base: Storyboard,
  plans: AiShotPlan[]
): Storyboard {
  if (!plans.length) return base;
  const shots = base.shots.map((shot, i) => {
    const plan = plans[i] ?? plans[plans.length - 1];
    if (!plan) return shot;
    return {
      ...shot,
      description: plan.description?.trim() || shot.description,
      subtitle: plan.subtitle?.trim() || shot.subtitle,
      narration: plan.narration?.trim() || shot.narration,
      durationSec:
        typeof plan.durationSec === "number" && plan.durationSec > 0
          ? round1(plan.durationSec)
          : shot.durationSec,
    };
  });
  return {
    ...base,
    shots,
    script: `AI 按参考链接线索改写分镜。${base.script}`,
    updatedAt: new Date().toISOString(),
  };
}
