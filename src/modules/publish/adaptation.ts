import type { AdaptationIssue, AdaptationResult, PublishPlatform } from "./types";

export interface ContentForAdaptation {
  contentType?: string | null;
  platform?: string | null;
  content?: Record<string, unknown> | null;
  hasImages?: boolean;
  hasVideo?: boolean;
  videoDurationSec?: number | null;
  imageCount?: number;
  aspectRatio?: string | null;
}

function str(content: Record<string, unknown> | null | undefined, key: string) {
  const v = content?.[key];
  if (Array.isArray(v)) return v.join(" ");
  return typeof v === "string" ? v : "";
}

function tags(content: Record<string, unknown> | null | undefined) {
  const v = content?.hashtags;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string")
    return v.split(/[\s,，#]+/).filter(Boolean);
  return [];
}

/**
 * Pre-publish platform adaptation checks (length, format, media constraints).
 * Deterministic rules — no fake pass.
 */
export function checkPlatformAdaptation(
  platform: PublishPlatform,
  input: ContentForAdaptation
): AdaptationResult {
  const issues: AdaptationIssue[] = [];
  const content = input.content ?? {};
  const title = str(content, "title") || str(content, "hook");
  const body =
    str(content, "body") ||
    str(content, "caption") ||
    str(content, "script") ||
    str(content, "hook");
  const hashtags = tags(content);
  const isVideo =
    input.contentType === "short_video" ||
    input.hasVideo ||
    platform === "tiktok" ||
    platform === "youtube" ||
    platform === "douyin";

  switch (platform) {
    case "x": {
      const text = `${title} ${body}`.trim();
      if (!text) {
        issues.push({
          field: "body",
          message: "X 发布需要正文内容。",
          severity: "error",
        });
      }
      if (text.length > 280) {
        issues.push({
          field: "body",
          message: `正文超过 X 限制（${text.length}/280）。`,
          severity: "error",
        });
      }
      if (input.imageCount && input.imageCount > 4) {
        issues.push({
          field: "images",
          message: "X 单次最多 4 张图片。",
          severity: "error",
        });
      }
      break;
    }
    case "instagram": {
      if (!body && !input.hasImages && !isVideo) {
        issues.push({
          field: "content",
          message: "Instagram 需要文案或媒体。",
          severity: "error",
        });
      }
      if (body.length > 2200) {
        issues.push({
          field: "caption",
          message: `Caption 过长（${body.length}/2200）。`,
          severity: "error",
        });
      }
      if (hashtags.length > 30) {
        issues.push({
          field: "hashtags",
          message: "话题标签过多（最多 30 个）。",
          severity: "error",
        });
      }
      if (input.aspectRatio && !["1:1", "4:5", "9:16"].includes(input.aspectRatio)) {
        issues.push({
          field: "aspectRatio",
          message: "图片/视频比例建议使用 1:1、4:5 或 9:16。",
          severity: "warning",
        });
      }
      break;
    }
    case "tiktok":
    case "douyin": {
      if (!isVideo && !input.hasVideo) {
        issues.push({
          field: "video",
          message: "当前平台需要视频内容。",
          severity: "error",
        });
      }
      if (input.videoDurationSec && input.videoDurationSec > 600) {
        issues.push({
          field: "duration",
          message: "视频时长超出常见平台限制。",
          severity: "error",
        });
      }
      if (input.aspectRatio && input.aspectRatio !== "9:16") {
        issues.push({
          field: "aspectRatio",
          message: "竖屏短视频建议使用 9:16。",
          severity: "warning",
        });
      }
      break;
    }
    case "youtube": {
      if (!isVideo && !input.hasVideo) {
        issues.push({
          field: "video",
          message: "YouTube 发布需要视频。",
          severity: "error",
        });
      }
      if (title.length > 100) {
        issues.push({
          field: "title",
          message: `标题过长（${title.length}/100）。`,
          severity: "error",
        });
      }
      if (!title.trim()) {
        issues.push({
          field: "title",
          message: "YouTube 需要标题。",
          severity: "error",
        });
      }
      break;
    }
    case "xiaohongshu": {
      if (title.length > 20) {
        issues.push({
          field: "title",
          message: `标题建议不超过 20 字（当前 ${title.length}）。`,
          severity: "warning",
        });
      }
      if (!body.trim()) {
        issues.push({
          field: "body",
          message: "正文不能为空。",
          severity: "error",
        });
      }
      if (hashtags.length > 10) {
        issues.push({
          field: "hashtags",
          message: "话题标签偏多，建议精简。",
          severity: "warning",
        });
      }
      break;
    }
    case "linkedin": {
      if (!body.trim()) {
        issues.push({
          field: "body",
          message: "LinkedIn 需要正文。",
          severity: "error",
        });
      }
      if (body.length > 3000) {
        issues.push({
          field: "body",
          message: `正文过长（${body.length}/3000）。`,
          severity: "error",
        });
      }
      break;
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    ok: errors.length === 0,
    issues,
    summary:
      errors.length === 0
        ? issues.length
          ? "可通过，但有建议优化项。"
          : "符合当前平台基础要求。"
        : "该内容不符合当前平台要求。",
  };
}
