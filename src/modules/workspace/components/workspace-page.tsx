"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, StepIndex } from "@/components/ui/hierarchy";
import { ReturnBackLink } from "@/components/navigation/return-back-link";
import { layout, type as typeStyle } from "@/lib/ui-hierarchy";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { UI } from "@/lib/ui-copy";
import { DeepResearchModal } from "@/modules/research/components/deep-research-modal";
import type { DeepResearchConfig } from "@/modules/research/components/deep-research-modal";
import { ResearchReportPanel } from "@/modules/research/components/research-report-panel";
import { RESEARCH_STATUS_LABELS } from "@/modules/research/constants";
import type { DeepResearchJob } from "@/modules/workspace/types";
import { WorkspaceContextPanel } from "@/modules/workspace/components/workspace-context-panel";
import { ExtractResultPanel } from "@/modules/workspace/components/extract-result-panel";
import {
  parseExtractResult,
  packToSeedContent,
  type CreationPack,
} from "@/modules/workspace/services/creation-pack";
import { emitAiJob } from "@/modules/ai-workbench/store";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";

const PLATFORM_LABELS: Record<string, string> = {
  web: "网页",
  wikipedia: "Wikipedia",
  youtube: "YouTube",
  bilibili: "B站",
  x: "X",
  reddit: "Reddit",
  xiaohongshu: "小红书",
  tiktok: "TikTok",
};

export function WorkspaceListPage() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-[14px] text-zinc-400">加载中…</p>}>
      <WorkspaceListContent />
    </Suspense>
  );
}

function WorkspaceListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const goal = searchParams.get("goal");
  const action = searchParams.get("action");
  const [workspaces, setWorkspaces] = useState<
    { id: string; name: string; count: number; updatedAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showNoise, setShowNoise] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(
    () => action === "research" && Boolean(goal)
  );

  useEffect(() => {
    if (action !== "research" || !goal) return;

    let cancelled = false;

    (async () => {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          query: goal,
        }),
      });
      if (cancelled || !res.ok) {
        setBootstrapping(false);
        return;
      }
      const ws = await res.json();
      router.replace(
        `/workspace/${ws.id}/research?goal=${encodeURIComponent(goal)}`
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [action, goal, router]);

  useEffect(() => {
    if (bootstrapping) return;
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((d) => setWorkspaces(d.workspaces ?? []))
      .finally(() => setLoading(false));
  }, [bootstrapping]);

  const isNoiseWorkspace = (name: string) => {
    const n = (name ?? "").toLowerCase();
    return /smoke|test\b|retest|untitled|未命名|demo[_ ]?test|v\d+v\d+/.test(n);
  };

  const mainWorkspaces = workspaces.filter((w) => !isNoiseWorkspace(w.name));
  const noiseWorkspaces = workspaces.filter((w) => isNoiseWorkspace(w.name));
  const visible = showNoise
    ? [...mainWorkspaces, ...noiseWorkspaces]
    : mainWorkspaces;

  const renameWorkspace = async (ws: { id: string; name: string }) => {
    const next = window.prompt("重命名工作区", ws.name);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === ws.name) return;
    const res = await fetch(`/api/workspace/${ws.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      window.alert("重命名失败，请稍后再试");
      return;
    }
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === ws.id ? { ...w, name } : w))
    );
  };

  const deleteWorkspaceRow = async (ws: { id: string; name: string }) => {
    if (
      !window.confirm(
        `确定删除工作区「${ws.name}」？资料与研究记录将一并移除，且不可恢复。`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/workspace/${ws.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteWorkspace: true }),
    });
    if (!res.ok) {
      window.alert("删除失败，请稍后再试");
      return;
    }
    setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
  };

  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title={UI.workspace.title}
        description="当前任务的 Context Hub：收集资料、研究判断，再带到创作。"
      />

      <p className={`mb-8 ${typeStyle.meta}`}>
        搜索加入资料 → 工作区整理 / 研究 →{" "}
        <Link href="/create" className="text-zinc-600 underline-offset-2 hover:underline">
          创作
        </Link>
        {" · "}
        <Link
          href="/commerce/amazon/selection"
          className="text-zinc-600 underline-offset-2 hover:underline"
        >
          选品调研
        </Link>
      </p>

      {bootstrapping && (
        <p className="text-[14px] text-zinc-400">正在创建工作区…</p>
      )}

      {!bootstrapping && loading && (
        <p className="text-[14px] text-zinc-400">{UI.common.loadingPage}</p>
      )}

      {!bootstrapping && !loading && (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className={typeStyle.sectionLabel}>我的工作区</p>
              <p className={`mt-1 ${typeStyle.bodyMuted}`}>
                每个工作区 = 围绕一个主题收集的一批资料与成片。
              </p>
            </div>
            <Link
              href="/"
              className="text-[13px] text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              去搜索并加入资料
            </Link>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-12 text-center">
              <p className={`${typeStyle.sectionTitle} text-zinc-700`}>
                还没有可用工作区
              </p>
              <p className={`mx-auto mt-2 max-w-sm ${typeStyle.bodyMuted}`}>
                先去搜索，在结果里点「加入工作区」；回来后就能在这里继续研究，并跳到创作。
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[13px]">
                <Link
                  href="/"
                  className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800"
                >
                  去搜索
                </Link>
                <Link
                  href="/create?mode=workspace"
                  className="text-zinc-600 underline-offset-2 hover:underline"
                >
                  或先去创作
                </Link>
              </div>
              {noiseWorkspaces.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNoise(true)}
                  className="mt-6 text-[12px] text-zinc-400 hover:text-zinc-600"
                >
                  另有 {noiseWorkspaces.length} 个测试工作区
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((ws) => {
                const noise = isNoiseWorkspace(ws.name);
                return (
                  <div
                    key={ws.id}
                    className="rounded-xl border border-zinc-100 px-4 py-4 transition-colors hover:border-zinc-200 hover:bg-zinc-50/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {noise && (
                          <span className="mb-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                            测试数据
                          </span>
                        )}
                        <Link
                          href={`/workspace/${ws.id}`}
                          className={`${typeStyle.sectionTitle} hover:text-[var(--nexa-link)] hover:underline`}
                        >
                          {ws.name}
                        </Link>
                        <p className={`mt-1 ${typeStyle.meta}`}>
                          {ws.count > 0
                            ? `${ws.count} 条资料 / 成片`
                            : "暂无资料，可继续搜索或去创作生成成片"}
                          {" · "}
                          更新于 {new Date(ws.updatedAt).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                      <Link
                        href={`/workspace/${ws.id}`}
                        className="font-medium text-zinc-900 underline underline-offset-4"
                      >
                        打开工作区
                      </Link>
                      <Link
                        href={`/search?workspaceId=${ws.id}`}
                        className="text-zinc-500 hover:text-zinc-800"
                      >
                        继续搜索
                      </Link>
                      <Link
                        href={`/create?mode=workspace&workspaceId=${encodeURIComponent(ws.id)}&goal=${encodeURIComponent(ws.name || "基于工作区生成短视频成片")}`}
                        className="text-zinc-500 hover:text-zinc-800"
                      >
                        一键成片
                      </Link>
                      <button
                        type="button"
                        onClick={() => void renameWorkspace(ws)}
                        className="text-zinc-500 hover:text-zinc-800"
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteWorkspaceRow(ws)}
                        className="text-zinc-400 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
              {!showNoise && noiseWorkspaces.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNoise(true)}
                  className="pt-2 text-[12px] text-zinc-400 hover:text-zinc-600"
                >
                  另有 {noiseWorkspaces.length} 个测试/噪音工作区
                </button>
              )}
              {showNoise && noiseWorkspaces.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowNoise(false)}
                  className="pt-2 text-[12px] text-zinc-400 hover:text-zinc-600"
                >
                  隐藏测试工作区
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function WorkspaceDetailPage({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  // Search → research → creation is available to guests; identity is only
  // required for account-owned capabilities such as publishing connections.
  const canResearch = true;
  const { workspace, refreshWorkspace, loading, setActiveWorkspaceId } =
    useWorkspaceContext();
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [researchInput, setResearchInput] = useState("");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiResultLabel, setAiResultLabel] = useState<string | null>(null);
  const [extractNotes, setExtractNotes] = useState<string>("");
  const [extractPack, setExtractPack] = useState<CreationPack | null>(null);
  const [showExtractPanel, setShowExtractPanel] = useState(false);
  const [createHandoffBusy, setCreateHandoffBusy] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [researchJobs, setResearchJobs] = useState<DeepResearchJob[]>([]);
  const [activeJob, setActiveJob] = useState<DeepResearchJob | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [researchSubmitting, setResearchSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveWorkspaceId(workspaceId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceId, setActiveWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    async function loadJobs() {
      const res = await fetch(`/api/research?workspaceId=${workspaceId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const jobs = (data.jobs ?? []) as DeepResearchJob[];
      if (!cancelled) {
        setResearchJobs(jobs);
        setActiveJob((prev) => {
          if (!prev) return jobs[0] ?? null;
          const updated = jobs.find((j) => j.id === prev.id);
          return updated ?? jobs[0] ?? prev;
        });
      }
    }
    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Poll while research job is in progress
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
        setResearchJobs((prev) =>
          prev.map((j) => (j.id === job.id ? job : j))
        );
      })();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.status]);

  const displayName = editingName ? name : (workspace?.name ?? "");

  const handleSaveName = async () => {
    await fetch(`/api/workspace/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setEditingName(false);
    await refreshWorkspace();
  };

  const handleRemoveSource = async (sourceId: string) => {
    const res = await fetch("/api/workspace/remove", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, sourceId }),
    });
    if (res.ok) {
      await refreshWorkspace();
    } else {
      setAiMessage("移除资料失败，请稍后再试");
    }
  };

  const runResearchAction = async (
    action: "summarize" | "compare" | "extract" | "disagree" | "ask",
    goal?: string
  ) => {
    if (!workspace || workspace.sources.length === 0) {
      setAiMessage("请先在工作区中加入资料。");
      return;
    }
    setAiLoading(true);
    setAiMessage(null);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/research-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, goal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage(data.error ?? "操作失败");
        return;
      }
      if (data.success === false) {
        setAiMessage(data.message ?? UI.common.aiUnavailable);
        return;
      }
      const text =
        typeof data.data?.text === "string" ? data.data.text.trim() : "";
      if (text) {
        setAiResult(text);
        setAiResultLabel(
          typeof data.message === "string" ? data.message : "分析结果"
        );
        if (action === "extract") {
          const fromApi =
            data.data?.pack && typeof data.data.pack === "object"
              ? (data.data.pack as CreationPack)
              : null;
          const parsed = parseExtractResult(text);
          setExtractNotes(
            typeof data.data?.notes === "string" && data.data.notes.trim()
              ? data.data.notes.trim()
              : parsed.notes
          );
          setExtractPack(fromApi ?? parsed.pack);
          setShowExtractPanel(true);
        } else {
          setExtractNotes("");
          setExtractPack(null);
          setShowExtractPanel(false);
        }
        setAiMessage(null);
      } else {
        setAiMessage(data.message ?? UI.common.aiUnavailable);
      }
    } finally {
      setAiLoading(false);
    }
  };

  useAiCapabilityListener(
    {
      workspace_summarize: () => {
        emitAiJob({
          capabilityId: "workspace_summarize",
          capabilityLabel: "快速分析 · 总结",
          title: workspace?.name || "工作区",
          phase: "running",
          message: "正在基于资料生成总结…",
          pageKey: "workspace",
        });
        void runResearchAction("summarize").then(() => {
          emitAiJob({
            capabilityId: "workspace_summarize",
            capabilityLabel: "快速分析 · 总结",
            title: workspace?.name || "工作区",
            phase: "done",
            message: "总结已生成，见工作区主栏",
            pageKey: "workspace",
          });
        });
      },
      workspace_research: () => {
        if (!canResearch) {
          setAiMessage("当前账号权限不足，无法发起深入研究。");
          return;
        }
        setShowResearch(true);
        emitAiJob({
          capabilityId: "workspace_research",
          capabilityLabel: "深入研究报告",
          title: workspace?.name || "工作区",
          phase: "done",
          message: "已打开深入研究配置",
          pageKey: "workspace",
        });
      },
    },
    [workspaceId, workspace?.sources?.length, canResearch, aiLoading]
  );

  const handleResearchSubmit = () => {
    if (!researchInput.trim()) return;
    void runResearchAction("ask", researchInput.trim());
  };

  const handleCreateFromSources = () => {
    if (!workspace || workspace.sources.length === 0) {
      setAiMessage("请先在工作区中加入资料。");
      return;
    }
    const goal =
      workspace.name?.trim() ||
      "基于工作区资料生成短视频成片";
    router.push(
      `/create?mode=workspace&workspaceId=${encodeURIComponent(workspaceId)}&goal=${encodeURIComponent(goal)}`
    );
  };

  const handleUseExtractForCreate = async () => {
    if (!workspace) return;
    const pack = extractPack;
    if (!pack) {
      handleCreateFromSources();
      return;
    }
    setCreateHandoffBusy(true);
    setAiMessage(null);
    try {
      const seed = packToSeedContent(pack);
      const goal =
        workspace.name?.trim() ||
        pack.hook ||
        "基于工作区资料的短视频创作";
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          title: goal.slice(0, 40),
          contentType: "short_video",
          platform: "xiaohongshu",
          startMode: "workspace",
          workspaceId,
          brief: extractNotes.slice(0, 2000) || pack.styleNotes || undefined,
          seedContent: seed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.id) {
        setAiMessage(data?.error || "创建创作项目失败");
        return;
      }
      router.push(`/create/${data.id}`);
    } catch {
      setAiMessage("创建创作项目失败，请稍后再试");
    } finally {
      setCreateHandoffBusy(false);
    }
  };

  const handleCreateResearch = async (config: DeepResearchConfig) => {
    setResearchSubmitting(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          goal: config.goal,
          scope: config.scope,
          timeRange: config.timeRange,
          reportType: config.reportType,
          customFrom: config.customFrom,
          customTo: config.customTo,
        }),
      });
      if (res.ok) {
        const job = (await res.json()) as DeepResearchJob;
        setResearchJobs((prev) => [job, ...prev]);
        setActiveJob(job);
        setShowResearch(false);
        setAiMessage(
          job.status === "blocked_ai_unavailable"
            ? UI.common.aiUnavailable
            : "研究任务已创建"
        );
      }
    } finally {
      setResearchSubmitting(false);
    }
  };

  const platformCounts = (workspace?.sources ?? []).reduce(
    (acc, s) => {
      const label = PLATFORM_LABELS[s.platform] ?? s.platform;
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading && !workspace) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-[14px] text-zinc-400">{UI.common.loadingPage}</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="py-20 text-center">
        <p className="text-[15px] text-zinc-500">工作区不存在</p>
        <ReturnBackLink
          className="mt-4 inline-block"
          fallbackHref="/workspace"
          fallbackLabel="返回工作区列表"
        />
      </div>
    );
  }

  const defaultGoal = `全面了解${workspace.name.replace(/研究$/, "")}的相关信息、主要观点和争议。`;

  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
      {/* Header */}
      <section className="mb-8 border-b border-zinc-100 pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <ReturnBackLink
              className="mb-2"
              fallbackHref="/workspace"
              fallbackLabel="返回工作区列表"
            />
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-b border-zinc-300 bg-transparent text-[22px] font-semibold outline-none"
                />
                <button
                  onClick={handleSaveName}
                  className="text-[13px] text-zinc-600 hover:text-zinc-900"
                >
                  {UI.common.save}
                </button>
              </div>
            ) : (
              <h1
                className="cursor-pointer text-[22px] font-semibold text-zinc-900"
                onClick={() => {
                  setName(workspace.name);
                  setEditingName(true);
                }}
              >
                {displayName}
              </h1>
            )}
            <p className="mt-1 text-[13px] text-zinc-400">
              {workspace.sources.length} 条资料 · 更新于{" "}
              {new Date(workspace.updatedAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() =>
                router.push(`/search?workspaceId=${workspaceId}`)
              }
              className="rounded-lg border border-zinc-200 px-4 py-2 text-[14px] text-zinc-700 hover:bg-zinc-50"
            >
              {UI.workspace.continueSearch}
            </button>
            <button
              onClick={() => canResearch && setShowResearch(true)}
              disabled={!canResearch}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-[14px] font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {UI.workspace.research}
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (
                    !window.confirm(
                      `确定删除工作区「${workspace.name}」？不可恢复。`
                    )
                  ) {
                    return;
                  }
                  const res = await fetch(`/api/workspace/${workspaceId}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deleteWorkspace: true }),
                  });
                  if (!res.ok) {
                    setAiMessage("删除失败，请稍后再试");
                    return;
                  }
                  router.push("/workspace");
                })();
              }}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-[14px] text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              删除工作区
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Research area + AI input */}
        <div className="min-w-0 space-y-0">
          <section className="pb-10">
            <StepIndex value={1} label="AI 快速分析" />
            <p className={`mt-2 mb-4 ${typeStyle.bodyMuted}`}>
              AI 基于当前资料提取要点、比较观点并形成结论；结果会显示在下方。
            </p>

            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  [UI.workspace.summarize, "summarize"],
                  [UI.workspace.compare, "compare"],
                  [UI.workspace.extract, "extract"],
                  [UI.workspace.disagree, "disagree"],
                ] as const
              ).map(([label, action]) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void runResearchAction(action)}
                  disabled={
                    !canResearch || aiLoading || workspace.sources.length === 0
                  }
                  className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-[13px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleCreateFromSources}
                disabled={workspace.sources.length === 0}
                className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-[13px] text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {UI.workspace.createFromSources}
              </button>
            </div>

            {aiLoading && (
              <p className="mb-4 text-[14px] text-zinc-400">正在分析资料…</p>
            )}
            {aiMessage && (
              <p className="mb-4 text-[14px] text-amber-800">{aiMessage}</p>
            )}
            {aiResult &&
              (showExtractPanel ? (
                <ExtractResultPanel
                  label={aiResultLabel ?? "提取要点"}
                  notes={extractNotes}
                  pack={extractPack}
                  rawText={aiResult}
                  createBusy={createHandoffBusy}
                  onUseForCreate={() => void handleUseExtractForCreate()}
                />
              ) : (
                <div className="mb-2 rounded-lg bg-zinc-50/80 px-4 py-3">
                  <p className={`mb-2 ${typeStyle.sectionLabel}`}>
                    {aiResultLabel ?? "分析结果"}
                  </p>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                    {aiResult}
                  </div>
                </div>
              ))}
          </section>

          <section className={layout.sectionDivided}>
            <StepIndex value={2} label="深入研究报告" />
            <p className={`mt-2 mb-4 ${typeStyle.bodyMuted}`}>
              需要结构化长报告时再发起；不会被快速分析覆盖。
            </p>

            {activeJob ? (
              <ResearchReportPanel
                report={activeJob.report}
                blocked={activeJob.status === "blocked_ai_unavailable"}
                status={activeJob.status}
                statusLabel={
                  RESEARCH_STATUS_LABELS[activeJob.status] ?? activeJob.status
                }
                goal={activeJob.goal}
                workspaceId={workspaceId}
                researchId={activeJob.id}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 px-5 py-8 text-center">
                <p className="text-[14px] text-zinc-500">
                  基于已收集的 {workspace.sources.length}{" "}
                  条资料，发起深入研究后将在此展示结构化报告。
                </p>
                <button
                  type="button"
                  onClick={() => canResearch && setShowResearch(true)}
                  disabled={!canResearch}
                  className="mt-4 text-[13px] font-medium text-zinc-800 underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {UI.workspace.research}
                </button>
              </div>
            )}

            {researchJobs.length > 1 && (
              <div className="mt-4 space-y-2">
                <p className={typeStyle.sectionLabel}>研究任务</p>
                {researchJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setActiveJob(job)}
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-[13px] ${
                      activeJob?.id === job.id
                        ? "border-zinc-300 bg-zinc-50"
                        : "border-zinc-100 hover:border-zinc-200"
                    }`}
                  >
                    <span className="line-clamp-1 text-zinc-800">{job.goal}</span>
                    <span className="mt-0.5 block text-[12px] text-zinc-400">
                      {RESEARCH_STATUS_LABELS[job.status] ?? job.status} ·{" "}
                      {new Date(job.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={layout.sectionDivided}>
            <StepIndex value={3} label="追问资料" />
            <p className={`mt-2 mb-4 ${typeStyle.bodyMuted}`}>
              针对当前资料自由提问。
            </p>
            <input
              type="text"
              value={researchInput}
              onChange={(e) => setResearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResearchSubmit()}
              placeholder={UI.workspace.aiPlaceholder}
              className="w-full rounded-xl border border-zinc-200 px-4 py-3.5 text-[15px] outline-none transition-colors focus:border-zinc-300"
            />
          </section>
        </div>

        {/* Sources + V3.0 Context */}
        <aside className="space-y-8">
          <WorkspaceContextPanel
            workspaceId={workspaceId}
            onChanged={() => void refreshWorkspace()}
          />

          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[12px] font-medium text-zinc-400">
                {UI.workspace.sources} · {workspace.sources.length}
              </p>
              <button
                onClick={() =>
                  router.push(`/search?workspaceId=${workspaceId}`)
                }
                className="text-[13px] text-zinc-500 hover:text-zinc-800"
              >
                {UI.workspace.continueSearch}
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(platformCounts).map(([label, count]) => (
                <span key={label} className="text-[12px] text-zinc-400">
                  {label} {count}
                </span>
              ))}
            </div>

            <div className="space-y-2">
              {workspace.sources.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-zinc-500">{UI.workspace.empty}</p>
                  <button
                    onClick={() =>
                      router.push(`/search?workspaceId=${workspaceId}`)
                    }
                    className="mt-3 text-[13px] text-zinc-700 underline underline-offset-2"
                  >
                    {UI.workspace.continueSearch}
                  </button>
                </div>
              )}
              {workspace.sources.map((source) => (
                <div
                  key={source.id}
                  className="group rounded-lg border border-transparent px-2.5 py-2.5 transition-colors hover:border-zinc-100 hover:bg-zinc-50/90"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
                      {PLATFORM_LABELS[source.platform] ?? source.platform}
                    </span>
                    {source.ingestStatus === "ready" &&
                      source.mediaSummary?.includes("已完成远程镜头分析") && (
                      <span className="text-[11px] text-emerald-700">
                        已完成镜头分析
                      </span>
                    )}
                    {source.ingestStatus === "ready" &&
                      source.mediaSummary?.includes("识别版本") &&
                      !source.mediaSummary?.includes("已完成远程镜头分析") && (
                      <span className="text-[11px] text-amber-700">
                        视觉参考·未逐帧解析
                      </span>
                    )}
                    {source.ingestStatus === "ready" &&
                      !source.mediaSummary?.includes("识别版本") && (
                      <span className="text-[11px] text-emerald-700">已抓取正文</span>
                    )}
                    {source.ingestStatus === "skipped_binary" && (
                      <span className="text-[11px] text-amber-700">
                        待媒体识别
                      </span>
                    )}
                    {source.ingestStatus === "failed" && (
                      <span className="text-[11px] text-amber-700">抓取失败·用摘要</span>
                    )}
                    {source.ingestStatus === "skipped_thin" && (
                      <span className="text-[11px] text-zinc-400">识别信号不足</span>
                    )}
                    {!source.ingestStatus && (
                      <span className="text-[11px] text-zinc-400">待抓取</span>
                    )}
                    {source.publishedAt && (
                      <span className="text-[11px] text-zinc-400">
                        {new Date(source.publishedAt).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                    {source.author && (
                      <span className="text-[11px] text-zinc-400">
                        · {source.author}
                      </span>
                    )}
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nexa-result-title line-clamp-2 text-[15px]"
                  >
                    {source.title ?? source.url}
                  </a>
                  {(source.contentSummary || source.snippet) && (
                    <p className="nexa-result-snippet mt-1 line-clamp-2 text-[12px]">
                      {source.contentSummary || source.snippet}
                    </p>
                  )}
                  {source.sourceType === "video" && (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {source.mediaSummary?.includes("已完成远程镜头分析")
                        ? "创作依据：远程服务返回的镜头时码、画面与风格信息；未下载或保存原视频。"
                        : "创作依据：标题、简介与封面识别；镜头分析服务未配置或未完成，未下载或逐帧解析原视频。"}
                    </p>
                  )}
                  <div className="mt-1.5 flex gap-3">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-[var(--nexa-link)] hover:underline"
                    >
                      {UI.workspace.openSource}
                    </a>
                    <button
                      onClick={() => void handleRemoveSource(source.id)}
                      className="text-[12px] text-zinc-400 hover:text-zinc-700"
                    >
                      {UI.common.remove}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {showResearch && (
        <DeepResearchModal
          key={defaultGoal}
          open={showResearch}
          initialGoal={defaultGoal}
          submitting={researchSubmitting}
          onClose={() => setShowResearch(false)}
          onSubmit={handleCreateResearch}
        />
      )}
    </div>
  );
}
