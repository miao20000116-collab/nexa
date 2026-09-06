/**
 * Attach scenario workflow bundle to capability results.
 */

import { buildScenarioActions, ensureWorkflowActions } from "./actions";
import {
  workflowComplianceHref,
  workflowCreateHref,
  workflowPublishHref,
  workflowQaHref,
  workflowResearchHref,
  workflowSearchHref,
} from "./hrefs";
import type {
  CommerceWorkflowContext,
  WorkflowAction,
  WorkflowScenarioId,
} from "./types";

export type WorkflowBundle = {
  workflowContext: CommerceWorkflowContext;
  workflowActions: WorkflowAction[];
  createHref: string;
  searchHref: string;
  researchHref: string;
  qaHref: string;
  complianceHref: string;
  publishHref: string;
  chainLabel: string;
};

const CHAIN_LABELS: Record<WorkflowScenarioId, string> = {
  product_research_loop:
    "闭环：Product Research → Search → Research → Creation → QA → Publish",
  listing_optimize: "闭环：Product → 商品页 → 合规 → QA → Publish",
  ads_anomaly: "闭环：Ads Diagnosis → Search → Research → Creation",
  customer_pain:
    "闭环：Customer Feedback → Pain Point → Product Diagnosis → Creation",
  inventory_risk: "闭环：Inventory → Sales → Ads → Profit → Decision",
  compliance_issue: "闭环：Product → Compliance → Research → QA → Publish",
};

export function buildWorkflowBundle(opts: {
  scenario: WorkflowScenarioId;
  ctx: CommerceWorkflowContext;
  researchHref?: string | null;
  workspaceHref?: string | null;
  productDiagnosisHref?: string | null;
  searchQuery?: string | null;
}): WorkflowBundle {
  const actions = ensureWorkflowActions(
    buildScenarioActions(opts.scenario, opts.ctx, {
      researchHref: opts.researchHref,
      workspaceHref: opts.workspaceHref,
      productDiagnosisHref: opts.productDiagnosisHref,
    })
  );

  return {
    workflowContext: opts.ctx,
    workflowActions: actions,
    createHref: workflowCreateHref(opts.ctx),
    searchHref: workflowSearchHref(opts.ctx, opts.searchQuery || undefined),
    researchHref: workflowResearchHref(
      opts.ctx,
      opts.researchHref || opts.workspaceHref
    ),
    qaHref: workflowQaHref(opts.ctx),
    complianceHref: workflowComplianceHref(opts.ctx),
    publishHref: workflowPublishHref(opts.ctx),
    chainLabel: CHAIN_LABELS[opts.scenario],
  };
}
