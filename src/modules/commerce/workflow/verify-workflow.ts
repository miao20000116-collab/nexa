/**
 * Scenario continuity smoke tests (V4.5-I).
 * Run: npx tsx src/modules/commerce/workflow/verify-workflow.ts
 */

import { buildWorkflowBundle } from "./bundle";
import { buildWorkflowContext } from "./context";
import type { WorkflowScenarioId } from "./types";

const SCENARIOS: WorkflowScenarioId[] = [
  "product_research_loop",
  "listing_optimize",
  "ads_anomaly",
  "customer_pain",
  "inventory_risk",
  "compliance_issue",
];

function main() {
  for (const scenario of SCENARIOS) {
    const ctx = buildWorkflowContext({
      stage: "commerce",
      platform: scenario.startsWith("tiktok") ? "TikTok Shop" : "Amazon",
      marketplace: "Amazon US",
      country: "US",
      storeId: "store_amazon_us",
      productTitle: "Portable Blender",
      audience: "Travel users",
      evidence: ["CVR -12%", "Sessions +8%"],
      diagnosis: "CVR下降",
      opportunity: "优化 Listing 与承接",
      contentGoal: "生成新 Listing 卖点",
      source: "amazon_diagnosis",
    });
    const wf = buildWorkflowBundle({ scenario, ctx });
    if (!wf.workflowActions.length) {
      throw new Error(`${scenario}: no actions`);
    }
    if (!wf.workflowActions.some((a) => a.priority === "primary")) {
      throw new Error(`${scenario}: missing primary action`);
    }
    if (!wf.createHref.includes("product=Portable")) {
      throw new Error(`${scenario}: create href missing product continuity`);
    }
    if (!wf.createHref.includes("commerceContext=")) {
      throw new Error(`${scenario}: create href missing context`);
    }
    // Dead-end check: must not be "分析完成" only
    const labels = wf.workflowActions.map((a) => a.label).join(" ");
    if (/分析完成/.test(labels)) {
      throw new Error(`${scenario}: dead-end label`);
    }
    console.log(`PASS ${scenario}: ${wf.chainLabel}`);
    console.log(
      `  primary=${wf.workflowActions.filter((a) => a.priority === "primary").map((a) => a.label).join(",")}`
    );
  }
  console.log("PASS: All 6 workflow scenarios OK");
}

main();
