/**
 * V2.8 Credits Economy — pricing policy (server-side only).
 * Search retrieval is always free; AI Overview is also free.
 * Other AI capabilities consume Credits.
 */

/** User-facing capability keys (also used in NEXA_CREDITS_COST_TABLE). */
export const CREDIT_CAPABILITIES = {
  aiOverview: "AI Overview",
  research: "深度研究",
  selection_analysis: "选品调研",
  listing_intelligence: "Listing 智能",
  keyword_intelligence: "关键词智能",
  advertising_analysis: "广告智能",
  customer_intelligence: "客户洞察",
  compliance_check: "合规筛查",
  financial_analysis: "利润智能",
  inventory_intelligence: "库存智能",
  generateText: "内容生成",
  rewrite: "内容改写",
  generateImage: "图片生成",
  editImage: "图片编辑",
  generateVideo: "视频生成",
  qualityCheck: "内容质检",
  summarize: "摘要",
  reason: "推理",
} as const;

export type CreditCapabilityKey = keyof typeof CREDIT_CAPABILITIES;

/** Search channels — never charge Credits. */
export const SEARCH_FREE_CHANNELS = ["web", "news", "image", "video"] as const;

/** AI capabilities that never charge Credits (no confirm). */
export const FREE_AI_CAPABILITIES: CreditCapabilityKey[] = ["aiOverview"];

/**
 * Guest low-cost creation + free overview.
 * Commerce intelligence & high-cost video require login (enforced via LOGIN_REQUIRED_AI
 * and commerce API requireLogin).
 */
export const GUEST_AI_CAPABILITIES: CreditCapabilityKey[] = [
  "aiOverview",
  "research",
  "generateText",
  "rewrite",
  "generateImage",
  "editImage",
  "qualityCheck",
  "summarize",
  "reason",
];

/** High-cost / commerce AI — must be authenticated (server-side gate). */
export const LOGIN_REQUIRED_AI: CreditCapabilityKey[] = [
  "generateVideo",
  "selection_analysis",
  "listing_intelligence",
  "keyword_intelligence",
  "advertising_analysis",
  "customer_intelligence",
  "compliance_check",
  "financial_analysis",
  "inventory_intelligence",
];

export const GUEST_CREDITS_ALLOWANCE = 50;

export function capabilityLabel(key: string): string {
  return (
    CREDIT_CAPABILITIES[key as CreditCapabilityKey] ??
    key
  );
}

export function isSearchFree(): true {
  return true;
}

export function isCapabilityFree(capability: string): boolean {
  return FREE_AI_CAPABILITIES.includes(capability as CreditCapabilityKey);
}

export function guestMayUseCapability(capability: string): boolean {
  return GUEST_AI_CAPABILITIES.includes(capability as CreditCapabilityKey);
}

export function capabilityRequiresLogin(capability: string): boolean {
  return LOGIN_REQUIRED_AI.includes(capability as CreditCapabilityKey);
}
