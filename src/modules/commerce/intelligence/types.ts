/** Shared Commerce Intelligence — Diagnosis → Evidence → Action */

import { applyReturnNavParams } from "@/modules/commerce/lib/return-nav";

export type CommerceChannel = "amazon" | "tiktok";

export type AnalysisDimension =
  | "traffic"
  | "conversion"
  | "aov"
  | "ads"
  | "product"
  | "content"
  | "creator"
  | "selection"
  | "compliance"
  | "listing";

export interface IntelligenceFinding {
  id: string;
  dimension: AnalysisDimension;
  /** 问题 */
  problem: string;
  /** 证据 */
  evidence: string[];
  /** 建议 */
  suggestion: string;
  severity: "high" | "medium" | "low" | "positive";
  /** Per-finding CTAs (search / create / …) */
  actions?: IntelligenceAction[];
}

export interface IntelligenceAction {
  label: string;
  kind: "search" | "workspace" | "create" | "link";
  href: string;
  /** 竞品 / 市场 / 用户反馈 / 内容趋势 / 选品 / 合规 / 商品页 / 广告 */
  intent?:
    | "competitor"
    | "market"
    | "feedback"
    | "trend"
    | "create"
    | "selection"
    | "compliance"
    | "listing"
    | "ads";
}

export interface CommerceIntelligenceReport {
  channel: CommerceChannel;
  isDemo: true;
  demoStoreLabel: string;
  productTitle: string;
  productKey: string;
  /** 总诊断结论 */
  diagnosis: string;
  findings: IntelligenceFinding[];
  actions: IntelligenceAction[];
  /** AI 是否参与增强（本地规则始终生效） */
  aiAssisted: boolean;
  blockedAi: boolean;
  createdAt: string;
}

export const DIMENSION_LABELS: Record<AnalysisDimension, string> = {
  traffic: "流量",
  conversion: "转化",
  aov: "客单价",
  ads: "广告",
  product: "商品",
  content: "内容",
  creator: "达人",
  selection: "选品",
  compliance: "合规",
  listing: "商品页",
};

export function commerceCreateHref(opts: {
  goal: string;
  context: string;
  storeId?: string;
  marketplace?: string;
  platform?: string;
  product?: string;
  stage?: string;
  returnTo?: string;
  returnLabel?: string;
}): string {
  const params = new URLSearchParams({
    mode: "commerce",
    goal: opts.goal,
    commerceContext: opts.context,
  });
  if (opts.storeId) params.set("storeId", opts.storeId);
  if (opts.marketplace) params.set("marketplace", opts.marketplace);
  if (opts.platform) params.set("commercePlatform", opts.platform);
  if (opts.product) params.set("product", opts.product);
  if (opts.stage) params.set("stage", opts.stage);
  applyReturnNavParams(params, opts.platform, {
    returnTo: opts.returnTo,
    returnLabel: opts.returnLabel,
  });
  return `/create?${params.toString()}`;
}

export function commerceSearchHref(
  q: string,
  extras?: {
    product?: string;
    storeId?: string;
    marketplace?: string;
    from?: string;
    platform?: string;
  }
): string {
  const params = new URLSearchParams({ q });
  params.set("from", extras?.from || "commerce");
  if (extras?.product) params.set("product", extras.product);
  if (extras?.storeId) params.set("storeId", extras.storeId);
  if (extras?.marketplace) params.set("marketplace", extras.marketplace);
  applyReturnNavParams(params, extras?.platform);
  return `/search?${params.toString()}`;
}
