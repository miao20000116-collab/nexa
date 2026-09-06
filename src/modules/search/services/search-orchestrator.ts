import type {
  AIOverview,
  ChannelStatus,
  OverviewStatus,
  SearchFailureKind,
  SearchIntent,
  SearchResponse,
  SearchResult,
  SearchStatus,
} from "../types";
import { createSearXNGProvider } from "../providers/searxng-provider";
import { createWikipediaProvider } from "../providers/wikipedia-provider";
import { createYouTubeProvider } from "../providers/youtube-provider";
import { createSocialSearchProvider } from "../providers/social-provider";
import { classifyIntent } from "./intent-classifier";
import { normalizeQuery, generateCacheKey } from "./query-normalizer";
import { rewriteQuery } from "./query-rewriter";
import {
  routeSources,
  expandSocialQuery,
  detectPreferredSocialPlatforms,
} from "./source-router";
import { deduplicateResults, normalizeResults } from "./deduplicator";
import { rankResults } from "./ranker";
import {
  computeRelevanceScore,
  filterByRelevance,
  relevanceThresholdForIntent,
} from "./relevance-validator";
import { getCacheProvider, getCacheTTL } from "./cache-service";
import { generateOverview } from "@/modules/ai/router/ai-gateway";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { trackEvent } from "@/lib/analytics";

const isDebugMode = () => process.env.SEARCH_DEBUG === "true";

