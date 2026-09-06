"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type {
  SearchFailureKind,
  SearchResponse,
  SearchResult,
  SearchTab,
  SearchStage,
} from "@/modules/search/types";
import { SearchInput } from "@/components/search-input";
import { AIOverviewCard } from "./ai-overview";
import { SearchResultItem, ImageResultCard } from "./result-card";
import { WorkspaceBar } from "@/modules/workspace/components/workspace-bar";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { emitAiJob } from "@/modules/ai-workbench/store";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";

const TABS: { id: SearchTab; label: string }[] = [
  { id: "all", label: "综合" },
  { id: "web", label: "网页" },
  { id: "x", label: "X" },
  { id: "video", label: "视频" },
  { id: "image", label: "图片" },
  { id: "social", label: "社媒" },
];

const STAGE_LABELS: Record<SearchStage, string> = {
  understanding: "正在理解你的问题…",
  searching: "正在搜索相关信息…",
  organizing: "正在整理结果…",
  generating_overview: "正在生成 AI 概览…",
  complete: "",
  error: "",
};

const FAILURE_MESSAGES: Record<
  Exclude<SearchFailureKind, null>,
  { title: string; hint: string }
> = {
  empty: {
    title: "未找到相关结果",
    hint: "试试换个问法，或扩大搜索范围",
  },
  error: {
    title: "搜索服务暂时不可用",
    hint: "请稍后再试",
  },
  timeout: {
    title: "搜索请求超时",
    hint: "网络较慢或来源响应延迟，请稍后重试",
  },
};

function filterByTab(results: SearchResult[], tab: SearchTab): SearchResult[] {
  switch (tab) {
    case "web":
      return results.filter(
        (r) =>
          r.platform === "web" &&
          r.sourceType !== "image" &&
          r.sourceType !== "video"
      );
    case "x":
      return results.filter((r) => r.platform === "x");
    case "video":
      return results.filter(
        (r) => r.platform === "youtube" || r.sourceType === "video"
      );
    case "image":
      return results.filter(
        (r) =>
          r.sourceType === "image" ||
          (Boolean(r.thumbnail) && r.type === "image")
      );
    case "social":
      return results.filter((r) =>
        ["x", "reddit", "xiaohongshu", "tiktok", "bilibili"].includes(r.platform)
      );
    default:
      return results;
  }
}

function getAvailableTabs(_results: SearchResult[]): SearchTab[] {
  // Always expose ordinary-engine tabs (web/video/image/social), not only when filled
  return TABS.map((t) => t.id);
}

function EmptyResultsState({
  activeTab,
  channelStatus,
  hasWebResults,
  hasVideoResults,
}: {
  activeTab: SearchTab;
  channelStatus?: "ok" | "empty" | "error" | "skipped";
  hasWebResults: boolean;
  hasVideoResults: boolean;
}) {
  const isSocialTab = activeTab === "x" || activeTab === "social";

  if (isSocialTab) {
    if (channelStatus === "error") {
      return (
        <div className="py-16 text-center">
          <p className="text-[15px] text-zinc-500">社媒搜索服务暂时不可用</p>
          <p className="mt-2 text-[13px] text-zinc-400">请稍后重试</p>
        </div>
      );
    }

    return (
      <div className="py-16 text-center">
        <p className="text-[15px] text-zinc-500">暂未找到相关公开内容</p>
        <p className="mt-3 text-[13px] text-zinc-400">
          可尝试扩大搜索范围
          {hasWebResults && " · 查看网页结果"}
          {hasVideoResults && " · 查看视频结果"}
        </p>
      </div>
    );
  }

  return (
    <p className="py-16 text-center text-[14px] text-zinc-400">
      未找到相关结果，试试换个问法
    </p>
  );
}

function GlobalFailureState({ kind }: { kind: SearchFailureKind }) {
  if (!kind) return null;
  const msg = FAILURE_MESSAGES[kind];
  return (
    <div className="py-20 text-center">
      <p className="text-[15px] text-zinc-500">{msg.title}</p>
      <p className="mt-2 text-[13px] text-zinc-400">{msg.hint}</p>
    </div>
  );
}

