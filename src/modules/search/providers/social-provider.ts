import type { SearchPlatform, SearchResult, SocialSearchOptions } from "../types";
import type { SocialSearchProvider } from "./interfaces";
import { SearXNGProvider } from "./searxng-provider";

const SOCIAL_SITES: Partial<Record<SearchPlatform, string[]>> = {
  x: ["x.com", "twitter.com"],
  reddit: ["reddit.com"],
  xiaohongshu: ["xiaohongshu.com"],
  tiktok: ["tiktok.com"],
};

const DEFAULT_PLATFORMS: SearchPlatform[] = [
  "x",
  "reddit",
  "xiaohongshu",
  "tiktok",
];

export class SocialSearchProviderImpl implements SocialSearchProvider {
  private webProvider: SearXNGProvider;

  constructor(webProvider?: SearXNGProvider) {
    this.webProvider = webProvider ?? new SearXNGProvider();
  }

  async search(options: SocialSearchOptions): Promise<SearchResult[]> {
    if (!this.webProvider.isConfigured()) {
      throw new Error("SEARXNG_BASE_URL is not configured for social search");
    }

    const platforms = options.platforms ?? DEFAULT_PLATFORMS;
    const maxPerPlatform = Math.max(
      3,
      Math.ceil((options.maxResults ?? 12) / platforms.length)
    );

    const settled = await Promise.allSettled(
      platforms.map(async (platform) => {
        const sites = SOCIAL_SITES[platform];
        if (!sites?.length) return [] as SearchResult[];

        const batches = await Promise.allSettled(
          sites.map((site) =>
            this.webProvider.searchSite(options.query, site, maxPerPlatform)
          )
        );

        const merged: SearchResult[] = [];
        for (const batch of batches) {
          if (batch.status !== "fulfilled") continue;
          for (const r of batch.value) {
            const host = (() => {
              try {
                return new URL(r.url).hostname.replace(/^www\./, "");
              } catch {
                return "";
              }
            })();
            const matchesSite = sites.some(
              (site) => host === site || host.endsWith(`.${site}`)
            );
            if (!matchesSite) continue;

            merged.push({
              ...r,
              platform,
              sourceType:
                platform === "reddit" ? ("forum" as const) : ("social" as const),
              source:
                platform === "x"
                  ? "X"
                  : platform === "reddit"
                    ? "Reddit"
                    : platform === "xiaohongshu"
                      ? "小红书"
                      : "TikTok",
              author: r.author ?? r.title?.split(/[:：\-–—]/)[0]?.trim(),
              retrievalMethod: `searxng_site_${platform}`,
            });
          }
        }
        return merged;
      })
    );

    const allResults: SearchResult[] = [];
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        allResults.push(item);
      }
    }

    if (allResults.length === 0) {
      const fallback = await this.fallbackSocialSearch(
        options.query,
        platforms,
        options.maxResults ?? 12
      );
      return fallback;
    }

    return allResults.slice(0, options.maxResults ?? 12);
  }

  private async fallbackSocialSearch(
    query: string,
    platforms: SearchPlatform[],
    maxResults: number
  ): Promise<SearchResult[]> {
    const topic = query.trim();
    if (!topic) return [];

    const siteHints = platforms
      .flatMap((p) => SOCIAL_SITES[p] ?? [])
      .slice(0, 4);
    const queries = [
      siteHints.length
        ? `${topic} (${siteHints.map((s) => `site:${s}`).join(" OR ")})`
        : null,
      `${topic} twitter OR x.com`,
      `${topic} reddit discussion`,
      topic,
    ].filter((q): q is string => Boolean(q));

    const merged: SearchResult[] = [];
    const seen = new Set<string>();

    for (const q of queries) {
      try {
        const hits = await this.webProvider.search({
          query: q,
          maxResults,
          categories: ["general"],
        });
        for (const r of hits) {
          if (seen.has(r.url)) continue;
          const host = (() => {
            try {
              return new URL(r.url).hostname.replace(/^www\./, "");
            } catch {
              return "";
            }
          })();
          const platform = platforms.find((p) =>
            (SOCIAL_SITES[p] ?? []).some(
              (site) => host === site || host.endsWith(`.${site}`)
            )
          );
          // A broad web fallback may contain commentary or reposts. Keep those
          // in web search, but never relabel them as an X/TikTok original.
          if (!platform) continue;
          seen.add(r.url);
          merged.push({
            ...r,
            platform,
            sourceType: platform === "reddit" ? "forum" : "social",
            source:
              platform === "x"
                ? "X"
                : platform === "reddit"
                  ? "Reddit"
                  : platform === "xiaohongshu"
                    ? "小红书"
                    : "TikTok",
            retrievalMethod: "searxng_social_fallback",
          });
        }
        if (merged.length >= Math.min(6, maxResults)) break;
      } catch {
        /* try next query */
      }
    }

    return merged.slice(0, maxResults);
  }
}

export function createSocialSearchProvider(
  webProvider?: SearXNGProvider
): SocialSearchProviderImpl {
  return new SocialSearchProviderImpl(webProvider);
}
