/**
 * Media recognition for workspace ingest — aligned with creation recreate/storyboard.
 *
 * Product rules:
 * - Do NOT download platform original video/audio bytes.
 * - DO recognize: share meta (title/caption/topics), cover frame via vision,
 *   and structure hints in the same shape as `buildCopyrightSafeBrief` /
 *   `extractReferenceSignals` so 二次创作 can ground on real signals.
 *
 * Use case e.g. 「南北方西红柿炒鸡蛋差异」: need topic + hook + visual cues
 * from the reference, not a bare URL snippet.
 */

import { detectSocialLink } from "@/lib/social-link";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  ingestSocialLink,
  type SocialIngestResult,
} from "@/modules/create/services/social-recreate";
import type { IngestPayload } from "@/modules/workspace/services/source-ingest-store";
import {
  analyzeRemoteVideoReference,
  type RemoteVideoAnalysis,
} from "@/modules/workspace/services/remote-video-analysis";

const RECOGNITION_VERSION = "识别版本:v1";
const VISION_PROMPT = `你是短视频/图文二创分镜分析师。根据封面图，用中文输出：
1) 画面主体与场景（食材、人物、环境）
2) 构图/镜头感觉（特写、对比、字幕区等）
3) 可迁移的风格线索（色调、信息密度、对比手法）
4) 3-6 个标签
不要臆造看不见的口播全文；信息不足就写「封面信息有限」。100–180 字。`;

export function isMediaRecognitionComplete(mediaSummary?: string | null): boolean {
  return Boolean(mediaSummary && mediaSummary.includes(RECOGNITION_VERSION));
}

