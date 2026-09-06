import type { AccountUser } from "@/modules/account/types";
import type { LoginRequiredFeature } from "@/modules/account/types";

export type AccountTier = "guest" | "basic" | "standard" | "pro";

export const TIER_ROLE_MAP: Record<Exclude<AccountTier, "guest">, string> = {
  basic: "tier_basic",
  standard: "tier_standard",
  pro: "tier_pro",
};

export const ROLE_TIER_MAP: Record<string, AccountTier> = {
  tier_basic: "basic",
  tier_standard: "standard",
  tier_pro: "pro",
  user: "standard",
};

export const TIER_LABELS: Record<AccountTier, string> = {
  guest: "访客",
  basic: "基础版",
  standard: "专业版",
  pro: "高级版",
};

export const TIER_CREDITS: Record<Exclude<AccountTier, "guest">, number> = {
  basic: 30,
  standard: 200,
  pro: 1000,
};

/**
 * Tier gates ONLY cross-border commerce + optional OAuth connect.
 * Creation / QA / preview are free for guests — never gated here.
 */
const FEATURE_MIN_TIER: Record<LoginRequiredFeature, AccountTier> = {
  persist_workspace: "guest",
  persist_assets: "guest",
  high_cost_generation: "guest",
  publish: "guest",
  connect_platform: "standard",
  commerce: "standard",
};

const TIER_RANK: Record<AccountTier, number> = {
  guest: 0,
  basic: 1,
  standard: 2,
  pro: 3,
};

export function getUserTier(user: AccountUser | null | undefined): AccountTier {
  if (!user) return "guest";
  return ROLE_TIER_MAP[user.role] ?? "standard";
}

export function canAccessFeature(
  user: AccountUser | null | undefined,
  feature: LoginRequiredFeature
): boolean {
  // Low-cost creation / temp workspace remain open for signed-in basic+ and guests
  // at the credits gate; publish / high-cost / commerce require real auth + tier.
  if (feature === "persist_workspace" || feature === "persist_assets") {
    return true;
  }
  if (feature === "publish" || feature === "high_cost_generation") {
    return Boolean(user);
  }
  const tier = getUserTier(user);
  const required = FEATURE_MIN_TIER[feature];
  return TIER_RANK[tier] >= TIER_RANK[required];
}

export function getTierCapabilities(tier: AccountTier) {
  const allFeatures: LoginRequiredFeature[] = [
    "commerce",
    "connect_platform",
  ];
  return {
    tier,
    label: TIER_LABELS[tier],
    credits: tier === "guest" ? 0 : TIER_CREDITS[tier],
    features: allFeatures.map((f) => ({
      id: f,
      allowed: TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[f]],
    })),
  };
}

export function tierUpgradeHint(
  user: AccountUser | null | undefined,
  feature: LoginRequiredFeature
): string {
  const required = FEATURE_MIN_TIER[feature];
  if (feature === "commerce") {
    return `跨境商业需「${TIER_LABELS[required]}」及以上`;
  }
  if (feature === "connect_platform") {
    return `连接平台账号需「${TIER_LABELS[required]}」及以上（创作与质检无需连接）`;
  }
  return `「${TIER_LABELS[required]}」及以上可用`;
}

export function canAccessFromTierView(
  tierView: { features: Array<{ id: LoginRequiredFeature; allowed: boolean }> } | null | undefined,
  feature: LoginRequiredFeature
): boolean {
  if (
    feature === "publish" ||
    feature === "high_cost_generation" ||
    feature === "persist_workspace" ||
    feature === "persist_assets"
  ) {
    return true;
  }
  if (!tierView) return false;
  return tierView.features.find((f) => f.id === feature)?.allowed ?? false;
}
