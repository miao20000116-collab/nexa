"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TikTokShell } from "@/modules/commerce/tiktok/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import {
  formatCvr,
  formatMoney,
  formatNumber,
} from "@/modules/commerce/tiktok/metrics";
import type { TikTokCreatorsView } from "@/modules/commerce/tiktok/types";

export function TikTokCreatorsClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const [data, setData] = useState<TikTokCreatorsView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/commerce/tiktok?view=creators&range=${encodeURIComponent(range)}`
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

  return (
    <TikTokShell
      title="达人 / 联盟"
      description="查看达人带货表现，便于决定合作重点。"
      range={range}
    >
      {!data && <CommerceContentPlaceholder />}
      {data && (
        <div className="space-y-8">
          {data.aiActions[0] && (
            <section className="border-b border-zinc-100 pb-6">
              <p className="text-[12px] font-medium tracking-wide text-zinc-400">
                合作重点
              </p>
              <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900">
                {data.aiActions[0].label}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-800">
                {data.aiActions[0].message}
              </p>
              {data.aiActions.length > 1 && (
                <ul className="mt-4 space-y-2">
                  {data.aiActions.slice(1).map((a) => (
                    <li key={a.label} className="text-[13px] text-zinc-600">
                      <span className="font-medium text-zinc-800">{a.label}</span>
                      {" · "}
                      {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section>
            <p className="mb-3 text-[12px] font-medium text-zinc-400">达人明细</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-zinc-100 text-[12px] text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">达人</th>
                    <th className="px-3 py-2 font-medium">视频数</th>
                    <th className="px-3 py-2 font-medium">成交额</th>
                    <th className="px-3 py-2 font-medium">订单</th>
                    <th className="px-3 py-2 font-medium">转化率</th>
                    <th className="px-3 py-2 font-medium">热门主题</th>
                  </tr>
                </thead>
                <tbody>
                  {data.creators.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-zinc-800">
                          {c.displayName}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {c.handle}
                          {c.niche ? ` · ${c.niche}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">{formatNumber(c.videos)}</td>
                      <td className="px-3 py-2.5">{formatMoney(c.gmv)}</td>
                      <td className="px-3 py-2.5">{formatNumber(c.orders)}</td>
                      <td className="px-3 py-2.5">{formatCvr(c.cvr)}</td>
                      <td className="px-3 py-2.5 text-zinc-600">
                        {c.topTheme ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </TikTokShell>
  );
}
