/**
 * Deterministic home-entry intent routing (not LLM, not Agent).
 */

import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";

export type EntryIntent = "SEARCH" | "RESEARCH" | "CREATE" | "COMMERCE";

export interface EntryRouteResult {
  intent: EntryIntent;
  confidence: number;
  reason: string;
}

const RESEARCH_PATTERNS = [
  /研究/,
  /分析市场/,
  /竞品/,
  /行业趋势/,
  /市场趋势/,
  /深度研究/,
  /全面分析/,
  /对比分析/,
  /\d+\s*天.*市场/,
  /最近\s*\d+\s*天/,
];

const CREATE_PATTERNS = [
  /写一篇/,
  /写一条/,
  /做一条/,
  /做一段/,
  /制作.*视频/,
  /做.*短视频/,
  /生成图片/,
  /生成.*图/,
  /制作内容/,
  /帮我做/,
  /帮我写/,
  /小红书/,
  /短视频/,
  /口播/,
  /脚本/,
  /二创/,
  /同款/,
  /分镜/,
  /种草/,
];

const COMMERCE_PATTERNS = [
  /为什么.*卖/,
  /销量下降/,
  /销售下降/,
  /卖得不好/,
  /卖差了/,
  /广告表现/,
  /\bCVR\b/i,
  /\bACOS\b/i,
  /\bROAS\b/i,
  /Portable\s*Blender/i,
  /便携.*搅拌/,
  /亚马逊/,
  /Amazon/i,
  /TikTok\s*Shop/i,
  /跨境/,
  /商品诊断/,
  /转化率/,
];

export function routeUserQuery(query: string): EntryRouteResult {
  const q = query.trim();
  if (!q) {
    return { intent: "SEARCH", confidence: 0, reason: "empty" };
  }

  if (COMMERCE_PATTERNS.some((p) => p.test(q))) {
    return { intent: "COMMERCE", confidence: 0.9, reason: "commerce_keywords" };
  }

  if (RESEARCH_PATTERNS.some((p) => p.test(q))) {
    return { intent: "RESEARCH", confidence: 0.88, reason: "research_keywords" };
  }

  if (CREATE_PATTERNS.some((p) => p.test(q))) {
    return { intent: "CREATE", confidence: 0.85, reason: "create_keywords" };
  }

  return { intent: "SEARCH", confidence: 0.7, reason: "default_search" };
}

export function buildEntryPath(query: string): string {
  const encoded = encodeURIComponent(query.trim());
  const route = routeUserQuery(query);

  switch (route.intent) {
    case "RESEARCH":
      return `/workspace?goal=${encoded}&action=research`;
    case "CREATE":
      return `/create?goal=${encoded}&mode=idea`;
    case "COMMERCE": {
      if (/TikTok|tiktok|抖音小店/i.test(query)) {
        return `/commerce/tiktok/content`;
      }
      if (/Portable\s*Blender|便携.*搅拌|blender/i.test(query)) {
        return commerceProductExpandHref(
          "amazon",
          "prod_portable_blender"
        );
      }
      return `/commerce/amazon`;
    }
    case "SEARCH":
    default:
      return `/search?q=${encoded}`;
  }
}
