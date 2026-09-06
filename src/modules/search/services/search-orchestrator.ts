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
import { createBingHtmlProvider } from "../providers/bing-html-provider";
import { createWikipediaProvider } from "../providers/wikipedia-provider";
import { createYouTubeProvider } from "../providers/youtube-provider";
import { createSocialSearchProvider } from "../providers/social-provider";
import { classifyIntent } from "./intent-classifier";
import { normalizeQuery, generateCacheKey } from "./query-normalizer";
import { rewriteQuery, pickRecallQuery, cleanQuery } from "./query-rewriter";
import {
  routeSources,
  expandSocialQuery,
  detectPreferredSocialPlatforms,
} from "./source-router";
import { deduplicateResults, normalizeResults } from "./deduplicator";
import { getCacheProvider, getCacheTTL } from "./cache-service";
import { generateOverview } from "@/modules/ai/router/ai-gateway";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { trackEvent } from "@/lib/analytics";

const isDebugMode = () => process.env.SEARCH_DEBUG === "true";

const PROVIDER_TIMEOUT_MS = Number(process.env.SEARCH_PROVIDER_TIMEOUT_MS) || 28_000;

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

/** Keep engine SERP order; only assign stable descending scores for UI/overview. */
function preserveEngineOrder(results: SearchResult[]): SearchResult[] {
  return results.map((r, i) => ({
    ...r,
    rankScore: r.rankScore && r.rankScore > 0 ? r.rankScore : Math.max(0.05, 1 - i * 0.04),
  }));
}

