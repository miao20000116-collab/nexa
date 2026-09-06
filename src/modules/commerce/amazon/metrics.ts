import type { CommerceRangeDays, MetricValue, PeriodWindow } from "./types";

export function parseRangeDays(raw?: string | null): CommerceRangeDays {
  const n = Number(raw);
  if (n === 30) return 30;
  if (n === 90) return 90;
  return 7;
}

export function buildPeriodWindow(
  anchorDate: string,
  days: CommerceRangeDays
): PeriodWindow {
  const currentEnd = anchorDate;
  const currentStart = shiftDate(anchorDate, -(days - 1));
  const previousEnd = shiftDate(currentStart, -1);
  const previousStart = shiftDate(previousEnd, -(days - 1));
  return {
    days,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  };
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export function metricValue(current: number, previous: number): MetricValue {
  return {
    current,
    previous,
    deltaPct: previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100,
  };
}

export function sumBy<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCvr(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Sales = Traffic × CVR × AOV
 * When orders=0, AOV treated as 0 → decomposition 0.
 */
export function decomposeSales(sessions: number, orders: number, sales: number) {
  const cvr = safeRate(orders, sessions) ?? 0;
  const aov = safeRate(sales, orders) ?? 0;
  return sessions * cvr * aov;
}
