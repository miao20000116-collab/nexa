/**
 * Ingest supported social links for copyright-safe recreate flow.
 * Parses share-page metadata (title/desc/cover/topics) ONLY —
 * never downloads or caches platform original media.
 */

import {
  detectSocialLink,
  socialPlatformLabel,
  type SocialRecreatePlatform,
} from "@/lib/social-link";
import {
  buildCopyrightSafeBrief,
  isSocialShareBoilerplate,
  pickRecreateDisplayTitle,
  RECREATE_COPYRIGHT_NOTICE,
  type RecreateOutputKind,
} from "@/modules/create/lib/recreate-copyright";
import {
  parseSocialReference,
  extractHashtagTopics,
  fieldLabel,
  withFieldChecklist,
  type SocialMetaField,
  type SocialParseStatus,
  type SocialReferenceMeta,
} from "@/modules/create/services/social-meta-parser";

export type SocialIngestResult = {
  url: string;
  platform: SocialRecreatePlatform;
  platformLabel: string;
  title: string | null;
  briefSnippet: string | null;
  /** Advisory: upload own assets before render — not a create blocker. */
  needsUpload: boolean;
  reason: string;
  thin: boolean;
  copyrightNotice: string;
  /** Real parse quality — ui must not pretend success when failed. */
  parseStatus: SocialParseStatus;
  parseNote: string;
  parseMethod: string;
  author: string | null;
  coverUrl: string | null;
  durationSec: number | null;
  likeCount: number | null;
  topics: string[];
  structureHints: string[];
  awemeId: string | null;
  /** Real long URL after short-link expansion. */
  canonicalUrl: string | null;
  /** Honest checklist for UI. */
  obtainedFields: SocialMetaField[];
  missingFields: SocialMetaField[];
  obtainedLabels: string[];
  missingLabels: string[];
};

function scoreMeta(meta: SocialReferenceMeta): number {
  let s = 0;
  if (meta.canonicalUrl) s += 4;
  if (meta.awemeId) s += 3;
  if (meta.title?.trim()) s += 3;
  if (meta.description?.trim()) s += 2;
  if (meta.coverUrl) s += 2;
  if (meta.author) s += 1;
  if (meta.topics.length) s += 1;
  return s;
}