function requestedForeignPlatforms(query: string): Array<"TikTok" | "X"> {
  const q = query.toLowerCase();
  const platforms: Array<"TikTok" | "X"> = [];
  if (/tiktok|tiktok\.com/.test(q)) platforms.push("TikTok");
  if (/x\.com|twitter|推特|\bx\b/.test(q)) platforms.push("X");
  return platforms;
}

function hasVerifiedPlatformResult(
  results: SearchResult[],
  platform: "TikTok" | "X"
): boolean {
  const domains =
    platform === "TikTok" ? ["tiktok.com"] : ["x.com", "twitter.com"];
  return results.some((result) => {
    try {
      const host = new URL(result.url).hostname.replace(/^www\./, "");
      return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  });
}

interface SearchResultsProps {
  initialQuery: string;
  initialWorkspaceId?: string | null;
  commerceContinuity?: {
    from?: string | null;
    product?: string | null;
    storeId?: string | null;
    marketplace?: string | null;
    wf?: string | null;
  } | null;
}

export function SearchResults({
  initialQuery,
  initialWorkspaceId = null,
  commerceContinuity = null,
}: SearchResultsProps) {
  const query = initialQuery;
  const workspaceParam = initialWorkspaceId;
  const hydrated = useHydrated();

  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [stage, setStage] = useState<SearchStage>("understanding");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overviewBusy, setOverviewBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const overviewAutoKey = useRef<string | null>(null);

  const {
    toggleInActiveWorkspace,
    togglePendingSource,
    isInWorkspace,
    setActiveWorkspaceId,
    activeWorkspaceId,
    workspace,
    pendingSources,
    ensureWorkspaceFromSearch,
    hydrated: workspaceHydrated,
  } = useWorkspaceContext();
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [referenceBusyId, setReferenceBusyId] = useState<string | null>(null);

  const inWorkspaceMode = Boolean(workspaceParam);
  const readyForWorkspaceUi = hydrated && workspaceHydrated;

  useEffect(() => {
    if (workspaceParam) {
      const timer = window.setTimeout(() => {
        setActiveWorkspaceId(workspaceParam);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [workspaceParam, setActiveWorkspaceId]);

  const selectionCount = readyForWorkspaceUi
    ? inWorkspaceMode
      ? workspaceParam && activeWorkspaceId === workspaceParam
        ? (workspace?.sources.length ?? 0)
        : 0
      : pendingSources.length
    : 0;

  const checkInWorkspace = (resultId: string, url: string) => {
    if (!readyForWorkspaceUi) return false;
    if (inWorkspaceMode) {
      return isInWorkspace(resultId, url);
    }
    return pendingSources.some((p) => p.result.url === url);
  };

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;

    setError(null);
    setResponse(null);
    setOverviewBusy(false);
    setPage(1);
    overviewAutoKey.current = null;
    setStage("understanding");

    const stageTimers = [
      setTimeout(() => setStage("searching"), 500),
      setTimeout(() => setStage("organizing"), 2000),
    ];

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, page: 1 }),
      });

      stageTimers.forEach(clearTimeout);

      if (!res.ok) {
        throw new Error("搜索暂时不可用，请稍后再试");
      }

      const data: SearchResponse = await res.json();

      if (data.status === "unavailable") {
        setError("搜索服务暂时不可用，请稍后再试");
        setStage("error");
        return;
      }

      setResponse(data);
      setPage(data.page ?? 1);
      setStage("complete");
      // Kick off AI overview immediately (do not wait for results paint cycle).
      if (
        data.results.length > 0 &&
        data.overviewStatus !== "ready" &&
        data.overviewStatus !== "unavailable"
      ) {
        setOverviewBusy(true);
      }

      if (process.env.NODE_ENV === "development" && data.debug) {
        console.log("[Nexa Search Debug]", data.debug);
      }
    } catch {
      stageTimers.forEach(clearTimeout);
      setError("搜索暂时不可用，请稍后再试");
      setStage("error");
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!query.trim() || !response || loadingMore || response.hasMore === false) {
      return;
    }
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, page: nextPage }),
      });
      if (!res.ok) throw new Error("load more failed");
      const data: SearchResponse = await res.json();
      const seen = new Set(response.results.map((r) => r.url));
      const appended = data.results.filter((r) => r.url && !seen.has(r.url));
      setResponse({
        ...response,
        results: [...response.results, ...appended],
        page: nextPage,
        hasMore: data.hasMore !== false && appended.length > 0,
        channels: { ...response.channels, ...data.channels },
      });
      setPage(nextPage);
    } catch {
      setResponse((prev) => (prev ? { ...prev, hasMore: false } : prev));
    } finally {
      setLoadingMore(false);
    }
  }, [query, response, loadingMore, page]);

  const requestOverview = useCallback(async () => {
    if (!response || !query.trim() || response.results.length === 0) return;
    setOverviewBusy(true);
    try {
      const res = await fetch("/api/search/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          results: response.results,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setResponse((prev) =>
          prev
            ? {
                ...prev,
                overview: null,
                overviewStatus:
                  data.code === "ai_unavailable" ? "unavailable" : "error",
              }
            : prev
        );
        return;
      }
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              overview: data.overview,
              overviewStatus: "ready",
            }
          : prev
      );
    } catch {
      setResponse((prev) =>
        prev ? { ...prev, overview: null, overviewStatus: "error" } : prev
      );
    } finally {
      setOverviewBusy(false);
    }
  }, [query, response]);

  useAiCapabilityListener(
    {
      search_overview: () => {
        if (!response || response.results.length === 0) {
          emitAiJob({
            capabilityId: "search_overview",
            capabilityLabel: "AI 概览",
            title: query || "搜索",
            phase: "error",
            message: "请先完成搜索并等待结果",
            pageKey: "search",
          });
          return;
        }
        emitAiJob({
          capabilityId: "search_overview",
          capabilityLabel: "AI 概览",
          title: query,
          phase: "running",
          message: "正在生成 AI 概览…",
          pageKey: "search",
        });
        void requestOverview().then(() => {
          emitAiJob({
            capabilityId: "search_overview",
            capabilityLabel: "AI 概览",
            title: query,
            phase: "done",
            message: "AI 概览已更新",
            pageKey: "search",
          });
        });
      },
    },
    [query, response?.results?.length, overviewBusy]
  );

  useEffect(() => {
    if (!query) return;
    const timer = window.setTimeout(() => {
      void runSearch(query);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  // AI Overview is free — generate immediately when search finishes without one.
  useEffect(() => {
    if (!response || stage !== "complete") return;
    if (response.overviewStatus === "ready" && response.overview) return;
    if (response.overviewStatus === "unavailable") return;
    if (response.results.length === 0) return;
    const key = response.sessionId;
    if (overviewAutoKey.current === key) return;
    overviewAutoKey.current = key;
    void requestOverview();
  }, [response, stage, requestOverview]);

  const isLoading = stage !== "complete" && stage !== "error";
  const results = response?.results ?? [];
  const foreignPlatforms = requestedForeignPlatforms(query);
  const missingForeignPlatforms = foreignPlatforms.filter(
    (platform) => !hasVerifiedPlatformResult(results, platform)
  );
  const filteredResults = filterByTab(results, activeTab);
  const availableTabs = getAvailableTabs(results);
  const wikiResult = results.find((r) => r.platform === "wikipedia");
  const globalFailure =
    response && results.length === 0 ? (response.failureKind ?? "empty") : null;

  const handleToggleWorkspace = (resultId: string) => {
    const r = results.find((x) => x.id === resultId);
    if (!r) return;
    if (inWorkspaceMode) {
      void toggleInActiveWorkspace(r);
      return;
    }
    togglePendingSource(r, query);
  };

  const collectSearchToWorkspace = async () => {
    if (!query.trim()) return;
    if (pendingSources.length === 0) {
      return;
    }
    setHandoffBusy(true);
    try {
      const ws = await ensureWorkspaceFromSearch([], query, { topN: 0 });
      if (!ws?.id) return;
      window.location.href = `/workspace/${encodeURIComponent(ws.id)}`;
    } finally {
      setHandoffBusy(false);
    }
  };

  const createFromVideoReference = async (resultId: string) => {
    const result = response?.results.find((item) => item.id === resultId);
    if (!result) return;

    setReferenceBusyId(resultId);
    try {
      const source = {
        searchResultId: result.id,
        title: result.title,
        url: result.url,
        platform: result.platform,
        sourceType: result.sourceType,
        snippet: result.snippet,
        author: result.author,
        publishedAt: result.publishedAt,
        thumbnail: result.thumbnail,
      };
      const name = `${(result.title || query).slice(0, 36)} · 创作参考`;
      const create = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          query,
          sources: [source],
        }),
      });
      if (!create.ok) throw new Error("创建创作参考失败");
      const workspace = (await create.json()) as { id?: string };
      if (!workspace.id) throw new Error("创建创作参考失败");

      const ingest = await fetch(
        `/api/workspace/${encodeURIComponent(workspace.id)}/ingest`,
        { method: "POST" }
      );
      if (!ingest.ok) throw new Error("解析创作参考失败");

      window.location.href = `/workspace/${encodeURIComponent(workspace.id)}`;
    } catch {
      setError("解析创作参考失败，请稍后再试");
    } finally {
      setReferenceBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] pb-28 pt-8 sm:pt-10">
      <div className="mb-8">
        <SearchInput
          key={query}
          defaultValue={query}
          workspaceId={workspaceParam}
        />
        {inWorkspaceMode && workspace && (
          <p className="mt-3 text-[13px] text-zinc-400">
            正在为「{workspace.name}」收集资料
          </p>
        )}
        {commerceContinuity?.from === "commerce" && (
          <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-600">
            <p className="font-medium text-zinc-800">来自 Commerce 诊断</p>
            <p className="mt-1">
              {[
                commerceContinuity.product
                  ? `商品：${commerceContinuity.product}`
                  : null,
                commerceContinuity.marketplace
                  ? `市场：${commerceContinuity.marketplace}`
                  : null,
                commerceContinuity.storeId
                  ? `店铺：${commerceContinuity.storeId}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {commerceContinuity.wf && (
              <p className="mt-1 line-clamp-3 text-[12px] text-zinc-500">
                {(() => {
                  try {
                    return decodeURIComponent(commerceContinuity.wf).slice(0, 280);
                  } catch {
                    return commerceContinuity.wf.slice(0, 280);
                  }
                })()}
              </p>
            )}
          </div>
        )}
        {query && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <button
              type="button"
              disabled={
                handoffBusy ||
                pendingSources.length === 0
              }
              onClick={() => void collectSearchToWorkspace()}
              className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:no-underline"
            >
              {handoffBusy ? "正在收集资料…" : "将已选资料放入工作区"}
            </button>
            <Link
              href={`/commerce/amazon/selection?q=${encodeURIComponent(query)}`}
              className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
            >
              AI 选品调研
            </Link>
          </p>
        )}
      </div>

      {query && isLoading && (
        <p className="mb-6 text-[14px] text-zinc-400">
          {STAGE_LABELS[stage]}
        </p>
      )}

      {error && <GlobalFailureState kind="error" />}

      {response && !isLoading && !error && globalFailure && (
        <GlobalFailureState kind={globalFailure} />
      )}

      {response && !isLoading && !error && !globalFailure && (
        <>
          {foreignPlatforms.length > 0 && (
            <div className="mb-5 rounded-lg border border-zinc-100 bg-zinc-50 px-3.5 py-3 text-[13px] leading-relaxed text-zinc-600">
              {missingForeignPlatforms.length > 0 ? (
                <>
                  未检到可核验的 {missingForeignPlatforms.join(" / ")} 原帖。
                  当前展示的是国内可访问的相关网页、视频和图片，不会把它们标注成原平台内容。
                </>
              ) : (
                <>
                  已检到可核验的 {foreignPlatforms.join(" / ")} 公开来源。
                  可在 Nexa 中预览已获取的公开字段，并加入 AI 工作区继续研究或创作。
                </>
              )}
            </div>
          )}
          {availableTabs.length > 1 && (
            <nav className="mb-8 flex gap-6 border-b border-zinc-100">
              {TABS.filter((t) => availableTabs.includes(t.id)).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative -mb-px pb-2.5 text-[14px] transition-colors",
                    activeTab === tab.id
                      ? "font-medium text-zinc-900 after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-zinc-900"
                      : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}

          {activeTab === "all" && (
            <AIOverviewCard
              overview={response.overview}
              overviewStatus={
                response.overview
                  ? "ready"
                  : (response.overviewStatus ?? "skipped")
              }
              results={results}
              query={query}
              overviewBusy={overviewBusy}
              onRequestOverview={() => void requestOverview()}
            />
          )}

          {activeTab === "all" && wikiResult && (
            <SearchResultItem
              result={wikiResult}
              onToggleWorkspace={handleToggleWorkspace}
              isInWorkspace={checkInWorkspace(wikiResult.id, wikiResult.url)}
            />
          )}

          {activeTab === "all" &&
            results.some(
              (r) =>
                r.sourceType === "image" ||
                (Boolean(r.thumbnail) && r.type === "image")
            ) && (
              <section className="mb-8">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-zinc-500">图片</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("image")}
                    className="text-[12px] text-zinc-400 hover:text-zinc-700"
                  >
                    查看更多
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {results
                    .filter(
                      (r) =>
                        r.sourceType === "image" ||
                        (Boolean(r.thumbnail) && r.type === "image")
                    )
                    .slice(0, 8)
                    .map((result) => (
                      <ImageResultCard
                        key={result.id}
                        result={result}
                        onToggleWorkspace={handleToggleWorkspace}
                        isInWorkspace={checkInWorkspace(result.id, result.url)}
                      />
                    ))}
                </div>
              </section>
            )}

          {activeTab === "image" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filteredResults.map((result) => (
                <ImageResultCard
                  key={result.id}
                  result={result}
                  onToggleWorkspace={handleToggleWorkspace}
                  isInWorkspace={checkInWorkspace(result.id, result.url)}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-zinc-50">
              {filteredResults
                .filter(
                  (r) =>
                    !(activeTab === "all" && r.platform === "wikipedia") &&
                    !(
                      activeTab === "all" &&
                      (r.sourceType === "image" ||
                        (Boolean(r.thumbnail) && r.type === "image"))
                    )
                )
                .map((result) => (
                  <SearchResultItem
                    key={result.id}
                    result={result}
                    onToggleWorkspace={handleToggleWorkspace}
                    isInWorkspace={checkInWorkspace(result.id, result.url)}
                    onCreateFromReference={
                      result.platform === "youtube" ||
                      result.sourceType === "video"
                        ? createFromVideoReference
                        : undefined
                    }
                    isReferenceBusy={referenceBusyId === result.id}
                  />
                ))}
            </div>
          )}

          {filteredResults.length === 0 && (
            <EmptyResultsState
              activeTab={activeTab}
              channelStatus={
                activeTab === "video"
                  ? response.channels?.videos ?? response.channels?.youtube
                  : activeTab === "image"
                    ? response.channels?.images
                    : response.channels?.social
              }
              hasWebResults={results.some((r) => r.platform === "web")}
              hasVideoResults={results.some(
                (r) => r.platform === "youtube" || r.sourceType === "video"
              )}
            />
          )}

          {filteredResults.length > 0 && response.hasMore !== false && (
            <div className="flex justify-center py-8">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-[14px] text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
        </>
      )}

      {!query && (
        <p className="py-20 text-center text-[14px] text-zinc-400">
          输入关键词开始搜索
        </p>
      )}

      {readyForWorkspaceUi && (
        <WorkspaceBar
          query={query}
          workspaceId={workspaceParam}
          selectionCount={selectionCount}
        />
      )}
    </div>
  );
}
