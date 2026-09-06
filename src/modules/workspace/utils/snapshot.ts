import type { SourceSnapshot } from "@/modules/workspace/types";

export function snapshotFromSearchResult(result: {
  id: string;
  title?: string;
  url: string;
  platform: string;
  sourceType: string;
  snippet?: string;
  author?: string;
  publishedAt?: string;
  thumbnail?: string;
}): SourceSnapshot {
  return {
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
}
