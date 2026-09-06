"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CommerceShell } from "@/modules/commerce/amazon/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { formatNumber } from "@/modules/commerce/amazon/metrics";
import { FinancialInventoryPanel } from "@/modules/commerce/components/financial-inventory-panel";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import type { InventoryView } from "@/modules/commerce/amazon/types";

export function InventoryClient() {
  const [data, setData] = useState<InventoryView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/commerce/amazon?view=inventory");
        if (!res.ok || cancelled) return;
        setData(await res.json());
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <CommerceShell
      title="库存风险"
      description="查看库存覆盖与断货风险，便于提前补货决策。"
    >
      {!data && <CommerceContentPlaceholder />}
      {data && (
        <>
          {(() => {
            const priority =
              data.rows.find((r) => r.risk === "high") ||
              data.rows.find((r) => r.risk === "medium") ||
              data.rows[0];
            if (!priority) return null;
            return (
              <section className="mb-8 border-b border-zinc-100 pb-6">
                <p className="text-[12px] font-medium tracking-wide text-zinc-400">
                  今天最值得关注
                </p>
                <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900">
                  {priority.title}
                </h2>
                <p className="mt-2 text-[15px] text-zinc-800">
                  {priority.riskLabel}
                  {priority.daysOfCover !== null
                    ? ` · 约剩 ${formatNumber(priority.daysOfCover, 1)} 天覆盖`
                    : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      requestExpandCommerceProduct(
                        priority.productId,
                        "amazon"
                      )
                    }
                    className="rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white"
                  >
                    查看商品诊断
                  </button>
                  <Link
                    href={`/commerce/amazon/ads?product=${encodeURIComponent(priority.title)}&inventoryBlocked=${priority.risk === "high" ? "1" : "0"}`}
                    className="text-[13px] text-zinc-500 hover:text-zinc-800"
                  >
                    看广告影响
                  </Link>
                </div>
              </section>
            );
          })()}
          <details className="mb-8">
            <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
              展开库存智能面板
            </summary>
            <div className="mt-4">
              <FinancialInventoryPanel mode="inventory" range="7" />
            </div>
          </details>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-zinc-100 text-[12px] text-zinc-400">
                <tr>
                  <th className="px-4 py-2 font-medium">商品</th>
                  <th className="px-4 py-2 font-medium">库存</th>
                  <th className="px-4 py-2 font-medium">在途</th>
                  <th className="px-4 py-2 font-medium">日均销量</th>
                  <th className="px-4 py-2 font-medium">覆盖天数</th>
                  <th className="px-4 py-2 font-medium">风险</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.productId} className="border-b border-zinc-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          requestExpandCommerceProduct(r.productId, "amazon")
                        }
                        className="font-medium text-zinc-800 hover:underline"
                      >
                        {r.title}
                      </button>
                      <p className="text-[11px] text-zinc-400">{r.asin}</p>
                    </td>
                    <td className="px-4 py-3">{formatNumber(r.unitsOnHand)}</td>
                    <td className="px-4 py-3">{formatNumber(r.inboundUnits)}</td>
                    <td className="px-4 py-3">
                      {formatNumber(r.avgDailyUnits, 1)}
                    </td>
                    <td className="px-4 py-3">
                      {r.daysOfCover === null
                        ? "—"
                        : formatNumber(r.daysOfCover, 1)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.risk === "high"
                            ? "text-red-600"
                            : r.risk === "medium"
                              ? "text-amber-700"
                              : "text-emerald-700"
                        }
                      >
                        {r.riskLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CommerceShell>
  );
}
