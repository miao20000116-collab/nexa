"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink, PageHeader } from "@/components/ui/hierarchy";
import { type as typeStyle } from "@/lib/ui-hierarchy";
import { useCommerceEmbedded } from "@/modules/commerce/components/commerce-nav-config";
import {
  formatCvr,
  formatMoney,
  formatNumber,
  formatPct,
} from "@/modules/commerce/tiktok/metrics";
import type { MetricValue } from "@/modules/commerce/tiktok/types";

export function DemoBadge() {
  return (
    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      演示 · 未接入
    </span>
  );
}

export function RangeSwitcher({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = value || searchParams.get("range") || "7";

  const setRange = (days: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", days);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 p-0.5">
      {["7", "30", "90"].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setRange(d)}
          className={`rounded-md px-2.5 py-1 text-[12px] ${
            current === d
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          {d}天
        </button>
      ))}
    </div>
  );
}

export function TikTokNav() {
  const pathname = usePathname();
  const items = [
    { href: "/commerce/tiktok", label: "经营概览", exact: true },
    { href: "/commerce/tiktok/products", label: "商品诊断" },
    { href: "/commerce/tiktok/selection", label: "选品调研" },
    { href: "/commerce/tiktok/compliance", label: "合规风险" },
    { href: "/commerce/tiktok/customer", label: "客户洞察" },
    { href: "/commerce/tiktok/content", label: "内容经营" },
    { href: "/commerce/tiktok/creators", label: "达人 / 联盟" },
    { href: "/commerce/tiktok/metrics", label: "指标定义" },
  ];

  return (
    <nav className="mb-8 flex flex-wrap gap-1 border-b border-zinc-100 pb-3">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-1.5 text-[13px] ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TikTokShell({
  title,
  description,
  range: _range,
  children,
  back,
  refreshing,
}: {
  title: string;
  description: string;
  /** Kept for call-site compat; range UI lives in layout chrome. */
  range?: string;
  children: ReactNode;
  /** Parent-context back (list→detail). Hub back is in layout chrome. */
  back?: { href: string; label: string };
  refreshing?: boolean;
}) {
  const embedded = useCommerceEmbedded();

  return (
    <div>
      {back ? (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <BackLink href={back.href}>{back.label}</BackLink>
          <span
            className={`text-[12px] text-zinc-400 ${
              refreshing ? "visible" : "invisible"
            }`}
            aria-hidden={!refreshing}
          >
            更新中
          </span>
        </div>
      ) : !embedded ? (
        <div className="mb-1 h-5">
          <span
            className={`text-[12px] text-zinc-400 ${
              refreshing ? "visible" : "invisible"
            }`}
            aria-live="polite"
          >
            更新中
          </span>
        </div>
      ) : null}
      {!embedded && <PageHeader title={title} description={description} />}
      <div
        className={`space-y-8 transition-opacity duration-200 ${
          embedded ? "" : "min-h-[48vh]"
        } ${refreshing ? "opacity-70" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  metric,
  format = "number",
}: {
  label: string;
  metric: MetricValue;
  format?: "number" | "money" | "cvr";
}) {
  const display = (v: number) => {
    if (format === "money") return formatMoney(v);
    if (format === "cvr") return formatCvr(v);
    return formatNumber(v);
  };

  return (
    <div className="rounded-xl border border-zinc-100 px-4 py-3">
      <p className={typeStyle.metricLabel}>{label}</p>
      <p className={typeStyle.metricValue}>{display(metric.current)}</p>
      <p className="mt-1 text-[12px] text-zinc-500">
        vs 上期 {display(metric.previous)}
        <span
          className={`ml-2 ${
            (metric.deltaPct ?? 0) < 0
              ? "text-red-600"
              : (metric.deltaPct ?? 0) > 0
                ? "text-emerald-700"
                : "text-zinc-400"
          }`}
        >
          {formatPct(metric.deltaPct)}
        </span>
      </p>
    </div>
  );
}

export function DeltaText({ value }: { value: number | null | undefined }) {
  return (
    <span
      className={
        (value ?? 0) < 0
          ? "text-red-600"
          : (value ?? 0) > 0
            ? "text-emerald-700"
            : "text-zinc-400"
      }
    >
      {formatPct(value ?? null)}
    </span>
  );
}
