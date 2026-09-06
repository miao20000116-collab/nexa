/**
 * Reference storyboard package — structured handoff from social ingest
 * into video step 02. Persisted on CreationProject.content.__referenceStoryboard.
 *
 * Industry pattern (Cutto / ViralShorts / frame extractors):
 * link → meta + cover frame + beat slots → storyboard → generate with own assets.
 * We store cover URL + slots as data; own assets / AI fill the pixels later.
 */

import type { SocialIngestResult } from "@/modules/create/services/social-recreate";
import type {
  MaterialCoverage,
  Storyboard,
  StoryboardShot,
} from "@/modules/video/types";
import type { OwnedAssetDurationInput } from "@/modules/video/material-strategy";

export const REFERENCE_STORYBOARD_KEY = "__referenceStoryboard";

export type ReferenceShotRole =
  | "hook"
  | "develop"
  | "contrast_a"
  | "contrast_b"
  | "showcase"
  | "close";

export type ReferenceShotSlot = {
  id: string;
  order: number;
  role: ReferenceShotRole | string;
  durationHintSec: number;
  visualHint: string;
  subtitleHint: string;
  narrationHint: string;
  /** Slot may cite cover as visual cue (not as owned render source). */
  coverAsPreview?: boolean;
};

export type ReferenceStoryboardPackage = {
  version: 1;
  platform: string;
  platformLabel: string;
  canonicalUrl: string;
  awemeId?: string | null;
  title: string | null;
  caption: string | null;
  author: string | null;
  topics: string[];
  coverUrl: string | null;
  coverVision: string | null;
  durationSec: number | null;
  structureHints: string[];
  shotSlots: ReferenceShotSlot[];
  parseStatus: string;
  parseMethod?: string;
  ingestedAt: string;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Build differentiated beat slots from ingest (+ optional cover vision). */
export function buildReferenceStoryboardPackage(
  ingest: SocialIngestResult,
  opts?: { coverVision?: string | null }
): ReferenceStoryboardPackage {
  const title = ingest.title?.trim() || null;
  const caption = ingest.briefSnippet?.trim() || null;
  const coverVision = opts?.coverVision?.trim() || null;
  const topics = ingest.topics ?? [];
  const hints = [...(ingest.structureHints ?? [])];
  if (coverVision && !hints.some((h) => h.includes("封面"))) {
    hints.unshift(`封面画面线索：${clip(coverVision, 120)}`);
  }

  const totalSec = Math.max(12, Math.min(60, ingest.durationSec || 30));
  const blob = `${title || ""}\n${caption || ""}\n${hints.join("\n")}`;
  const isContrast = /南北|对比|差异|PK|vs\.?/i.test(blob);

  const slots: ReferenceShotSlot[] = [];
  let order = 1;
  const push = (
    role: ReferenceShotRole | string,
    durationHintSec: number,
    visualHint: string,
    subtitleHint: string,
    narrationHint: string,
    coverAsPreview?: boolean
  ) => {
    slots.push({
      id: `ref_slot_${order}`,
      order,
      role,
      durationHintSec: round1(durationHintSec),
      visualHint,
      subtitleHint: clip(subtitleHint, 48),
      narrationHint: clip(narrationHint, 80),
      coverAsPreview,
    });
    order += 1;
  };

  const hookText =
    hints.find((h) => /钩子|开场/.test(h))?.replace(/^[^：:]*[：:]\s*/, "") ||
    caption?.slice(0, 60) ||
    title ||
    "开场抓住注意力";

  push(
    "hook",
    Math.max(3, totalSec * 0.15),
    coverVision
      ? `开场画面对齐封面：${clip(coverVision, 90)}`
      : `开场钩子构图（参考封面风格）${title ? ` · 「${clip(title, 24)}」` : ""}`,
    hookText,
    `旁白：${hookText}`,
    Boolean(ingest.coverUrl)
  );

  if (isContrast) {
    const north =
      hints.find((h) => /北/.test(h)) ||
      "北方做法：重口 / 大火 / 典型调料特写";
    const south =
      hints.find((h) => /南/.test(h)) ||
      "南方做法：清淡 / 细切 / 与北方对照";
    push(
      "contrast_a",
      totalSec * 0.25,
      north.replace(/^[^：:]*[：:]\s*/, "") || north,
      "北方这样炒",
      "旁白：先看北方怎么做"
    );
    push(
      "contrast_b",
      totalSec * 0.25,
      south.replace(/^[^：:]*[：:]\s*/, "") || south,
      "南方不一样",
      "旁白：南方又是另一套"
    );
    push(
      "develop",
      totalSec * 0.2,
      "分屏或快切对比：南北关键差异一眼可见",
      "一眼看出差别",
      "旁白：差别就在这几步"
    );
  } else {
    const developHints = hints
      .filter((h) => !/钩子|开场|版权|默认节奏|封面/.test(h))
      .slice(0, 3);
    if (developHints.length >= 2) {
      for (const h of developHints) {
        const text = h.replace(/^[^：:]*[：:]\s*/, "");
        push(
          "develop",
          totalSec / (developHints.length + 1),
          `中段画面：${clip(text, 90)}`,
          clip(text, 48),
          `旁白：${clip(text, 60)}`
        );
      }
    } else {
      const topicLine = topics.length
        ? `围绕 ${topics
            .slice(0, 3)
            .map((t) => `#${t}`)
            .join(" ")} 展开`
        : `展开「${clip(title || "主题", 28)}」`;
      push(
        "develop",
        totalSec * 0.35,
        `${topicLine}；用自有素材承接参考节奏`,
        topicLine.slice(0, 48),
        caption
          ? `旁白改写：${clip(caption, 50)}`
          : `旁白：${topicLine}`
      );
      push(
        "showcase",
        totalSec * 0.2,
        "角色/产品特写：自有形象入画，承接参考情绪",
        "自有形象入画",
        "旁白：这是我的主角画面"
      );
    }
  }

  push(
    "close",
    Math.max(3, totalSec * 0.12),
    "收尾互动：引导评论/关注，画面留字幕安全区",
    topics[0] ? `你怎么看 #${topics[0]}？` : "评论区聊聊你的看法",
    "旁白：互动收尾，欢迎同款讨论"
  );

  // Normalize durations to totalSec
  const sum = slots.reduce((s, x) => s + x.durationHintSec, 0) || 1;
  for (const slot of slots) {
    slot.durationHintSec = round1(
      (slot.durationHintSec / sum) * totalSec
    );
  }

  return {
    version: 1,
    platform: ingest.platform,
    platformLabel: ingest.platformLabel,
    canonicalUrl: ingest.canonicalUrl || ingest.url,
    awemeId: ingest.awemeId,
    title,
    caption,
    author: ingest.author,
    topics,
    coverUrl: ingest.coverUrl,
    coverVision,
    durationSec: ingest.durationSec,
    structureHints: hints.slice(0, 12),
    shotSlots: slots,
    parseStatus: ingest.parseStatus,
    parseMethod: ingest.parseMethod,
    ingestedAt: new Date().toISOString(),
  };
}

/** Expand package slots into a Storyboard bound to owned assets / AI gaps. */
export function storyboardFromReferencePackage(
  pkg: ReferenceStoryboardPackage,
  coverage: MaterialCoverage,
  assets?: OwnedAssetDurationInput[]
): Storyboard {
  const videoAssets = (assets ?? []).filter((a) => a.type === "video");
  const imageAssets = (assets ?? []).filter((a) => a.type === "image");
  let videoIdx = 0;
  let imageIdx = 0;
  let remainV = coverage.ownedVideoSec;
  let remainI = coverage.imageAnimationSec;

  const shots: StoryboardShot[] = pkg.shotSlots.map((slot, i) => {
    let sourceType: StoryboardShot["sourceType"] = "ai_video";
    let assetId: string | null = null;
    const dur = Math.max(1, slot.durationHintSec);

    // Bind each owned asset at most once. Remaining slots stay ai_video (T2V).
    if (videoIdx < videoAssets.length && remainV > 0.05) {
      sourceType = "owned_video";
      assetId = videoAssets[videoIdx++]?.id ?? null;
      remainV -= dur;
    } else if (imageIdx < imageAssets.length && remainI > 0.05) {
      sourceType = "image_animation";
      assetId = imageAssets[imageIdx++]?.id ?? null;
      remainI -= dur;
    }
    // else: ai_video unbound — requestAiFill will T2V each shot

    return {
      id: slot.id || `shot_${i + 1}`,
      order: slot.order || i + 1,
      durationSec: round1(dur),
      description: slot.visualHint,
      sourceType,
      assetId,
      subtitle: slot.subtitleHint,
      narration: slot.narrationHint,
    };
  });

  return {
    script: [
      `【参考分镜包】${pkg.platformLabel}`,
      pkg.title ? `主题：${pkg.title}` : null,
      pkg.coverVision ? `封面识别：${clip(pkg.coverVision, 100)}` : null,
      `已按解析结果拆成 ${shots.length} 镜；用自有素材承接，可编辑后导出。`,
    ]
      .filter(Boolean)
      .join("\n"),
    shots,
    musicStrategy:
      "Music Track 必需。优先级：①用户上传 ②合法曲库 ③AI Music。禁止抓取版权音乐。",
    subtitleStyle: "底部安全区，简体中文",
    narrationNotes:
      "旁白来自链接解析槽位，非原片口播；可改。封面仅作视觉线索。",
    updatedAt: new Date().toISOString(),
  };
}

export function readReferencePackage(
  content: unknown
): ReferenceStoryboardPackage | null {
  if (!content || typeof content !== "object") return null;
  const pkg = (content as Record<string, unknown>)[REFERENCE_STORYBOARD_KEY];
  if (!pkg || typeof pkg !== "object") return null;
  const p = pkg as ReferenceStoryboardPackage;
  if (p.version !== 1 || !Array.isArray(p.shotSlots) || !p.shotSlots.length) {
    return null;
  }
  return p;
}
