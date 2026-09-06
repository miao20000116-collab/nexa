/**
 * Resolve + apply Skills for a commerce AI job.
 */

import { formatSkillsForPrompt } from "./format";
import {
  selectCommerceSkills,
  taskFromCommerceCapability,
} from "./router";
import type {
  AppliedKnowledgeSummary,
  SkillPlatform,
  SkillRouteContext,
} from "./types";

export type ApplySkillsInput = {
  capabilityKey: string;
  platform?: SkillPlatform | "Amazon" | "TikTok Shop";
  marketplace?: string | null;
  country?: string | null;
  category?: string | null;
  task?: SkillRouteContext["task"];
};

export function applyCommerceSkills(input: ApplySkillsInput): {
  appliedKnowledge: AppliedKnowledgeSummary;
  promptBlock: string;
} {
  const task =
    input.task || taskFromCommerceCapability(input.capabilityKey);
  const appliedKnowledge = selectCommerceSkills({
    platform: input.platform,
    marketplace: input.marketplace,
    country: input.country,
    category: input.category,
    task,
  });
  return {
    appliedKnowledge,
    promptBlock: formatSkillsForPrompt(appliedKnowledge),
  };
}
