/**
 * Client-side active commerce smart-analysis context.
 * Panels publish baseline/deep results; AI workbench can refine them.
 */

export const NEXA_COMMERCE_ANALYSIS_EVENT = "nexa:commerce-analysis";
export const NEXA_COMMERCE_ANALYSIS_APPLY_EVENT =
  "nexa:commerce-analysis-apply";

export type CommerceAnalysisKind =
  | "financial_inventory"
  | "advertising"
  | "customer"
  | "compliance"
  | "product_research"
  | "listing";

export type CommerceAnalysisInsightSlice = {
  situation: string;
  evidence: string[];
  diagnosis: string;
  opportunity: string;
  recommendation: string;
  dataNotice?: string;
  aiAssisted?: boolean;
};

export type ActiveCommerceAnalysis = {
  kind: CommerceAnalysisKind;
  /** Panel instance key, e.g. financial|inventory|joint|amazon-ads */
  slot: string;
  pageKey: string;
  title: string;
  depth: "baseline" | "deep" | "refined";
  insight: CommerceAnalysisInsightSlice;
  updatedAt: string;
};

let active: ActiveCommerceAnalysis | null = null;

export function getActiveCommerceAnalysis(): ActiveCommerceAnalysis | null {
  return active;
}

export function publishCommerceAnalysis(next: ActiveCommerceAnalysis) {
  active = next;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NEXA_COMMERCE_ANALYSIS_EVENT, { detail: next })
  );
}

export function clearCommerceAnalysis(slot?: string) {
  if (slot && active?.slot !== slot) return;
  active = null;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NEXA_COMMERCE_ANALYSIS_EVENT, { detail: null })
  );
}

/** AI workbench → panels: apply refined insight into matching slot */
export function applyCommerceAnalysisRefinement(detail: {
  slot: string;
  insight: CommerceAnalysisInsightSlice;
  depth?: "refined" | "deep";
}) {
  if (active?.slot === detail.slot) {
    active = {
      ...active,
      insight: detail.insight,
      depth: detail.depth || "refined",
      updatedAt: new Date().toISOString(),
    };
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NEXA_COMMERCE_ANALYSIS_APPLY_EVENT, { detail })
  );
}
