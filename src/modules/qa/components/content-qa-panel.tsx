"use client";

import { useEffect, useState } from "react";
import { QA_CATEGORY_LABELS, type ContentQAReport } from "@/modules/qa/types";
import { CreditsConfirmPanel } from "@/modules/account/components/credits-confirm";

export function ContentQAPanel({
  projectId,
  platform,
  onReport,
}: {
  projectId: string;
  platform?: string | null;
  onReport?: (report: ContentQAReport | null) => void;
}) {
  const [report, setReport] = useState<ContentQAReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    estimatedCredits: number | null;
    jobId?: string;
  } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/qa?projectId=${encodeURIComponent(projectId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.report) {
          setReport(data.report);
          onReport?.(data.report);
        }
      })();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const runQa = async (confirm = false, jobId?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platform, confirm, jobId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "confirm_required") {
          setConfirmState({
            message: data.estimate?.message ?? data.message,
            estimatedCredits: data.estimate?.estimatedCredits ?? null,
            jobId: data.jobId,
          });
          return;
        }
        setMessage(data.message ?? data.error ?? "质检失败");
        return;
      }
      setConfirmState(null);
      setReport(data.report);
      onReport?.(data.report);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-100 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium text-zinc-400">内容质检 QA</p>
          <p className="mt-1 text-[12px] text-zinc-400">
            Creation → QA → Preview → Publish
          </p>
        </div>
        {!confirmState && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runQa()}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? "质检中…" : "运行质检"}
          </button>
        )}
      </div>

      {confirmState && (
        <div className="mb-3">
          <CreditsConfirmPanel
            message={confirmState.message}
            estimatedCredits={confirmState.estimatedCredits}
            busy={busy}
            onConfirm={() => void runQa(true, confirmState.jobId)}
            onCancel={() => setConfirmState(null)}
          />
        </div>
      )}

      {message && <p className="mb-2 text-[13px] text-zinc-600">{message}</p>}

      {!report ? (
        <p className="text-[13px] text-zinc-400">
          发布前必须质检。将检查事实、来源、素材、版权、平台规范、安全与商业信息。
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p
              className={`text-[15px] font-semibold ${
                report.verdict === "PASS"
                  ? "text-emerald-700"
                  : "text-amber-700"
              }`}
            >
              {report.verdict === "PASS" ? "PASS" : "NEEDS_REVISION"}
              <span className="ml-2 text-[13px] font-medium">
                （{report.verdictLabel}）
              </span>
            </p>
            <p className="mt-1 text-[13px] text-zinc-600">{report.summary}</p>
            {report.blockedAi && (
              <p className="mt-1 text-[12px] text-zinc-400">
                当前使用规则质检完成检测。
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium text-zinc-400">检测结果</p>
            <ul className="space-y-1.5">
              {report.checks.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 text-[13px]"
                >
                  <span className="text-zinc-700">
                    {QA_CATEGORY_LABELS[c.id] ?? c.label}
                  </span>
                  <span
                    className={
                      c.ok ? "text-emerald-700" : "text-amber-700"
                    }
                  >
                    {c.ok ? "通过" : "需关注"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {report.issues.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">问题</p>
              <ul className="space-y-3">
                {report.issues.map((issue) => (
                  <li
                    key={issue.id}
                    className="rounded-lg border border-zinc-100 px-3 py-2"
                  >
                    <p className="text-[12px] text-zinc-400">
                      {QA_CATEGORY_LABELS[issue.category]} ·{" "}
                      {issue.severity === "error" ? "必须修改" : "建议修改"}
                    </p>
                    <p className="mt-1 text-[13px] text-zinc-800">
                      <span className="text-zinc-500">哪里：</span>
                      {issue.where}
                    </p>
                    <p className="mt-0.5 text-[13px] text-zinc-800">
                      <span className="text-zinc-500">为什么：</span>
                      {issue.why}
                    </p>
                    <p className="mt-0.5 text-[13px] text-zinc-800">
                      <span className="text-zinc-500">怎么改：</span>
                      {issue.how}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">建议</p>
              <ul className="list-disc space-y-1 pl-4">
                {report.suggestions.map((s) => (
                  <li key={s} className="text-[13px] text-zinc-600">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
