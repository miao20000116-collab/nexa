import type { SearchResult } from "../types";
import { extractDomain, getFaviconUrl } from "@/lib/utils";

export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const result of results) {
    const normalizedUrl = normalizeUrl(result.url);
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    deduped.push(result);
  }

  return deduped;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // 只去掉 hash，保留全部 query 参数（如 YouTube ?v=、搜狗跳转参数）
    // 否则不同内容会被错误合并成一条
    parsed.hash = "";
    const host = parsed.hostname.replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function normalizeResults(results: SearchResult[]): SearchResult[] {
  return results.map((r) => ({
    ...r,
    title: r.title?.trim(),
    snippet: r.snippet?.trim(),
    favicon: r.favicon || (r.url ? getFaviconUrl(r.url) : undefined),
  }));
}
