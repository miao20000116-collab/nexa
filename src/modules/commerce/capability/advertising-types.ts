/**
 * Advertising Intelligence types (V4.5-C).
 * Enhances existing Ads pages — not a rewrite.
 */

import type { CommerceCapabilityInsight } from "./listing-types";

export type AdKeywordClass =
  | "high_value"
  | "low_value"
  | "low_conversion"
  | "high_spend"
  | "potential_negative";

export type AdKeywordInsight = {
  term: string;
  classification: AdKeywordClass;
  spend: number | null;
  orders: number | null;
  acos: number | null;
  evidence: string;
  source: "演示数据" | "数据暂缺";
};

export type InventoryAdConstraint = {
  productId: string;
  title: string;
  risk: "low" | "medium" | "high";
  riskLabel: string;
  daysOfCover: number | null;
  /** If true, must not recommend increasing ads for this product */
  blockIncreaseAds: boolean;
};

export type AdvertisingAnalysisInput = {
  channel: "amazon" | "tiktok";
  range?: string;
  /** baseline = free demo on page load; deep = Credits + AI enrich */
  depth?: "baseline" | "deep";
  confirm?: boolean;
  jobId?: string;
  workspaceId?: string | null;
};

export type AdvertisingAnalysisResult =
  | {
      ok: true;
      insight: CommerceCapabilityInsight;
      headline: string;
      keywords: AdKeywordInsight[];
      inventoryConstraints: InventoryAdConstraint[];
      metricsSummary: string[];
      dataLabel: "演示数据" | "数据暂缺";
      analysisDepth: "baseline" | "deep";
      searchHref: string;
      researchHref: string | null;
      createHref: string;
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
        | "invalid_input"
        | "data_unavailable";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
    };

export type { CommerceCapabilityInsight };