async function analyzeCover(
  coverUrl: string | null | undefined,
  context: { title?: string | null; caption?: string | null }
): Promise<string | null> {
  if (!coverUrl?.trim()) return null;
  try {
    bootstrapAIProviders();
    if (!AIGateway.isAvailable("analyzeImage")) return null;
    const hint = [
      context.title ? `标题：${context.title}` : null,
      context.caption ? `文案线索：${context.caption.slice(0, 240)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const result = await AIGateway.analyzeImage({
      url: coverUrl,
      prompt: hint ? `${VISION_PROMPT}\n\n已知信息：\n${hint}` : VISION_PROMPT,
    });
    const summary =
      typeof result === "object" && result && "summary" in result
        ? String((result as { summary?: string }).summary || "").trim()
        : "";
    return summary ? summary.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Distill structure beats for storyboard — same language as recreate flow. */
async function distillStructureHints(input: {
  title?: string | null;
  caption?: string | null;
  coverVision?: string | null;
  topics?: string[];
  platformLabel?: string;
}): Promise<string[]> {
  const blob = [
    input.title,
    input.caption,
    input.coverVision,
    input.topics?.length ? `话题：${input.topics.join(" ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  if (blob.replace(/\s/g, "").length < 20) return [];

  bootstrapAIProviders();
  if (!AIGateway.isAvailable("summarize")) {
    return heuristicStructure(input);
  }

  try {
    const text = await AIGateway.summarize(
      blob.slice(0, 3500),
      `你是短视频分镜分析师（${input.platformLabel || "社媒"}）。
根据参考标题/文案/封面画面，列出 4–6 条「结构线索」（每条一行，不要编号前缀），供二创分镜使用。
要求：
- 可迁移结构（钩子→对比/展开→收尾），不要抄原文案句子
- 若涉及对比（如南北差异、做法差异），明确写出对比轴
- 信息不足时写「信息不足：…」而不是编造口播
只输出线索行，不要开场白。`
    );
    const lines = String(text || "")
      .split(/\n+/)
      .map((l) => l.replace(/^[-•*\d.、)\s]+/, "").trim())
      .filter((l) => l.length >= 4 && l.length <= 120)
      .slice(0, 8);
    return lines.length ? lines : heuristicStructure(input);
  } catch {
    return heuristicStructure(input);
  }
}

function heuristicStructure(input: {
  title?: string | null;
  caption?: string | null;
  coverVision?: string | null;
  topics?: string[];
}): string[] {
  const hints: string[] = [];
  const hook = (input.caption || input.title || "")
    .replace(/#[\s]*[\w\u4e00-\u9fff]+/g, "")
    .trim()
    .slice(0, 60);
  if (hook) hints.push(`开场钩子线索（需改写）：${hook}`);
  if (input.topics?.length) {
    hints.push(
      `话题方向：${input.topics.slice(0, 6).map((t) => `#${t}`).join(" ")}`
    );
  }
  if (input.coverVision) {
    hints.push(`封面画面线索：${input.coverVision.slice(0, 80)}`);
  }
  const contrast =
    /南北|差异|对比|VS|vs|还是|哪个|两种|两边/.test(
      `${input.title || ""}${input.caption || ""}${input.coverVision || ""}`
    );
  if (contrast) {
    hints.push("对比轴：先亮冲突点 → 分边展开差异 → 收束观点/做法");
  }
  hints.push("默认节奏模板（非原片分镜）：短视频三幕式（开场钩子→中段展开→收尾互动）");
  return hints.slice(0, 8);
}

function buildAlignedPayload(input: {
  url: string;
  platformLabel: string;
  title: string | null;
  caption: string | null;
  author?: string | null;
  topics: string[];
  structureHints: string[];
  coverUrl: string | null;
  coverVision: string | null;
  parseNote?: string;
  awemeId?: string | null;
  canonicalUrl?: string | null;
  videoAnalysis?: RemoteVideoAnalysis;
}): IngestPayload {
  const now = new Date().toISOString();
  const structureHints = input.structureHints.slice(0, 10);

  // Same field names as buildCopyrightSafeBrief / extractReferenceSignals
  const briefLines = [
    `【媒体识别 · 二创参考】${input.platformLabel}`,
    `参考链接（仅作结构/风格参考，不复制原作）：${input.canonicalUrl || input.url}`,
    input.awemeId ? `作品 ID：${input.awemeId}` : null,
    input.title ? `参考标题（需改写，不得原样使用）：${input.title}` : null,
    input.author ? `原作者（勿模仿人脸/形象）：${input.author}` : null,
    input.topics.length
      ? `话题方向：${input.topics.map((t) => `#${t}`).join(" ")}`
      : null,
    structureHints.length
      ? `结构线索：\n- ${structureHints.join("\n- ")}`
      : null,
    input.caption
      ? `参考文案线索（需原创改写）：\n${input.caption.slice(0, 800)}`
      : null,
    input.coverVision
      ? `封面画面识别（分镜视觉信号）：\n${input.coverVision}`
      : null,
    input.videoAnalysis?.status === "analyzed"
      ? [
          "远程镜头分析（来自视频理解服务，可用于分镜/拍摄参考，不作为事实依据）：",
          ...(input.videoAnalysis.shots ?? []).map((shot) => {
            const time =
              shot.startSec != null
                ? `${shot.startSec}s${shot.endSec != null ? `–${shot.endSec}s` : ""}`
                : "时码未返回";
            return `- ${time}：${shot.description}${
              shot.camera ? `；构图/镜头：${shot.camera}` : ""
            }${shot.motion ? `；运动：${shot.motion}` : ""}${
              shot.style ? `；风格：${shot.style}` : ""
            }`;
          }),
          input.videoAnalysis.summary
            ? `整体节奏/风格：${input.videoAnalysis.summary}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    "二创规则：可参考节奏/Hook/话题/画面类型；禁止原片原声原文案与原作者形象。",
    RECOGNITION_VERSION,
  ].filter(Boolean);

  const contentSummary = briefLines.join("\n").slice(0, 2200);
  const keyExcerpts = [
    input.caption?.slice(0, 280),
    input.coverVision?.slice(0, 280),
    structureHints[0],
  ].filter((x): x is string => Boolean(x && x.trim()));

  const mediaSummary = [
    RECOGNITION_VERSION,
    "未下载平台原片/原声",
    input.coverUrl ? `封面 URL：${input.coverUrl}` : null,
    input.coverVision ? "已做封面画面识别" : "封面未识别（无图或视觉模型不可用）",
    structureHints.length
      ? `结构线索 ${structureHints.length} 条`
      : "结构线索不足",
    input.videoAnalysis?.status === "analyzed"
      ? `已完成远程镜头分析 ${input.videoAnalysis.shots.length} 镜`
      : input.videoAnalysis?.status === "not_configured"
        ? "视频镜头分析未配置，当前仅有标题、摘要与封面参考"
        : input.videoAnalysis?.status === "failed"
          ? "视频镜头分析未完成，当前仅有标题、摘要与封面参考"
          : null,
    input.parseNote || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasSignal = Boolean(
    input.title ||
      input.caption ||
      input.coverVision ||
      structureHints.length ||
      input.topics.length
  );

  return {
    contentSummary: hasSignal
      ? contentSummary
      : `媒体链接未能识别有效内容：${input.url}`,
    keyExcerpts,
    mediaSummary,
    ingestStatus: hasSignal ? "ready" : "skipped_thin",
    ingestedAt: now,
    extractedText: contentSummary,
  };
}

async function recognizeSocialUrl(
  urlOrText: string,
  fallback: {
    title?: string | null;
    snippet?: string | null;
    thumbnail?: string | null;
  }
): Promise<IngestPayload | null> {
  if (!detectSocialLink(urlOrText)) return null;

  let ingest: SocialIngestResult;
  try {
    ingest = await ingestSocialLink({ urlOrText, mediaAssetCount: 0 });
  } catch {
    return null;
  }

  const title = ingest.title || fallback.title || null;
  const caption =
    ingest.briefSnippet ||
    fallback.snippet ||
    null;
  const coverUrl = ingest.coverUrl || fallback.thumbnail || null;
  const coverVision = await analyzeCover(coverUrl, { title, caption });
  const videoAnalysis = await analyzeRemoteVideoReference({
    url: ingest.canonicalUrl || ingest.url,
    title,
    thumbnail: coverUrl,
  });

  const structureHints = [
    ...ingest.structureHints,
    ...(await distillStructureHints({
      title,
      caption,
      coverVision,
      topics: ingest.topics,
      platformLabel: ingest.platformLabel,
    })),
  ];
  // de-dupe by prefix
  const seen = new Set<string>();
  const uniqueHints = structureHints.filter((h) => {
    const key = h.slice(0, 24);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return buildAlignedPayload({
    url: ingest.url,
    platformLabel: ingest.platformLabel,
    title,
    caption,
    author: ingest.author,
    topics: ingest.topics,
    structureHints: uniqueHints,
    coverUrl,
    coverVision,
    parseNote: ingest.parseNote,
    awemeId: ingest.awemeId,
    canonicalUrl: ingest.canonicalUrl,
    videoAnalysis,
  });
}

/** YouTube / Bilibili / generic: title+snippet+thumbnail vision → same brief shape. */
async function recognizeGenericMedia(input: {
  url: string;
  title?: string | null;
  snippet?: string | null;
  thumbnail?: string | null;
  sourceType?: string;
  platform?: string;
}): Promise<IngestPayload> {
  const title = input.title?.trim() || null;
  const caption = input.snippet?.trim() || null;
  const coverUrl = input.thumbnail?.trim() || null;
  const coverVision = await analyzeCover(coverUrl, { title, caption });
  const platformLabel =
    input.platform ||
    (input.sourceType === "video"
      ? "视频"
      : input.sourceType === "image"
        ? "图片"
        : "媒体");

  const topics = [
    ...new Set(
      `${title || ""} ${caption || ""}`
        .match(/#[\s]*[\w\u4e00-\u9fff]+/g)
        ?.map((t) => t.replace(/^#\s*/, "")) ?? []
    ),
  ].slice(0, 8);

  const structureHints = await distillStructureHints({
    title,
    caption,
    coverVision,
    topics,
    platformLabel,
  });
  const videoAnalysis =
    input.sourceType === "video"
      ? await analyzeRemoteVideoReference({
          url: input.url,
          title,
          thumbnail: coverUrl,
        })
      : undefined;

  return buildAlignedPayload({
    url: input.url,
    platformLabel,
    title,
    caption,
    topics,
    structureHints,
    coverUrl,
    coverVision,
    parseNote:
      "非可解析社交分享链：未配置远程镜头服务时，仅用标题、摘要与封面识别。",
    videoAnalysis,
  });
}

/**
 * Entry: recognize a media/social source for workspace AI + creation.
 * Returns null if caller should fall through to HTML text ingest.
 */
export async function recognizeMediaForIngest(input: {
  url: string;
  title?: string | null;
  snippet?: string | null;
  sourceType?: string;
  thumbnail?: string | null;
  platform?: string;
}): Promise<IngestPayload | null> {
  const social = await recognizeSocialUrl(
    [input.title, input.snippet, input.url].filter(Boolean).join("\n"),
    input
  );
  if (social) return social;

  // Also try bare URL as social
  const socialUrl = await recognizeSocialUrl(input.url, input);
  if (socialUrl) return socialUrl;

  const t = (input.sourceType || "").toLowerCase();
  const looksMedia =
    t === "video" ||
    t === "image" ||
    t === "audio" ||
    Boolean(input.thumbnail) ||
    /\.(mp4|webm|mov|m4v|jpg|jpeg|png|gif|webp)(\?|$)/i.test(input.url) ||
    /youtube|youtu\.be|bilibili|ytimg|googlevideo/i.test(input.url);

  if (!looksMedia) return null;

  return recognizeGenericMedia(input);
}
