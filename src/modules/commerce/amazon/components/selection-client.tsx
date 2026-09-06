"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CommerceShell } from "@/modules/commerce/amazon/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { IntelligenceFindingsPanel } from "@/modules/commerce/intelligence/findings-panel";
import { ProductResearchPanel } from "@/modules/commerce/components/product-research-panel";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import { competitionLevelLabel } from "@/modules/commerce/lib/metric-labels";
import type { SelectionResearchView } from "@/modules/commerce/amazon/types";

export function SelectionClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const initialQuery = searchParams.get("q") || "";
  const [data, setData] = useState<SelectionResearchView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/commerce/amazon?view=selection&range=${encodeURIComponent(range)}`
      );
      if (!res.ok || cancelled) return;
      setData(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <CommerceShell
      title="选品调研"
      description="AI 选品调研（公开证据）+ 演示货盘机会表。可跳转搜索、深入研究或生成内容。"
      range={range}
    >
      <div className="mb-10">
        <ProductResearchPanel
          key={initialQuery || "empty"}
          defaultMarketplace="Amazon US"
          initialQuery={initialQuery}
        />
      </div>

      {!data && (
        <CommerceContentPlaceholder />
      )}

      {data && (
        <div className="space-y-10">
          <section>
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              优先结论
            </p>
            <h2 className="mt-2 text-[18px] font-semibold text-zinc-900">
              {data.intelligence.diagnosis}
            </h2>
            <div className="mt-5">
              <IntelligenceFindingsPanel
                report={data.intelligence}
                previewCount={3}
              />
            </div>
          </section>

          <section>
            <p className="mb-3 text-[12px] font-medium tracking-wide text-zinc-400">
              机会表
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-zinc-400">
                    <th className="py-2 pr-3 font-medium">商品</th>
                    <th className="py-2 pr-3 font-medium">需求分</th>
                    <th className="py-2 pr-3 font-medium">竞争</th>
                    <th className="py-2 pr-3 font-medium">预估毛利</th>
                    <th className="py-2 font-medium">缺口</th>
                  </tr>
                </thead>
                <tbody>
                  {data.opportunities.map((o) => (
                    <tr
                      key={o.productId}
                      className="border-b border-zinc-50 align-top"
                    >
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() =>
                            requestExpandCommerceProduct(o.productId, "amazon")
                          }
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {o.title}
                        </button>
                        <p className="mt-0.5 text-[12px] text-zinc-400">
                          {o.asin} · {o.category}
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-zinc-800">{o.demandScore}</td>
                      <td className="py-3 pr-3 text-zinc-800">
                        {competitionLevelLabel(o.competitionLevel)}
                      </td>
                      <td className="py-3 pr-3 text-zinc-800">
                        {(o.marginEstimate * 100).toFixed(0)}%
                      </td>
                      <td className="max-w-[280px] py-3 text-zinc-600">
                        {o.gapNotes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </CommerceShell>
  );
}
