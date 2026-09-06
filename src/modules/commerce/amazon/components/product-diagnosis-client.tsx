"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CommerceShell,
  DeltaText,
  MetricCard,
} from "@/modules/commerce/amazon/components/shell";
import { DualTrendChart } from "@/modules/commerce/components/charts";
import { IntelligenceFindingsPanel } from "@/modules/commerce/intelligence/findings-panel";
import { ListingIntelligencePanel } from "@/modules/commerce/components/listing-intelligence-panel";
import { CustomerIntelligencePanel } from "@/modules/commerce/components/customer-intelligence-panel";
import {
  commerceStrategyCreateHref,
  formatDeltaEvidence,
} from "@/modules/commerce/lib/commerce-create-context";
import { commerceSearchHref } from "@/modules/commerce/intelligence/types";
import { workflowResearchHref } from "@/modules/commerce/workflow/hrefs";
import type { ProductDiagnosis } from "@/modules/commerce/amazon/types";

type ActiveStoreInfo = {
  storeId: string;
  marketplace: string;
  country?: string;
  currency?: string;
  connectionStatus?: string;
  label?: string;
};

export function ProductDiagnosisClient({
  productId,
  initialRange = "7",
  initialData = null,
  initialError = null,
  variant = "page",
}: {
  productId: string;
  initialRange?: string;
  initialData?: ProductDiagnosis | null;
  initialError?: string | null;
  /** Inline under product list — no back link / compact shell. */
  variant?: "page" | "inline";
}) {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const [data, setData] = useState<ProductDiagnosis | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<ActiveStoreInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/commerce/stores?platform=Amazon");
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          activeStoreId?: string;
          stores?: Array<{
            id: string;
            marketplace: string;
            country?: string;
            currency?: string;
            connectionStatus?: string;
            label?: string;
          }>;
        };
        const active =
          json.stores?.find((s) => s.id === json.activeStoreId) ||
          json.stores?.[0];
        if (active && !cancelled) {
          setStore({
            storeId: active.id,
            marketplace: active.marketplace,
            country: active.country,
            currency: active.currency,
            connectionStatus: active.connectionStatus,
            label: active.label,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (range === initialRange && initialData) {
      setData(initialData);
      setError(initialError);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // Soft refresh: keep previous diagnosis on screen
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await fetch(
        `/api/commerce/amazon?view=product&productId=${encodeURIComponent(productId)}&range=${encodeURIComponent(range)}`
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
  }, [productId, range, initialRange, initialData, initialError]);

  const primaryCreate = useMemo(
    () => data?.nextActions.find((a) => a.kind === "create"),
    [data]
  );
  const primarySearch = useMemo(
    () => data?.nextActions.find((a) => a.kind === "search"),
    [data]
  );
  const otherActions = useMemo(
    () =>
      (data?.nextActions ?? []).filter(
        (a) => a !== primaryCreate && a !== primarySearch
      ),
    [data, primaryCreate, primarySearch]
  );
  const topFinding = data?.intelligence?.findings?.[0];
  const suggestion =
    topFinding?.suggestion ??
    "先确认流量是否稳定，再判断是承接问题还是曝光问题。";
  const keyEvidence = useMemo(
    () => (data?.evidence ?? []).slice(0, 3),
    [data]
  );
  const extraEvidence = useMemo(
    () => (data?.evidence ?? []).slice(3),
    [data]
  );
  const sessionsTrend = useMemo(
    () =>
      (data?.series ?? []).map((p) => ({ date: p.date, value: p.sessions })),
    [data]
  );
  const cvrTrend = useMemo(
    () => (data?.series ?? []).map((p) => ({ date: p.date, value: p.cvr })),
    [data]
  );
  const createHref = useMemo(() => {
    if (!data) return null;
    const evidence = [
      formatDeltaEvidence("访问量", data.metrics.sessions.deltaPct),
      formatDeltaEvidence("转化率", data.metrics.cvr.deltaPct),
      formatDeltaEvidence("订单", data.metrics.orders.deltaPct),
    ].filter((x): x is string => Boolean(x));
    return commerceStrategyCreateHref({
      goal: `基于 Amazon 诊断为「${data.title}」生成策略与 商品页/种草内容`,
      context: {
        source: "amazon_diagnosis",
        platform: "Amazon",
        productTitle: data.title,
        productId,
        conclusion: data.conclusion,
        evidence,
        suggestion,
        diagnosis: data.conclusion,
        opportunity: suggestion,
        storeId: store?.storeId,
        storeMarketplace: store?.marketplace,
        storeCountry: store?.country,
        storeCurrency: store?.currency,
        storeConnectionStatus: store?.connectionStatus,
      },
    });
  }, [data, suggestion, store, productId]);
  const searchHref = useMemo(() => {
    if (primarySearch?.href) return primarySearch.href;
    if (!data) return "/search";
    return commerceSearchHref(`${data.title} 竞品商品页 转化`, {
      product: data.title,
      storeId: store?.storeId,
      marketplace: store?.marketplace,
      from: "commerce",
    });
  }, [primarySearch, data, store]);
  const researchHref = useMemo(() => {
    if (!data) return null;
    return workflowResearchHref({
      version: 1,
      stage: "research",
      platform: "Amazon",
      marketplace: store?.marketplace,
      country: store?.country,
      currency: store?.currency,
      storeId: store?.storeId,
      productTitle: data.title,
      productId,
      diagnosis: data.conclusion,
      opportunity: suggestion,
      evidence: [
        formatDeltaEvidence("转化率", data.metrics.cvr.deltaPct) || "",
      ].filter(Boolean),
      contentGoal: `为什么「${data.title}」出现：${data.conclusion}？`,
      source: "amazon_diagnosis",
    });
  }, [data, store, productId, suggestion]);

  return (
    <CommerceShell
      title={data?.title ?? "商品诊断"}
      description={
        data
          ? "一页看清：结论、关键证据、下一步怎么做。"
          : "正在打开诊断…"
      }
      range={range}
      back={
        variant === "page"
          ? {
              href: `/commerce/amazon/products?range=${range}`,
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
          {/* Identity — quiet */}
          <div>
            <p className="text-[12px] text-zinc-400">
              {data.asin} · 演示数据 · 对比上期
            </p>
          </div>

          {/* Verdict — the only hero */}
          <section>
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              当前最重要的问题
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-zinc-900">
              {data.conclusion}
            </p>
            <div className="mt-4">
              <p className="text-[12px] font-medium tracking-wide text-zinc-400">
                Nexa 判断
              </p>
              <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-zinc-800 sm:text-[16px]">
                {suggestion}
              </p>
            </div>
          </section>

          {/* Actions — immediately after verdict */}
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
            {researchHref && (
              <Link
                href={researchHref}
                className="text-[13px] text-zinc-500 hover:text-zinc-800"
              >
                深入研究
              </Link>
            )}
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
                {otherActions.map((action) => (
                  <li key={action.href + action.label}>
                    <Link
                      href={action.href}
                      className="text-[13px] text-zinc-500 hover:text-zinc-800"
                    >
                      {action.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Traffic vs conversion — the diagnostic chart */}
          {sessionsTrend.length >= 2 && (
            <section>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                流量 vs 转化走势
              </p>
              <DualTrendChart
                a={sessionsTrend}
                b={cvrTrend}
                aLabel="访问量"
                bLabel="转化率"
              />
              <p className="mt-2 text-[12px] text-zinc-400">
                若访问量稳、转化率下行 → 优先改商品页；若两者同降 → 先查曝光与库存。
              </p>
            </section>
          )}

          {/* Key evidence — 3 metrics, not a ledger */}
          <section>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
              关键证据
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {keyEvidence.map((e) => (
                <div key={e.label} className="border-t border-zinc-200 pt-3">
                  <p className="text-[12px] text-zinc-500">{e.label}</p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums text-zinc-900">
                    {e.current}
                  </p>
                  <p className="mt-0.5 text-[13px] text-zinc-500">
                    上期 {e.previous} · <DeltaText value={e.deltaPct} />
                  </p>
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
                  : `查看全部 ${data.evidence.length} 项指标`}
              </button>
            )}
            {showAllEvidence && (
              <div className="mt-4 space-y-4">
                <ul className="space-y-3 border-t border-zinc-100 pt-3">
                  {extraEvidence.map((e) => (
                    <li
                      key={e.label}
                      className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-zinc-800">
                          {e.label}
                        </p>
                        {e.detail && (
                          <p className="mt-0.5 text-[12px] text-zinc-400">
                            {e.detail}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-[13px] text-zinc-600">
                        {e.previous} → {e.current}{" "}
                        <DeltaText value={e.deltaPct} />
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="销售额"
                    metric={data.metrics.sales}
                    format="money"
                  />
                  <MetricCard label="访问量" metric={data.metrics.sessions} />
                  <MetricCard
                    label="转化率"
                    metric={data.metrics.cvr}
                    format="cvr"
                  />
                  <MetricCard label="订单" metric={data.metrics.orders} />
                </div>
              </div>
            )}
          </section>

          {/* Findings — top issues only by default */}
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
            productTitle={data.title}
            productId={data.productId}
            channel="amazon"
            platform="Amazon"
            category={data.category}
            listingWeaknesses={data.listingWeaknesses}
            listingChecklist={data.listingChecklist}
          />

          <CustomerIntelligencePanel
            channel="amazon"
            platform="Amazon"
            productTitle={data.title}
            productId={data.productId}
          />
        </div>
      )}
    </CommerceShell>
  );
}
