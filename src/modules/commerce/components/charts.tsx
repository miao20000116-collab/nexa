"use client";

import { useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export type ChartPoint = {
  date: string;
  value: number;
};

export type NamedBar = {
  label: string;
  value: number;
  /** Optional secondary value for dual bars */
  secondary?: number;
};

function formatAxisDate(iso: string) {
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${Number(m)}/${Number(d)}`;
}

/** Y domain from data with padding — not forced from 0. */
function paddedDomain(values: number[]): { min: number; max: number } {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return { min: 0, max: 1 };
  }
  if (rawMin === rawMax) {
    const pad = Math.abs(rawMin) * 0.08 || 1;
    return { min: rawMin - pad, max: rawMax + pad };
  }
  let min = rawMin * 0.92;
  let max = rawMax * 1.08;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { min, max };
}

function nearestIndex(coords: { x: number }[], svgX: number) {
  if (!coords.length) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = Math.abs(coords[i].x - svgX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

const CHART_CAPTION = "悬停可查看每日数值；纵轴按区间放大，便于看趋势";

/** Single-series trend — store sales / 成交额 over the selected range. */
export function TrendChart({
  points,
  className,
  height = 160,
  formatValue = (n) => String(Math.round(n)),
  stroke = "#18181b",
  label,
}: {
  points: ChartPoint[];
  className?: string;
  height?: number;
  formatValue?: (n: number) => string;
  stroke?: string;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 640;
  const padX = 8;
  const padTop = 12;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const chartW = width - padX * 2;
  const { min, max } = paddedDomain(points.map((p) => p.value));

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * chartW;
    const y =
      padTop + chartH - ((p.value - min) / (max - min || 1)) * chartH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x},${padTop + chartH} L${coords[0].x},${padTop + chartH} Z`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const active = hover != null ? coords[hover] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    setHover(nearestIndex(coords, svgX));
  };

  const tooltipLeft =
    active != null
      ? Math.min(92, Math.max(8, (active.x / width) * 100))
      : 50;

  return (
    <div className={cn("w-full", className)}>
      {(label || last) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {label && (
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
              {label}
            </p>
          )}
          <p className="text-[13px] tabular-nums text-zinc-600">
            {formatValue(first.value)} → {formatValue(last.value)}
          </p>
        </div>
      )}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={label ?? "趋势图"}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1={padX}
            x2={width - padX}
            y1={padTop + chartH}
            y2={padTop + chartH}
            stroke="#f4f4f5"
            strokeWidth={1}
          />
          <path d={area} fill={stroke} opacity={0.06} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={last.x} cy={last.y} r={3} fill={stroke} />
          {active && (
            <>
              <line
                x1={active.x}
                x2={active.x}
                y1={padTop}
                y2={padTop + chartH}
                stroke="#d4d4d8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={active.x}
                cy={active.y}
                r={4}
                fill="#fff"
                stroke={stroke}
                strokeWidth={1.75}
              />
            </>
          )}
          <text
            x={padX}
            y={height - 8}
            className="fill-zinc-400"
            style={{ fontSize: 10 }}
          >
            {formatAxisDate(first.date)}
          </text>
          <text
            x={width - padX}
            y={height - 8}
            textAnchor="end"
            className="fill-zinc-400"
            style={{ fontSize: 10 }}
          >
            {formatAxisDate(last.date)}
          </text>
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="text-[11px] text-zinc-400">
              {formatAxisDate(active.date)}
            </p>
            <p className="text-[13px] font-medium tabular-nums text-zinc-900">
              {formatValue(active.value)}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">{CHART_CAPTION}</p>
    </div>
  );
}

