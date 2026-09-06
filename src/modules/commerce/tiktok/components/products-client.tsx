"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StepIndex } from "@/components/ui/hierarchy";
import {
  DeltaText,
  TikTokShell,
} from "@/modules/commerce/tiktok/components/shell";
import { TikTokProductDiagnosisClient } from "@/modules/commerce/tiktok/components/product-diagnosis-client";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import {
  formatCvr,
  formatMoney,
  formatPct,
} from "@/modules/commerce/tiktok/metrics";
import {
  COMMERCE_EXPAND_PRODUCT,
  consumePendingExpandProduct,
  type CommerceExpandProductDetail,
} from "@/modules/commerce/lib/expand-product";
import { useCommerceQuery } from "@/modules/commerce/lib/use-commerce-query";
import type { TikTokProductMetrics } from "@/modules/commerce/tiktok/types";

export function TikTokProductsClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const expandParam = searchParams.get("expand");
  const { data, pending, refreshing } = useCommerceQuery<{
    products?: TikTokProductMetrics[];
  }>(
    `/api/commerce/tiktok?view=products&range=${encodeURIComponent(range)}`
  );
  const products = data?.products ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(
    expandParam || null
  );

  const expand = useCallback((productId: string) => {
    setExpandedId((prev) => (prev === productId ? null : productId));
  }, []);

  useEffect(() => {
    if (expandParam) setExpandedId(expandParam);
  }, [expandParam]);

  useEffect(() => {
    const pendingId = consumePendingExpandProduct("tiktok");
    if (pendingId) setExpandedId(pendingId);

    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<CommerceExpandProductDetail>).detail;
      if (detail?.platform !== "tiktok" || !detail.productId) return;
      setExpandedId(detail.productId);
    };
    window.addEventListener(COMMERCE_EXPAND_PRODUCT, onExpand);
    return () => window.removeEventListener(COMMERCE_EXPAND_PRODUCT, onExpand);
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`product-row-${expandedId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [expandedId]);

  return (
    <TikTokShell
      title="商品诊断"
      description="SKU 表现与问题清单。点「展开诊断」在下方查看，可随时收起。"
      range={range}
      refreshing={refreshing}
    >
      <p className="mb-4 text-[13px]">
        <Link
          href="/commerce/tiktok/selection"
          className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
        >
          AI 选品调研 — 找新品机会
        </Link>
      </p>
      {pending && !products.length && <CommerceContentPlaceholder />}
      <div className="space-y-3">
        {products.map((p, i) => {
          const open = expandedId === p.id;
          return (
            <div
              key={p.id}
              id={`product-row-${p.id}`}
              className={`overflow-hidden rounded-xl border ${
                open
                  ? "border-zinc-300 bg-white"
                  : "border-zinc-100 bg-white hover:border-zinc-200"
              }`}
            >
              <button
                type="button"
                onClick={() => expand(p.id)}
                aria-expanded={open}
                className="flex w-full items-start gap-3 px-4 py-4 text-left sm:gap-4 sm:px-5"
              >
                <span
                  className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    open
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}
                  aria-hidden
                >
                  {open ? (
                    <ChevronUp className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <StepIndex value={i + 1} />
                      <p className="mt-2 text-[16px] font-semibold tracking-tight text-zinc-900">
                        {p.title}
                      </p>
                      <p className="mt-1 text-[13px] text-zinc-500">
                        {p.productId} · {p.sku}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-600">
                        <span>
                          曝光 {Math.round(p.exposure.current)} (
                          {formatPct(p.exposure.deltaPct)})
                        </span>
                        <span>
                          转化率 {formatCvr(p.cvr.current)} → 上期{" "}
                          {formatCvr(p.cvr.previous)}
                        </span>
                        <span>
                          视频归因成交额 {formatMoney(p.videoGmv.current)}
                        </span>
                        <span>达人成交额 {formatMoney(p.creatorGmv.current)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-[14px] font-medium text-zinc-800">
                        成交额 {formatMoney(p.gmv.current)}{" "}
                        <DeltaText value={p.gmv.deltaPct} />
                      </p>
                      <span
                        className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] font-semibold ${
                          open
                            ? "bg-zinc-100 text-zinc-800"
                            : "bg-zinc-900 text-white"
                        }`}
                      >
                        {open ? (
                          <>
                            收起诊断
                            <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            展开诊断
                            <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
              {open && (
                <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-5 sm:px-5">
                  <p className="mb-4 text-[12px] font-medium tracking-wide text-zinc-400">
                    诊断详情 · 已展开 · 可再次点击上方收起
                  </p>
                  <Suspense
                    fallback={
                      <p className="text-[13px] text-zinc-400">正在打开诊断…</p>
                    }
                  >
                    <TikTokProductDiagnosisClient
                      productId={p.id}
                      initialRange={range}
                      variant="inline"
                    />
                  </Suspense>
                  <div className="mt-4 flex justify-end border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      收起诊断
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TikTokShell>
  );
}
