"use client";

import Link from "next/link";
import { UI } from "@/lib/ui-copy";
import type { ResearchReport } from "@/modules/workspace/types";
import { parseStoredResearchReport } from "@/modules/ai/research/normalize-report";

interface ResearchReportPanelProps {
  report?: ResearchReport | Record<string, unknown> | null;
  blocked?: boolean;
  status?: string;
  statusLabel?: string;
  goal?: string;
  workspaceId?: string;
  researchId?: string;
}

export function ResearchReportPanel({
  report: rawReport,
  blocked = false,
  status,
  statusLabel,
  goal,
  workspaceId,
  researchId,
}: ResearchReportPanelProps) {
  const report =
    rawReport &&
    typeof rawReport === "object" &&
    Array.isArray((rawReport as ResearchReport).keyFindings) &&
    typeof (rawReport as ResearchReport).title === "string"
      ? (rawReport as ResearchReport)
      : parseStoredResearchReport(
          rawReport as Record<string, unknown> | null | undefined
        );

  const inProgress =
    status === "queued" || status === "running" || status === "generating";
  const failed = status === "failed";
  const unavailable = status === "blocked_ai_unavailable";

  if (inProgress) {
    return (
      <div className="rounded-xl border border-zinc-100 bg-zinc-50/40 px-5 py-8 text-center">
        <p className="text-[15px] font-medium text-zinc-800">正在生成研究报告…</p>
        <p className="mt-2 text-[13px] text-zinc-500">
          {statusLabel ?? "处理中"} · 完成后将展示结论、证据与来源
        </p>
        {goal && (
          <p className="mt-4 text-[13px] text-zinc-400">目标：{goal}</p>
        )}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/40 px-5 py-6">
        <p className="text-[15px] font-medium text-red-700">研究失败</p>
        <p className="mt-2 text-[13px] text-red-600/80">
          {statusLabel ?? "请稍后重试"}
        </p>
      </div>
    );
  }

  if (unavailable || blocked || !report) {
    return (
      <div className="rounded-xl border border-zinc-100 bg-zinc-50/40 px-5 py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium text-zinc-900">研究报告</p>
            {goal && (
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                目标：{goal}
              </p>
            )}
          </div>
          {statusLabel && (
            <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-[12px] text-zinc-600">
              {statusLabel}
            </span>
          )}
        </div>
        <p className="text-[14px] text-zinc-500">{UI.common.aiUnavailable}</p>
      </div>
    );
  }

  const sourceMap = new Map(report.sources.map((s) => [s.id, s]));

  const reportActions =
    (
      report as ResearchReport & {
        actions?: Array<{ label: string; href: string }>;
      }
    ).actions ?? [];

  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-100 pb-5">
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          研究报告
        </p>
        <h3 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-900">
          {report.title}
        </h3>
        {report.generatedAt && (
          <p className="mt-1 text-[12px] text-zinc-400">
            生成于 {new Date(report.generatedAt).toLocaleString("zh-CN")}
          </p>
        )}
        {report.executiveSummary && (
          <section className="mt-4">
            <p className="mb-1.5 text-[12px] font-medium text-zinc-400">
              {UI.research.conclusion}
            </p>
            <p className="text-[15px] leading-relaxed text-zinc-800">
              {report.executiveSummary}
            </p>
          </section>
        )}
        {workspaceId && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            {reportActions.length > 0
              ? reportActions.map((a) => (
                  <Link
                    key={a.href + a.label}
                    href={a.href}
                    className="font-medium text-zinc-900 underline underline-offset-4"
                  >
                    {a.label}
                  </Link>
                ))
              : (
                  <>
                    <Link
                      href={`/create?mode=workspace&workspaceId=${encodeURIComponent(workspaceId)}&goal=${encodeURIComponent(goal || report.title)}${
                        researchId
                          ? `&researchId=${encodeURIComponent(researchId)}`
                          : ""
                      }`}
                      className="rounded-lg bg-zinc-900 px-3 py-2 font-medium text-white"
                    >
                      继续创作
                    </Link>
                    <Link
                      href={`/workspace/${workspaceId}`}
                      className="text-zinc-600 underline underline-offset-4"
                    >
                      在工作区查看
                    </Link>
                    <Link
                      href={`/search?q=${encodeURIComponent(goal || report.title)}&workspaceId=${workspaceId}`}
                      className="text-zinc-600 underline underline-offset-4"
                    >
                      继续搜索
                    </Link>
                  </>
                )}
          </div>
        )}
      </header>

      <ReportList title={UI.research.findings} items={report.keyFindings} />

      {report.evidence.length > 0 && (
        <section>
          <p className="mb-1.5 text-[12px] font-medium text-zinc-400">
            {UI.research.evidence}
          </p>
          <ul className="space-y-2">
            {report.evidence.map((item, i) => (
              <li key={i} className="text-[14px] leading-relaxed text-zinc-700">
                <span>{item.text}</span>
                {item.sourceIds?.length > 0 && (
                  <span className="ml-1 inline-flex gap-1">
                    {item.sourceIds.map((id) => {
                      const src = sourceMap.get(id);
                      if (!src) return null;
                      return (
                        <a
                          key={id}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-zinc-400 hover:text-zinc-700"
                        >
                          [{id}]
                        </a>
                      );
                    })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details>
        <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
          趋势 / 分歧 / 机会 / 风险 / 来源
        </summary>
        <div className="mt-4 space-y-5">
          <ReportList title={UI.research.trends} items={report.trends} />
          <ReportList
            title={UI.research.disagreements}
            items={report.disagreements}
          />
          <ReportList
            title={UI.research.opportunities}
            items={report.opportunities}
          />
          <ReportList title={UI.research.risks} items={report.risks} />
          <section>
            <p className="mb-1.5 text-[12px] font-medium text-zinc-400">
              {UI.research.sources}
            </p>
            <ul className="space-y-1.5">
              {report.sources.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-zinc-600 hover:underline"
                  >
                    [{s.id}] {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="mb-5">
      <p className="mb-1.5 text-[12px] font-medium text-zinc-400">{title}</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i} className="text-[14px] leading-relaxed text-zinc-700">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
