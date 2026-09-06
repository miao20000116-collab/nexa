import { cleanQuery } from "./query-rewriter";

export function normalizeQuery(query: string): string {
  return cleanQuery(query)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function generateCacheKey(
  normalizedQuery: string,
  intent: string
): string {
  return `search:v6:${intent}:${normalizedQuery}`;
}
