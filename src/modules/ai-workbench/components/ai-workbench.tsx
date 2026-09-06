"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolvePageCapabilities } from "@/modules/ai-workbench/registry";
import {
  clearAiCapabilityRecords,
  listAiCapabilityRecords,
  NEXA_AI_CAPABILITY_EVENT,
  NEXA_AI_HISTORY_EVENT,
  NEXA_AI_JOB_EVENT,
  recordAiCapabilityRun,
} from "@/modules/ai-workbench/store";
import type {
  AiCapabilityRecord,
  AiJobEventDetail,
  AiJobPhase,
} from "@/modules/ai-workbench/types";
import { NEXA_AI_OPEN_CHAT_EVENT } from "@/modules/ai-workbench/types";
import {
  applyCommerceAnalysisRefinement,
  clearCommerceAnalysis,
  getActiveCommerceAnalysis,
} from "@/modules/commerce/lib/analysis-context";
import { requestCommerceGoto } from "@/modules/commerce/lib/hub-pager";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";

type TabId = "chat" | "caps" | "records";

type AgentStepView = {
  id: string;
  order: number;
  title: string;
  action: string;
  note?: string;
  tool: { kind: string; status: string; label: string };
};

type AgentChatResult = {
  summary: string;
  intentLabel: string;
  chainLabel?: string | null;
  primaryHref: string;
  steps: AgentStepView[];
  missingMcp: string[];
  executed?: Array<{
    stepId: string;
    status: string;
    message: string;
    href?: string;
  }>;
  projectId?: string;
  confirmRequired?: boolean;
  jobId?: string;
  estimateCredits?: number | null;
  estimateMessage?: string;
  appliedKnowledge?: {
    summaryLine: string;
    items: Array<{
      label: string;
      ruleHighlights: string[];
    }>;
  } | null;
};

type LiveJob = {
  capabilityLabel: string;
  title: string;
  phase: AiJobPhase;
  message?: string;
  updatedAt: number;
};

type McpConnectorView = {
  id: string;
  label: string;
  status: "ready" | "unavailable" | "error";
  reason?: string;
  tools?: Array<{ name: string; title?: string; description?: string }>;
};

const PHASE_LABEL: Record<AiJobPhase, string> = {
  running: "正在生成",
  confirm_required: "待确认 Credits",
  done: "已完成",
  error: "失败",
  cancelled: "已取消",
};

/**
 * Floating AI Workbench — auto-opens on AI jobs, shows live status,
 * dismisses when user clicks outside the panel.
 */
function AiWorkbenchContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("caps");
  const [question, setQuestion] = useState("");
  const [records, setRecords] = useState<AiCapabilityRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentResult, setAgentResult] = useState<AgentChatResult | null>(null);
  const [liveJob, setLiveJob] = useState<LiveJob | null>(null);
  const [refineSummary, setRefineSummary] = useState<string | null>(null);
  const [pendingRefineJobId, setPendingRefineJobId] = useState<
    string | undefined
  >();
  const refineCredits = useCreditsConfirm();
  const [activeAnalysisTitle, setActiveAnalysisTitle] = useState<string | null>(
    null
  );
  const [mcpConnectors, setMcpConnectors] = useState<McpConnectorView[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);

  const onCommercePage = (pathname || "").startsWith("/commerce");
  const refineModeTitle = onCommercePage ? activeAnalysisTitle : null;

  useEffect(() => {
    const sync = () => {
      const a = getActiveCommerceAnalysis();
      setActiveAnalysisTitle(a ? a.title : null);
    };
    sync();
    window.addEventListener("nexa:commerce-analysis", sync);
    return () => window.removeEventListener("nexa:commerce-analysis", sync);
  }, []);

  useEffect(() => {
    if ((pathname || "").startsWith("/commerce")) return;
    if (getActiveCommerceAnalysis()) {
      clearCommerceAnalysis();
      setActiveAnalysisTitle(null);
    }
  }, [pathname]);

  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<{ question?: string }>).detail;
      setOpen(true);
      setTab("chat");
      if (detail?.question) setQuestion(detail.question);
    };
    window.addEventListener(NEXA_AI_OPEN_CHAT_EVENT, onOpenChat);
    return () =>
      window.removeEventListener(NEXA_AI_OPEN_CHAT_EVENT, onOpenChat);
  }, []);

  const page = useMemo(
    () => resolvePageCapabilities(pathname || "/"),
    [pathname]
  );
  const workspaceId = useMemo(() => {
    const match = (pathname || "").match(/^\/workspace\/([^/]+)/);
    return match?.[1];
  }, [pathname]);
  const searchTopic = searchParams.get("q")?.trim();

  const refreshRecords = () => {
    setRecords(listAiCapabilityRecords(page.pageKey));
  };

  useEffect(() => {
    refreshRecords();
    const onHist = () => refreshRecords();
    window.addEventListener(NEXA_AI_HISTORY_EVENT, onHist);
    return () => window.removeEventListener(NEXA_AI_HISTORY_EVENT, onHist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.pageKey]);

  useEffect(() => {
    const onJob = (ev: Event) => {
      const detail = (ev as CustomEvent<AiJobEventDetail>).detail;
      if (!detail) return;
      setLiveJob({
        capabilityLabel: detail.capabilityLabel,
        title: detail.title,
        phase: detail.phase,
        message: detail.message,
        updatedAt: Date.now(),
      });
      setOpen(true);
      setTab("records");
      if (detail.phase === "done" || detail.phase === "error") {
        recordAiCapabilityRun({
          pageKey: detail.pageKey || page.pageKey,
          capabilityId: detail.capabilityId,
          capabilityLabel: detail.capabilityLabel,
          title: detail.title,
          summary:
            detail.message ||
            (detail.phase === "done" ? "生成完成" : "生成失败"),
        });
        refreshRecords();
      }
    };
    window.addEventListener(NEXA_AI_JOB_EVENT, onJob);
    return () => window.removeEventListener(NEXA_AI_JOB_EVENT, onJob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.pageKey]);

  // Click outside panel → dismiss (toggle button excluded)
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (toggleRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Defer so the opening click does not immediately close
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointer, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "chat") return;
    let cancelled = false;
    setMcpLoading(true);
    fetch("/api/ai/mcp")
      .then(async (res) => {
        if (!res.ok) throw new Error("MCP 状态读取失败");
        return (await res.json()) as { connectors?: McpConnectorView[] };
      })
      .then((data) => {
        if (!cancelled) setMcpConnectors(data.connectors || []);
      })
      .catch(() => {
        if (!cancelled) setMcpConnectors([]);
      })
      .finally(() => {
        if (!cancelled) setMcpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  const runCapability = (capId: string, href?: string) => {
    if (href) {
      router.push(href);
      return;
    }
    if (capId === "creation_agent") {
      setOpen(true);
      setTab("chat");
      return;
    }
    if (capId === "refine_analysis") {
      setOpen(true);
      setTab("chat");
      setQuestion("把建议写得更可执行，列出今天就能做的三步");
      return;
    }
    if (capId === "customer_analyze" || capId === "customer_reply") {
      requestCommerceGoto("customer");
    }
    if (capId === "deep_financial") {
      requestCommerceGoto("profit");
    }
    if (capId === "deep_inventory") {
      requestCommerceGoto("inventory");
    }
    if (capId === "deep_ads") {
      requestCommerceGoto(
        (pathname || "").includes("tiktok") ? "content" : "ads"
      );
    }
    window.dispatchEvent(
      new CustomEvent(NEXA_AI_CAPABILITY_EVENT, {
        detail: { capabilityId: capId, pageKey: page.pageKey },
      })
    );
    setOpen(true);
    setTab("records");
  };

  const runRefineAnalysis = async (
    instruction: string,
    opts?: { confirm?: boolean; jobId?: string }
  ) => {
    const active = getActiveCommerceAnalysis();
    const q = instruction.trim();
    if (!q || !active) return false;

    setAgentLoading(true);
    setAgentError(null);
    setRefineSummary(null);
    setOpen(true);
    setTab("chat");
    setLiveJob({
      capabilityLabel: "优化智能分析",
      title: q.slice(0, 80),
      phase: "running",
      message: opts?.confirm
        ? "已确认 Credits，正在按你的意愿改写…"
        : `正在改写「${active.title}」…`,
      updatedAt: Date.now(),
    });

    try {
      const res = await fetch("/api/commerce/refine-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: q,
          insight: active.insight,
          kind: active.kind,
          title: active.title,
          confirm: Boolean(opts?.confirm),
          jobId: opts?.jobId || pendingRefineJobId,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        if (
          refineCredits.applyGateResponse({
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
          setPendingRefineJobId(data.jobId);
          setLiveJob({
            capabilityLabel: "优化智能分析",
            title: q.slice(0, 80),
            phase: "confirm_required",
            message: data.estimate?.message || data.message,
            updatedAt: Date.now(),
          });
          return true;
        }
        setAgentError(data.message || "改写失败");
        setLiveJob({
          capabilityLabel: "优化智能分析",
          title: q.slice(0, 80),
          phase: "error",
          message: data.message || "改写失败",
          updatedAt: Date.now(),
        });
        return true;
      }

      refineCredits.reset();
      setPendingRefineJobId(undefined);
      applyCommerceAnalysisRefinement({
        slot: active.slot,
        insight: data.insight,
        depth: "refined",
      });
      const summary = `已按你的意愿更新「${active.title}」：${String(data.insight.diagnosis || "").slice(0, 120)}`;
      setRefineSummary(summary);
      setAgentResult(null);
      setLiveJob({
        capabilityLabel: "优化智能分析",
        title: active.title,
        phase: "done",
        message: summary,
        updatedAt: Date.now(),
      });
      recordAiCapabilityRun({
        pageKey: page.pageKey,
        capabilityId: "refine_analysis",
        capabilityLabel: "优化智能分析",
        title: q.slice(0, 80),
        summary,
        payload: { slot: active.slot, insight: data.insight },
      });
      refreshRecords();
      return true;
    } catch {
      setAgentError("网络错误，请稍后重试");
      setLiveJob({
        capabilityLabel: "优化智能分析",
        title: q.slice(0, 80),
        phase: "error",
        message: "网络错误",
        updatedAt: Date.now(),
      });
      return true;
    } finally {
      setAgentLoading(false);
    }
  };

  const runAgent = async (
    goal: string,
    opts?: { confirm?: boolean; jobId?: string }
  ) => {
    const q = goal.trim();
    if (!q) return;
    const contextualGoal =
      page.pageKey === "search" && searchTopic
        ? `${q}\n\n【当前搜索主题】${searchTopic}`
        : q;

    // On commerce pages with an active smart analysis, prefer refine via chat.
    if (
      (pathname || "").startsWith("/commerce") &&
      getActiveCommerceAnalysis() &&
      !opts?.confirm
    ) {
      const handled = await runRefineAnalysis(q);
      if (handled) return;
    }
    if (opts?.confirm && refineCredits.state.pending) {
      const handled = await runRefineAnalysis(q, {
        confirm: true,
        jobId: opts.jobId || pendingRefineJobId,
      });
      if (handled) return;
    }

    setAgentLoading(true);
    setAgentError(null);
    setOpen(true);
    setTab("chat");
    setLiveJob({
      capabilityLabel: "创作 Agent",
      title: q.slice(0, 80),
      phase: opts?.confirm ? "running" : "running",
      message: opts?.confirm
        ? "已确认 Credits，正在执行链路…"
        : "正在识别意图并执行链路…",
      updatedAt: Date.now(),
    });
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: contextualGoal,
          execute: true,
          enrich: true,
          confirm: Boolean(opts?.confirm),
          jobId: opts?.jobId,
          workspaceId,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.plan) {
        setAgentError(data.error || "Agent 执行失败");
        setLiveJob({
          capabilityLabel: "创作 Agent",
          title: q.slice(0, 80),
          phase: "error",
          message: data.error || "Agent 执行失败",
          updatedAt: Date.now(),
        });
        return;
      }
      const plan = data.plan;
      const view: AgentChatResult = {
        summary: plan?.summary || data.error || "",
        intentLabel: plan?.intentLabel || "创作",
        chainLabel: plan?.chainLabel,
        primaryHref: data.primaryHref || plan?.primaryHref || "/create",
        missingMcp: plan?.missingMcp || [],
        steps: (plan?.steps || []).map(
          (s: {
            id: string;
            order: number;
            title: string;
            action: string;
            note?: string;
            tool: { kind: string; status: string; label: string };
          }) => ({
            id: s.id,
            order: s.order,
            title: s.title,
            action: s.action,
            note: s.note,
            tool: s.tool,
          })
        ),
        executed: data.executed,
        projectId: data.projectId,
        confirmRequired: Boolean(data.confirmRequired),
        jobId: data.jobId,
        estimateCredits: data.estimate?.estimatedCredits ?? null,
        estimateMessage: data.estimate?.message,
        appliedKnowledge: plan?.appliedKnowledge ?? null,
      };
      setAgentResult(view);

      if (data.confirmRequired) {
        setLiveJob({
          capabilityLabel: "创作 Agent",
          title: q.slice(0, 80),
          phase: "confirm_required",
          message:
            data.estimate?.message ||
            "需要确认 Credits 后继续执行生成步骤",
          updatedAt: Date.now(),
        });
      } else {
        const failed = (data.executed || []).find(
          (s: { status: string }) =>
            s.status === "error" || s.status === "login_required"
        );
        setLiveJob({
          capabilityLabel: plan?.chainLabel || "创作 Agent",
          title: q.slice(0, 80),
          phase: failed ? "error" : "done",
          message: failed
            ? failed.message
            : data.projectId
              ? `链路完成 · 项目已创建`
              : plan?.summary,
          updatedAt: Date.now(),
        });
      }

      recordAiCapabilityRun({
        pageKey: page.pageKey,
        capabilityId: "creation_agent",
        capabilityLabel: plan?.chainLabel || "创作 Agent",
        title: q.slice(0, 80),
        summary: view.summary,
        payload: {
          intent: plan?.creationIntent,
          chainId: plan?.chainId,
          executed: data.executed,
          projectId: data.projectId,
          primaryHref: view.primaryHref,
        },
      });
      refreshRecords();
    } catch {
      setAgentError("网络错误，请稍后重试");
      setLiveJob({
        capabilityLabel: "创作 Agent",
        title: q.slice(0, 80),
        phase: "error",
        message: "网络错误",
        updatedAt: Date.now(),
      });
    } finally {
      setAgentLoading(false);
    }
  };

  const pageRecords = records;
  const jobRunning = liveJob?.phase === "running";

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed right-4 top-[calc(var(--nexa-header-height)+12px)] z-[60] flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 sm:right-6"
        aria-expanded={open}
        aria-controls="nexa-ai-workbench"
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            jobRunning ? "animate-pulse bg-amber-500" : "bg-emerald-500"
          }`}
        />
        AI 工作台
        {jobRunning && (
          <span className="rounded-md bg-amber-50 px-1.5 text-[11px] text-amber-800">
            生成中
          </span>
        )}
        {!jobRunning && pageRecords.length > 0 && (
          <span className="rounded-md bg-zinc-100 px-1.5 text-[11px] tabular-nums text-zinc-600">
            {pageRecords.length}
          </span>
        )}
      </button>

      {open && (
        <aside
          ref={panelRef}
          id="nexa-ai-workbench"
          className="fixed right-4 top-[calc(var(--nexa-header-height)+56px)] z-[60] flex h-[min(72vh,640px)] w-[min(100vw-2rem,360px)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg sm:right-6"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">AI 工作台</p>
              <p className="mt-0.5 text-[12px] text-zinc-500">
                点击页面其他区域可收起
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] text-zinc-400 hover:text-zinc-700"
            >
              收起
            </button>
          </div>

          {liveJob && (
            <div
              className={`mx-3 mt-3 rounded-lg border px-3 py-2.5 ${
                liveJob.phase === "running"
                  ? "border-amber-100 bg-amber-50/80"
                  : liveJob.phase === "done"
                    ? "border-emerald-100 bg-emerald-50/70"
                    : liveJob.phase === "error"
                      ? "border-red-100 bg-red-50/70"
                      : "border-zinc-100 bg-zinc-50"
              }`}
            >
              <p className="text-[12px] font-medium text-zinc-800">
                {PHASE_LABEL[liveJob.phase]} · {liveJob.capabilityLabel}
              </p>
              <p className="mt-0.5 text-[13px] text-zinc-700">{liveJob.title}</p>
              {liveJob.message && (
                <p className="mt-1 line-clamp-3 text-[12px] text-zinc-500">
                  {liveJob.message}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-1 border-b border-zinc-100 px-2 pt-2">
            {(
              [
                ["caps", "能力"],
                ["chat", "Agent"],
                ["records", "记录"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 rounded-t-md px-2 py-2 text-[13px] ${
                  tab === id
                    ? "bg-zinc-50 font-medium text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {label}
                {id === "records" && pageRecords.length > 0
                  ? ` (${pageRecords.length})`
                  : ""}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
              <p>
                当前页 ·{" "}
                <span className="font-medium text-zinc-800">{page.pageLabel}</span>
              </p>
            </div>

            {tab === "caps" && (
              <div className="space-y-3">
                <p className="text-[12px] font-medium text-zinc-500">
                  本页可用 AI 能力
                </p>
                {page.capabilities.length === 0 ? (
                  <p className="text-[13px] text-zinc-500">
                    {page.tips?.[0] || "暂无专用能力；可切到 Agent 描述目标"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {page.capabilities.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          runCapability(c.id, c.href);
                        }}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-[13px] text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        <span className="font-medium">{c.label}</span>
                        {c.description && (
                          <span className="mt-0.5 block text-[11px] text-zinc-400">
                            {c.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "chat" && (
              <div className="space-y-3">
                <p className="text-[13px] text-zinc-600">
                  {refineModeTitle
                    ? `当前已有「${refineModeTitle}」。直接说希望怎么改（更聚焦库存 / 语气更强 / 补充促销建议等），会按你的意愿优化分析。`
                    : page.agentIntro ||
                      "描述目标。Agent 会在已接入能力范围内规划并执行。"}
                </p>
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <p className="text-[12px] font-medium text-zinc-700">
                    MCP 连接
                    {mcpLoading ? " · 检查中" : ""}
                  </p>
                  {mcpConnectors.length > 0 ? (
                    <div className="mt-1.5 space-y-1">
                      {mcpConnectors.map((connector) => (
                        <p key={connector.id} className="text-[11px] text-zinc-500">
                          <span
                            className={
                              connector.status === "ready"
                                ? "text-emerald-700"
                                : connector.status === "error"
                                  ? "text-red-600"
                                  : "text-zinc-400"
                            }
                          >
                            {connector.status === "ready"
                              ? "已连接"
                              : connector.status === "error"
                                ? "连接失败"
                                : "未配置"}
                          </span>
                          {" · "}
                          {connector.label}
                          {connector.status === "ready"
                            ? ` · ${connector.tools?.length || 0} 个工具`
                            : connector.reason
                              ? ` · ${connector.reason}`
                              : ""}
                        </p>
                      ))}
                    </div>
                  ) : !mcpLoading ? (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      未配置远程 MCP；Agent 仍会执行已接入的 Nexa 能力。
                    </p>
                  ) : null}
                </div>
                {refineModeTitle ? (
                  <ul className="space-y-1.5 text-[13px] text-zinc-700">
                    {[
                      "把建议写得更可执行，列出今天就能做的三步",
                      "更强调库存风险，不要提加投",
                      "用更简短的中文经营简报语气重写诊断",
                    ].map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          className="text-left underline-offset-2 hover:underline"
                          onClick={() => {
                            setQuestion(q);
                            void runAgent(q);
                          }}
                        >
                          「{q}」
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-1.5 text-[13px] text-zinc-700">
                    {(page.agentExamples ?? []).map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          className="text-left underline-offset-2 hover:underline"
                          onClick={() => {
                            setQuestion(q);
                            void runAgent(q);
                          }}
                        >
                          「{q}」
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {agentLoading && (
                  <p className="text-[13px] text-zinc-500">
                    {refineModeTitle ? "正在按你的意愿改写…" : "Agent 执行中…"}
                  </p>
                )}
                {agentError && (
                  <p className="text-[13px] text-red-600">{agentError}</p>
                )}
                {refineCredits.state.pending && (
                  <CreditsConfirmPanel
                    message={refineCredits.state.estimateMessage}
                    estimatedCredits={refineCredits.state.estimatedCredits}
                    onConfirm={() =>
                      void runRefineAnalysis(question.trim(), {
                        confirm: true,
                        jobId: pendingRefineJobId,
                      })
                    }
                    onCancel={() => {
                      refineCredits.reset();
                      setPendingRefineJobId(undefined);
                    }}
                    busy={agentLoading}
                    loginRequired={refineCredits.state.loginRequired}
                  />
                )}
                {refineSummary && !agentLoading && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 text-[13px] text-zinc-800">
                    {refineSummary}
                    <p className="mt-1 text-[12px] text-zinc-500">
                      页面中的智能分析已同步更新。
                    </p>
                  </div>
                )}
                {agentResult && !agentLoading && (
                  <div className="space-y-2 rounded-lg border border-zinc-100 p-3">
                    <p className="text-[12px] font-medium text-zinc-500">
                      意图 · {agentResult.intentLabel}
                      {agentResult.chainLabel
                        ? ` · ${agentResult.chainLabel}`
                        : ""}
                    </p>
                    <p className="text-[13px] leading-relaxed text-zinc-800">
                      {agentResult.summary}
                    </p>
                    {agentResult.appliedKnowledge?.items.length ? (
                      <div className="rounded-md bg-zinc-50 px-2.5 py-2">
                        <p className="text-[12px] font-medium text-zinc-700">
                          已应用知识
                        </p>
                        <p className="mt-0.5 text-[12px] text-zinc-600">
                          {agentResult.appliedKnowledge.summaryLine}
                        </p>
                        <ul className="mt-1.5 space-y-1 text-[11px] text-zinc-500">
                          {agentResult.appliedKnowledge.items.map((item) => (
                            <li key={item.label}>
                              {item.ruleHighlights[0] || item.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {agentResult.steps.length > 0 && (
                      <ol className="space-y-1 text-[12px] text-zinc-600">
                        {agentResult.steps.map((step) => (
                          <li key={step.id}>
                            {step.order}. {step.title}
                            <span className="ml-1 text-zinc-400">
                              · {step.tool.kind === "mcp" ? "MCP" : step.tool.kind === "capability" ? "AI 能力" : "服务"}
                              {step.action === "skip"
                                ? " · 未接入"
                                : step.action === "navigate"
                                  ? " · 需要补充输入"
                                  : ""}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {agentResult.executed && agentResult.executed.length > 0 && (
                      <ol className="space-y-1.5 text-[12px] text-zinc-600">
                        {agentResult.executed.map((s, i) => (
                          <li key={s.stepId || i}>
                            {i + 1}.{" "}
                            <span
                              className={
                                s.status === "ok"
                                  ? "text-emerald-700"
                                  : s.status === "confirm_required"
                                    ? "text-amber-700"
                                    : s.status === "skipped" ||
                                        s.status === "blocked"
                                      ? "text-zinc-400"
                                      : "text-red-600"
                              }
                            >
                              [{s.status}]
                            </span>{" "}
                            {s.message}
                          </li>
                        ))}
                      </ol>
                    )}
                    {agentResult.confirmRequired && (
                      <div className="rounded-md border border-amber-100 bg-amber-50/80 px-3 py-2">
                        <p className="text-[12px] text-amber-900">
                          {agentResult.estimateMessage ||
                            "生成步骤需要确认 Credits"}
                          {agentResult.estimateCredits != null
                            ? ` · 约 ${agentResult.estimateCredits} Credits`
                            : ""}
                        </p>
                        <button
                          type="button"
                          disabled={agentLoading}
                          onClick={() =>
                            void runAgent(question.trim(), {
                              confirm: true,
                              jobId: agentResult.jobId,
                            })
                          }
                          className="mt-2 w-full rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
                        >
                          确认并继续执行
                        </button>
                      </div>
                    )}
                    {!agentResult.confirmRequired && (
                      <button
                        type="button"
                        onClick={() => {
                          if (agentResult.projectId) {
                            router.push(`/create/${agentResult.projectId}`);
                            return;
                          }
                          const hintsGoal =
                            question.trim() || agentResult.summary;
                          const href = agentResult.primaryHref.includes("goal=")
                            ? agentResult.primaryHref
                            : `${agentResult.primaryHref}${
                                agentResult.primaryHref.includes("?")
                                  ? "&"
                                  : "?"
                              }goal=${encodeURIComponent(
                                hintsGoal.slice(0, 200)
                              )}`;
                          router.push(href);
                        }}
                        className="mt-1 w-full rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
                      >
                        {agentResult.projectId
                          ? "打开创作项目"
                          : "按计划前往"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "records" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium text-zinc-500">
                    本页历史
                  </p>
                  {pageRecords.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        clearAiCapabilityRecords(page.pageKey);
                        refreshRecords();
                      }}
                      className="text-[12px] text-zinc-400 hover:text-zinc-700"
                    >
                      清空本页
                    </button>
                  )}
                </div>
                {pageRecords.length === 0 && !liveJob ? (
                  <p className="text-[13px] text-zinc-500">
                    还没有记录。页面开始 AI 生成时，状态会出现在上方。
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pageRecords.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-lg border border-zinc-100 px-3 py-2"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            setExpandedId((id) => (id === r.id ? null : r.id))
                          }
                        >
                          <p className="text-[13px] font-medium text-zinc-900">
                            {r.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            {r.capabilityLabel} ·{" "}
                            {new Date(r.createdAt).toLocaleString("zh-CN")}
                          </p>
                          {r.summary && (
                            <p className="mt-1 line-clamp-2 text-[12px] text-zinc-600">
                              {r.summary}
                            </p>
                          )}
                        </button>
                        {expandedId === r.id && r.payload != null && (
                          <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-50 p-2 text-[11px] text-zinc-600">
                            {typeof r.payload === "string"
                              ? r.payload
                              : JSON.stringify(r.payload, null, 2).slice(0, 2000)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-100 p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const q = question.trim();
                if (!q || agentLoading) return;
                void runAgent(q);
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  page.agentInputPlaceholder ||
                  "描述要完成的事，规划并执行…"
                }
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={agentLoading}
                className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                {agentLoading ? "…" : "规划并执行"}
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}

export function AiWorkbench() {
  return (
    <Suspense fallback={null}>
      <AiWorkbenchContent />
    </Suspense>
  );
}
