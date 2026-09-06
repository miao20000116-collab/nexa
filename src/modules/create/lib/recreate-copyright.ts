/**
 * Copyright-safe “同款二创” policy for social references.
 * Rule: recreate structure & style — never copy original media, faces, copy, or BGM.
 */

export const RECREATE_COPYRIGHT_NOTICE =
  "版权安全二创：只参考结构与风格；不下载、不使用平台原片 / 原声 / 原文案；成片用你自有形象或 AI 新生成。";

export type RecreateOutputKind = "video" | "image" | "copy";

export { isSocialShareBoilerplate } from "./social-boilerplate";
import { isSocialShareBoilerplate } from "./social-boilerplate";

/** Best short label for UI from ingest fields (never OG boilerplate). */
export function pickRecreateDisplayTitle(input: {
  title?: string | null;
  caption?: string | null;
  topics?: string[];
  awemeId?: string | null;
  structureHints?: string[];
}): string {
  if (input.title?.trim() && !isSocialShareBoilerplate(input.title)) {
    return input.title.trim().slice(0, 40);
  }
  const hookHint = input.structureHints?.find((h) =>
    /钩子|开场/.test(h)
  );
  if (hookHint) {
    const m = hookHint.match(/[：:]\s*(.+)$/);
    if (m?.[1] && !isSocialShareBoilerplate(m[1])) {
      return m[1].trim().slice(0, 40);
    }
  }
  if (input.caption?.trim() && !isSocialShareBoilerplate(input.caption)) {
    return input.caption
      .replace(/#[\s]*[\w\u4e00-\u9fff]+/g, "")
      .trim()
      .slice(0, 40);
  }
  if (input.topics?.length) {
    return input.topics.slice(0, 2).map((t) => `#${t}`).join(" ");
  }
  if (input.awemeId) return `抖音作品 ${input.awemeId}`;
  return "已解析的参考作品";
}

export function buildCopyrightSafeBrief(input: {
  platformLabel: string;
  url: string;
  title?: string | null;
  referenceCaption?: string | null;
  outputKind?: RecreateOutputKind;
  author?: string | null;
  topics?: string[];
  structureHints?: string[];
  parseStatus?: string;
}): string {
  const kind =
    input.outputKind === "image"
      ? "图片 / 封面"
      : input.outputKind === "copy"
        ? "文案"
        : "短视频";

  const safeTitle =
    input.title && !isSocialShareBoilerplate(input.title) ? input.title : null;
  const safeCaption = input.referenceCaption?.trim()
    ? isSocialShareBoilerplate(input.referenceCaption)
      ? null
      : input.referenceCaption
    : null;

  return [
    `【同款二创 · ${kind}】${input.platformLabel}`,
    `参考链接（仅作结构/风格参考，不复制原作）：${input.url}`,
    input.parseStatus
      ? `解析状态：${input.parseStatus}`
      : null,
    safeTitle ? `参考标题（需改写，不得原样使用）：${safeTitle}` : null,
    input.author
      ? `原作者（勿模仿人脸/形象）：${input.author}`
      : null,
    input.topics?.length
      ? `话题方向：${input.topics.map((t) => `#${t}`).join(" ")}`
      : null,
    input.structureHints?.length
      ? `结构线索：\n- ${input.structureHints.join("\n- ")}`
      : null,
    safeCaption
      ? `参考文案线索（需原创改写）：\n${safeCaption}`
      : null,
    "二创规则：",
    "1. 可参考：镜头节奏、Hook 结构、话题方向、画面风格类型。",
    "2. 禁止：原视频画面、平台配乐原声、原文案原句、原作者人脸/形象。",
    "3. 成片必须使用：用户自有素材（如 AI 照片/物品图）和/或 AI 新生成素材 + 自有/曲库 BGM。",
    "4. 对外声明建议：Style Aligned 原创重构，非搬运或像素级复刻。",
    RECREATE_COPYRIGHT_NOTICE,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRecreateCreateHref(input: {
  url: string;
  title?: string;
  output?: RecreateOutputKind;
  platform?: string;
}): string {
  const params = new URLSearchParams();
  params.set("mode", "link");
  params.set("linkUrl", input.url);
  if (input.title) params.set("goal", `同款二创：${input.title}`);
  else params.set("goal", "根据参考链接做版权安全的同款二创");
  if (input.output) params.set("output", input.output);
  if (input.platform) params.set("platform", input.platform);
  return `/create?${params.toString()}`;
}

export function isSocialRecreateUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.includes("douyin.com") ||
      host.includes("iesdouyin.com") ||
      host.includes("xiaohongshu.com") ||
      host.includes("xhslink.com") ||
      host.includes("tiktok.com") ||
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host.includes("twitter.com")
    );
  } catch {
    return false;
  }
}

export function platformFromSocialUrl(
  url: string
): "douyin" | "xiaohongshu" | "tiktok" | "x" | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("douyin") || host.includes("iesdouyin")) return "douyin";
    if (host.includes("xiaohongshu") || host.includes("xhslink"))
      return "xiaohongshu";
    if (host.includes("tiktok")) return "tiktok";
    if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter"))
      return "x";
    return null;
  } catch {
    return null;
  }
}
