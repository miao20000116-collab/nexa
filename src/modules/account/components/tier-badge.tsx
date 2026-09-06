"use client";

import type { AccountTier } from "@/modules/account/permissions/tier-policy";
import {
  getTierCapabilities,
  TIER_LABELS,
} from "@/modules/account/permissions/tier-policy";
import { LOGIN_REQUIRED_LABELS } from "@/modules/account/types";
import { cn } from "@/lib/utils";

export function TierBadge({
  tier,
  className,
}: {
  tier: AccountTier;
  className?: string;
}) {
  if (tier === "guest") return null;

  const styles: Record<Exclude<AccountTier, "guest">, string> = {
    basic: "bg-zinc-100 text-zinc-600",
    standard: "bg-blue-50 text-blue-700",
    pro: "bg-amber-50 text-amber-800",
  };

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        styles[tier],
        className
      )}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

export function TierCapabilitiesPanel({ tier }: { tier: AccountTier }) {
  const caps = getTierCapabilities(tier);

  return (
    <section className="mt-6 rounded-xl border border-zinc-100 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-medium text-zinc-400">当前权限</p>
        <TierBadge tier={tier} />
        {tier !== "guest" && (
          <span className="text-[12px] text-zinc-400">
            · AI Credits 初始额度 {caps.credits}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {caps.features.map((f) => (
          <li
            key={f.id}
            className={cn(
              "flex items-center gap-2 text-[13px]",
              f.allowed ? "text-zinc-700" : "text-zinc-400"
            )}
          >
            <span aria-hidden>{f.allowed ? "✓" : "–"}</span>
            {LOGIN_REQUIRED_LABELS[f.id]}
            {!f.allowed && (
              <span className="text-[11px] text-zinc-400">（当前不可用）</span>
            )}
          </li>
        ))}
      </ul>
      {tier !== "pro" && tier !== "guest" && (
        <p className="mt-4 text-[12px] text-zinc-400">
          可在登录页切换更高级别的演示账号体验完整能力。
        </p>
      )}
    </section>
  );
}