function mergeByUrl(...lists: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const list of lists) {
    for (const r of list) {
      const key = (r.url || "").split("#")[0];
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function pickSearchQuery(rewritten: string[], original: string): string {
  const multi = rewritten.find((q) => q.includes(" ") && q.length > 3);
  if (multi) return multi;
  return rewritten[0] ?? original;
}

/**
 * Ordinary-engine style query for providers.
 * Long chatty Chinese questions are compressed only so headless Bing does not
 * fall into character-dictionary SERPs — results are never relevance-filtered.
 */
function buildWebQuery(original: string, rewritten: string[]): string {
  return pickRecallQuery(original) || cleanQuery(original) || pickSearchQuery(rewritten, original);
}

function buildNewsQuery(original: string, rewritten: string[]): string {
  const entity = pickSearchQuery(rewritten, original);
  if (/[\u4e00-\u9fff]/.test(original)) {
    if (/新闻|资讯|最近|发生了什么/.test(original)) return original;
    return `${entity} 新闻`;
  }
  return `${entity} news`;
}

function buildImageQuery(original: string, rewritten: string[]): string {
  const cleaned = pickSearchQuery(rewritten, original)
    .replace(/图片|照片|图像/g, "")
    .trim();
  return cleaned || original;
}

export class SearchOrchestrator {
  private webProvider = createSearXNGProvider();
  private bingHtmlProvider = createBingHtmlProvider();
  private wikiProvider = createWikipediaProvider();
  private youtubeProvider = createYouTubeProvider();
  private socialProvider = createSocialSearchProvider(this.webProvider);
  private cache = getCacheProvider();

  async search(
    query: string,
    opts?: {
      includeOverview?: boolean;
      userId?: string | null;
      accountId?: string | null;
      jobId?: string;
      /** 1-based page (web/images/videos pagination) */
      page?: number;
    }
  ): Promise<SearchResponse> {
    trackEvent("search_started", { query });

    const page = Math.max(1, opts?.page ?? 1);
    const normalizedQuery = normalizeQuery(query);
    const intent: SearchIntent = classifyIntent(query);
    const rewrittenQueries = rewriteQuery(query);
    // v16: multi-channel (web+image+video) + pagination
    const cacheKey = `result-id-v16:p${page}:${generateCacheKey(normalizedQuery, intent)}`;

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
    const webQuery = buildWebQuery(query, rewrittenQueries);

    if (routes.web) {
      providersCalled.push("web");
      tasks.push(
        this.timedRetrieve(
          "web",
          async () => {
            const bingHits = await this.bingHtmlProvider.search({
              query: webQuery,
              maxResults: 20,
              page,
            });

            let sxHits: SearchResult[] = [];
            if (this.webProvider.isConfigured()) {
              try {
                sxHits = await this.webProvider.search({
                  query: webQuery,
                  categories: ["general"],
                  maxResults: 16,
                  engines: ["bing", "baidu"],
                  page,
                });
              } catch {
                /* optional */
              }
            }

            return mergeByUrl(bingHits, sxHits);
          },
          allResults,
          providerErrors,
          providerLatency,
          resultsReturned
        )
      );
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

    if (routes.image) {
      providersCalled.push("images");
      const imageQuery = buildImageQuery(query, rewrittenQueries);
      tasks.push(
        this.timedRetrieve(
          "images",
          async () => {
            let hits: SearchResult[] = [];
            if (this.webProvider.isConfigured()) {
              try {
                const [cn, intl] = await Promise.allSettled([
                  this.webProvider.search({
                    query: imageQuery,
                    categories: ["images"],
                    maxResults: 20,
                    engines: ["baidu images", "sogou images", "bing images"],
                    page,
                  }),
                  this.webProvider.search({
                    query: imageQuery,
                    categories: ["images"],
                    maxResults: 16,
                    engines: ["bing images", "google images"],
                    page,
                  }),
                ]);
                hits = [
                  ...(cn.status === "fulfilled" ? cn.value : []),
                  ...(intl.status === "fulfilled" ? intl.value : []),
                ];
              } catch {
                /* fall through */
              }
            }
            if (hits.length < 4) {
              try {
                hits = mergeByUrl(
                  hits,
                  await this.bingHtmlProvider.searchImages({
                    query: imageQuery,
                    maxResults: 24,
                    page,
                  })
                );
              } catch {
                /* ignore */
              }
            }
            return hits.filter(
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
      if (this.youtubeProvider.isConfigured() && page === 1) {
        providersCalled.push("youtube");
        tasks.push(
          this.timedRetrieve(
            "youtube",
            () =>
              this.youtubeProvider.search({
                query: primaryQuery,
                maxResults: 12,
              }),
            allResults,
            providerErrors,
            providerLatency,
            resultsReturned
          )
        );
      }
      providersCalled.push("videos");
      tasks.push(
        this.timedRetrieve(
          "videos",
          async () => {
            let hits: SearchResult[] = [];
            if (this.webProvider.isConfigured()) {
              try {
                hits = await this.webProvider.search({
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
                  page,
                });
              } catch {
                /* fall through */
              }
            }
            if (hits.length < 3) {
              try {
                hits = mergeByUrl(
                  hits,
                  await this.bingHtmlProvider.searchVideos({
                    query: webQuery,
                    maxResults: 16,
                    page,
                  })
                );
              } catch {
                /* ignore */
              }
            }
            return hits.filter(
              (r) =>
                r.sourceType === "video" ||
                r.type === "video" ||
                r.platform === "youtube" ||
                r.platform === "bilibili" ||
                /youtube\.com|youtu\.be|bilibili\.com|b23\.tv|douyin\.com|tiktok\.com|youku|iqiyi/i.test(
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

    if (routes.wikipedia && page === 1) {
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

    if (shouldSearchSocial && this.webProvider.isConfigured() && page === 1) {
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
    } else if (shouldSearchSocial && page === 1) {
      providerErrors.social = "SEARXNG_BASE_URL is not configured";
      logProviderError("social", providerErrors.social);
    }

    await Promise.allSettled(tasks);

    const preFilterCount = allResults.length;
    // Passthrough: dedupe only. No relevance filter. Preserve engine order for
    // workspace / create (title, url, snippet, thumbnail stay intact).
    let results = preserveEngineOrder(
      normalizeResults(deduplicateResults(allResults))
    );

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
      page,
      // Enough hits on this page ⇒ likely another page exists
      hasMore: results.length >= 8,
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
        resultsFiltered: Math.max(0, preFilterCount - results.length),
        providerErrors,
      };
      console.log("[Search Debug]", JSON.stringify(response.debug, null, 2));
    }

    const ttl = getCacheTTL(intent, results.length);
    // Cache any non-empty SERP (passthrough mode — no on-topic gate)
    if (ttl > 0 && results.length > 0) {
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