function mergePasteAndMeta(
  pasteTitle: string | null | undefined,
  pasteCaption: string | null | undefined,
  meta: SocialReferenceMeta
): {
  title: string | null;
  briefSnippet: string | null;
  thin: boolean;
  parseStatus: SocialParseStatus;
  parseMethod: string;
  parseNote: string;
} {
  const pasteHasSignal = Boolean(
    pasteTitle?.trim() ||
      (pasteCaption?.trim() && pasteCaption.trim().length >= 6)
  );

  // Page parse failed hard, but share clipboard text has usable content
  // (do NOT treat short-link expand success as failure)
  if (
    meta.parseStatus === "failed" &&
    !meta.awemeId &&
    !meta.canonicalUrl &&
    pasteHasSignal
  ) {
    const title = pasteTitle?.trim() || pasteCaption!.trim().slice(0, 80);
    const parts = [
      pasteCaption?.trim()
        ? `分享口令文案：${pasteCaption.trim()}`
        : null,
      pasteTitle?.trim() ? `分享标题：${pasteTitle.trim()}` : null,
      meta.awemeId ? `作品 ID：${meta.awemeId}` : null,
      "说明：页面元数据未能拉取，当前仅依据你粘贴的分享口令（不是空壳假装读过视频）。",
    ].filter(Boolean);
    return {
      title,
      briefSnippet: parts.join("\n").slice(0, 2500),
      thin: true,
      parseStatus: "partial",
      parseMethod: "share_paste_fallback",
      parseNote: `${meta.parseNote} 已回退使用分享口令文字。`,
    };
  }

  const cleanedMetaTitle =
    meta.title?.trim() && !isSocialShareBoilerplate(meta.title)
      ? meta.title.trim()
      : null;
  const cleanedMetaDesc =
    meta.description?.trim() && !isSocialShareBoilerplate(meta.description)
      ? meta.description.trim()
      : null;
  const cleanedPasteCaption =
    pasteCaption?.trim() && !isSocialShareBoilerplate(pasteCaption)
      ? pasteCaption.trim()
      : pasteCaption?.trim() || null;

  // Prefer share paste title/caption over Douyin OG template
  const title =
    (pasteTitle?.trim() && !isSocialShareBoilerplate(pasteTitle)
      ? pasteTitle.trim()
      : null) ||
    cleanedMetaTitle ||
    (cleanedPasteCaption ? cleanedPasteCaption.slice(0, 40) : null) ||
    cleanedMetaDesc?.slice(0, 40) ||
    (meta.awemeId ? `抖音作品 ${meta.awemeId}` : null);

  const parts: string[] = [];
  // Put human-readable signals first (UI truncates snippets)
  if (cleanedPasteCaption) {
    parts.push(cleanedPasteCaption);
  } else if (cleanedMetaDesc) {
    parts.push(cleanedMetaDesc);
  }
  if (meta.awemeId) parts.push(`作品 ID：${meta.awemeId}`);
  if (meta.canonicalUrl) parts.push(`真实链接：${meta.canonicalUrl}`);
  if (meta.author) parts.push(`原作者（仅参考，勿模仿形象）：${meta.author}`);
  if (meta.topics.length) {
    parts.push(`话题：${meta.topics.map((t) => `#${t}`).join(" ")}`);
  }
  if (meta.structureHints.length) {
    parts.push(`结构线索：\n- ${meta.structureHints.join("\n- ")}`);
  }

  const briefSnippet = parts.length ? parts.join("\n").slice(0, 2500) : null;
  const thin =
    (meta.parseStatus === "failed" && !meta.awemeId) ||
    (!briefSnippet && !title) ||
    meta.parseStatus === "partial";

  return {
    title,
    briefSnippet,
    thin,
    parseStatus:
      meta.awemeId && meta.parseStatus === "failed" ? "partial" : meta.parseStatus,
    parseMethod: meta.parseMethod,
    parseNote: meta.parseNote,
  };
}

export async function ingestSocialLink(options: {
  urlOrText: string;
  mediaAssetCount?: number;
  outputKind?: RecreateOutputKind;
}): Promise<SocialIngestResult> {
  const match = detectSocialLink(options.urlOrText);
  if (!match) {
    throw new Error("请粘贴抖音、小红书、TikTok 或 X 链接");
  }

  const mediaCount = options.mediaAssetCount ?? 0;
  const platformLabel = socialPlatformLabel(match.platform);

  const pasteOpts = {
    pasteText: options.urlOrText,
    pasteTitle: match.shareTitle,
    pasteCaption: match.shareCaption,
  };

  // Try primary URL first; if paste has multiple social links, pick best parse.
  const urls = [
    match.url,
    ...(match.allUrls ?? []).filter((u) => u !== match.url),
  ].slice(0, 4);

  let meta = await parseSocialReference(match.platform, urls[0]!, pasteOpts);
  for (const extra of urls.slice(1)) {
    if (scoreMeta(meta) >= 10) break;
    const next = await parseSocialReference(match.platform, extra, pasteOpts);
    if (scoreMeta(next) > scoreMeta(meta)) meta = next;
  }

  const merged = mergePasteAndMeta(
    match.shareTitle,
    match.shareCaption,
    meta
  );

  // Enrich topics / structure from share paste when SSR body is thin
  const pasteTopics = extractHashtagTopics(
    `${match.shareCaption ?? ""} ${match.shareTitle ?? ""} ${options.urlOrText}`
  );
  const topics = [...new Set([...meta.topics, ...pasteTopics])].slice(0, 12);

  const structureHints = [...meta.structureHints];
  if (match.shareCaption?.trim()) {
    const hook = match.shareCaption
      .replace(/#[\s]*[\w\u4e00-\u9fff]+/g, "")
      .trim()
      .slice(0, 60);
    if (hook && !structureHints.some((h) => h.includes(hook.slice(0, 12)))) {
      structureHints.unshift(`开场钩子线索（需改写）：${hook}`);
    }
  }
  if (topics.length && !structureHints.some((h) => h.includes("话题"))) {
    structureHints.unshift(
      `话题方向：${topics.slice(0, 6).map((t) => `#${t}`).join(" ")}`
    );
  }
  // Only add default rhythm template when we already have *some* real signal
  // (paste / topics / page meta). Never pretend we read the original video.
  const hasRealSignal = Boolean(
    topics.length ||
      match.shareCaption?.trim() ||
      match.shareTitle?.trim() ||
      (meta.title && meta.parseStatus === "ok") ||
      (meta.description && meta.parseStatus !== "failed")
  );
  if (
    hasRealSignal &&
    !structureHints.some((h) => h.includes("三幕") || h.includes("默认节奏"))
  ) {
    structureHints.push(
      "默认节奏模板（非原片分镜）：短视频三幕式（开场钩子→中段展开→收尾互动）"
    );
  }

  const hasMedia = mediaCount >= 1;
  const needsUpload = !hasMedia;

  const checklist = withFieldChecklist({
    ...meta,
    title: merged.title || meta.title,
    description: meta.description || match.shareCaption || null,
    topics,
    parseStatus: merged.parseStatus,
  });
  const obtainedFields = checklist.obtainedFields ?? [];
  const missingFields = checklist.missingFields ?? [];
  const obtainedLabels = obtainedFields.map(fieldLabel);
  const missingLabels = missingFields.map(fieldLabel);

  let reason: string;
  if (merged.parseStatus === "ok") {
    reason = `${platformLabel} 参考已解析（标题/描述可用）。`;
  } else if (match.platform === "x") {
    reason = `${platformLabel} 仅拿到可公开核验的部分字段：${
      obtainedLabels.join("、") || "无"
    }；仍缺：${missingLabels.join("、") || "无"}。${
      merged.parseNote
    }`;
  } else if (meta.canonicalUrl || meta.awemeId) {
    reason = `${platformLabel} 短链已展开${
      meta.awemeId ? ` → ID ${meta.awemeId}` : ""
    }。已拿到：${obtainedLabels.join("、") || "无"}；仍缺：${
      missingLabels.join("、") || "无"
    }。请粘贴完整分享口令，或下方手动补充结构。`;
  } else if (merged.parseStatus === "partial") {
    reason = `${platformLabel} 仅部分可用：${merged.parseNote}`;
  } else {
    reason = `${platformLabel} 未能展开短链。${merged.parseNote}`;
  }

  return {
    url: meta.canonicalUrl || match.url,
    platform: match.platform,
    platformLabel,
    title: pickRecreateDisplayTitle({
      title: merged.title,
      caption: match.shareCaption,
      topics,
      awemeId: meta.awemeId,
      structureHints,
    }),
    briefSnippet: merged.briefSnippet,
    needsUpload,
    reason,
    thin: merged.thin,
    copyrightNotice: RECREATE_COPYRIGHT_NOTICE,
    parseStatus: merged.parseStatus,
    parseNote: merged.parseNote,
    parseMethod: merged.parseMethod,
    author: meta.author,
    coverUrl: meta.coverUrl,
    durationSec: meta.durationSec,
    likeCount: meta.likeCount,
    topics,
    structureHints: structureHints.slice(0, 10),
    awemeId: meta.awemeId ?? null,
    canonicalUrl: meta.canonicalUrl ?? null,
    obtainedFields,
    missingFields,
    obtainedLabels,
    missingLabels,
  };
}

export function buildRecreateGoal(platformLabel: string, linkUrl: string) {
  return `根据参考做版权安全的同款二创（${platformLabel}）：${linkUrl}`;
}

export function buildRecreateBrief(
  ingest: SocialIngestResult,
  outputKind: RecreateOutputKind = "video"
): string {
  return buildCopyrightSafeBrief({
    platformLabel: ingest.platformLabel,
    url: ingest.url,
    title: ingest.title,
    referenceCaption: ingest.briefSnippet,
    outputKind,
    author: ingest.author,
    topics: ingest.topics,
    structureHints: ingest.structureHints,
    parseStatus: ingest.parseStatus,
  });
}
