"use client";

import Link from "next/link";
import type { LoginRequiredFeature } from "@/modules/account/types";
import { LOGIN_REQUIRED_LABELS } from "@/modules/account/types";
import { tierUpgradeHint } from "@/modules/account/permissions/tier-policy";
import type { AccountUser } from "@/modules/account/types";
import { getUserTier, TIER_LABELS } from "@/modules/account/permissions/tier-policy";

export function TierUpgradeNotice({
  feature,
  user,
  className = "",
}: {
  feature: LoginRequiredFeature;
  user?: AccountUser | null;
  className?: string;
}) {
  const tier = getUserTier(user);
  return (
    <div
      className={`rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ${className}`}
    >
      「{LOGIN_REQUIRED_LABELS[feature]}」需要更高权限。
      {user ? (
        <>
          当前为「{TIER_LABELS[tier]}」，{tierUpgradeHint(user, feature)}。
        </>
      ) : (
        <> 请先登录。</>
      )}
      <Link
        href="/account/login"
        className="ml-2 font-medium underline underline-offset-2"
      >
        {user ? "切换演示账号" : "去登录"}
      </Link>
    </div>
  );
}