const PROVIDER_TIMEOUT_MS = Number(process.env.SEARCH_PROVIDER_TIMEOUT_MS) || 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("search_provider_timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

function logProviderError(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Search] Provider "${provider}" failed:`, message);
}

function pickSearchQuery(rewritten: string[], original: string): string {
  // Prefer multi-word cleaned query over single acronym when available
  const multi = rewritten.find((q) => q.includes(" ") && q.length > 3);
  if (multi) return multi;
  return rewritten[0] ?? original;
}

function buildNewsQuery(original: string, rewritten: string[]): string {
  const entity =
    rewritten.find((q) => /^[A-Za-z][A-Za-z0-9 ._-]{1,40}$/.test(q)) ||
    rewritten.find((q) => /人工智能|OpenAI|AI/.test(q)) ||
    pickSearchQuery(rewritten, original);
  // Keep Chinese news queries in Chinese for baidu/sogou; add light English twin later
  if (/[\u4e00-\u9fff]/.test(original)) {
    if (/新闻|资讯|最近|发生了什么/.test(original)) return original;
    return `${entity} 新闻`;
  }
  if (/openai/i.test(original) || /openai/i.test(entity)) return "OpenAI news";
  if (/人工智能|artificial intelligence/i.test(original) || entity === "人工智能")
    return "artificial intelligence AI news";
  return `${entity} news`;
}

function buildImageQuery(original: string, rewritten: string[]): string {
  if (/眼镜/.test(original)) return "AI glasses 智能眼镜";
  const cleaned = pickSearchQuery(rewritten, original)
    .replace(/图片|照片|图像/g, "")
    .trim();
  return cleaned || original;
}

export class SearchOrchestrator {
  private webProvider = createSearXNGProvider();
  private wikiProvider = createWikipediaProvider();
  private youtubeProvider = createYouTubeProvider();
  private socialProvider = createSocialSearchProvider(this.webProvider);
  private cache = getCacheProvider();

  async search(
    query: string,
    opts?: { includeOverview?: boolean; userId?: string | null; accountId?: string | null; jobId?: string }
  ): Promise<SearchResponse> {
    trackEvent("search_started", { query });

    const normalizedQuery = normalizeQuery(query);
    const intent: SearchIntent = classifyIntent(query);
    const rewrittenQueries = rewriteQuery(query);
    // Search result identity rules changed; avoid serving pre-fix cached ids.
    const cacheKey = `result-id-v2:${generateCacheKey(normalizedQuery, intent)}`;

    const cached = await this.cache.get<SearchResponse>(cacheKey);
    if (cached) {
      trackEvent("search_completed", { query, cached: true });
      return cached;
    }

    const routes = routeSources(intent);
    const preferredSocialPlatforms = detectPreferredSocialPlatforms(query);
    const shouldSearchSocial =
      routes.social || preferredSocialPlatforms.length > 0;
    const providerErrors: Record<string, string> = {};
    const providerLatency: Record<string, number> = {};
    const resultsReturned: Record<string, number> = {};
    const providersCalled: string[] = [];
    const allResults: SearchResult[] = [];
    const tasks: Promise<void>[] = [];

    const primaryQuery = pickSearchQuery(rewrittenQueries, query);
    const webQuery =
      intent === "knowledge" && rewrittenQueries.includes("RAG")
        ? "RAG retrieval augmented generation"
        : /眼镜|glasses/i.test(query)
          ? "AI glasses 智能眼镜 AI眼镜"
          : primaryQuery;

    if (routes.web && this.webProvider.isConfigured()) {
      providersCalled.push("web");
      tasks.push(
        this.timedRetrieve(
          "web",
          async () => {
            const [cn, intl] = await Promise.allSettled([
              this.webProvider.search({
                query: webQuery,
                categories: ["general"],
                maxResults: intent === "knowledge" ? 10 : 12,
                engines: ["baidu", "sogou"],
              }),
              this.webProvider.search({
                query: webQuery,
                categories: ["general"],
                maxResults: intent === "knowledge" ? 10 : 12,
                engines: ["yandex", "bing"],
              }),
            ]);
            const merged = [
              ...(cn.status === "fulfilled" ? cn.value : []),
              ...(intl.status === "fulfilled" ? intl.value : []),
            ];
            if (cn.status === "rejected" && intl.status === "rejected") {
              throw cn.reason instanceof Error
                ? cn.reason
                : new Error(String(cn.reason));
            }
            if (/眼镜|glasses/i.test(query)) {
              const extra = await this.webProvider.search({
                query: "智能眼镜",
                categories: ["general"],
                maxResults: 10,
                engines: ["baidu", "sogou", "yandex"],
              });
              return [...merged, ...extra];
            }
            return merged.length
              ? merged
              : this.webProvider.search({
                  query: webQuery,
                  categories: ["general"],
                  maxResults: 16,
                });
          },
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
    } else if (routes.web) {
      providerErrors.web = "SEARXNG_BASE_URL is not configured";
      logProviderError("web", providerErrors.web);
    }

    if (routes.news && this.webProvider.isConfigured()) {
      providersCalled.push("news");
      const newsQuery = buildNewsQuery(query, rewrittenQueries);
      tasks.push(
        this.timedRetrieve(
          "news",
          async () => {
            const [cn, intl] = await Promise.allSettled([
              this.webProvider.search({
                query: newsQuery,
                categories: ["general"],
                maxResults: 12,
                engines: ["baidu", "sogou"],
              }),
              this.webProvider.search({
                query: newsQuery,
                categories: ["news"],
                maxResults: 12,
                engines: ["bing news", "yandex news", "google news"],
              }),
            ]);
            const hits = [
              ...(cn.status === "fulfilled" ? cn.value : []),
              ...(intl.status === "fulfilled" ? intl.value : []),
            ];
            if (hits.length > 0) {
              return hits.map((r) => ({
                ...r,
                sourceType:
                  r.sourceType === "official" ? r.sourceType : ("news" as const),
              }));
            }
            if (cn.status === "rejected" && intl.status === "rejected") {
              throw cn.reason instanceof Error
                ? cn.reason
                : new Error(String(cn.reason));
            }
            const fallback = await this.webProvider.search({
              query: newsQuery,
              categories: ["general"],
              maxResults: 12,
              engines: ["baidu", "sogou", "yandex", "bing"],
            });
            return fallback.map((r) => ({
              ...r,
              sourceType:
                r.sourceType === "official" ? r.sourceType : ("news" as const),
              retrievalMethod: r.retrievalMethod ?? "searxng_news_fallback",
            }));
          },
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
    }

    if (routes.image && this.webProvider.isConfigured()) {
      providersCalled.push("images");
      const imageQuery = buildImageQuery(query, rewrittenQueries);
      tasks.push(
        this.timedRetrieve(
          "images",
          async () => {
            const [cn, intl] = await Promise.allSettled([
              this.webProvider.search({
                query: imageQuery,
                categories: ["images"],
                maxResults: 16,
                engines: ["baidu images", "sogou images"],
              }),
              this.webProvider.search({
                query: imageQuery,
                categories: ["images"],
                maxResults: 12,
                engines: ["bing images", "google images"],
              }),
            ]);
            const hits = [
              ...(cn.status === "fulfilled" ? cn.value : []),
              ...(intl.status === "fulfilled" ? intl.value : []),
            ];
            const filtered = hits.filter(
              (r) =>
                r.sourceType === "image" ||
                r.type === "image" ||
                Boolean(r.thumbnail)
            );
            // 有缩略图优先；没有也保留条目，前端直接展示对应标题/链接
            const preferred = filtered.filter((r) => Boolean(r.thumbnail));
            const kept = preferred.length ? preferred : filtered;
            if (
              kept.length === 0 &&
              cn.status === "rejected" &&
              intl.status === "rejected"
            ) {
              throw cn.reason instanceof Error
                ? cn.reason
                : new Error(String(cn.reason));
            }
            if (kept.length > 0) return kept;
            return (
              await this.webProvider.search({
                query: imageQuery,
                categories: ["images"],
                maxResults: 20,
              })
            ).filter(
              (r) =>
                r.sourceType === "image" ||
                r.type === "image" ||
                Boolean(r.thumbnail)
            );
          },
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
    }

    if (routes.video) {
      if (this.youtubeProvider.isConfigured()) {
        providersCalled.push("youtube");
        tasks.push(
          this.timedRetrieve(
            "youtube",
            () =>
              this.youtubeProvider.search({
                query: primaryQuery,
                maxResults: 10,
              }),
            allResults,
            providerErrors,
            providerLatency,
            resultsReturned
          )
        );
      }
      if (this.webProvider.isConfigured()) {
        providersCalled.push("videos");
        tasks.push(
          this.timedRetrieve(
            "videos",
            async () => {
              const hits = await this.webProvider.search({
                query: primaryQuery,
                categories: ["videos"],
                maxResults: 16,
                engines: [
                  "sogou videos",
                  "bing videos",
                  "bilibili",
                  "youtube",
                  "google videos",
                ],
              });
              // 不过度过滤：有视频类别或视频链接就保留，直接展示对应条目
              return hits.filter(
                (r) =>
                  r.sourceType === "video" ||
                  r.type === "video" ||
                  r.platform === "youtube" ||
                  /youtube\.com|youtu\.be|bilibili\.com|b23\.tv|douyin\.com|tiktok\.com/i.test(
                    r.url
                  )
              );
            },
            allResults,
            providerErrors,
            providerLatency,
            resultsReturned
          )
        );
      }
    }

    if (routes.wikipedia) {
      providersCalled.push("wikipedia");
      tasks.push(
        this.timedRetrieve(
          "wikipedia",
          () => this.wikiProvider.search({ query, maxResults: 1 }),
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
    }

    if (shouldSearchSocial && this.webProvider.isConfigured()) {
      providersCalled.push("social");
      const socialQuery = expandSocialQuery(query) || primaryQuery;
      tasks.push(
        this.timedRetrieve(
          "social",
          () =>
            this.socialProvider.search({
              query: socialQuery,
              platforms: preferredSocialPlatforms,
              maxResults: 12,
            }),
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
    } else if (shouldSearchSocial) {
      providerErrors.social = "SEARXNG_BASE_URL is not configured";
      logProviderError("social", providerErrors.social);
    }

    await Promise.allSettled(tasks);

    const preFilterCount = allResults.length;
    let results = normalizeResults(deduplicateResults(allResults));
    const threshold = relevanceThresholdForIntent(intent);
    const { kept, filtered } = filterByRelevance(results, query, threshold);
    results = kept;
    // Soft fallback: if relevance wiped everything but providers returned hits,
    // keep the least-bad filtered items rather than locking an empty page.
    if (results.length === 0 && filtered.length > 0) {
      results = filtered
        .map((r) => ({
          ...r,
          rankScore: Math.max(computeRelevanceScore(r, query), 0.01),
          retrievalMethod: `${r.retrievalMethod ?? "search"}_soft_relevance`,
        }))
        .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
        .slice(0, Math.min(8, filtered.length));
    }
    results = rankResults(results, normalizedQuery, intent);

    // SearXNG can reuse an item id across category/engine responses. React
    // result grids need keys unique across the entire merged response.
    const usedResultIds = new Set<string>();
    results = results.map((r, i) => {
      const baseId = r.id || `result_${i}`;
      let id = baseId;
      let duplicate = 1;
      while (usedResultIds.has(id)) {
        id = `${baseId}_${duplicate++}`;
      }
      usedResultIds.add(id);
      return {
        ...r,
        id,
        source: r.source ?? r.platform,
      };
    });

    const status = this.computeStatus(
      results.length,
      providersCalled,
      providerErrors
    );
    const failureKind = this.computeFailureKind(
      results.length,
      providersCalled,
      providerErrors
    );

    let overview: AIOverview | null = null;
    let overviewStatus: OverviewStatus = "skipped";
    if (opts?.includeOverview && results.length > 0) {
      if (!AIGateway.isAvailable("generateText")) {
        overviewStatus = "unavailable";
      } else {
        try {
          overview = await generateOverview(query, results, {
            userId: opts.userId,
            accountId: opts.accountId,
            jobId: opts.jobId,
          });
          overviewStatus = overview ? "ready" : "error";
        } catch (err) {
          logProviderError("ai_overview", err);
          overviewStatus = "error";
        }
      }
    }

    const channels: Partial<Record<string, ChannelStatus>> = {};
    for (const name of providersCalled) {
      if (providerErrors[name]) {
        channels[name] = "error";
      } else if ((resultsReturned[name] ?? 0) === 0) {
        channels[name] = "empty";
      } else {
        channels[name] = "ok";
      }
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const response: SearchResponse = {
      sessionId,
      query,
      normalizedQuery,
      intent,
      status,
      failureKind,
      results,
      overview,
      overviewStatus,
      channels,
    };

    if (isDebugMode()) {
      response.debug = {
        originalQuery: query,
        normalizedQuery,
        intent,
        rewrittenQueries,
        providersCalled,
        providerLatency,
        resultsReturned,
        resultsFiltered: preFilterCount - results.length + filtered.length,
        providerErrors,
      };
      console.log("[Search Debug]", JSON.stringify(response.debug, null, 2));
    }

    const ttl = getCacheTTL(intent, results.length);
    if (ttl > 0) {
      await this.cache.set(cacheKey, response, ttl);
    }

    trackEvent("search_completed", {
      query,
      intent,
      resultCount: results.length,
      status,
    });

    return response;
  }

  private computeStatus(
    resultCount: number,
    providersCalled: string[],
    errors: Record<string, string>
  ): SearchStatus {
    if (resultCount > 0) {
      const hasErrors = Object.keys(errors).length > 0;
      return hasErrors ? "partial" : "ok";
    }
    if (providersCalled.length === 0) return "unavailable";
    if (Object.keys(errors).length >= providersCalled.length)
      return "unavailable";
    return "empty";
  }

  private computeFailureKind(
    resultCount: number,
    providersCalled: string[],
    errors: Record<string, string>
  ): SearchFailureKind {
    if (resultCount > 0) return null;
    if (providersCalled.length === 0) return "error";

    const errorValues = Object.values(errors);
    if (errorValues.length === 0) return "empty";
    if (errorValues.every((e) => e === "timeout")) return "timeout";
    if (errorValues.length >= providersCalled.length) return "error";
    return "empty";
  }

  private async timedRetrieve(
    name: string,
    fn: () => Promise<SearchResult[]>,
    results: SearchResult[],
    errors: Record<string, string>,
    latency: Record<string, number>,
    returned: Record<string, number>
  ): Promise<void> {
    const start = Date.now();
    try {
      const items = await withTimeout(fn(), PROVIDER_TIMEOUT_MS);
      results.push(...items);
      returned[name] = items.length;
    } catch (err) {
      errors[name] =
        err instanceof Error && err.message === "search_provider_timeout"
          ? "timeout"
          : "failed";
      logProviderError(name, err);
      returned[name] = 0;
    } finally {
      latency[name] = Date.now() - start;
    }
  }
}

let orchestratorInstance: SearchOrchestrator | null = null;

export function getSearchOrchestrator(): SearchOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SearchOrchestrator();
  }
  return orchestratorInstance;
}
