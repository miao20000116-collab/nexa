"use client";

import { useEffect, useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type { AdvertisingAnalysisResult } from "@/modules/commerce/capability/advertising-types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";
import {
  NEXA_COMMERCE_ANALYSIS_APPLY_EVENT,
  publishCommerceAnalysis,
} from "@/modules/commerce/lib/analysis-context";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";
import { emitAiJob } from "@/modules/ai-workbench/store";
import { requestCommerceGoto } from "@/modules/commerce/lib/hub-pager";

const CLASS_LABEL: Record<string, string> = {
  high_value: "高价值",
  low_value: "低价值",
  low_conversion: "低转化",
  high_spend: "高花费",
  potential_negative: "建议否定",
};

/**
 * Inline Advertising Intelligence — enhances existing Ads / Content pages.
 * Opens with demo baseline; deep run costs Credits.
 */
export function AdvertisingIntelligencePanel({
  channel,
  range = "7",
}: {
  channel: "amazon" | "tiktok";
  range?: string;
}) {
  const slot = `advertising_${channel}`;
  const [running, setRunning] = useState(false);
  const [loadingBaseline, setLoadingBaseline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    AdvertisingAnalysisResult,
    { ok: true }
  > | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const credits = useCreditsConfirm();

  const publish = (
    data: Extract<AdvertisingAnalysisResult, { ok: true }>,
    depth: "baseline" | "deep" | "refined"
  ) => {
    publishCommerceAnalysis({
      kind: "advertising",
      slot,
      pageKey:
        channel === "tiktok"
          ? "commerce.tiktok.ads"
          : "commerce.amazon.ads",
      title: "AI 广告诊断",
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
      const res = await fetch("/api/commerce/advertising-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          range,
          depth: opts.depth,
          confirm: Boolean(opts.confirm),
          jobId: opts.confirm ? pendingJobId : undefined,
        }),
      });
      const data = (await res.json()) as AdvertisingAnalysisResult;

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
        if (isDeep) setError(data.message || "广告分析失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(data);
      publish(data, data.analysisDepth || opts.depth);
      if (isDeep) {
        emitAiJob({
          capabilityId: "deep_ads",
          capabilityLabel: "广告深度分析",
          title: "AI 广告诊断",
          phase: "done",
          message: "深度分析已完成",
          pageKey:
            channel === "tiktok"
              ? "commerce.tiktok.ads"
              : "commerce.amazon.ads",
        });
      }
    } catch {
      if (isDeep) setError("广告分析失败，请稍后重试");
    } finally {
      setRunning(false);
      setLoadingBaseline(false);
    }
  };

  useEffect(() => {
    void run({ depth: "baseline" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, range]);

  useAiCapabilityListener(
    {
      deep_ads: () => {
        requestCommerceGoto(channel === "tiktok" ? "content" : "ads");
        emitAiJob({
          capabilityId: "deep_ads",
          capabilityLabel: "广告深度分析",
          title: "AI 广告诊断",
          phase: "running",
          pageKey:
            channel === "tiktok"
              ? "commerce.tiktok.ads"
              : "commerce.amazon.ads",
        });
        void run({ depth: "deep" });
      },
      deep_analysis: () => {
        requestCommerceGoto(channel === "tiktok" ? "content" : "ads");
        void run({ depth: "deep" });
      },
    },
    [channel, range, running]
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
      const next = {
        ...result,
        insight: {
          ...result.insight,
          ...detail.insight,
          aiAssisted: true,
        },
        analysisDepth: "deep" as const,
      };
      setResult(next);
      publish(next, "refined");
    };
    window.addEventListener(NEXA_COMMERCE_ANALYSIS_APPLY_EVENT, onApply);
    return () =>
      window.removeEventListener(NEXA_COMMERCE_ANALYSIS_APPLY_EVENT, onApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, slot]);

  const insight = result?.insight;
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
          广告智能
          {depthLabel ? ` · ${depthLabel}` : ""}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          AI 广告诊断
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          打开即有演示基线分析；深度分析消耗 Credits。库存不足时不会建议加投。也可在
          AI 工作台对话改写。
        </p>
      </div>

      <button
        type="button"
        onClick={() => void run({ depth: "deep" })}
        disabled={running || loadingBaseline}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {running ? "深度分析中…" : "运行深度分析"}
      </button>

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
            {result.dataLabel}
            {depthLabel ? ` · ${depthLabel}` : ""}
          </p>
          <p className="text-[16px] font-semibold leading-snug text-zinc-900">
            {result.headline}
          </p>

          <div className="space-y-2">
            <p>
              <span className="text-zinc-400">证据 · </span>
              {insight.evidence.slice(0, 4).join("；")}
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

          {result.metricsSummary.length > 0 && (
            <ul className="space-y-1 text-[12px] text-zinc-600">
              {result.metricsSummary.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
          )}

          {result.inventoryConstraints.some((c) => c.blockIncreaseAds) && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] text-amber-900">
              库存约束：以下商品覆盖不足，已禁止「增加广告」类建议 —
              {result.inventoryConstraints
                .filter((c) => c.blockIncreaseAds)
                .map((c) => c.title)
                .slice(0, 3)
                .join("；")}
            </div>
          )}

          {result.keywords.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                关键词智能（广告数据分类）
              </p>
              <ul className="space-y-2">
                {result.keywords.slice(0, 12).map((k) => (
                  <li key={k.term + k.classification} className="text-zinc-800">
                    <span className="font-medium">
                      {CLASS_LABEL[k.classification] || k.classification}
                    </span>
                    <span className="text-zinc-500"> · {k.term}</span>
                    <p className="text-[12px] text-zinc-500">
                      {k.evidence} · {k.source}
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
