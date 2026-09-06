import type {
  KnowledgeSearchOptions,
  SearchResult,
  SocialSearchOptions,
  VideoSearchOptions,
  WebSearchOptions,
} from "../types";

export interface WebSearchProvider {
  search(options: WebSearchOptions): Promise<SearchResult[]>;
}

export interface KnowledgeSearchProvider {
  search(options: KnowledgeSearchOptions): Promise<SearchResult[]>;
}

export interface VideoSearchProvider {
  search(options: VideoSearchOptions): Promise<SearchResult[]>;
}

export interface SocialSearchProvider {
  search(options: SocialSearchOptions): Promise<SearchResult[]>;
}

export interface ProviderResult {
  provider: string;
  results: SearchResult[];
  error?: string;
}
