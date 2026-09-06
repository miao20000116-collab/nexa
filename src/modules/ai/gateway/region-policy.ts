import type { RouteContext } from "./types";

/**
 * RegionPolicy — reserved for multi-region routing.
 * Never hardcode vendor model product names in business code.
 */
export function resolveRegion(explicit?: string): string {
  return (
    explicit ||
    process.env.NEXA_AI_REGION?.trim() ||
    process.env.AI_REGION?.trim() ||
    "cn"
  );
}

export function scoreProviderForContext(
  provider: {
    region: string;
    priority: number;
    isConfigured: () => boolean;
  },
  ctx: RouteContext
): number {
  if (!provider.isConfigured()) return -1;
  let score = provider.priority;
  const region = resolveRegion(ctx.region);
  if (provider.region === region) score += 100;
  if (provider.region === "global") score += 10;
  if (ctx.quality === "fast") score += 5;
  if (ctx.costPreference === "low") score += 5;
  return score;
}
