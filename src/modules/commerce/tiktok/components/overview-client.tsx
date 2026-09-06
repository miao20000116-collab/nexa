"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DeltaText,
  MetricCard,
  TikTokShell,
} from "@/modules/commerce/tiktok/components/shell";
import {
  RankBars,
  TrendChart,
} from "@/modules/commerce/components/charts";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { ActionCluster, NexaInsight, StepIndex } from "@/components/ui/hierarchy";
import { layout, type as typeStyle } from "@/lib/ui-hierarchy";
import {
  commerceSearchHref,
  commerceStrategyCreateHref,
  formatDeltaEvidence,
} from "@/modules/commerce/lib/commerce-create-context";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import { useCommerceQuery } from "@/modules/commerce/lib/use-commerce-query";
import { formatMoney } from "@/modules/commerce/tiktok/metrics";
import type { TikTokOverview } from "@/modules/commerce/tiktok/types";

export function TikTokOverviewClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const { data, error, pending, refreshing } = useCommerceQuery<TikTokOverview>(
    `/api/commerce/tiktok?view=overview&range=${encodeURIComponent(range)}`,
    (status) =>
      status === 401
        ? "需要登录后查看 TikTok Shop 演示数据。"
        : "演示数据加载失败，可刷新重试。"
  );
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <TikTokShell
      title="TikTok Shop 经营概览"
      description="先看内容模式判断，再展开走势与商品明细。"
      range={range}
      refreshing={refreshing}
    >
      {pending && !data && <CommerceContentPlaceholder />}
      {error && <p className="text-[14px] text-zinc-600">{error}</p>}
      {data && (
        <>
          <p className={`mb-8 ${typeStyle.meta}`}>
            {data.storeName} · {data.period.currentStart}–{data.period.currentEnd}{" "}
            vs 上期
          </p>

          {data.contentInsight && (
            <section className="mb-2 border-b border-zinc-200 pb-10">
              <StepIndex value={1} label="优先事项" />
              <p className={`mt-2 ${typeStyle.insightLabel}`}>内容情报</p>
              <h2 className={`mt-2 ${typeStyle.focusTitle}`}>
                {data.contentInsight.title}
              </h2>
              <NexaInsight className="mt-4" label="Nexa 判断">
                {data.contentInsight.detail}
              </NexaInsight>
              <ActionCluster
                primary={{
                  href: commerceStrategyCreateHref({
                    goal: "根据 TikTok 内容洞察生成种草脚本与投放策略",
                    context: {
                      source: "tiktok_diagnosis",
                      platform: "TikTok Shop",
                      productTitle: data.contentInsight.title,
                      productId: data.contentInsight.productId,
                      conclusion: data.contentInsight.detail,
                      evidence: data.products
                        .slice(0, 2)
                        .map((p) =>
                          formatDeltaEvidence(
                            `成交额·${p.title.slice(0, 12)}`,
                            p.gmv.deltaPct
                          )
                        )
                        .filter((x): x is string => Boolean(x)),
                      suggestion:
                        "优先复用高转化内容模式，再决定是否加投或改脚本。",
                      storeId: data.storeContext?.storeId,
                      storeMarketplace: data.marketplace,
                      storeCountry: data.storeContext?.country,
                      storeCurrency: data.currency,
                      storeConnectionStatus:
                        data.storeContext?.connectionStatus,
                    },
                  }),
                  label: "生成策略与内容",
                }}
                secondary={{
                  href: `/commerce/tiktok/content?range=${range}`,
                  label: "查看内容经营",
                }}
                tertiary={[
                  {
                    href: commerceSearchHref(
                      `${data.marketplace} TikTok 带货开场钩子 购买理由`,
                      {
                        product: data.contentInsight.title,
                        storeId: data.storeContext?.storeId,
                        marketplace: data.marketplace,
                        platform: "TikTok Shop",
                      }
                    ),
                    label: "搜索竞品",
                  },
                ]}
              />
            </section>
          )}

          <section className={layout.sectionDivided}>
            <StepIndex value={2} label="证据" />
            <h2 className={`mt-2 mb-4 ${typeStyle.sectionTitle}`}>成交额走势</h2>
            <TrendChart
              label="店铺成交额走势"
              points={(data.series ?? []).map((p) => ({
                date: p.date,
                value: p.gmv,
              }))}
              formatValue={(n) => formatMoney(n)}
            />
          </section>

          <section className={layout.sectionDivided}>
            <StepIndex value={3} label="商品" />
            <h2 className={`mt-2 mb-1 ${typeStyle.sectionTitle}`}>商品侧关注</h2>
            <p className={`mb-5 ${typeStyle.meta}`}>
              每行一个主动作；详情与搜索降为次级。
            </p>
            <div className="space-y-6">
              {data.products.map((p, i) => {
                const suggestion =
                  "先看内容承接与转化，再决定是否加投或改脚本。";
                const evidence = [
                  formatDeltaEvidence("成交额", p.gmv.deltaPct),
                  formatDeltaEvidence("曝光", p.exposure.deltaPct),
                  formatDeltaEvidence("转化率", p.cvr.deltaPct),
                ].filter((x): x is string => Boolean(x));
                const createHref = commerceStrategyCreateHref({
                  goal: `针对「${p.title}」生成种草脚本与投放策略`,
                  context: {
                    source: "tiktok_diagnosis",
                    platform: "TikTok Shop",
                    productTitle: p.title,
                    productId: p.id,
                    conclusion: `成交额 ${formatMoney(p.gmv.current)}，较上期变动需关注`,
                    evidence,
                    suggestion,
                    storeId: data.storeContext?.storeId,
                    storeMarketplace: data.marketplace,
                    storeCountry: data.storeContext?.country,
                    storeCurrency: data.currency,
                    storeConnectionStatus:
                      data.storeContext?.connectionStatus,
                  },
                });
                const highlight = i === 0;
                return (
                  <div
                    key={p.id}
                    className="border-b border-zinc-100 pb-6 last:border-0"
                  >
                    <StepIndex value={i + 1} />
                    <h3
                      className={
                        highlight
                          ? `mt-1.5 ${typeStyle.focusTitle}`
                          : "mt-1.5 text-[15px] font-medium text-zinc-900"
                      }
                    >
                      {p.title}
                    </h3>
                    <p className={`mt-2 ${typeStyle.evidence}`}>
                      成交额 {formatMoney(p.gmv.current)}{" "}
                      <DeltaText value={p.gmv.deltaPct} />
                      {" · "}曝光 <DeltaText value={p.exposure.deltaPct} />
                      {" · "}转化率 <DeltaText value={p.cvr.deltaPct} />
                    </p>
                    <ActionCluster
                      primary={{ href: createHref, label: "生成策略与内容" }}
                      secondary={{
                        label: "查看分析",
                        onClick: () =>
                          requestExpandCommerceProduct(p.id, "tiktok"),
                      }}
                      tertiary={[
                        {
                          href: commerceSearchHref(
                            `${p.title} ${data.marketplace} TikTok 竞品 带货`,
                            {
                              product: p.title,
                              storeId: data.storeContext?.storeId,
                              marketplace: data.marketplace,
                              platform: "TikTok Shop",
                            }
                          ),
                          label: "搜索竞品",
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-8">
            <RankBars
              label="商品成交额贡献（本期）"
              items={data.products
                .slice()
                .sort((a, b) => b.gmv.current - a.gmv.current)
                .map((p) => ({
                  label:
                    p.title.length > 28 ? `${p.title.slice(0, 28)}…` : p.title,
                  value: p.gmv.current,
                }))}
              formatValue={(n) => formatMoney(n)}
            />
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowMetrics((v) => !v)}
              className="text-[13px] text-zinc-500 hover:text-zinc-800"
            >
              {showMetrics ? "收起经营指标" : "查看经营指标（证据）"}
            </button>
            {showMetrics && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="成交额" metric={data.totals.gmv} format="money" />
                <MetricCard label="订单" metric={data.totals.orders} />
                <MetricCard label="商品曝光" metric={data.totals.exposure} />
                <MetricCard label="点击" metric={data.totals.clicks} />
                <MetricCard label="转化率" metric={data.totals.cvr} format="cvr" />
                <MetricCard
                  label="视频归因成交额"
                  metric={data.totals.videoGmv}
                  format="money"
                />
                <MetricCard
                  label="达人成交额"
                  metric={data.totals.creatorGmv}
                  format="money"
                />
              </div>
            )}
          </section>
        </>
      )}
    </TikTokShell>
  );
}
