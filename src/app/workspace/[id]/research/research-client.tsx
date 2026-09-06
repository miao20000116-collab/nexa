"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ReturnBackLink } from "@/components/navigation/return-back-link";
import { withPreservedReturnNav } from "@/modules/commerce/lib/return-nav";
import { UI } from "@/lib/ui-copy";
import { ResearchReportPanel } from "@/modules/research/components/research-report-panel";
import { RESEARCH_STATUS_LABELS } from "@/modules/research/constants";
import type { DeepResearchJob } from "@/modules/workspace/types";

export default function WorkspaceResearchPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const goalFromUrl = searchParams.get("goal");
  const [jobs, setJobs] = useState<DeepResearchJob[]>([]);
  const [activeJob, setActiveJob] = useState<DeepResearchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/research?workspaceId=${workspaceId}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.jobs ?? []) as DeepResearchJob[];
        if (!cancelled) {
          setJobs(list);
          setActiveJob(list[0] ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!goalFromUrl || loading || creating || jobs.length > 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCreating(true);
      void (async () => {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            goal: goalFromUrl,
            scope: "web",
            timeRange: "year",
            reportType: "full",
          }),
        });
        if (cancelled) return;
        if (res.ok) {
          const job = (await res.json()) as DeepResearchJob;
          setJobs([job]);
          setActiveJob(job);
        }
        setCreating(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [goalFromUrl, loading, creating, jobs.length, workspaceId]);

  useEffect(() => {
    const status = activeJob?.status;
    const jobId = activeJob?.id;
    if (!jobId || (status !== "queued" && status !== "running")) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/research?id=${jobId}`);
        if (!res.ok || cancelled) return;
        const job = (await res.json()) as DeepResearchJob;
        if (cancelled) return;
        setActiveJob(job);
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.status]);

  const latest = activeJob ?? jobs[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-zinc-900">
            {UI.workspace.research}
          </h1>
          <p className="mt-1 text-[14px] text-zinc-500">
            围绕工作区资料与全网检索生成结构化研究报告。
          </p>
        </div>
        <ReturnBackLink
          fallbackHref={withPreservedReturnNav(
            `/workspace/${workspaceId}`,
            searchParams
          )}
          fallbackLabel="返回工作区"
        />
      </div>

      {(loading || creating) && (
        <p className="text-[14px] text-zinc-400">{UI.common.loadingPage}</p>
      )}

      {!loading && !creating && !latest && (
        <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-10 text-center">
          <p className="text-[14px] text-zinc-500">还没有研究任务</p>
          <Link
            href={`/workspace/${workspaceId}`}
            className="mt-3 inline-block text-[13px] font-medium text-zinc-800 underline underline-offset-2"
          >
            去工作区发起深入研究
          </Link>
        </div>
      )}

      {latest && (
        <ResearchReportPanel
          report={latest.report}
          blocked={latest.status === "blocked_ai_unavailable"}
          status={latest.status}
          statusLabel={RESEARCH_STATUS_LABELS[latest.status] ?? latest.status}
          goal={latest.goal}
          workspaceId={workspaceId}
          researchId={latest.id}
        />
      )}

      {jobs.length > 1 && (
        <div className="mt-8 space-y-2">
          <p className="text-[12px] font-medium text-zinc-400">历史任务</p>
          {jobs.slice(1).map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setActiveJob(job)}
              className="block w-full rounded-lg border border-zinc-100 px-3 py-2 text-left hover:border-zinc-200"
            >
              <p className="line-clamp-1 text-[13px] text-zinc-800">{job.goal}</p>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                {RESEARCH_STATUS_LABELS[job.status] ?? job.status} ·{" "}
                {new Date(job.createdAt).toLocaleString("zh-CN")}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