/** Two series with independent domain scaling — e.g. traffic vs conversion. */
export function DualTrendChart({
  a,
  b,
  aLabel,
  bLabel,
  className,
  height = 168,
  formatA = (n) => String(Math.round(n)),
  formatB = (n) =>
    n < 1 && n > 0 ? `${(n * 100).toFixed(1)}%` : String(Math.round(n)),
}: {
  a: ChartPoint[];
  b: ChartPoint[];
  aLabel: string;
  bLabel: string;
  className?: string;
  height?: number;
  formatA?: (n: number) => string;
  formatB?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (a.length < 2 || b.length < 2) return null;

  const width = 640;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const chartW = width - padX * 2;
  const n = Math.min(a.length, b.length);

  const mapSeries = (pts: ChartPoint[]) => {
    const { min, max } = paddedDomain(pts.slice(0, n).map((p) => p.value));
    return pts.slice(0, n).map((p, i) => {
      const x = padX + (i / (n - 1)) * chartW;
      const y =
        padTop + chartH - ((p.value - min) / (max - min || 1)) * chartH;
      return { x, y, date: p.date, value: p.value };
    });
  };

  const ca = mapSeries(a);
  const cb = mapSeries(b);
  const path = (coords: { x: number; y: number }[]) =>
    coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    setHover(nearestIndex(ca, svgX));
  };

  const ai = hover != null ? ca[hover] : null;
  const bi = hover != null ? cb[hover] : null;
  const tooltipLeft =
    ai != null ? Math.min(92, Math.max(8, (ai.x / width) * 100)) : 50;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-zinc-700">
          <span className="h-0.5 w-3 bg-zinc-900" />
          {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-zinc-500">
          <span className="h-0.5 w-3 bg-zinc-400" />
          {bLabel}
        </span>
        <span className="text-zinc-400">（各自按区间放大，便于对比走势）</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${aLabel} 与 ${bLabel} 走势`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1={padX}
            x2={width - padX}
            y1={padTop + chartH}
            y2={padTop + chartH}
            stroke="#f4f4f5"
            strokeWidth={1}
          />
          <path
            d={path(ca)}
            fill="none"
            stroke="#18181b"
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
          <path
            d={path(cb)}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth={1.75}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
          {ai && bi && (
            <>
              <line
                x1={ai.x}
                x2={ai.x}
                y1={padTop}
                y2={padTop + chartH}
                stroke="#d4d4d8"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={ai.x}
                cy={ai.y}
                r={4}
                fill="#fff"
                stroke="#18181b"
                strokeWidth={1.75}
              />
              <circle
                cx={bi.x}
                cy={bi.y}
                r={4}
                fill="#fff"
                stroke="#a1a1aa"
                strokeWidth={1.75}
              />
            </>
          )}
          <text
            x={padX}
            y={height - 8}
            className="fill-zinc-400"
            style={{ fontSize: 10 }}
          >
            {formatAxisDate(a[0].date)}
          </text>
          <text
            x={width - padX}
            y={height - 8}
            textAnchor="end"
            className="fill-zinc-400"
            style={{ fontSize: 10 }}
          >
            {formatAxisDate(a[n - 1].date)}
          </text>
        </svg>
        {ai && bi && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 shadow-sm"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="text-[11px] text-zinc-400">
              {formatAxisDate(ai.date)}
            </p>
            <p className="mt-0.5 text-[12px] tabular-nums text-zinc-800">
              {aLabel} {formatA(ai.value)}
            </p>
            <p className="text-[12px] tabular-nums text-zinc-500">
              {bLabel} {formatB(bi.value)}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">{CHART_CAPTION}</p>
    </div>
  );
}

/** Horizontal rank bars — campaign spend, product GMV, etc. */
export function RankBars({
  items,
  className,
  formatValue = (n) => String(Math.round(n)),
  label,
}: {
  items: NamedBar[];
  className?: string;
  formatValue?: (n: number) => string;
  label?: string;
}) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={cn("w-full space-y-3", className)}>
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((item) => {
          const pct = Math.max(2, (item.value / max) * 100);
          return (
            <li key={item.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-zinc-700">
                  {item.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {formatValue(item.value)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-100">
                <div
                  className="h-1.5 rounded-full bg-zinc-900"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cost / share composition as % of a total (e.g. profit costs of revenue). */
export function CompositionBars({
  items,
  total,
  className,
  formatValue = (n) => String(Math.round(n)),
  label,
}: {
  items: NamedBar[];
  total: number;
  className?: string;
  formatValue?: (n: number) => string;
  label?: string;
}) {
  if (!items.length || total <= 0) return null;

  return (
    <div className={cn("w-full space-y-3", className)}>
      {label && (
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((item) => {
          const share = (item.value / total) * 100;
          return (
            <li key={item.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-zinc-700">{item.label}</span>
                <span className="tabular-nums text-zinc-500">
                  {formatValue(item.value)}
                  <span className="ml-2 text-zinc-400">
                    {share.toFixed(0)}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-100">
                <div
                  className="h-1.5 rounded-full bg-zinc-800"
                  style={{ width: `${Math.min(100, Math.max(1, share))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Simple period compare: current vs previous for a few KPIs. */
export function PeriodCompareBars({
  items,
  className,
  formatValue = (n) => String(Math.round(n)),
  label,
}: {
  items: Array<{ label: string; current: number; previous: number }>;
  className?: string;
  formatValue?: (n: number) => string;
  label?: string;
}) {
  if (!items.length) return null;
  const max = Math.max(
    ...items.flatMap((i) => [i.current, i.previous]),
    1
  );

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
          {label}
        </p>
      )}
      <div className="mb-2 flex gap-4 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-zinc-900" />
          本期
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-zinc-300" />
          上期
        </span>
      </div>
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.label}>
            <p className="mb-1.5 text-[12px] text-zinc-600">{item.label}</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-sm bg-zinc-100">
                  <div
                    className="h-2 rounded-sm bg-zinc-900"
                    style={{
                      width: `${Math.max(2, (item.current / max) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-zinc-600">
                  {formatValue(item.current)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-sm bg-zinc-100">
                  <div
                    className="h-2 rounded-sm bg-zinc-300"
                    style={{
                      width: `${Math.max(2, (item.previous / max) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-zinc-400">
                  {formatValue(item.previous)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
