"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  DEMO_ACCOUNTS,
  type DemoTier,
} from "@/modules/account/permissions/demo-accounts";
import { TIER_LABELS } from "@/modules/account/permissions/tier-policy";

const TIER_ORDER: DemoTier[] = ["basic", "standard", "pro"];

const TIER_STYLES: Record<
  DemoTier,
  { ring: string; badge: string; button: string }
> = {
  basic: {
    ring: "hover:border-zinc-300",
    badge: "bg-zinc-100 text-zinc-600",
    button: "bg-zinc-800 hover:bg-zinc-700",
  },
  standard: {
    ring: "hover:border-blue-200",
    badge: "bg-blue-50 text-blue-700",
    button: "bg-blue-600 hover:bg-blue-500",
  },
  pro: {
    ring: "hover:border-amber-200",
    badge: "bg-amber-50 text-amber-800",
    button: "bg-amber-600 hover:bg-amber-500",
  },
};

export function DemoAccountPicker({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<DemoTier | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loginDemo = async (tier: DemoTier) => {
    setBusy(tier);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "登录失败");
        return;
      }
      router.push(redirectTo || "/account");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-4">
        <p className="text-[12px] font-medium text-zinc-400">演示账号</p>
        <p className="mt-1 text-[13px] text-zinc-500">
          点击下方卡片一键登录，体验不同权限级别的功能范围
        </p>
      </div>

      <div className="space-y-3">
        {TIER_ORDER.map((tier) => {
          const account = DEMO_ACCOUNTS[tier];
          const styles = TIER_STYLES[tier];
          return (
            <button
              key={tier}
              type="button"
              disabled={busy !== null}
              onClick={() => void loginDemo(tier)}
              className={cn(
                "w-full rounded-xl border border-zinc-100 p-4 text-left transition-colors",
                styles.ring,
                busy === tier && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium text-zinc-900">
                      {account.name}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        styles.badge
                      )}
                    >
                      {TIER_LABELS[tier]}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    {account.description}
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {account.highlights.map((item) => (
                      <li
                        key={item}
                        className="text-[12px] text-emerald-700 before:mr-1.5 before:content-['✓']"
                      >
                        {item}
                      </li>
                    ))}
                    {account.limitations.map((item) => (
                      <li
                        key={item}
                        className="text-[12px] text-zinc-400 before:mr-1.5 before:content-['–']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white",
                    styles.button
                  )}
                >
                  {busy === tier ? "登录中…" : "一键登录"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {message && (
        <p className="mt-3 text-[13px] text-red-600">{message}</p>
      )}
    </section>
  );
}
