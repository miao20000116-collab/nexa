/**
 * Financial & Inventory Intelligence types (V4.5-F).
 * Enhance Profit / Inventory — not a traditional ERP finance system.
 */

import type { CommerceCapabilityInsight } from "./listing-types";

export type SupportedCurrency = "USD" | "EUR" | "GBP" | "CNY";

export type FxStatus = "Rate Unavailable" | "Estimated" | "Same Currency";

export type FinancialSnapshot = {
  currency: SupportedCurrency;
  displayCurrency: SupportedCurrency;
  fxStatus: FxStatus;
  fxNote: string;
  revenue: number;
  cogs: number;
  platformFee: number;
  adSpend: number;
  shipping: number;
  otherCost: number;
  profit: number;
  previousRevenue: number | null;
  previousProfit: number | null;
  revenueDeltaPct: number | null;
  profitDeltaPct: number | null;
};

export type InventoryRiskItem = {
  productId: string;
  title: string;
  stock: number;
  salesVelocity: number;
  daysOfInventory: number | null;
  leadTimeDays: number | null;
  risk: "low" | "medium" | "high";
  riskLabel: string;
  recommendation: string;
};

export type BusinessDiagnosisScenario =
  | "high_sales_low_stock"
  | "low_sales_high_stock"
  | "high_acos"
  | "profit_down"
  | "healthy"
  | "mixed";

export type FinancialInventoryMode =
  | "financial"
  | "inventory"
  | "joint";

export type FinancialInventoryInput = {
  channel?: "amazon" | "tiktok";
  mode?: FinancialInventoryMode;
  range?: string;
  displayCurrency?: SupportedCurrency;
  /** Optional lead time assumption days — labeled Estimated if used */
  leadTimeDays?: number | null;
  /** baseline = free demo on page load; deep = Credits + AI enrich */
  depth?: "baseline" | "deep";
  confirm?: boolean;
  jobId?: string;
  workspaceId?: string | null;
};

export type FinancialInventoryResult =
  | {
      ok: true;
      mode: FinancialInventoryMode;
      insight: CommerceCapabilityInsight;
      financial: FinancialSnapshot | null;
      inventoryRisks: InventoryRiskItem[];
      businessScenario: BusinessDiagnosisScenario;
      adsRecommendation: {
        mayIncreaseAds: boolean;
        reason: string;
      };
      createHref: string;
      searchHref: string;
      adsHref: string;
      listingHref: string;
      dataLabel: "演示数据";
      analysisDepth: "baseline" | "deep";
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
