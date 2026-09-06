import type { AccountTier } from "./tier-policy";

export type DemoTier = Exclude<AccountTier, "guest">;

export interface DemoAccountConfig {
  tier: DemoTier;
  email: string;
  name: string;
  role: string;
  description: string;
  highlights: string[];
  limitations: string[];
}

export const DEMO_ACCOUNTS: Record<DemoTier, DemoAccountConfig> = {
  basic: {
    tier: "basic",
    email: "demo-basic@nexa.demo",
    name: "演示·基础版",
    role: "tier_basic",
    description: "适合体验搜索、工作区与素材管理",
    highlights: ["搜索与工作区保存", "素材库上传", "Commerce Demo"],
    limitations: ["Deep Research", "AI 生成", "发布与平台连接"],
  },
  standard: {
    tier: "standard",
    email: "demo-standard@nexa.demo",
    name: "演示·专业版",
    role: "tier_standard",
    description: "适合体验研究与 AI 创作",
    highlights: [
      "基础版全部能力",
      "Deep Research",
      "AI 创作与生成",
      "更多 AI Credits",
    ],
    limitations: ["发布到第三方平台", "平台 OAuth 连接"],
  },
  pro: {
    tier: "pro",
    email: "demo-pro@nexa.demo",
    name: "演示·高级版",
    role: "tier_pro",
    description: "完整体验 Nexa 全链路能力",
    highlights: [
      "专业版全部能力",
      "发布预览与确认",
      "平台连接中心",
      "最高 AI Credits 额度",
    ],
    limitations: [],
  },
};

export function getDemoAccountByEmail(email: string): DemoAccountConfig | null {
  const normalized = email.trim().toLowerCase();
  return (
    Object.values(DEMO_ACCOUNTS).find((a) => a.email === normalized) ?? null
  );
}

export function getDemoAccountByTier(tier: DemoTier): DemoAccountConfig {
  return DEMO_ACCOUNTS[tier];
}
