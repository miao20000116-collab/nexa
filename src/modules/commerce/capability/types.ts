/**
 * Cross-border Capability Layer — Product Research types (V4.5-A).
 * Not a new top-level nav; used inside Commerce / Product / Search / Workspace.
 */

export type OpportunityRecommendation = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

/** Evidence bound to a judgment — never invent sources. */
export type ProductResearchEvidence = {
  title: string;
  url: string;
  snippet?: string | null;
  /** Display source (domain / platform) */
  source: string;
  /** ISO timestamp: publishedAt when known, else retrieval time */
  timestamp: string;
  platform?: string | null;
  sourceType?: string | null;
};

export type ClaimEvidenceStatus = "backed" | "insufficient";

export type ClaimWithEvidence = {
  claim: string;
  status: ClaimEvidenceStatus;
  /** Indices into opportunity.evidence; empty when Insufficient Evidence */
  evidenceIndexes: number[];
  note?: string;
};

export type ProfitInputs = {
  sellPrice?: number | null;
  productCost?: number | null;
  shippingCost?: number | null;
  platformFees?: number | null;
  adCost?: number | null;
};

export type ProfitAnalysis = {
  status: "complete" | "incomplete";
  label: string;
  sellPrice: number | null;
  productCost: number | null;
  shippingCost: number | null;
  platformFees: number | null;
  adCost: number | null;
  grossMarginPct: number | null;
  estimatedProfit: number | null;
  breakEvenNote: string;
  missingFields: string[];
};

export type ProductOpportunity = {
  product: string;
  marketplace: string;
  country: string;
  category: string | null;
  /** Market analysis */
  market: string;
  marketOpportunity: string;
  targetAudience: string;
  priceRange: string;
  competition: string;
  competitionLevel: string;
  demandSignals: string[];
  sellingPoints: string[];
  painPoints: string[];
  estimatedMargin: string;
  potentialProfit: string;
  mainRisks: string[];
  risks: string[];
  opportunity: string;
  recommendation: OpportunityRecommendation;
  /** Structured claims with evidence binding */
  claims: ClaimWithEvidence[];
  profit: ProfitAnalysis | null;
  dataNotice: string;
  evidence: ProductResearchEvidence[];
  aiAssisted: boolean;
  createdAt: string;
};

export type ProductCompareRow = {
  product: string;
  market: string;
  price: string;
  competition: string;
  margin: string;
  risk: string;
  opportunity: string;
  recommendation: OpportunityRecommendation;
  evidenceCount: number;
};

export type ProductCompareResult = {
  rows: ProductCompareRow[];
  summary: string;
  dataNotice: string;
};

export type ProductResearchInput = {
  query: string;
  marketplace?: string;
  country?: string;
  category?: string;
  keywords?: string;
  targetPrice?: number | null;
  targetProfit?: number | null;
  existingProduct?: string;
  /** Optional unit economics — never invent missing costs */
  profit?: ProfitInputs;
  /** Compare up to 3 product names/directions */
  compareProducts?: string[];
  workspaceId?: string | null;
  confirm?: boolean;
  jobId?: string;
};

export type ProductResearchResult =
  | {
      ok: true;
      opportunity: ProductOpportunity;
      compare: ProductCompareResult | null;
      searchQuery: string;
      searchHref: string;
      researchHref: string | null;
      workspaceHref: string | null;
      createHref: string;
      workspaceItemId?: string | null;
      jobId: string;
      estimatedCredits: number | null;
      appliedKnowledge?: import("@/modules/commerce/skills/types").AppliedKnowledgeSummary;
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
        | "invalid_query"
        | "search_unavailable";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
      searchHref?: string;
    };
