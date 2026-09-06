/**
 * Cross-border Skills Infrastructure (V4.5-H).
 * Not a Prompt Center / Prompt Marketplace / Agent Marketplace.
 * Skills = versioned business knowledge packs (rules + evidence + decision logic).
 */

export type SkillDomain =
  | "listing"
  | "advertising"
  | "product_research"
  | "compliance"
  | "content"
  | "customer"
  | "profit"
  | "cross_border";

export type SkillPlatform = "Amazon" | "TikTok Shop" | "Cross-border";

export type SkillEvidence = {
  source: string;
  url: string | null;
  timestamp: string;
  region: string;
  platform: string;
};

export type SkillRuleKind =
  | "business"
  | "platform"
  | "category"
  | "keyword"
  | "compliance"
  | "localization"
  | "decision"
  | "content";

export type SkillRule = {
  id: string;
  kind: SkillRuleKind;
  statement: string;
  /** Important rules should carry evidence */
  evidence?: SkillEvidence[];
};

export type SkillVersionPack = {
  /** Semver string, e.g. 1.1.0 — immutable once published */
  version: string;
  releasedAt: string;
  changelog: string;
  rules: SkillRule[];
  decisionLogic: string[];
  inputs: string[];
  outputs: string[];
  evidenceIndex: SkillEvidence[];
  applicableScenarios: string[];
};

/**
 * Full Skill definition (meta + all published versions).
 * Rule changes → new version; never overwrite prior packs.
 */
export type CommerceSkillDefinition = {
  skillId: string;
  name: string;
  domain: SkillDomain;
  platform: SkillPlatform;
  /** Marketplace filters; empty = all for platform */
  marketplace: string[];
  country: string[];
  /** Pointer to latest version string */
  latestVersion: string;
  /** Immutable history — append only */
  versions: SkillVersionPack[];
  lastUpdated: string;
  /** Future: org-scoped private skills (not Marketplace) */
  ownership: "nexa_system" | "enterprise_private";
};

/** Routing task keys used by CapabilityRouter + commerce capabilities */
export type CommerceSkillTask =
  | "listing_optimization"
  | "listing_review"
  | "advertising_analysis"
  | "product_research"
  | "compliance_check"
  | "content_analysis"
  | "content_optimization"
  | "product_analysis"
  | "customer_review_analysis"
  | "profit_analysis"
  | "inventory_analysis";

export type SkillRouteContext = {
  platform?: SkillPlatform | "Amazon" | "TikTok Shop";
  marketplace?: string | null;
  country?: string | null;
  category?: string | null;
  task: CommerceSkillTask | string;
  /** Optional explicit skill ids (advanced / enterprise) — not required for UX */
  preferSkillIds?: string[];
};

/** User-facing Applied Knowledge (no Agent/Skill ordinal labels) */
export type AppliedKnowledgeItem = {
  /** Human label, e.g. "Amazon US Listing 相关知识" */
  label: string;
  skillName: string;
  version: string;
  domain: SkillDomain;
  platform: SkillPlatform;
  marketplaceHint: string | null;
  ruleHighlights: string[];
  evidence: SkillEvidence[];
  scenarios: string[];
};

export type AppliedKnowledgeSummary = {
  /** Primary UX line */
  summaryLine: string;
  items: AppliedKnowledgeItem[];
  /** Opaque ids for debugging / enterprise — never primary UX */
  skillIds: string[];
  routedAt: string;
};
