import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import {
  buildWorkflowContext,
  serializeWorkflowContext,
} from "@/modules/commerce/workflow/context";
import type { CommerceWorkflowContext } from "@/modules/commerce/workflow/types";

export type CommerceDiagnosisSource =
  | "amazon_diagnosis"
  | "tiktok_diagnosis";

export type CommerceCreateContextInput = {
  source: CommerceDiagnosisSource;
  platform: "Amazon" | "TikTok Shop";
  productTitle: string;
  conclusion: string;
  /** Key evidence lines, e.g. "访问量 -12%" / "GMV -18%" */
  evidence: string[];
  suggestion: string;
  /** Bound Commerce Store — required for multi-store isolation */
  storeId?: string;
  storeMarketplace?: string;
  storeCountry?: string;
  storeCurrency?: string;
  storeConnectionStatus?: string;
  audience?: string;
  opportunity?: string;
  researchSummary?: string;
  contentGoal?: string;
  productId?: string;
  diagnosis?: string;
};

/** Structured text passed to /create as commerceContext. */
export function buildCommerceCreateContext(
  input: CommerceCreateContextInput & {
    listingWeaknesses?: string[];
    complianceRisks?: string[];
    adsNotes?: string[];
  }
): string {
  const wf = buildWorkflowContext({
    stage: "creation",
    platform: input.platform,
    marketplace: input.storeMarketplace,
    country: input.storeCountry,
    currency: input.storeCurrency,
    storeId: input.storeId,
    storeLabel: input.storeMarketplace,
    productTitle: input.productTitle,
    productId: input.productId,
    audience: input.audience,
    researchSummary: input.researchSummary,
    evidence: input.evidence,
    diagnosis: input.diagnosis || input.conclusion,
    opportunity: input.opportunity,
    contentGoal: input.contentGoal || input.suggestion,
    source:
      input.source === "tiktok_diagnosis"
        ? "tiktok_diagnosis"
        : "amazon_diagnosis",
  });

  let text = serializeWorkflowContext(wf);
  if (input.listingWeaknesses?.length) {
    text += `\nlistingWeaknesses: ${input.listingWeaknesses.join("；")}`;
  }
  if (input.complianceRisks?.length) {
    text += `\ncomplianceRisks: ${input.complianceRisks.join("；")}`;
  }
  if (input.adsNotes?.length) {
    text += `\nadsNotes: ${input.adsNotes.join("；")}`;
  }
  // Keep legacy keys for older create parsers
  text += `\nconclusion: ${input.conclusion}`;
  text += `\nsuggestion: ${input.suggestion}`;
  return text;
}

export function commerceStrategyCreateHref(opts: {
  goal: string;
  context: CommerceCreateContextInput;
  stage?: string;
}): string {
  return commerceCreateHref({
    goal: opts.goal,
    context: buildCommerceCreateContext(opts.context),
    storeId: opts.context.storeId,
    marketplace: opts.context.storeMarketplace,
    platform: opts.context.platform,
    product: opts.context.productTitle,
    stage: opts.stage,
  });
}

export { commerceSearchHref };

export function formatDeltaEvidence(
  label: string,
  deltaPct: number | null | undefined
): string | null {
  if (deltaPct == null || Number.isNaN(deltaPct)) return null;
  const sign = deltaPct > 0 ? "+" : "";
  return `${label} ${sign}${deltaPct.toFixed(1)}%`;
}

export type { CommerceWorkflowContext };
