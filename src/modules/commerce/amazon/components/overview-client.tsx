"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CommerceShell,
  DeltaText,
  MetricCard,
} from "@/modules/commerce/amazon/components/shell";
import {
  RankBars,
  TrendChart,
} from "@/modules/commerce/components/charts";
import { CommerceSection } from "@/modules/commerce/components/commerce-section";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import {
  ActionCluster,
  NexaInsight,
  StepIndex,
} from "@/components/ui/hierarchy";
import { type as typeStyle } from "@/lib/ui-hierarchy";
import {
  commerceSearchHref,
  commerceStrategyCreateHref,
  formatDeltaEvidence,
} from "@/modules/commerce/lib/commerce-create-context";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import { useCommerceQuery } from "@/modules/commerce/lib/use-commerce-query";
import { formatMoney } from "@/modules/commerce/amazon/metrics";
import type { StoreOverview } from "@/modules/commerce/amazon/types";

const SUGGESTION =
  "流量不一定是主因；优先排查商品页转化与购买理由是否还站得住。";

export function AmazonOverviewClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const { data, error, pending, refreshing } = useCommerceQuery<StoreOverview>(
    `/api/commerce/amazon?view=overview&range=${encodeURIComponent(range)}`,
    (status) =>
      status === 401
        ? "需要登录后查看经营数据。可使用演示账号继续体验。"
        : "演示数据加载失败。可刷新重试。"
  );
  const [showMetrics, setShowMetrics] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const priorities = data
    ? data.alerts.slice(0, 3).map((a, i) => {
        const product = data.products.find((p) => p.productId === a.productId);
        return {
          rank: i + 1,
          ...a,
          sessions: product?.sessions,
          cvr: product?.cvr,
          orders: product?.orders,
          sales: product?.sales,
        };
      })
    : [];

  const salesTrend =
    data?.series?.map((p) => ({ date: p.date, value: p.sales })) ?? [];
  const productBars =
    data?.products
      .slice()
      .sort((a, b) => b.sales.current - a.sales.current)
      .slice(0, 5)
      .map((p) => ({
        label: p.title.length > 28 ? `${p.title.slice(0, 28)}…` : p.title,
        value: p.sales.current,
      })) ?? [];

  return (
    <CommerceShell
      title="Amazon 经营概览"
      description="先看今天最值得处理的事，再展开证据与明细。"
      range={range}
      refreshing={refreshing}
    >
      {pending && !data && <CommerceContentPlaceholder />}
      {error && (
        <div className="space-y-2">
          <p className="text-[14px] text-zinc-600">{error}</p>
          <Link href="/account/login" className="text-[13px] text-zinc-900 underline">
            去登录
          </Link>
        </div>
      )}
      {data && (
        <>
          <p className={typeStyle.meta}>
            {data.storeName} · {data.marketplace} ·{" "}
            {data.period.currentStart}–{data.period.currentEnd} vs 上期
          </p>

          <CommerceSection
            step={1}
            label="优先事项"
            title={`今天最值得处理的 ${Math.max(priorities.length, 1)} 件事`}
          >
            <p className={`mb-6 ${typeStyle.bodyMuted}`}>
              按所选周期与上期对比。结论可带入创作，明细按需展开。
            </p>

            {priorities.length === 0 ? (
              <p className={typeStyle.body}>
                当前区间未发现显著异常。可展开下方指标作例行检查，或拉长到 30/90 天再看。
              </p>
            ) : (
              <ol className="space-y-0">
                {priorities.map((item) => {
                  const evidence = [
                    formatDeltaEvidence("访问量", item.sessions?.deltaPct),
                    formatDeltaEvidence("转化率", item.cvr?.deltaPct),
                    formatDeltaEvidence("订单", item.orders?.deltaPct),
                  ].filter((x): x is string => Boolean(x));
                  const createHref = commerceStrategyCreateHref({
                    goal: `针对「${item.title}」生成策略与商品页/种草内容`,
                    context: {
                      source: "amazon_diagnosis",
                      platform: "Amazon",
                      productTitle: item.title,
                      productId: item.productId,
                      conclusion: item.message,
                      evidence,
                      suggestion: SUGGESTION,
                      storeId: data.storeId,
                      storeMarketplace: data.marketplace,
                      storeCurrency: data.currency,
                      storeConnectionStatus: data.connectionStatus,
                    },
                  });
                  return (
                    <li
                      key={item.productId}
                      className="border-b border-zinc-100 py-8 first:pt-0 last:border-0"
                    >
                      <StepIndex value={item.rank} />
                      <h3 className={`mt-1.5 ${typeStyle.focusTitle}`}>
                        {item.title}
                      </h3>
                      <p className={`mt-2 ${typeStyle.body}`}>{item.message}</p>

                      {(item.sessions || item.cvr || item.orders) && (
                        <p className={`mt-3 ${typeStyle.evidence}`}>
                          证据：
                          {item.sessions && (
                            <>
                              {" "}
                              访问量{" "}
                              <DeltaText value={item.sessions.deltaPct} />
                            </>
                          )}
                          {item.cvr && (
                            <>
                              {" · "}转化率{" "}
                              <DeltaText value={item.cvr.deltaPct} />
                            </>
                          )}
                          {item.orders && (
                            <>
                              {" · "}订单{" "}
                              <DeltaText value={item.orders.deltaPct} />
                            </>
                          )}
                        </p>
                      )}

                      <NexaInsight className="mt-4">{SUGGESTION}</NexaInsight>

                      <ActionCluster
                        primary={{ href: createHref, label: "生成策略与内容" }}
                        secondary={{
                          label: "查看分析",
                          onClick: () =>
                            requestExpandCommerceProduct(
                              item.productId,
                              "amazon"
                            ),
                        }}
                        tertiary={[
                          {
                            href: commerceSearchHref(
                              `${item.title} ${data.marketplace} 竞品商品页转化`,
                              {
                                product: item.title,
                                storeId: data.storeId,
                                marketplace: data.marketplace,
                                platform: "Amazon",
                              }
                            ),
                            label: "搜索竞品",
                          },
                        ]}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </CommerceSection>

          <CommerceSection step={2} label="证据" title="店铺销售额走势">
            <TrendChart
              label="店铺销售额走势"
              points={salesTrend}
              formatValue={(n) => formatMoney(n)}
            />
          </CommerceSection>

          {productBars.length > 0 && (
            <CommerceSection step={3} label="贡献" title="商品销售额贡献（本期）">
              <RankBars
                label="商品销售额贡献（本期）"
                items={productBars}
                formatValue={(n) => formatMoney(n)}
              />
            </CommerceSection>
          )}

          <CommerceSection step={4} label="明细" title="经营指标与商品清单">
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => setShowMetrics((v) => !v)}
                className={typeStyle.meta + " hover:text-zinc-700"}
              >
                {showMetrics ? "收起经营指标" : "查看经营指标"}
              </button>
              <button
                type="button"
                onClick={() => setShowProducts((v) => !v)}
                className={typeStyle.meta + " hover:text-zinc-700"}
              >
                {showProducts ? "收起商品清单" : "查看商品清单"}
              </button>
            </div>
            {showMetrics && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="销售额" metric={data.totals.sales} format="money" />
                <MetricCard label="访问量" metric={data.totals.sessions} />
                <MetricCard label="转化率" metric={data.totals.cvr} format="cvr" />
                <MetricCard label="客单价" metric={data.totals.aov} format="money" />
                <MetricCard label="广告花费" metric={data.totals.adSpend} format="money" />
                <MetricCard label="广告成本比" metric={data.totals.acos} format="pct" />
                <MetricCard
                  label="预计利润"
                  metric={data.totals.estimatedProfit}
                  format="money"
                />
                <MetricCard label="订单" metric={data.totals.orders} />
              </div>
            )}
            {showProducts && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-[13px]">
                  <thead className="border-b border-zinc-100 text-[12px] text-zinc-400">
                    <tr>
                      <th className="py-2 pr-4 font-medium">商品</th>
                      <th className="py-2 pr-4 font-medium">销售额</th>
                      <th className="py-2 pr-4 font-medium">访问量</th>
                      <th className="py-2 pr-4 font-medium">转化率</th>
                      <th className="py-2 font-medium">变动</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.productId} className="border-b border-zinc-50">
                        <td className="py-3 pr-4">
                          <button
                            type="button"
                            onClick={() =>
                              requestExpandCommerceProduct(p.productId, "amazon")
                            }
                            className="font-medium text-zinc-800 hover:underline"
                          >
                            {p.title}
                          </button>
                          <p className="text-[11px] text-zinc-400">{p.asin}</p>
                        </td>
                        <td className="py-3 pr-4">
                          {formatMoney(p.sales.current)}
                        </td>
                        <td className="py-3 pr-4">
                          {Math.round(p.sessions.current)}
                        </td>
                        <td className="py-3 pr-4">
                          {(p.cvr.current * 100).toFixed(1)}%
                        </td>
                        <td className="py-3">
                          <DeltaText value={p.sales.deltaPct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[12px] text-zinc-400">
                  涨跌均相对上一同长度周期计算。
                </p>
              </div>
            )}
          </CommerceSection>
        </>
      )}
    </CommerceShell>
  );
}
