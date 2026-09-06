/**
 * CapabilityRouter — Capability → Provider → Model
 * (+ Commerce Skill selection by Platform / Market / Category / Task)
 */

import {
  getProvider,
  resolveProvider,
} from "@/modules/ai/gateway/provider-registry";
import type { AICapability, RouteContext } from "@/modules/ai/gateway/types";
import {
  applyCommerceSkills,
  formatSkillsForPrompt,
  selectCommerceSkills,
  type AppliedKnowledgeSummary,
  type ApplySkillsInput,
  type SkillRouteContext,
} from "@/modules/commerce/skills";
import { resolveModelForCapability } from "./model-router";

export interface CapabilityRoute {
  capability: AICapability;
  providerId: string;
  model: string;
}

export function routeCapability(ctx: RouteContext): CapabilityRoute | null {
  const provider = resolveProvider(ctx);
  if (!provider || !provider.isConfigured()) return null;

  const model = resolveModelForCapability(ctx.capability, ctx.quality);

  return {
    capability: ctx.capability,
    providerId: provider.id,
    model,
  };
}

/**
 * CapabilityRouter + Skill routing for commerce jobs.
 * Users do not select Skills — router picks knowledge packs.
 */
export function routeCapabilityWithSkills(
  ctx: RouteContext & { skills?: SkillRouteContext | ApplySkillsInput }
): {
  route: CapabilityRoute | null;
  appliedKnowledge: AppliedKnowledgeSummary | null;
  skillPromptBlock: string;
} {
  const route = routeCapability(ctx);
  if (!ctx.skills) {
    return { route, appliedKnowledge: null, skillPromptBlock: "" };
  }
  if ("capabilityKey" in ctx.skills) {
    const applied = applyCommerceSkills(ctx.skills);
    return {
      route,
      appliedKnowledge: applied.appliedKnowledge,
      skillPromptBlock: applied.promptBlock,
    };
  }
  const appliedKnowledge = selectCommerceSkills(ctx.skills);
  return {
    route,
    appliedKnowledge,
    skillPromptBlock: formatSkillsForPrompt(appliedKnowledge),
  };
}

export function isRoutedCapabilityAvailable(
  capability: AICapability
): boolean {
  return routeCapability({ capability }) !== null;
}

export function describeRoute(capability: AICapability): {
  available: boolean;
  providerId?: string;
} {
  const route = routeCapability({ capability });
  if (!route) return { available: false };
  const descriptor = getProvider(route.providerId);
  return {
    available: Boolean(descriptor?.isConfigured()),
    providerId: route.providerId,
  };
}

/** Re-export for callers that expect Skill routing via CapabilityRouter */
export { selectCommerceSkills, applyCommerceSkills };
