"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DeltaText,
  MetricCard,
  TikTokShell,
} from "@/modules/commerce/tiktok/components/shell";
import { DualTrendChart } from "@/modules/commerce/components/charts";
import { IntelligenceFindingsPanel } from "@/modules/commerce/intelligence/findings-panel";
import { ListingIntelligencePanel } from "@/modules/commerce/components/listing-intelligence-panel";
import { CustomerIntelligencePanel } from "@/modules/commerce/components/customer-intelligence-panel";
import {
  commerceStrategyCreateHref,
  formatDeltaEvidence,
} from "@/modules/commerce/lib/commerce-create-context";
import { UI } from "@/lib/ui-copy";
import type { TikTokProductDiagnosis } from "@/modules/commerce/tiktok/types";

export function TikTokProductDiagnosisClient({
  productId,
  initialRange = "7",
  initialData = null,
  initialError = null,
  variant = "page",
}: {
  productId: string;
  initialRange?: string;
  initialData?: TikTokProductDiagnosis | null;
  initialError?: string | null;
  variant?: "page" | "inline";
}) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const [data, setData] = useState<TikTokProductDiagnosis | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (range === initialRange && initialData) {
      setData(initialData);
      setError(initialError);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await fetch(
        `/api/commerce/tiktok?view=product&productId=${encodeURIComponent(productId)}&range=${encodeURIComponent(range)}`
      );
      if (cancelled) return;
      if (!res.ok) {
        setError(
          res.status === 401
            ? "需要登录后查看商品诊断。可使用演示账号继续体验。"
            : "商品不存在或加载失败，可返回列表重试。"
        );
        setLoading(false);
        return;
      }
      setData(await res.json());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soft-refresh keeps prior data
  }, [productId, range, initialData, initialRange, initialError]);

  const actions = data?.diagnosis.nextActions ?? [];
  const primaryCreate = useMemo(
    () => actions.find((a) => a.kind === "create" && a.href && !a.blockedAi),
    [actions]
  );
  const primarySearch = useMemo(
    () => actions.find((a) => a.kind === "search" && a.href),
    [actions]
  );
  const otherActions = useMemo(
    () =>
      actions.filter(
        (a) => a !== primaryCreate && a !== primarySearch
      ),
    [actions, primaryCreate, primarySearch]
  );
  const topFinding = data?.intelligence?.findings?.[0];
  const suggestion =
    topFinding?.suggestion ??
    "先看内容承接与转化，再决定是否加投或改脚本。";
  const keyEvidence = useMemo(
    () => (data?.diagnosis.evidence ?? []).slice(0, 3),
    [data]
  );
  const extraEvidence = useMemo(
    () => (data?.diagnosis.evidence ?? []).slice(3),
    [data]
  );
  const exposureTrend = useMemo(
    () =>
      (data?.series ?? []).map((p) => ({ date: p.date, value: p.exposure })),
    [data]
  );
  const cvrTrend = useMemo(
    () => (data?.series ?? []).map((p) => ({ date: p.date, value: p.cvr })),
    [data]
  );
  const createHref = useMemo(() => {
    if (!data) return null;
    const evidence = [
      formatDeltaEvidence("成交额", data.product.gmv.deltaPct),
      formatDeltaEvidence("曝光", data.product.exposure.deltaPct),
      formatDeltaEvidence("转化率", data.product.cvr.deltaPct),
      formatDeltaEvidence("订单", data.product.orders.deltaPct),
    ].filter((x): x is string => Boolean(x));
    return commerceStrategyCreateHref({
      goal: `基于 TikTok 诊断为「${data.product.title}」生成种草脚本与投放策略`,
      context: {
        source: "tiktok_diagnosis",
        platform: "TikTok Shop",
        productTitle: data.product.title,
        productId,
        conclusion: data.diagnosis.opportunity,
        evidence,
        suggestion,
        diagnosis: data.diagnosis.opportunity,
        opportunity: suggestion,
      },
    });
  }, [data, suggestion, productId]);
  const searchHref =
    primarySearch?.href ??
    (data
      ? `/search?q=${encodeURIComponent(`TikTok Shop ${data.product.title} 竞品 带货`)}&from=commerce&product=${encodeURIComponent(data.product.title)}`
      : "/search");

  return (
    <TikTokShell
      title={data?.product.title ?? "商品诊断"}
      description={
        data
          ? "一页看清：结论、关键证据、下一步怎么做。"
          : "正在打开诊断…"
      }
      range={range}
      back={
        variant === "page"
          ? {
              href: `/commerce/tiktok/products?range=${range}`,
              label: "← 返回商品列表",
            }
          : undefined
      }
      refreshing={loading && Boolean(data)}
    >
      {error && (
        <div className="space-y-2">
          <p className="text-[14px] text-zinc-600">{error}</p>
        </div>
      )}
      {!data && !error && (
        <p className="text-[14px] text-zinc-400">
          {loading ? "正在切换时间范围…" : "正在打开诊断…"}
        </p>
      )}
      {data && (
        <div
          className={
            variant === "inline"
              ? "w-full space-y-8"
              : "mx-auto max-w-[720px] space-y-8"
          }
        >
          <div>
            <p className="text-[12px] text-zinc-400">
              {data.product.productId} · 演示数据 · 对比上期
            </p>
          </div>

          <section>
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              诊断结论
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-zinc-900">
              {data.diagnosis.opportunity}
            </p>
            <p className="mt-2 text-[13px] text-zinc-500">
              可信度 {data.diagnosis.confidenceLabel}
            </p>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-zinc-600">
              {suggestion}
            </p>
            <p className="mt-2 text-[12px] text-zinc-400">
              诊断结果写入「策略工作区」，不与创作台混用。
            </p>
          </section>

          <section className="flex flex-wrap items-center gap-3 border-y border-zinc-100 py-5">
            {createHref && (
              <Link
                href={createHref}
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800"
              >
                生成策略与内容
              </Link>
            )}
            <Link
              href={searchHref}
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
            >
              搜索竞品
            </Link>
            {otherActions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMoreActions((v) => !v)}
                className="text-[13px] text-zinc-400 hover:text-zinc-700"
              >
                {showMoreActions ? "收起动作" : "更多动作"}
              </button>
            )}
            {showMoreActions && (
              <ul className="basis-full space-y-2 pt-1">
                {otherActions.map((action) => {
                  if (action.blockedAi) {
                    return (
                      <li key={action.label} className="text-[13px] text-zinc-500">
                        {action.label} — {UI.common.aiUnavailable}
                      </li>
                    );
                  }
                  if (!action.href) return null;
                  return (
                    <li key={action.href + action.label}>
                      <Link
                        href={action.href}
                        className="text-[13px] text-zinc-500 hover:text-zinc-800"
                      >
                        {action.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {exposureTrend.length >= 2 && (
            <section>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                曝光 vs 转化走势
              </p>
              <DualTrendChart
                a={exposureTrend}
                b={cvrTrend}
                aLabel="曝光"
                bLabel="转化率"
              />
              <p className="mt-2 text-[12px] text-zinc-400">
                曝光稳、转化率下行 → 优先改内容承接；同降则先查投放与达人供给。
              </p>
            </section>
          )}

          <section>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
              关键证据
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {keyEvidence.map((e) => (
                <div key={e.label} className="border-t border-zinc-200 pt-3">
                  <p className="text-[12px] text-zinc-500">{e.label}</p>
                  <p className="mt-1 text-[14px] font-medium leading-snug text-zinc-900">
                    {e.detail}
                  </p>
                  {e.deltaPct !== undefined && (
                    <p className="mt-1 text-[13px] text-zinc-500">
                      <DeltaText value={e.deltaPct} />
                    </p>
                  )}
                </div>
              ))}
            </div>
            {extraEvidence.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllEvidence((v) => !v)}
                className="mt-4 text-[13px] text-zinc-500 hover:text-zinc-800"
              >
                {showAllEvidence
                  ? "收起全部指标"
                  : `查看全部 ${data.diagnosis.evidence.length} 项指标`}
              </button>
            )}
            {showAllEvidence && (
              <div className="mt-4 space-y-4">
                <ul className="space-y-3 border-t border-zinc-100 pt-3">
                  {extraEvidence.map((e) => (
                    <li key={e.label} className="border-b border-zinc-50 pb-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <p className="text-[13px] font-medium text-zinc-800">
                          {e.label}
                        </p>
                        {e.deltaPct !== undefined && (
                          <DeltaText value={e.deltaPct} />
                        )}
                      </div>
                      <p className="mt-1 text-[13px] text-zinc-600">{e.detail}</p>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="成交额"
                    metric={data.product.gmv}
                    format="money"
                  />
                  <MetricCard label="订单" metric={data.product.orders} />
                  <MetricCard
                    label="转化率"
                    metric={data.product.cvr}
                    format="cvr"
                  />
                  <MetricCard
                    label="视频归因成交额"
                    metric={data.product.videoGmv}
                    format="money"
                  />
                </div>
              </div>
            )}
          </section>

          {data.intelligence && (
            <section>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                优先处理
              </p>
              <IntelligenceFindingsPanel
                report={data.intelligence}
                previewCount={2}
              />
            </section>
          )}

          <ListingIntelligencePanel
            productTitle={data.product.title}
            productId={data.product.productId}
            channel="tiktok"
            platform="TikTok Shop"
            category={data.category}
            listingWeaknesses={data.listingWeaknesses}
          />

          <CustomerIntelligencePanel
            channel="tiktok"
            platform="TikTok Shop"
            productTitle={data.product.title}
            productId={data.product.productId}
          />
        </div>
      )}
    </TikTokShell>
  );
}
