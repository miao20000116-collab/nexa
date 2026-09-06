"use client";

import { useEffect, useRef, useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type {
  CustomerIntelligenceResult,
  CustomerReplyKind,
  CustomerReplyLanguage,
} from "@/modules/commerce/capability/customer-types";
import { DEMO_CUSTOMER_SAMPLES } from "@/modules/commerce/capability/customer-types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";
import {
  NEXA_AI_CAPABILITY_EVENT,
  recordAiCapabilityRun,
} from "@/modules/ai-workbench/store";

const LANGS: CustomerReplyLanguage[] = [
  "English",
  "German",
  "French",
  "Spanish",
  "Chinese",
];

const LANG_LABEL: Record<string, string> = {
  English: "英语",
  German: "德语",
  French: "法语",
  Spanish: "西班牙语",
  Chinese: "中文",
};

const KINDS: Array<{ id: CustomerReplyKind; label: string }> = [
  { id: "review_reply", label: "评价回复" },
  { id: "customer_reply", label: "客服回复" },
  { id: "email", label: "邮件" },
  { id: "follow_up", label: "跟进" },
];

/**
 * Customer Intelligence panel — Commerce Capability, not a CS ticket system.
 */
export function CustomerIntelligencePanel({
  channel,
  platform,
  productTitle,
  productId,
  defaultReviews,
}: {
  channel: "amazon" | "tiktok";
  platform: "Amazon" | "TikTok Shop";
  productTitle?: string;
  productId?: string;
  defaultReviews?: string;
}) {
  const [reviewsText, setReviewsText] = useState(
    defaultReviews || DEMO_CUSTOMER_SAMPLES.join("\n")
  );
  const [messagesText, setMessagesText] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const [orderContext, setOrderContext] = useState("");
  const [title, setTitle] = useState(productTitle || "");
  const [replyLanguage, setReplyLanguage] =
    useState<CustomerReplyLanguage>("English");
  const [replyKind, setReplyKind] =
    useState<CustomerReplyKind>("review_reply");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    CustomerIntelligenceResult,
    { ok: true }
  > | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const [pendingMode, setPendingMode] = useState<"analyze" | "reply">(
    "analyze"
  );
  const credits = useCreditsConfirm();
  const resultRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  const pageKey =
    channel === "tiktok"
      ? "commerce.tiktok.customer"
      : "commerce.amazon.customer";

  const run = async (mode: "analyze" | "reply", confirm = false) => {
    setRunning(true);
    setError(null);
    setPendingMode(mode);
    try {
      const res = await fetch("/api/commerce/customer-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          platform,
          productTitle: title || undefined,
          productId,
          reviewsText: reviewsText || undefined,
          messagesText: messagesText || undefined,
          emailsText: emailsText || undefined,
          orderContext: orderContext || undefined,
          useDemoSamples: true,
          mode,
          replyKind,
          replyLanguage,
          focusTheme: result?.painPoints[0]?.theme,
          confirm,
          jobId: confirm ? pendingJobId : undefined,
        }),
      });
      const raw = (await res.json()) as CustomerIntelligenceResult & {
        error?: string;
      };

      if (!raw.ok) {
        if (
          credits.applyGateResponse({
            code: raw.code,
            message: raw.message || raw.error,
            error: raw.error,
            estimate: raw.estimate
              ? {
                  message: raw.estimate.message,
                  estimatedCredits: raw.estimate.estimatedCredits ?? undefined,
                }
              : undefined,
          })
        ) {
          setPendingJobId(raw.jobId);
          requestAnimationFrame(() =>
            confirmRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            })
          );
          return;
        }
        setError(raw.message || raw.error || "客户洞察失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(raw);
      recordAiCapabilityRun({
        pageKey,
        capabilityId:
          mode === "analyze" ? "customer_analyze" : "customer_reply",
        capabilityLabel:
          mode === "analyze" ? "分析差评 / 痛点" : "生成本土化回复",
        title:
          mode === "analyze"
            ? raw.insight?.diagnosis || "差评痛点分析"
            : raw.reply?.subject || "本土化回复",
        summary:
          mode === "analyze"
            ? raw.painPoints
                .slice(0, 3)
                .map((p) => p.theme)
                .join(" · ") || raw.insight?.recommendation
            : raw.reply?.body?.slice(0, 160),
        payload: {
          mode,
          painPoints: raw.painPoints,
          reply: raw.reply,
          insight: raw.insight,
          dataLabel: raw.dataLabel,
        },
      });
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        })
      );
    } catch {
      setError("客户洞察失败，请稍后重试");
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    const onCap = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as
        | { capabilityId?: string; pageKey?: string }
        | undefined;
      if (!detail?.capabilityId) return;
      if (detail.capabilityId === "customer_analyze") {
        void run("analyze", false);
      } else if (detail.capabilityId === "customer_reply") {
        void run("reply", false);
      }
    };
    window.addEventListener(NEXA_AI_CAPABILITY_EVENT, onCap);
    return () => window.removeEventListener(NEXA_AI_CAPABILITY_EVENT, onCap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, reviewsText, title, replyKind, replyLanguage]);

  const insight = result?.insight;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          Customer Intelligence · customer_intelligence
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          客户洞察
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          差评 / 消息聚类 → Pain Points → 本土化回复。不是完整客服工单系统。
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">
          商品（可选）
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="产品名称"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">
          Reviews / Negative Reviews（每行一条）
        </span>
        <textarea
          value={reviewsText}
          onChange={(e) => setReviewsText(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
        />
      </label>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        {showMore ? "收起消息 / 邮件 / 订单" : "展开消息 / 邮件 / 订单 Context"}
      </button>

      {showMore && (
        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <textarea
            value={messagesText}
            onChange={(e) => setMessagesText(e.target.value)}
            rows={2}
            placeholder="Customer Messages（可选）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <textarea
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            rows={2}
            placeholder="邮件原文（可选）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <input
            value={orderContext}
            onChange={(e) => setOrderContext(e.target.value)}
            placeholder="Order Context（可选）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run("analyze", false)}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {running && pendingMode === "analyze" ? "分析中…" : "分析差评 / 痛点"}
        </button>
        <select
          value={replyKind}
          onChange={(e) => setReplyKind(e.target.value as CustomerReplyKind)}
          className="rounded-lg border border-zinc-200 px-2 py-2 text-[12px]"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          value={replyLanguage}
          onChange={(e) =>
            setReplyLanguage(e.target.value as CustomerReplyLanguage)
          }
          className="rounded-lg border border-zinc-200 px-2 py-2 text-[12px]"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_LABEL[l] || l}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void run("reply", false)}
          disabled={running}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
        >
          {running && pendingMode === "reply" ? "生成中…" : "生成本土化回复"}
        </button>
      </div>

      {credits.state.pending && (
        <div ref={confirmRef}>
          <CreditsConfirmPanel
            message={credits.state.estimateMessage}
            estimatedCredits={credits.state.estimatedCredits}
            loginRequired={credits.state.loginRequired}
            onConfirm={() => void run(pendingMode, true)}
            onCancel={() => {
              credits.reset();
              setPendingJobId(undefined);
            }}
            busy={running}
          />
        </div>
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {result && (
        <div
          ref={resultRef}
          className="space-y-4 border-t border-zinc-100 pt-4 text-[13px]"
        >
          <AppliedKnowledgeBanner
            knowledge={
              result.appliedKnowledge ?? insight?.appliedKnowledge ?? null
            }
          />
          <p className="text-[12px] font-medium text-amber-800">
            {result.dataLabel}
          </p>

          {insight && (
            <div className="space-y-2">
              <p>
                <span className="text-zinc-400">Diagnosis · </span>
                {insight.diagnosis}
              </p>
              <p>
                <span className="text-zinc-400">Opportunity · </span>
                {insight.opportunity}
              </p>
              <p>
                <span className="text-zinc-400">Recommendation · </span>
                {insight.recommendation}
              </p>
            </div>
          )}

          {result.painPoints.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                Top Customer Pain Points
              </p>
              <ul className="space-y-3">
                {result.painPoints.map((p) => (
                  <li
                    key={p.theme}
                    className="border-b border-zinc-50 pb-3 last:border-0"
                  >
                    <p className="font-medium text-zinc-900">
                      {p.theme}
                      <span className="ml-2 text-[12px] font-normal text-zinc-400">
                        {p.category} · {p.sentiment} · {p.frequencyLabel}
                      </span>
                    </p>
                    {p.likelyProductProblem && (
                      <p className="mt-1 text-[12px] text-amber-800">
                        可能是 Product Problem，不仅是客服问题
                      </p>
                    )}
                    <p className="mt-1 text-zinc-600">{p.recommendation}</p>
                    {p.evidenceSnippets.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[12px] text-zinc-500">
                        {p.evidenceSnippets.map((e) => (
                          <li key={e}>· {e}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.reply && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
              <p className="text-[12px] text-zinc-400">
                {KINDS.find((k) => k.id === result.reply!.kind)?.label ||
                  result.reply.kind}{" "}
                · {LANG_LABEL[result.reply.language] || result.reply.language}
              </p>
              {result.reply.subject && (
                <p className="mt-1 font-medium text-zinc-800">
                  主题 · {result.reply.subject}
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-zinc-800">
                {result.reply.body}
              </p>
              <p className="mt-2 text-[12px] text-zinc-500">
                {result.reply.localizationNotes}
              </p>
            </div>
          )}

          {insight?.dataNotice && (
            <p className="text-[12px] text-zinc-500">{insight.dataNotice}</p>
          )}

          <WorkflowActions
            actions={result.workflowActions}
            chainLabel={result.chainLabel}
          />
        </div>
      )}
    </section>
  );
}
