/**
 * Fine-grained creation intent — rules first, optional LLM refine later.
 * Extends coarse EntryIntent=CREATE into actionable subtypes for the agent.
 */

export type CreationIntentKind =
  | "copy_script"
  | "short_video"
  | "image_cover"
  | "social_recreate"
  | "commerce_strategy"
  | "research_then_create"
  | "customer_insight"
  | "multimodal"
  | "general_create";

export type CreationIntentResult = {
  kind: CreationIntentKind;
  confidence: number;
  reason: string;
  /** Platform hint for create project */
  platformHint?: "xiaohongshu" | "douyin" | "tiktok" | "wechat" | "generic";
  contentTypeHint?: "copy" | "short_video" | "image" | "carousel";
  signals: string[];
};

const RULES: Array<{
  kind: CreationIntentKind;
  confidence: number;
  reason: string;
  patterns: RegExp[];
  platformHint?: CreationIntentResult["platformHint"];
  contentTypeHint?: CreationIntentResult["contentTypeHint"];
}> = [
  {
    kind: "social_recreate",
    confidence: 0.92,
    reason: "link_recreate",
    patterns: [
      /同款/,
      /二创/,
      /复刻/,
      /仿拍/,
      /douyin\.com|v\.douyin|xiaohongshu|xhslink|tiktok\.com|(?:x|twitter)\.com\/\w+\/status/i,
      /分享口令/,
    ],
  },
  {
    kind: "commerce_strategy",
    confidence: 0.9,
    reason: "commerce_create",
    patterns: [
      /Listing|ACOS|CVR|转化/,
      /卖点|商品诊断|种草脚本/,
      /Amazon|亚马逊|TikTok\s*Shop|跨境/,
      /南北方|对比.*做法/,
    ],
  },
  {
    kind: "customer_insight",
    confidence: 0.88,
    reason: "customer_pain",
    patterns: [/差评|痛点|客服回复|Review\s*Reply|本土化回复/],
  },
  {
    kind: "research_then_create",
    confidence: 0.86,
    reason: "research_then_create",
    patterns: [
      /先研究|调研后再|基于研究|深入研究/,
      /当前资料.*(比较|总结|分析|提取|结论|创作)/,
      /资料.*(比较|总结|分析|提取|结论|创作)/,
      /证据.*(结论|判断|创作)/,
    ],
  },
  {
    kind: "short_video",
    confidence: 0.88,
    reason: "video_create",
    patterns: [/短视频|口播|分镜|脚本.*视频|做.*视频|抖音|TikTok|Reel/],
    platformHint: "douyin",
    contentTypeHint: "short_video",
  },
  {
    kind: "image_cover",
    confidence: 0.86,
    reason: "image_create",
    patterns: [/封面|海报|主图|生成图|做一张图|配图/],
    contentTypeHint: "image",
  },
  {
    kind: "copy_script",
    confidence: 0.84,
    reason: "copy_create",
    patterns: [/文案|标题|Hook|小红书|笔记|写一条|写一篇|脚本/],
    platformHint: "xiaohongshu",
    contentTypeHint: "copy",
  },
  {
    kind: "multimodal",
    confidence: 0.8,
    reason: "multimodal",
    patterns: [/图文|视频.*文案|文案.*视频|一键成片|多模态/],
  },
];

export function classifyCreationIntent(goal: string): CreationIntentResult {
  const q = goal.trim();
  const signals: string[] = [];
  if (!q) {
    return {
      kind: "general_create",
      confidence: 0,
      reason: "empty",
      signals,
    };
  }

  for (const rule of RULES) {
    const hit = rule.patterns.find((p) => p.test(q));
    if (hit) {
      signals.push(hit.source.slice(0, 40));
      return {
        kind: rule.kind,
        confidence: rule.confidence,
        reason: rule.reason,
        platformHint: rule.platformHint,
        contentTypeHint: rule.contentTypeHint,
        signals,
      };
    }
  }

  return {
    kind: "general_create",
    confidence: 0.55,
    reason: "default_create",
    contentTypeHint: "copy",
    signals,
  };
}

export const CREATION_INTENT_LABELS: Record<CreationIntentKind, string> = {
  copy_script: "文案 / 脚本创作",
  short_video: "短视频创作",
  image_cover: "图片 / 封面",
  social_recreate: "社交链接同款二创",
  commerce_strategy: "跨境经营 → 策略内容",
  research_then_create: "先研究再创作",
  customer_insight: "客户洞察 / 回复",
  multimodal: "多模态成片",
  general_create: "通用创作",
};
