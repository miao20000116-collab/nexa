import type { SearchIntent } from "../types";

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

const TTL_BY_INTENT: Record<SearchIntent, number> = {
  news: 3 * 60,
  general: 10 * 60,
  knowledge: 4 * 60 * 60,
  social: 8 * 60,
  opinion: 8 * 60,
  product: 15 * 60,
  research: 30 * 60,
  video: 10 * 60,
  image: 10 * 60,
};

export class MemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let cacheInstance: CacheProvider | null = null;

export function getCacheProvider(): CacheProvider {
  if (!cacheInstance) {
    // In-process memory cache: correct for single-instance local/dev only.
    // Multi-instance production (Tencent web replicas) should wire Redis via
    // SEARCH_CACHE_REDIS_URL when available; bump result-id-v* on relevance changes.
    cacheInstance = new MemoryCacheProvider();
  }
  return cacheInstance;
}

export function getCacheTTL(intent: SearchIntent, resultCount = 1): number {
  // Never cache empty responses — flaky providers should not lock empty pages
  if (resultCount === 0) return 0;
  return TTL_BY_INTENT[intent] ?? 600;
}

/** Minimum average relevance to allow caching a SERP. */
export function isCacheWorthy(avgScore: number, resultCount: number): boolean {
  if (resultCount === 0) return false;
  return avgScore >= 0.18;
}
