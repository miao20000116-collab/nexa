"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BackLink, PageHeader } from "@/components/ui/hierarchy";
import { type as typeStyle } from "@/lib/ui-hierarchy";
import type { CreditsSummary } from "@/modules/account/types";
import { LoginForm, useSession } from "@/modules/account/components/account-home";
import { TierBadge } from "@/modules/account/components/tier-badge";
import { getUserTier } from "@/modules/account/permissions/tier-policy";
import { DemoAccountPicker } from "@/modules/account/components/demo-account-picker";
import { CREDIT_CAPABILITIES } from "@/modules/account/credits/policy";

const TYPE_LABELS: Record<string, string> = {
  grant: "发放",
  consume: "消耗",
  adjust: "调整",
  refund: "退回",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  success: "成功",
  failed: "失败",
  refunded: "已退回",
  reserved: "预扣",
};

export function CreditsClient() {
  const { session } = useSession();
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [estimates, setEstimates] = useState<
    Array<{ key: string; label: string; message: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const cRes = await fetch("/api/credits");
        if (cancelled || !cRes.ok) return;
        const data = await cRes.json();
        setCredits(data.credits);

        const keys = [
          "aiOverview",
          "research",
          "generateText",
          "generateImage",
          "generateVideo",
          "qualityCheck",
        ];
        const rows = await Promise.all(
          keys.map(async (key) => {
            const r = await fetch(`/api/credits?capability=${key}`);
            if (!r.ok) return null;
            const j = await r.json();
            return {
              key,
              label:
                CREDIT_CAPABILITIES[key as keyof typeof CREDIT_CAPABILITIES] ??
                key,
              message: j.estimate?.message ?? "—",
            };
          })
        );
        if (!cancelled) {
          setEstimates(rows.filter(Boolean) as typeof estimates);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session?.authenticated]);

  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="积分 Credits"
        description="搜索（网页 / 新闻 / 图片 / 视频）免费。AI 能力消耗 Credits；界面不展示人民币或 Token。"
        eyebrow={
          <BackLink href="/account">← 返回账户</BackLink>
        }
        actions={
          session?.authenticated && session.user ? (
            <TierBadge tier={getUserTier(session.user)} />
          ) : null
        }
      />

      {!credits && (
        <p className="text-[14px] text-zinc-400">正在加载…</p>
      )}

      {credits && (
        <div className="space-y-8">
          <section className="border-b border-zinc-100 pb-6">
            <p className={typeStyle.sectionLabel}>{credits.label}</p>
            <p className={`mt-2 ${typeStyle.focusMetric}`}>{credits.balance}</p>
            <p className={`mt-2 ${typeStyle.bodyMuted}`}>{credits.note}</p>
            {credits.isDemoGrant && (
              <p className="mt-2 text-[12px] text-amber-800">
                含体验额度（非充值、非订阅）。
              </p>
            )}
            {!session?.authenticated && (
              <p className="mt-3 text-[13px] text-zinc-600">
                访客可使用搜索与少量低成本 AI（{credits.balance} Credits
                体验额度）。深度研究 / 图片 / 视频生成需{" "}
                <Link href="/account/login" className="underline">
                  登录
                </Link>
                。
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/create" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800">
                去创作
              </Link>
              <Link href="/workspace" className="text-[13px] text-zinc-500 hover:text-zinc-800">
                去研究 / 工作区
              </Link>
            </div>
          </section>

          <section className="border-t border-zinc-100 pt-8">
            <p className={typeStyle.sectionLabel}>
              AI 能力预计消耗（确认后执行）
            </p>
            <ul className="mt-3 space-y-2">
              {estimates.map((e) => (
                <li
                  key={e.key}
                  className="flex flex-col gap-0.5 text-[13px] sm:flex-row sm:justify-between"
                >
                  <span className="text-zinc-700">{e.label}</span>
                  <span className="text-zinc-500">{e.message}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <p className={`mb-3 ${typeStyle.sectionLabel}`}>积分流水</p>
            {credits.entries.length === 0 ? (
              <p className="text-[14px] text-zinc-400">暂无流水</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                {credits.entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[13px] text-zinc-800">
                        {TYPE_LABELS[e.type] ?? e.type}
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {new Date(e.createdAt).toLocaleString("zh-CN")}
                        {e.capability ? ` · ${e.capability}` : ""}
                        {e.jobId ? ` · job ${e.jobId}` : ""}
                        {e.jobStatus
                          ? ` · ${JOB_STATUS_LABELS[e.jobStatus] ?? e.jobStatus}`
                          : ""}
                      </p>
                    </div>
                    <p
                      className={`text-[14px] font-medium ${
                        e.amount < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {e.amount > 0 ? `+${e.amount}` : e.amount}
                      {e.balance != null ? (
                        <span className="ml-2 text-[12px] font-normal text-zinc-400">
                          余额 {e.balance}
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirectTo = searchParams.get("redirect") || "/account";

  return (
    <div className="mx-auto w-full max-w-[640px] px-[var(--nexa-page-pad-x)] py-12">
      <BackLink href="/account">← 返回账户</BackLink>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900">
        登录 Nexa
      </h1>
      <p className="mt-2 text-[14px] text-zinc-500">
        登录后 Credits 与 Workspace / Assets / Creation 绑定。V2.8 不启用订阅与支付。
      </p>
      {error === "google_pending" && (
        <p className="mt-4 text-[13px] text-zinc-600">
          Google 登录尚未完成接入，请使用邮箱登录。
        </p>
      )}

      <DemoAccountPicker redirectTo={redirectTo} />

      <div className="relative my-10">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-100" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-[12px] text-zinc-400">
            或使用邮箱登录
          </span>
        </div>
      </div>

      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
