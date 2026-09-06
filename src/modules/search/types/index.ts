export type SearchIntent =
  | "knowledge"
  | "news"
  | "opinion"
  | "product"
  | "research"
  | "video"
  | "image"
  | "social"
  | "general";

export type SearchPlatform =
  | "web"
  | "wikipedia"
  | "youtube"
  | "bilibili"
  | "x"
  | "reddit"
  | "xiaohongshu"
  | "tiktok";

export type SourceType =
  | "official"
  | "encyclopedia"
  | "news"
  | "web"
  | "social"
  | "video"
  | "forum"
  | "academic"
  | "commerce"
  | "image";

export type SearchStatus = "ok" | "partial" | "empty" | "unavailable";

export type SearchFailureKind = "empty" | "error" | "timeout" | null;

export type OverviewStatus = "ready" | "unavailable" | "error" | "skipped";

export type ChannelStatus = "ok" | "empty" | "error" | "skipped";

export interface SearchResultMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  duration?: string;
}

export interface SearchResult {
  id: string;
  type: string;
  platform: SearchPlatform;
  sourceType: SourceType;
  title?: string;
  content?: string;
  snippet?: string;
  author?: string;
  url: string;
  thumbnail?: string;
  favicon?: string;
  publishedAt?: string;
  metrics?: SearchResultMetrics;
  /** Display-friendly source label, e.g. domain or platform name */
  source?: string;
  retrievalMethod?: string;
  rawSource?: unknown;
  rankScore?: number;
}

export interface AIOverviewPoint {
  text: string;
  sourceIds: string[];
}

export interface AIOverview {
  summary: string;
  points: AIOverviewPoint[];
}

export type SearchTab =
  | "all"
  | "web"
  | "x"
  | "video"
  | "image"
  | "social";

export type SearchStage =
  | "understanding"
  | "searching"
  | "organizing"
  | "generating_overview"
  | "complete"
  | "error";

export interface SearchDebugInfo {
  originalQuery: string;
  normalizedQuery: string;
  intent: SearchIntent;
  rewrittenQueries: string[];
  providersCalled: string[];
  providerLatency: Record<string, number>;
  resultsReturned: Record<string, number>;
  resultsFiltered: number;
  providerErrors: Record<string, string>;
}

export interface SearchResponse {
  sessionId: string;
  query: string;
  normalizedQuery: string;
  intent: SearchIntent;
  status: SearchStatus;
  failureKind?: SearchFailureKind;
  results: SearchResult[];
  overview: AIOverview | null;
  overviewStatus?: OverviewStatus;
  channels?: Partial<Record<string, ChannelStatus>>;
  /** 1-based page that produced these results */
  page?: number;
  /** True when another page is likely available */
  hasMore?: boolean;
  debug?: SearchDebugInfo;
}

export interface WebSearchOptions {
  query: string;
  categories?: ("general" | "news" | "images" | "videos")[];
  timeRange?: "day" | "week" | "month" | "year";
  maxResults?: number;
  /** Prefer specific SearXNG engines (comma-separated names). */
  engines?: string[];
  /** 1-based page for Bing / SearXNG pagination */
  page?: number;
}

export interface KnowledgeSearchOptions {
  query: string;
  language?: string;
  maxResults?: number;
}

export interface VideoSearchOptions {
  query: string;
  maxResults?: number;
}

export interface SocialSearchOptions {
  query: string;
  platforms?: SearchPlatform[];
  maxResults?: number;
}
