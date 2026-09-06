"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CommerceShell } from "@/modules/commerce/amazon/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import {
  CompositionBars,
  RankBars,
} from "@/modules/commerce/components/charts";
import { formatMoney, formatPct } from "@/modules/commerce/amazon/metrics";
import { FinancialInventoryPanel } from "@/modules/commerce/components/financial-inventory-panel";
import type { ProfitBreakdown } from "@/modules/commerce/amazon/types";

export function ProfitClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const [data, setData] = useState<ProfitBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/commerce/amazon?view=profit&range=${encodeURIComponent(range)}`
        );
        if (!res.ok || cancelled) return;
        setData(await res.json());
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [range]);

  const rows = data
    ? [
        { label: "营收", value: data.revenue },
        { label: "− 广告花费", value: -data.adSpend },
        { label: "− 平台费用", value: -data.platformFee },
        { label: "− 亚马逊物流", value: -data.fba },
        { label: "− 物流", value: -data.logistics },
        { label: "− 退款", value: -data.refund },
        { label: "− 销货成本", value: -data.cogs },
      ]
    : [];

  const costItems = data
    ? [
        { label: "广告花费", value: data.adSpend },
        { label: "平台费用", value: data.platformFee },
        { label: "亚马逊物流", value: data.fba },
        { label: "物流", value: data.logistics },
        { label: "退款", value: data.refund },
        { label: "销货成本", value: data.cogs },
      ].sort((a, b) => b.value - a.value)
    : [];

  const productBars =
    data?.byProduct
      .slice()
      .sort((a, b) => b.estimatedProfit - a.estimatedProfit)
      .map((p) => ({
        label: p.title.length > 28 ? `${p.title.slice(0, 28)}…` : p.title,
        value: Math.max(0, p.estimatedProfit),
      })) ?? [];

  return (
    <CommerceShell
      title="利润"
      description="查看预计利润构成，了解收入与主要成本。"
      range={range}
    >
      {!data && <CommerceContentPlaceholder />}
      {data && (
        <div className="space-y-8">
          <section className="border-b border-zinc-100 pb-6">
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              预计利润
            </p>
            <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-[32px]">
              {formatMoney(data.estimatedProfit)}
            </p>
            <p className="mt-2 text-[13px] text-zinc-500">
              vs 上期 {formatMoney(data.previousEstimatedProfit)}（
              {formatPct(data.deltaPct)}）
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-800">
              {data.note}
            </p>
          </section>

          <details>
            <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
              展开财务 / 库存智能面板
            </summary>
            <div className="mt-4">
              <FinancialInventoryPanel mode="joint" range={range} />
            </div>
          </details>

          <div>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between text-[14px] text-zinc-700"
                >
                  <span>{r.label}</span>
                  <span>{formatMoney(r.value)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4">
              <span className="text-[15px] font-semibold text-zinc-900">
                = 预计利润
              </span>
              <span className="text-[18px] font-semibold text-zinc-900">
                {formatMoney(data.estimatedProfit)}
              </span>
            </div>
          </div>

          <CompositionBars
            label="成本占营收比重（看钱花在哪）"
            total={data.revenue}
            items={costItems}
            formatValue={(n) => formatMoney(n)}
          />

          {productBars.length > 0 && (
            <RankBars
              label="分商品预计利润"
              items={productBars}
              formatValue={(n) => formatMoney(n)}
            />
          )}
        </div>
      )}
    </CommerceShell>
  );
}
