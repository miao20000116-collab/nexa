/**
 * V3.5 — Commerce Intelligence 2.0
 * Period compare + anomaly detection. Demo data must stay clearly demo.
 */

import type { CommerceIntelligenceReport } from "@/modules/commerce/intelligence/types";

export type CommercePeriod = "today" | "7d" | "30d";

export interface PeriodMetrics {
  sales: number;
  sessions: number;
  cvr: number;
  orders: number;
  aov: number;
  acos: number;
  adSpend: number;
  profit: number;
}

export interface PeriodComparison {
  period: CommercePeriod;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  deltas: Partial<Record<keyof PeriodMetrics, number>>;
  isDemo: true;
}

export type AnomalyType =
  | "sales_drop"
  | "cvr_drop"
  | "traffic_drop"
  | "ad_cost_increase"
  | "profit_margin_drop";

export interface CommerceAnomaly {
  type: AnomalyType;
  label: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  deltaPct: number;
}

/** Demo metrics — explicitly synthetic for portfolio Demo Store. */
export function demoMetricsForPeriod(period: CommercePeriod): PeriodComparison {
  const base: PeriodMetrics = {
    sales: period === "today" ? 4200 : period === "7d" ? 28600 : 112000,
    sessions: period === "today" ? 1800 : period === "7d" ? 12400 : 48000,
    cvr: period === "today" ? 0.028 : period === "7d" ? 0.031 : 0.034,
    orders: period === "today" ? 50 : period === "7d" ? 384 : 1632,
    aov: 84,
    acos: period === "today" ? 0.32 : period === "7d" ? 0.28 : 0.25,
    adSpend: period === "today" ? 980 : period === "7d" ? 6200 : 24000,
    profit: period === "today" ? 610 : period === "7d" ? 4800 : 21000,
  };
  const previous: PeriodMetrics = {
    sales: Math.round(base.sales * 1.18),
    sessions: Math.round(base.sessions * 1.12),
    cvr: Number((base.cvr * 1.15).toFixed(4)),
    orders: Math.round(base.orders * 1.16),
    aov: base.aov,
    acos: Number((base.acos * 0.88).toFixed(4)),
    adSpend: Math.round(base.adSpend * 0.85),
    profit: Math.round(base.profit * 1.22),
  };
  const deltas: PeriodComparison["deltas"] = {};
  (Object.keys(base) as (keyof PeriodMetrics)[]).forEach((k) => {
    const cur = base[k];
    const prev = previous[k];
    deltas[k] = prev === 0 ? 0 : Number((((cur - prev) / prev) * 100).toFixed(1));
  });
  return {
    period,
    current: base,
    previous,
    deltas,
    isDemo: true,
  };
}

export function detectAnomalies(cmp: PeriodComparison): CommerceAnomaly[] {
  const anomalies: CommerceAnomaly[] = [];
  const d = cmp.deltas;
  if ((d.sales ?? 0) <= -10) {
    anomalies.push({
      type: "sales_drop",
      label: "销售额下降",
      severity: (d.sales ?? 0) <= -20 ? "high" : "medium",
      evidence: `相对上期销售额变化 ${d.sales}%`,
      deltaPct: d.sales ?? 0,
    });
  }
  if ((d.cvr ?? 0) <= -8) {
    anomalies.push({
      type: "cvr_drop",
      label: "转化率下降",
      severity: "high",
      evidence: `转化率变化 ${d.cvr}%`,
      deltaPct: d.cvr ?? 0,
    });
  }
  if ((d.sessions ?? 0) <= -10) {
    anomalies.push({
      type: "traffic_drop",
      label: "流量下降",
      severity: "medium",
      evidence: `访问量变化 ${d.sessions}%`,
      deltaPct: d.sessions ?? 0,
    });
  }
  if ((d.adSpend ?? 0) >= 15) {
    anomalies.push({
      type: "ad_cost_increase",
      label: "广告花费上升",
      severity: "medium",
      evidence: `广告花费变化 ${d.adSpend}%`,
      deltaPct: d.adSpend ?? 0,
    });
  }
  if ((d.profit ?? 0) <= -12) {
    anomalies.push({
      type: "profit_margin_drop",
      label: "利润下降",
      severity: "high",
      evidence: `利润变化 ${d.profit}%`,
      deltaPct: d.profit ?? 0,
    });
  }
  return anomalies;
}

export function enrichIntelligenceWithTrends(
  report: CommerceIntelligenceReport,
  period: CommercePeriod = "7d"
): CommerceIntelligenceReport & {
  periodComparison: PeriodComparison;
  anomalies: CommerceAnomaly[];
  opportunities: string[];
} {
  const periodComparison = demoMetricsForPeriod(period);
  const anomalies = detectAnomalies(periodComparison);
  const opportunities = anomalies.map(
    (a) => `针对「${a.label}」深入诊断并生成改进内容`
  );
  return {
    ...report,
    isDemo: true,
    periodComparison,
    anomalies,
    opportunities,
  };
}
