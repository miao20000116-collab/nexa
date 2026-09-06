import type { SearchResult, SourceType, WebSearchOptions } from "../types";
import type { WebSearchProvider } from "./interfaces";
import { extractDomain, getFaviconUrl } from "@/lib/utils";

interface SearXNGResult {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string;
  thumbnail?: string;
  thumbnail_src?: string;
  img_src?: string;
  iframe_src?: string;
  duration?: string;
  author?: string;
  engine?: string;
  category?: string;
}

interface SearXNGResponse {
  results?: SearXNGResult[];
}

const DEFAULT_TIMEOUT = 10000;

const NEWS_DOMAINS = [
  "reuters.com",
  "bbc.com",
  "cnn.com",
  "nytimes.com",
  "theverge.com",
  "techcrunch.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "apnews.com",
  "新华网",
  "xinhuanet.com",
  "people.com.cn",
  "36kr.com",
  "jiemian.com",
  "caixin.com",
  "cls.cn",
  "ifeng.com",
  "sina.com.cn",
];

const OFFICIAL_DOMAINS = [
  "openai.com",
  "google.com",
  "deepmind.com",
  "microsoft.com",
  "anthropic.com",
  "meta.com",
  "apple.com",
  "amazon.com",
];

const ACADEMIC_DOMAINS = [
  "arxiv.org",
  "nature.com",
  "science.org",
  "acm.org",
  "ieee.org",
  "nih.gov",
  "ssrn.com",
];

function detectPlatform(url: string): SearchResult["platform"] {
  const lower = url.toLowerCase();
  if (lower.includes("x.com/") || lower.includes("twitter.com/")) return "x";
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("xiaohongshu.com") || lower.includes("xhslink.com"))
    return "xiaohongshu";
  if (lower.includes("tiktok.com") || lower.includes("douyin.com"))
    return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("bilibili.com") || lower.includes("b23.tv"))
    return "bilibili";
  if (lower.includes("wikipedia.org")) return "wikipedia";
  return "web";
}

/** When SearXNG marks a web URL as video, keep non-YouTube hosts distinct. */
function detectVideoPlatform(url: string): SearchResult["platform"] {
  const lower = url.toLowerCase();
  if (lower.includes("bilibili.com") || lower.includes("b23.tv"))
    return "bilibili";
  if (lower.includes("douyin.com") || lower.includes("tiktok.com"))
    return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  // Search aggregators such as v.sogou.com can point to many providers.
  // Do not label their result as YouTube unless the resolved URL is YouTube.
  return "web";
}

function detectSourceType(
  platform: SearchResult["platform"],
  url: string,
  category?: string
): SourceType {
  const lower = url.toLowerCase();
  if (category === "images") return "image";
  if (
    category === "videos" ||
    platform === "youtube" ||
    lower.includes("bilibili.com") ||
    lower.includes("b23.tv") ||
    lower.includes("youtu.be")
  ) {
    return "video";
  }
  if (platform === "wikipedia") return "encyclopedia";
  if (platform === "reddit") return "forum";
  if (["x", "xiaohongshu", "tiktok"].includes(platform)) return "social";

  if (ACADEMIC_DOMAINS.some((d) => lower.includes(d))) return "academic";
  if (OFFICIAL_DOMAINS.some((d) => lower.includes(d))) return "official";
  if (
    category === "news" ||
    NEWS_DOMAINS.some((d) => lower.includes(d)) ||
    lower.includes("/news")
  ) {
    return "news";
  }
  if (lower.includes("amazon.") || lower.includes("/dp/")) return "commerce";
  return "web";
}

function sourceLabel(
  platform: SearchResult["platform"],
  url: string
): string {
  const lower = url.toLowerCase();
  if (lower.includes("bilibili.com") || lower.includes("b23.tv")) return "B站";
  if (lower.includes("douyin.com") || lower.includes("iesdouyin.com"))
    return "抖音";
  if (platform === "wikipedia") return "Wikipedia";
  if (platform === "youtube") return "YouTube";
  if (platform === "bilibili") return "B站";
  if (platform === "x") return "X";
  if (platform === "reddit") return "Reddit";
  if (platform === "xiaohongshu") return "小红书";
  if (platform === "tiktok") return "TikTok";
  return extractDomain(url);
}

function normalizeSearXNGResult(
  item: SearXNGResult,
  index: number,
  retrievalMethod: string,
  forcedCategory?: string
): SearchResult | null {
  if (!item.url && !item.img_src) return null;

  const url = item.url || item.img_src || "";
  if (!url) return null;

  const category = forcedCategory || item.category;
  const platform = detectPlatform(url);
  const sourceType = detectSourceType(platform, url, category);
  const thumbnail =
    item.img_src || item.thumbnail || item.thumbnail_src || undefined;

  // Image category without an actual image URL is not a valid image result
  if (sourceType === "image" && !thumbnail) return null;

  return {
    id: `searx_${index}_${Buffer.from(url).toString("base64url").slice(0, 12)}`,
    type:
      sourceType === "image"
        ? "image"
        : sourceType === "video"
          ? "video"
          : platform === "web"
            ? "web"
            : platform,
    platform:
      sourceType === "video" && platform === "web"
        ? detectVideoPlatform(url)
        : platform,
    sourceType,
    title: item.title,
    snippet: item.content,
    content: item.content,
    author: item.author,
    url: sourceType === "image" && item.img_src ? item.img_src : url,
    thumbnail,
    favicon: getFaviconUrl(url),
    publishedAt: item.publishedDate,
    metrics: item.duration ? { duration: item.duration } : undefined,
    source: sourceLabel(
      sourceType === "video" && platform === "web"
        ? detectVideoPlatform(url)
        : platform,
      url
    ),
    retrievalMethod,
    rawSource: item,
  };
}

export class SearXNGProvider implements WebSearchProvider {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = DEFAULT_TIMEOUT) {
    this.baseUrl = (baseUrl || process.env.SEARXNG_BASE_URL || "").replace(
      /\/$/,
      ""
    );
    this.timeout = timeout;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async search(options: WebSearchOptions): Promise<SearchResult[]> {
    if (!this.baseUrl) {
      throw new Error("SEARXNG_BASE_URL is not configured");
    }

    const params = new URLSearchParams({
      q: options.query,
      format: "json",
      language: "auto",
    });

    const categories = options.categories?.length
      ? options.categories
      : (["general"] as const);

    params.set("categories", categories.join(","));

    if (options.timeRange) {
      params.set("time_range", options.timeRange);
    }

    if (options.engines?.length) {
      params.set("engines", options.engines.join(","));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(
        `${this.baseUrl}/search?${params.toString()}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`SearXNG returned ${response.status}`);
      }

      const data: SearXNGResponse = await response.json();
      const maxResults = options.maxResults ?? 20;
      const primaryCategory = categories[0];

      return (data.results ?? [])
        .slice(0, maxResults)
        .map((item, i) =>
          normalizeSearXNGResult(
            item,
            i,
            `searxng_${primaryCategory}`,
            primaryCategory
          )
        )
        .filter((r): r is SearchResult => r !== null);
    } finally {
      clearTimeout(timer);
    }
  }

  async searchSite(
    query: string,
    site: string,
    maxResults = 10
  ): Promise<SearchResult[]> {
    // Prefer engines that better honor site: filters; host is still validated by SocialProvider
    return this.search({
      query: `site:${site} ${query}`,
      maxResults,
      engines: ["baidu", "sogou", "yandex", "bing"],
    });
  }
}

export function createSearXNGProvider(): SearXNGProvider {
  return new SearXNGProvider();
}
