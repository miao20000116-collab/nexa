import { getSession } from "@/modules/account/auth/service";
import {
  LOGIN_REQUIRED_LABELS,
  type LoginRequiredFeature,
} from "@/modules/account/types";
import {
  canAccessFeature,
  getUserTier,
  tierUpgradeHint,
  TIER_LABELS,
} from "@/modules/account/permissions/tier-policy";

export async function requireLogin(feature: LoginRequiredFeature) {
  const session = await getSession();
  if (!session.authenticated || !session.user) {
    return {
      ok: false as const,
      status: 401,
      message: `「${LOGIN_REQUIRED_LABELS[feature]}」需要登录后使用`,
    };
  }
  if (!canAccessFeature(session.user, feature)) {
    const tier = getUserTier(session.user);
    return {
      ok: false as const,
      status: 403,
      message: `当前为「${TIER_LABELS[tier]}」，${tierUpgradeHint(session.user, feature)}`,
    };
  }
  return { ok: true as const, user: session.user };
}
