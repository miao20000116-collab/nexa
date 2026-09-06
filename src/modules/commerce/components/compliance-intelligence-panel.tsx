"use client";

import { useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type { ComplianceIntelligenceResult } from "@/modules/commerce/capability/compliance-types";
import {
  COMPLIANCE_DATA_LABEL,
  COMPLIANCE_RISK_LABEL,
  COMPLIANCE_TARGET_LABEL,
  COMPLIANCE_VERDICT_LABEL,
} from "@/modules/commerce/capability/compliance-types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";

function VerdictBadge({
  value,
}: {
  value: string;
}) {
  const tone =
    value === "HIGH_RISK"
      ? "bg-red-50 text-red-800"
      : value === "PASS"
        ? "bg-emerald-50 text-emerald-800"
        : value.includes("INSUFFICIENT")
          ? "bg-amber-50 text-amber-900"
          : "bg-zinc-100 text-zinc-800";
  return (
    <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${tone}`}>
      {COMPLIANCE_VERDICT_LABEL[value] || value}
    </span>
  );
}

/**
 * Compliance Intelligence — enhances existing compliance pages.
 * Never claims legal certainty.
 */
export function ComplianceIntelligencePanel({
  channel,
  platform,
  defaultProductTitle,
  defaultProductId,
  defaultFlags,
  defaultClaimRisks,
}: {
  channel: "amazon" | "tiktok";
  platform: "Amazon" | "TikTok Shop";
  defaultProductTitle?: string;
  defaultProductId?: string;
  defaultFlags?: string[];
  defaultClaimRisks?: string[];
}) {
  const [productTitle, setProductTitle] = useState(defaultProductTitle || "");
  const [listingText, setListingText] = useState("");
  const [keywords, setKeywords] = useState("");
  const [adsNotes, setAdsNotes] = useState("");
  const [imageNotes, setImageNotes] = useState("");
  const [videoNotes, setVideoNotes] = useState("");
  const [scenario, setScenario] = useState<
    "auto" | "low" | "mid" | "high" | "insufficient"
  >("auto");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    ComplianceIntelligenceResult,
    { ok: true }
  > | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const credits = useCreditsConfirm();

  const run = async (confirm = false) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/commerce/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          platform,
          productTitle: productTitle || undefined,
          productId: defaultProductId,
          listingText: listingText || undefined,
          keywords: keywords || undefined,
          adsNotes: adsNotes || undefined,
          imageNotes: imageNotes || undefined,
          videoNotes: videoNotes || undefined,
          demoFlags: defaultFlags,
          demoClaimRisks: defaultClaimRisks,
          scenario,
          confirm,
          jobId: confirm ? pendingJobId : undefined,
        }),
      });
      const data = (await res.json()) as ComplianceIntelligenceResult;

      if (!data.ok) {
        if (
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
        setError(data.message || "合规分析失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(data);
    } catch {
      setError("合规分析失败，请稍后重试");
    } finally {
      setRunning(false);
    }
  };

  const insight = result?.insight;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          Compliance Intelligence · compliance_check
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          合规智能筛查
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          Risk · Evidence · Reason · Recommendation。禁止保证合法或过审。
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">商品 / Title</span>
        <input
          value={productTitle}
          onChange={(e) => setProductTitle(e.target.value)}
          placeholder="产品名称"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">
          商品页 / 描述（可选）
        </span>
        <textarea
          value={listingText}
          onChange={(e) => setListingText(e.target.value)}
          rows={3}
          placeholder="粘贴标题、描述、宣称等"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-zinc-400">验收场景</span>
        {(
          [
            ["auto", "自动"],
            ["low", "低风险"],
            ["mid", "中风险"],
            ["high", "高风险"],
            ["insufficient", "证据不足"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setScenario(id)}
            className={
              scenario === id
                ? "rounded-md bg-zinc-900 px-2.5 py-1 text-white"
                : "rounded-md border border-zinc-200 px-2.5 py-1 text-zinc-600"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        {showMore ? "收起 Keywords / Ads / Image / Video" : "展开更多检查对象"}
      </button>

      {showMore && (
        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <input
            value={adsNotes}
            onChange={(e) => setAdsNotes(e.target.value)}
            placeholder="Ads 文案 / 备注"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <input
            value={imageNotes}
            onChange={(e) => setImageNotes(e.target.value)}
            placeholder="Image 备注"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <input
            value={videoNotes}
            onChange={(e) => setVideoNotes(e.target.value)}
            placeholder="Video 备注"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void run(false)}
        disabled={running}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {running ? "筛查中…" : "运行合规筛查"}
      </button>

      {credits.state.pending && (
        <CreditsConfirmPanel
          message={credits.state.estimateMessage}
          estimatedCredits={credits.state.estimatedCredits}
          onConfirm={() => void run(true)}
          onCancel={() => {
            credits.reset();
            setPendingJobId(undefined);
          }}
          busy={running}
        />
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {result && insight && (
        <div className="space-y-4 border-t border-zinc-100 pt-4 text-[13px]">
          <AppliedKnowledgeBanner
            knowledge={
              result.appliedKnowledge ?? insight.appliedKnowledge ?? null
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge value={result.overallVerdict} />
            <span className="text-[12px] text-amber-800">
              {COMPLIANCE_DATA_LABEL[result.dataLabel] || result.dataLabel}
            </span>
          </div>

          <div className="space-y-2">
            <p>
              <span className="text-zinc-400">Diagnosis · </span>
              {insight.diagnosis}
            </p>
            <p>
              <span className="text-zinc-400">Recommendation · </span>
              {insight.recommendation}
            </p>
          </div>

          <ul className="space-y-4">
            {result.risks.map((r, idx) => (
              <li
                key={`${r.risk}-${r.target}-${idx}`}
                className="border-b border-zinc-50 pb-4 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictBadge value={r.verdict} />
                  <span className="font-medium text-zinc-900">
                    {COMPLIANCE_RISK_LABEL[r.risk] || r.risk}
                  </span>
                  <span className="text-[12px] text-zinc-400">
                    · {COMPLIANCE_TARGET_LABEL[r.target] || r.target}
                  </span>
                </div>
                <p className="mt-2 text-zinc-700">
                  <span className="text-zinc-400">原因 · </span>
                  {r.reason}
                </p>
                <p className="mt-1 text-zinc-700">
                  <span className="text-zinc-400">建议 · </span>
                  {r.recommendation}
                </p>
                {r.evidence.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[12px] text-zinc-500">
                    {r.evidence.map((e) => (
                      <li key={e.url}>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {e.title}
                        </a>
                        {" · "}
                        {e.source} · {e.timestamp}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12px] text-amber-800">
                    Evidence · INSUFFICIENT EVIDENCE
                  </p>
                )}
              </li>
            ))}
          </ul>

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
