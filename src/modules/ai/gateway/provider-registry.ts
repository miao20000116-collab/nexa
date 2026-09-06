import type { AICapability, ProviderDescriptor, RouteContext } from "./types";
import { scoreProviderForContext } from "./region-policy";

const registry = new Map<string, ProviderDescriptor>();

export function registerProvider(descriptor: ProviderDescriptor) {
  registry.set(descriptor.id, descriptor);
}

export function listProviders(): ProviderDescriptor[] {
  return [...registry.values()];
}

export function getProvider(id: string): ProviderDescriptor | undefined {
  return registry.get(id);
}

export function resolveProvider(
  ctx: RouteContext
): ProviderDescriptor | null {
  const candidates = listProviders().filter((p) =>
    p.capabilities.includes(ctx.capability)
  );
  let best: ProviderDescriptor | null = null;
  let bestScore = -1;
  for (const p of candidates) {
    const score = scoreProviderForContext(p, ctx);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function isCapabilityAvailable(capability: AICapability): boolean {
  return resolveProvider({ capability }) !== null;
}
