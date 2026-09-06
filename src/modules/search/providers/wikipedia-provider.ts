import type { KnowledgeSearchOptions, SearchResult } from "../types";
import type { KnowledgeSearchProvider } from "./interfaces";
import { getFaviconUrl } from "@/lib/utils";
import {
  rewriteQuery,
  getWikipediaLanguages,
  cleanQuery,
} from "../services/query-rewriter";
import {
  scoreWikiCandidate,
  WIKI_THRESHOLD,
} from "../services/relevance-validator";

interface WikiSearchItem {
  title: string;
  pageid: number;
  snippet?: string;
}

interface WikiSearchResponse {
  query?: {
    search?: WikiSearchItem[];
  };
}

interface WikiSummary {
  title?: string;
  extract?: string;
  description?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
  thumbnail?: { source?: string };
}

const WIKI_APIS: Record<string, string> = {
  en: "https://en.wikipedia.org/w/api.php",
  zh: "https://zh.wikipedia.org/w/api.php",
};

const WIKI_REST: Record<string, string> = {
  en: "https://en.wikipedia.org/api/rest_v1/page/summary",
  zh: "https://zh.wikipedia.org/api/rest_v1/page/summary",
};

const DEFAULT_TIMEOUT = 8000;

const DIRECT_WIKI_TITLES: Array<{ pattern: RegExp; en?: string; zh?: string }> = [
  {
    pattern: /\bRAG\b|检索增强生成|retrieval[- ]augmented/i,
    en: "Retrieval-augmented generation",
    zh: "检索增强生成",
  },
];

export class WikipediaProvider implements KnowledgeSearchProvider {
  private timeout: number;

  constructor(timeout = DEFAULT_TIMEOUT) {
    this.timeout = timeout;
  }

  async search(options: KnowledgeSearchOptions): Promise<SearchResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const direct = await this.tryDirectLookup(options.query, controller.signal);
      if (direct.length > 0) return direct;

      const searchQueries = rewriteQuery(options.query).slice(0, 4);
      const languages = getWikipediaLanguages(options.query);

      let bestCandidate: {
        item: WikiSearchItem;
        lang: string;
        score: number;
      } | null = null;

      // Parallelize lang × term searches to avoid timeout under load
      const jobs = languages.flatMap((lang) =>
        searchQueries.map(async (searchTerm) => {
          const items = await this.searchWiki(
            searchTerm,
            lang,
            controller.signal
          );
          return items.map((item) => ({
            item,
            lang,
            score: scoreWikiCandidate(
              item.title,
              item.snippet ?? "",
              options.query
            ),
          }));
        })
      );

      const batches = await Promise.allSettled(jobs);
      for (const batch of batches) {
        if (batch.status !== "fulfilled") continue;
        for (const candidate of batch.value) {
          if (
            candidate.score >= WIKI_THRESHOLD &&
            (!bestCandidate || candidate.score > bestCandidate.score)
          ) {
            bestCandidate = candidate;
          }
        }
      }

      if (!bestCandidate) return [];

      const summary = await this.fetchSummary(
        bestCandidate.item.title,
        bestCandidate.lang,
        controller.signal
      );
      if (!summary) return [];

      const { item, lang } = bestCandidate;
      const url =
        summary.content_urls?.desktop?.page ??
        `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;

      return [
        {
          id: `wiki_${item.pageid}`,
          type: "knowledge",
          platform: "wikipedia",
          sourceType: "encyclopedia",
          title: summary.title ?? item.title,
          snippet: summary.description ?? item.snippet?.replace(/<[^>]+>/g, ""),
          content: summary.extract,
          url,
          thumbnail: summary.thumbnail?.source,
          source: "Wikipedia",
          favicon: getFaviconUrl("wikipedia.org"),
          retrievalMethod: `wikipedia_${lang}`,
          rankScore: bestCandidate.score,
          rawSource: { search: item, summary, lang },
        },
      ];
    } finally {
      clearTimeout(timer);
    }
  }

  private async tryDirectLookup(
    query: string,
    signal: AbortSignal
  ): Promise<SearchResult[]> {
    const cleaned = cleanQuery(query);
    const languages = getWikipediaLanguages(query);

    for (const entry of DIRECT_WIKI_TITLES) {
      if (!entry.pattern.test(query) && !entry.pattern.test(cleaned)) continue;

      for (const lang of languages) {
        const title = lang === "zh" ? entry.zh : entry.en;
        if (!title) continue;

        const summary = await this.fetchSummary(title, lang, signal);
        if (!summary?.extract) continue;

        const url =
          summary.content_urls?.desktop?.page ??
          `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

        return [
          {
            id: `wiki_direct_${lang}_${title.replace(/\s+/g, "_")}`,
            type: "knowledge",
            platform: "wikipedia",
            sourceType: "encyclopedia",
            title: summary.title ?? title,
            snippet: summary.description,
            content: summary.extract,
            url,
            thumbnail: summary.thumbnail?.source,
            source: "Wikipedia",
            retrievalMethod: `wikipedia_direct_${lang}`,
            rankScore: 0.95,
            rawSource: { summary, lang, direct: true },
          },
        ];
      }
    }

    return [];
  }

  private async searchWiki(
    term: string,
    lang: string,
    signal: AbortSignal
  ): Promise<WikiSearchItem[]> {
    const api = WIKI_APIS[lang];
    if (!api) return [];

    const searchParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: term,
      format: "json",
      origin: "*",
      srlimit: "5",
      utf8: "1",
    });

    try {
      const res = await fetch(`${api}?${searchParams}`, { signal });
      if (!res.ok) return [];
      const data: WikiSearchResponse = await res.json();
      return data.query?.search ?? [];
    } catch {
      return [];
    }
  }

  private async fetchSummary(
    title: string,
    lang: string,
    signal: AbortSignal
  ): Promise<WikiSummary | null> {
    const rest = WIKI_REST[lang];
    if (!rest) return null;

    try {
      const res = await fetch(
        `${rest}/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        { signal }
      );
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }
}

export function createWikipediaProvider(): WikipediaProvider {
  return new WikipediaProvider();
}
