"use client";

import { useEffect, useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type {
  FinancialInventoryMode,
  FinancialInventoryResult,
  SupportedCurrency,
} from "@/modules/commerce/capability/financial-types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";
import {
  NEXA_COMMERCE_ANALYSIS_APPLY_EVENT,
  publishCommerceAnalysis,
} from "@/modules/commerce/lib/analysis-context";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";
import { emitAiJob } from "@/modules/ai-workbench/store";
import { requestCommerceGoto } from "@/modules/commerce/lib/hub-pager";

const FX_STATUS_LABEL: Record<string, string> = {
  "Rate Unavailable": "汇率不可用",
  Estimated: "估算汇率",
  "Same Currency": "同币种",
};

const SCENARIO_LABEL: Record<string, string> = {
  high_sales_low_stock: "高销量低库存",
  low_sales_high_stock: "低销量高库存",
  high_acos: "高广告成本比",
  profit_down: "利润下降",
  healthy: "相对健康",
  mixed: "混合信号",
};

/**
 * Financial & Inventory Intelligence panel — enhances Profit / Inventory pages.
 * Opens with demo baseline analysis; deep run costs Credits.
 */
export function FinancialInventoryPanel({
  mode = "joint",
  range = "7",
}: {
  mode?: FinancialInventoryMode;
  range?: string;
}) {
  const slot = `financial_${mode}`;
  const [displayCurrency, setDisplayCurrency] =
    useState<SupportedCurrency>("USD");
  const [running, setRunning] = useState(false);
  const [loadingBaseline, setLoadingBaseline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    FinancialInventoryResult,
    { ok: true }
  > | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const credits = useCreditsConfirm();

  const publish = (
    data: Extract<FinancialInventoryResult, { ok: true }>,
    depth: "baseline" | "deep" | "refined"
  ) => {
    publishCommerceAnalysis({
      kind: "financial_inventory",
      slot,
      pageKey: "commerce.amazon.financial",
      title:
        mode === "financial"
          ? "利润智能诊断"
          : mode === "inventory"
            ? "库存智能诊断"
            : "经营联合诊断",
      depth,
      insight: {
        situation: data.insight.situation,
        evidence: data.insight.evidence,
        diagnosis: data.insight.diagnosis,
        opportunity: data.insight.opportunity,
        recommendation: data.insight.recommendation,
        dataNotice: data.insight.dataNotice,
        aiAssisted: data.insight.aiAssisted,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const run = async (opts: { depth: "baseline" | "deep"; confirm?: boolean }) => {
    const isDeep = opts.depth === "deep";
    if (isDeep) setRunning(true);
    else setLoadingBaseline(true);
    setError(null);
    try {
      const res = await fetch("/api/commerce/financial-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          range,
          displayCurrency,
          depth: opts.depth,
          confirm: Boolean(opts.confirm),
          jobId: opts.confirm ? pendingJobId : undefined,
        }),
      });
      const data = (await res.json()) as FinancialInventoryResult;

      if (!data.ok) {
        if (
          isDeep &&
          credits.applyGateResponse({
            code: data.code,
            message: data.message,
            estimate: data.estimate
              ? {
                  message: data.estimate.message,
                  estimatedCredits: data.estimate.estimatedCredits ?? undefined,
                }
              : undefined,
          })
        ) {
          setPendingJobId(data.jobId);
          return;
        }
        if (isDeep) setError(data.message || "分析失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(data);
      publish(data, data.analysisDepth || opts.depth);
      if (isDeep) {
        emitAiJob({
          capabilityId:
            mode === "inventory" ? "deep_inventory" : "deep_financial",
          capabilityLabel:
            mode === "inventory" ? "库存深度分析" : "利润深度分析",
          title:
            mode === "inventory" ? "库存智能诊断" : "利润智能诊断",
          phase: "done",
          message: "深度分析已完成",
          pageKey: "commerce.amazon.financial",
        });
      }
    } catch {
      if (isDeep) setError("分析失败，请稍后重试");
    } finally {
      setRunning(false);
      setLoadingBaseline(false);
    }
  };

  useEffect(() => {
    void run({ depth: "baseline" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, range, displayCurrency]);

  useAiCapabilityListener(
    {
      deep_financial: () => {
        if (mode === "inventory") return;
        requestCommerceGoto("profit");
        emitAiJob({
          capabilityId: "deep_financial",
          capabilityLabel: "利润深度分析",
          title: "利润智能诊断",
          phase: "running",
          pageKey: "commerce.amazon.financial",
        });
        void run({ depth: "deep" });
      },
      deep_inventory: () => {
        if (mode !== "inventory") return;
        requestCommerceGoto("inventory");
        emitAiJob({
          capabilityId: "deep_inventory",
          capabilityLabel: "库存深度分析",
          title: "库存智能诊断",
          phase: "running",
          pageKey: "commerce.amazon.financial",
        });
        void run({ depth: "deep" });
      },
      deep_analysis: () => {
        requestCommerceGoto(mode === "inventory" ? "inventory" : "profit");
        void run({ depth: "deep" });
      },
    },
    [mode, range, displayCurrency, running]
  );

  useEffect(() => {
    const onApply = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          slot: string;
          insight: {
            situation: string;
            evidence: string[];
            diagnosis: string;
            opportunity: string;
            recommendation: string;
            dataNotice?: string;
            aiAssisted?: boolean;
          };
        }>
      ).detail;
      if (!detail || detail.slot !== slot || !result) return;
      setResult({
        ...result,
        insight: {
          ...result.insight,
          ...detail.insight,
          aiAssisted: true,
        },
        analysisDepth: "deep",
      });
      publish(
        {
          ...result,
          insight: { ...result.insight, ...detail.insight, aiAssisted: true },
        },
        "refined"
      );
    };
    window.addEventListener(NEXA_COMMERCE_ANALYSIS_APPLY_EVENT, onApply);
    return () =>
      window.removeEventListener(NEXA_COMMERCE_ANALYSIS_APPLY_EVENT, onApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, slot]);

  const insight = result?.insight;
  const fin = result?.financial;
  const title =
    mode === "financial"
      ? "利润智能诊断"
      : mode === "inventory"
        ? "库存智能诊断"
        : "经营联合诊断";
  const depthLabel =
    result?.analysisDepth === "deep"
      ? "深度分析"
      : result
        ? "今日基线"
        : null;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          {mode === "inventory"
            ? "库存智能"
            : mode === "joint"
              ? "财务与库存联合"
              : "财务分析"}
          {depthLabel ? ` · ${depthLabel}` : ""}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          现状 → 证据 → 诊断 → 机会 → 建议。打开即有演示基线分析；深度分析消耗
          Credits。也可在 AI 工作台对话改写。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-zinc-500">
          展示币种
          <select
            value={displayCurrency}
            onChange={(e) =>
              setDisplayCurrency(e.target.value as SupportedCurrency)
            }
            className="ml-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px]"
          >
            {(["USD", "EUR", "GBP", "CNY"] as const).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void run({ depth: "deep" })}
          disabled={running || loadingBaseline}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {running ? "深度分析中…" : "运行深度分析"}
        </button>
      </div>

      {credits.state.pending && (
        <CreditsConfirmPanel
          message={credits.state.estimateMessage}
          estimatedCredits={credits.state.estimatedCredits}
          onConfirm={() => void run({ depth: "deep", confirm: true })}
          onCancel={() => {
            credits.reset();
            setPendingJobId(undefined);
          }}
          busy={running}
        />
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {loadingBaseline && !result && (
        <p className="text-[13px] text-zinc-400">正在生成今日基线智能分析…</p>
      )}

      {result && insight && (
        <div className="space-y-4 border-t border-zinc-100 pt-4 text-[13px]">
          <AppliedKnowledgeBanner
            knowledge={
              result.appliedKnowledge ?? insight.appliedKnowledge ?? null
            }
          />
          <p className="text-[12px] font-medium text-amber-800">
            {result.dataLabel} ·{" "}
            {SCENARIO_LABEL[result.businessScenario] || result.businessScenario}
            {depthLabel ? ` · ${depthLabel}` : ""}
          </p>

          <div className="space-y-2">
            <p>
              <span className="text-zinc-400">现状 · </span>
              {insight.situation}
            </p>
            <p>
              <span className="text-zinc-400">诊断 · </span>
              {insight.diagnosis}
            </p>
            <p>
              <span className="text-zinc-400">机会 · </span>
              {insight.opportunity}
            </p>
            <p>
              <span className="text-zinc-400">建议 · </span>
              {insight.recommendation}
            </p>
          </div>

          {fin && mode !== "inventory" && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
              <p className="text-[12px] text-zinc-400">
                财务 · {fin.currency}
                {fin.displayCurrency !== fin.currency
                  ? ` → ${fin.displayCurrency}`
                  : ""}{" "}
                · {FX_STATUS_LABEL[fin.fxStatus] || fin.fxStatus}
              </p>
              <p className="mt-1 text-[12px] text-zinc-500">{fin.fxNote}</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>营收 · {fin.revenue.toFixed(2)}</li>
                <li>销货成本 · {fin.cogs.toFixed(2)}</li>
                <li>平台费用 · {fin.platformFee.toFixed(2)}</li>
                <li>广告花费 · {fin.adSpend.toFixed(2)}</li>
                <li>物流 · {fin.shipping.toFixed(2)}</li>
                <li>其他成本 · {fin.otherCost.toFixed(2)}</li>
                <li className="font-medium sm:col-span-2">
                  利润 · {fin.profit.toFixed(2)}
                </li>
              </ul>
            </div>
          )}

          <div
            className={
              result.adsRecommendation.mayIncreaseAds
                ? "rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[12px] text-emerald-900"
                : "rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] text-amber-900"
            }
          >
            广告策略 ·{" "}
            {result.adsRecommendation.mayIncreaseAds
              ? "可谨慎加投"
              : "不宜扩大广告"}
            ：{result.adsRecommendation.reason}
          </div>

          {result.inventoryRisks.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                库存风险
              </p>
              <ul className="space-y-2">
                {result.inventoryRisks.slice(0, 6).map((r) => (
                  <li key={r.productId} className="text-zinc-800">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-zinc-400">
                      {" "}
                      · 库存 {r.stock} · 日均 {r.salesVelocity.toFixed(1)} ·
                      可售天数{" "}
                      {r.daysOfInventory == null
                        ? "—"
                        : r.daysOfInventory.toFixed(1)}
                      {" · "}
                      {r.riskLabel}
                    </span>
                    <p className="text-[12px] text-zinc-500">
                      {r.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-zinc-500">{insight.dataNotice}</p>

          <WorkflowActions
            actions={result.workflowActions}
            chainLabel={result.chainLabel}
          />
        </div>
      )}
    </section>
  );
}
