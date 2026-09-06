/**
 * Attach Applied Knowledge on commerce AI API responses (V4.5-H).
 */

import { applyCommerceSkills } from "@/modules/commerce/skills";
import type { AppliedKnowledgeSummary } from "@/modules/commerce/skills/types";

export function resolveAppliedKnowledge(opts: {
  capabilityKey: string;
  platform?: "Amazon" | "TikTok Shop";
  marketplace?: string | null;
  country?: string | null;
  category?: string | null;
  task?: string;
}): AppliedKnowledgeSummary {
  return applyCommerceSkills({
    capabilityKey: opts.capabilityKey,
    platform: opts.platform,
    marketplace: opts.marketplace,
    country: opts.country,
    category: opts.category,
    task: opts.task,
  }).appliedKnowledge;
}
