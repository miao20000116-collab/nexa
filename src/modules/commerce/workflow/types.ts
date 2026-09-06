/**
 * Cross-border Intelligence Integration (V4.5-I).
 * Connects existing capabilities into workflows — no new top-level product.
 */

export type WorkflowStage =
  | "product_research"
  | "listing"
  | "advertising"
  | "customer"
  | "compliance"
  | "inventory"
  | "financial"
  | "commerce"
  | "search"
  | "research"
  | "creation"
  | "qa"
  | "publish";

export type WorkflowActionKind =
  | "search"
  | "research"
  | "create"
  | "review"
  | "save"
  | "assign"
  | "publish"
  | "qa"
  | "compliance"
  | "listing"
  | "ads"
  | "inventory"
  | "profit"
  | "diagnosis"
  | "link"
  | "workspace";

export type WorkflowActionPriority = "primary" | "secondary" | "inline";

export type WorkflowAction = {
  id: string;
  label: string;
  kind: WorkflowActionKind;
  href: string;
  priority: WorkflowActionPriority;
  /** Short chain hint, e.g. "Diagnosis → Search → Create" */
  chainHint?: string;
};

/**
 * Continuity payload across Commerce → Search → Research → Creation → QA → Publish.
 * Must travel with handoffs so users are not asked to re-enter known fields.
 */
export type CommerceWorkflowContext = {
  version: 1;
  stage: WorkflowStage;
  storeId?: string | null;
  storeLabel?: string | null;
  platform: "Amazon" | "TikTok Shop" | "Cross-border";
  marketplace?: string | null;
  country?: string | null;
  currency?: string | null;
  productTitle: string;
  productId?: string | null;
  audience?: string | null;
  researchSummary?: string | null;
  evidence: string[];
  diagnosis?: string | null;
  opportunity?: string | null;
  contentGoal?: string | null;
  source:
    | "product_research"
    | "listing"
    | "advertising"
    | "customer"
    | "compliance"
    | "financial"
    | "inventory"
    | "amazon_diagnosis"
    | "tiktok_diagnosis";
};

export type WorkflowScenarioId =
  | "product_research_loop"
  | "listing_optimize"
  | "ads_anomaly"
  | "customer_pain"
  | "inventory_risk"
  | "compliance_issue";
