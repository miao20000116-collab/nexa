/**
 * Listing Intelligence types (V4.5-B).
 * Capability layer inside Commerce — not a standalone Listing SaaS.
 */

import type { AppliedKnowledgeSummary } from "@/modules/commerce/skills/types";

export type CommerceCapabilityInsight = {
  situation: string;
  evidence: string[];
  diagnosis: string;
  opportunity: string;
  recommendation: string;
  actions: Array<{
    label: string;
    kind:
      | "search"
      | "create"
      | "workspace"
      | "qa"
      | "compliance"
      | "publish"
      | "link";
    href: string;
  }>;
  dataNotice: string;
  aiAssisted: boolean;
  createdAt: string;
  /** V4.5-H — auto-routed Skills (not Agent Marketplace) */
  appliedKnowledge?: AppliedKnowledgeSummary;
};

export type ListingMode = "generate" | "review" | "partial";

export type ListingPartialField = "title" | "bullets" | "description";

export type KeywordBucket = {
  term: string;
  /** Why this term — never invent search volume */
  source: string;
  intent?: string;
  relevance?: string;
};

export type KeywordIntelligence = {
  primary: KeywordBucket[];
  secondary: KeywordBucket[];
  longTail: KeywordBucket[];
  searchIntent: string;
  relevanceNotes: string;
  potentialNegative: KeywordBucket[];
  /** Honest: no volume APIs → never fake volume */
  volumeNotice: string;
  evidenceUrls: string[];
  aiAssisted: boolean;
};

export type ListingReviewScores = {
  clarity: string;
  relevance: string;
  keywordCoverage: string;
  persuasiveness: string;
  localization: string;
  potentialComplianceRisk: string;
};

export type ListingReview = {
  scores: ListingReviewScores;
  strengths: string[];
  problems: string[];
  recommendations: string[];
  dataNotice: string;
};

export type ListingRecommendation = {
  title: string;
  bulletPoints: string[];
  description: string;
  searchKeywords: string[];
  positioning: string;
  cta: string;
  localizedCopy: string;
  localizationNotes: string;
  complianceNotes: string;
  risks: string[];
  /** Which fields were regenerated this run */
  regeneratedFields: Array<"title" | "bullets" | "description" | "full">;
};

export type ListingIntelligenceInput = {
  productTitle: string;
  sku?: string;
  productDescription?: string;
  /** Image URLs or captions — not fake vision results */
  imageNotes?: string[];
  platform: "Amazon" | "TikTok Shop";
  marketplace?: string;
  country?: string;
  category?: string;
  features?: string[];
  /** Existing full listing for review / partial */
  currentListing?: string;
  currentTitle?: string;
  currentBullets?: string[];
  currentDescription?: string;
  /** Prior Product Research / Research notes (plain text) */
  researchNotes?: string;
  productResearchSummary?: string;
  listingWeaknesses?: string[];
  listingChecklist?: string[];
  productId?: string;
  channel: "amazon" | "tiktok";
  mode?: ListingMode;
  /** When mode=partial — only rewrite this field */
  partialField?: ListingPartialField;
  /** Seed listing for partial merge */
  baseListing?: Partial<ListingRecommendation> | null;
  confirm?: boolean;
  jobId?: string;
  workspaceId?: string | null;
};

export type ListingIntelligenceResult =
  | {
      ok: true;
      insight: CommerceCapabilityInsight;
      listing: ListingRecommendation;
      keywords: KeywordIntelligence | null;
      review: ListingReview | null;
      createHref: string;
      qaHref: string;
      complianceHref: string;
      publishHref: string;
      qaHint: string;
      jobId: string;
      estimatedCredits: number | null;
      appliedKnowledge?: AppliedKnowledgeSummary;
      workflowActions?: import("@/modules/commerce/workflow/types").WorkflowAction[];
      chainLabel?: string;
    }
  | {
      ok: false;
      code:
        | "confirm_required"
        | "login_required"
        | "insufficient_credits"
        | "ai_unavailable"
        | "invalid_input";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
    };
