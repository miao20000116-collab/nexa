"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TikTokShell } from "@/modules/commerce/tiktok/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import {
  formatCvr,
  formatMoney,
  formatNumber,
} from "@/modules/commerce/tiktok/metrics";
import { AdvertisingIntelligencePanel } from "@/modules/commerce/components/advertising-intelligence-panel";
import type { TikTokContentView } from "@/modules/commerce/tiktok/types";

export function TikTokContentClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const [data, setData] = useState<TikTokContentView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/commerce/tiktok?view=content&range=${encodeURIComponent(range)}`
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
      title="内容经营"
      description="查看视频播放、点击、订单与转化，发现可复制主题。"
      range={range}
    >
      {!data && <CommerceContentPlaceholder />}
      {data && (
        <div className="space-y-8">
          {(data.insight || data.aiActions[0]) && (
            <section className="border-b border-zinc-100 pb-6">
              <p className="text-[12px] font-medium tracking-wide text-zinc-400">
                内容情报
              </p>
              <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900">
                {data.insight?.title || data.aiActions[0]?.label}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-800">
                {data.insight?.detail || data.aiActions[0]?.message}
              </p>
              {data.nextActions?.[0] && (
                <Link
                  href={data.nextActions[0].href}
                  className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white"
                >
                  {data.nextActions[0].label}
                </Link>
              )}
            </section>
          )}

          <details>
            <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
              展开投放智能分析面板
            </summary>
            <div className="mt-4">
              <AdvertisingIntelligencePanel channel="tiktok" range={range} />
            </div>
          </details>

          <section>
            <p className="mb-3 text-[12px] font-medium text-zinc-400">视频明细</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-zinc-100 text-[12px] text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">视频</th>
                    <th className="px-3 py-2 font-medium">播放量</th>
                    <th className="px-3 py-2 font-medium">商品点击</th>
                    <th className="px-3 py-2 font-medium">订单</th>
                    <th className="px-3 py-2 font-medium">成交额</th>
                    <th className="px-3 py-2 font-medium">转化率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.videos.map((v) => (
                    <tr key={v.id} className="border-b border-zinc-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-zinc-800">{v.title}</p>
                        <p className="text-[11px] text-zinc-400">
                          {v.theme}
                          {v.creatorHandle ? ` · ${v.creatorHandle}` : ""}
                          {" · "}播放#{v.viewsRank} · 转化率#{v.cvrRank}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">{formatNumber(v.views)}</td>
                      <td className="px-3 py-2.5">
                        {formatNumber(v.productClicks)}
                      </td>
                      <td className="px-3 py-2.5">{formatNumber(v.orders)}</td>
                      <td className="px-3 py-2.5">{formatMoney(v.gmv)}</td>
                      <td className="px-3 py-2.5">{formatCvr(v.cvr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.aiActions.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
                更多 AI 建议（{data.aiActions.length}）
              </summary>
              <ul className="mt-3 space-y-3">
                {data.aiActions.map((a) => (
                  <li key={a.label} className="border-b border-zinc-50 pb-3">
                    <p className="text-[14px] text-zinc-800">{a.label}</p>
                    <p className="mt-1 text-[13px] text-zinc-500">{a.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {data.nextActions.length > 0 && (
            <section>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                跨模块下一步
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                {data.nextActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="text-zinc-700 underline underline-offset-4 hover:text-zinc-900"
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </TikTokShell>
  );
}
