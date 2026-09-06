import type { SearchIntent } from "../types";

const IMAGE_PATTERNS = [
  /图片/,
  /照片/,
  /图像/,
  /image/i,
  /photo/i,
  /picture/i,
  /壁纸/,
  /配图/,
];

const VIDEO_PATTERNS = [
  /视频/,
  /评测视频/,
  /youtube/i,
  /bilibili/i,
  /教程视频/,
  /观看/,
  /\bvideo\b/i,
  /review video/i,
];

const SOCIAL_PATTERNS = [
  /x\s*上/i,
  /推特/,
  /twitter/i,
  /reddit/i,
  /小红书/,
  /tiktok/i,
  /抖音/,
  /大家.*讨论/,
  /网友.*怎么看/,
  /社交/,
  /舆论/,
];

const OPINION_PATTERNS = [
  /怎么看/,
  /如何评价/,
  /看法/,
  /观点/,
  /争议/,
  /吐槽/,
  /评价如何/,
  /值得关注/,
];

const NEWS_PATTERNS = [
  /新闻/,
  /最近.*发生/,
  /最新.*动态/,
  /最近.*有什么/,
  /有什么新闻/,
  /最新消息/,
  /latest news/i,
  /recent news/i,
  /breaking/i,
  /今天.*消息/,
  /本周/,
  /近日/,
];

const PRODUCT_PATTERNS = [
  /哪个好/,
  /推荐买/,
  /值得买/,
  /测评/,
  /评测(?!视频)/,
  /购买/,
  /价格/,
  /asin/i,
  /sku/i,
  /对比.*产品/,
];

const RESEARCH_PATTERNS = [
  /深入研究/,
  /研究报告/,
  /全面分析/,
  /对比分析/,
  /趋势研究/,
  /市场研究/,
  /系统梳理/,
];

const KNOWLEDGE_PATTERNS = [
  /是什么$/,
  /什么是/,
  /是什么/,
  /的定义/,
  /什么意思/,
  /怎么工作/,
  /如何工作/,
  /who is/i,
  /what is/i,
  /what are/i,
  /define/i,
  /explain/i,
  /介绍/,
  /简介/,
  /原理/,
  /概念/,
  /用简单的话/,
];

export function classifyIntentByRules(query: string): SearchIntent | null {
  const q = query.trim();

  if (IMAGE_PATTERNS.some((p) => p.test(q))) return "image";
  if (VIDEO_PATTERNS.some((p) => p.test(q))) return "video";
  if (SOCIAL_PATTERNS.some((p) => p.test(q))) return "social";
  if (NEWS_PATTERNS.some((p) => p.test(q))) return "news";
  if (PRODUCT_PATTERNS.some((p) => p.test(q))) return "product";
  if (RESEARCH_PATTERNS.some((p) => p.test(q))) return "research";
  if (OPINION_PATTERNS.some((p) => p.test(q))) return "opinion";
  if (KNOWLEDGE_PATTERNS.some((p) => p.test(q))) return "knowledge";

  return null;
}

export function classifyIntent(query: string): SearchIntent {
  return classifyIntentByRules(query) ?? "general";
}
