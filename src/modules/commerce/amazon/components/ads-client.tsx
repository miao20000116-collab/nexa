"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { StepIndex } from "@/components/ui/hierarchy";
import {
  CommerceShell,
  MetricCard,
} from "@/modules/commerce/amazon/components/shell";
import {
  CompositionBars,
  RankBars,
} from "@/modules/commerce/components/charts";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { commerceCreateHref } from "@/modules/commerce/intelligence/types";
import {
  formatCvr,
  formatMoney,
  formatNumber,
} from "@/modules/commerce/amazon/metrics";
import { AdvertisingIntelligencePanel } from "@/modules/commerce/components/advertising-intelligence-panel";
import { useCommerceQuery } from "@/modules/commerce/lib/use-commerce-query";
import type { AdsDiagnosis } from "@/modules/commerce/amazon/types";

const TABS = [
  { id: "overview", label: "概览" },
  { id: "campaign", label: "广告活动" },
  { id: "terms", label: "搜索词" },
  { id: "product", label: "商品" },
  { id: "placement", label: "版位" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdsClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const inventoryBlocked = searchParams.get("inventoryBlocked") === "1";
  const continuityProduct = searchParams.get("product")?.trim() || "";
  const continuityStoreId = searchParams.get("storeId")?.trim() || "";
  const [tab, setTab] = useState<TabId>("overview");
  const [showMetrics, setShowMetrics] = useState(false);
  const { data, pending, refreshing } = useCommerceQuery<AdsDiagnosis>(
    `/api/commerce/amazon?view=ads&range=${encodeURIComponent(range)}`
  );

  return (
    <CommerceShell
      title="广告诊断"
      description="先看优先建议，再按需查看广告活动、搜索词与版位明细。"
      range={range}
      refreshing={refreshing}
    >
      {(inventoryBlocked || continuityProduct || continuityStoreId) && (
        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-900">
          {inventoryBlocked
            ? "库存工作流提示：低库存场景下不应盲目加投。广告智能会结合库存约束给出建议。"
            : "已从 Commerce 工作流带入商品上下文。"}
          {(continuityProduct || continuityStoreId) && (
            <span className="mt-1 block text-[12px] text-amber-800/80">
              {[
                continuityProduct ? `商品：${continuityProduct}` : null,
                continuityStoreId ? `店铺：${continuityStoreId}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-zinc-100 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-[13px] ${
              tab === t.id
                ? "font-medium text-zinc-900 underline underline-offset-4"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data && pending && <CommerceContentPlaceholder />}

      {data && tab === "overview" && (
        <div className="space-y-8">
          <section>
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              优先事项
            </p>
            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900 sm:text-[22px]">
              今天最值得先处理的广告问题
            </h2>
            <ol className="mt-5 space-y-5">
              {(data.actions?.length
                ? data.actions.map((a) => a.label)
                : data.suggestions
              ).map((s, i) => (
                <li
                  key={s}
                  className="border-b border-zinc-100 pb-5 last:border-0"
                >
                  <StepIndex value={i + 1} />
                  <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-800">
                    {s}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[12px] text-zinc-400">
              建议供参考，广告投放请在 Amazon 后台自行调整。
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
              <button
                type="button"
                onClick={() => setTab("terms")}
                className="font-medium text-zinc-900 underline underline-offset-4"
              >
                查看搜索词
              </button>
              {(data.actions?.length
                ? data.actions.filter((a) => a.kind !== "link" || a.href !== "#terms")
                : []
              ).map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="text-zinc-500 hover:text-zinc-800"
                >
                  {a.label}
                </Link>
              ))}
              {!data.actions?.length && (
                <>
                  <Link
                    href={`/search?q=${encodeURIComponent("亚马逊广告低效词优化 广告成本比")}`}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    搜索优化方法
                  </Link>
                  <Link
                    href={commerceCreateHref({
                      goal: "根据广告诊断写商品页承接与购买理由内容",
                      context: data.suggestions.join("；"),
                      platform: "Amazon",
                    })}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    生成承接内容
                  </Link>
                </>
              )}
            </div>
          </section>

          <details className="border-t border-zinc-100 pt-6">
            <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
              展开广告智能分析面板
            </summary>
            <div className="mt-4">
              <AdvertisingIntelligencePanel channel="amazon" range={range} />
            </div>
          </details>

          <section className="grid gap-8 lg:grid-cols-2">
            <RankBars
              label="广告活动花费（本期）"
              items={data.campaigns
                .slice()
                .sort((a, b) => b.spend - a.spend)
                .slice(0, 5)
                .map((c) => ({
                  label: c.name.length > 24 ? `${c.name.slice(0, 24)}…` : c.name,
                  value: c.spend,
                }))}
              formatValue={(n) => formatMoney(n)}
            />
            <CompositionBars
              label="版位花费占比"
              total={data.placements.reduce((s, p) => s + p.spend, 0) || 1}
              items={data.placements.map((p) => ({
                label: p.placement,
                value: p.spend,
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
              {showMetrics ? "收起广告指标" : "查看广告指标（证据）"}
            </button>
            {showMetrics && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="广告花费"
                  metric={data.overview.spend}
                  format="money"
                />
                <MetricCard
                  label="广告销售额"
                  metric={data.overview.sales}
                  format="money"
                />
                <MetricCard label="点击" metric={data.overview.clicks} />
                <MetricCard label="订单" metric={data.overview.orders} />
                <MetricCard
                  label="广告成本比"
                  metric={data.overview.acos}
                  format="pct"
                />
                <MetricCard
                  label="广告回报"
                  metric={data.overview.roas}
                  format="x"
                />
              </div>
            )}
          </section>
        </div>
      )}

      {data && tab === "campaign" && (
        <Table
          headers={[
            "广告活动",
            "花费",
            "点击",
            "订单",
            "销售额",
            "广告成本比",
            "广告回报",
          ]}
          rows={data.campaigns.map((c) => [
            c.name,
            formatMoney(c.spend),
            formatNumber(c.clicks),
            formatNumber(c.orders),
            formatMoney(c.sales),
            c.acos === null ? "—" : `${(c.acos * 100).toFixed(1)}%`,
            c.roas === null ? "—" : `${c.roas.toFixed(2)}x`,
          ])}
        />
      )}

      {data && tab === "terms" && (
        <div className="space-y-4">
          <p className="text-[12px] text-zinc-500">
            高花费低转化词可点「否定研究 / 生成商品页」——不会自动改 Amazon 出价。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400">
                  <th className="py-2 pr-2 font-medium">搜索词</th>
                  <th className="py-2 pr-2 font-medium">花费</th>
                  <th className="py-2 pr-2 font-medium">订单</th>
                  <th className="py-2 pr-2 font-medium">广告成本比</th>
                  <th className="py-2 font-medium">行动</th>
                </tr>
              </thead>
              <tbody>
                {data.searchTerms.slice(0, 40).map((t) => {
                  const waste =
                    t.spend > 20 && (t.orders === 0 || (t.acos ?? 0) > 0.6);
                  return (
                    <tr
                      key={`${t.campaignId}-${t.term}`}
                      className="border-b border-zinc-50"
                    >
                      <td className="py-2.5 pr-2 text-zinc-800">{t.term}</td>
                      <td className="py-2.5 pr-2">{formatMoney(t.spend)}</td>
                      <td className="py-2.5 pr-2">{formatNumber(t.orders)}</td>
                      <td className="py-2.5 pr-2">
                        {t.acos === null
                          ? "—"
                          : `${(t.acos * 100).toFixed(1)}%`}
                      </td>
                      <td className="py-2.5">
                        {waste ? (
                          <span className="flex flex-wrap gap-2">
                            <Link
                              href={`/search?q=${encodeURIComponent(
                                `亚马逊广告否定 "${t.term}"`
                              )}`}
                              className="text-zinc-600 underline-offset-2 hover:underline"
                            >
                              否定研究
                            </Link>
                            <Link
                              href={commerceCreateHref({
                                goal: `围绕低效词「${t.term}」优化商品页承接`,
                                context: `低效词 ${t.term}；花费 $${t.spend.toFixed(2)}；订单 ${t.orders}`,
                                platform: "Amazon",
                              })}
                              className="text-zinc-600 underline-offset-2 hover:underline"
                            >
                              生成商品页
                            </Link>
                          </span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && tab === "product" && (
        <Table
          headers={["商品", "花费", "销售额", "广告成本比", "广告回报"]}
          rows={data.products.map((p) => [
            p.title,
            formatMoney(p.spend),
            formatMoney(p.sales),
            p.acos === null ? "—" : `${(p.acos * 100).toFixed(1)}%`,
            p.roas === null ? "—" : `${p.roas.toFixed(2)}x`,
          ])}
        />
      )}

      {data && tab === "placement" && (
        <Table
          headers={["版位", "花费", "占比"]}
          rows={data.placements.map((p) => [
            p.placement,
            formatMoney(p.spend),
            `${p.sharePct.toFixed(1)}%`,
          ])}
        />
      )}
    </CommerceShell>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-zinc-100 text-[12px] text-zinc-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-50">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-3 text-zinc-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
