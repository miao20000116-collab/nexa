/**
 * Scenario action chains — Insight → Action (never dead-end "分析完成").
 */

import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import {
  workflowAdsHref,
  workflowComplianceHref,
  workflowCreateHref,
  workflowInventoryHref,
  workflowListingHref,
  workflowProfitHref,
  workflowQaHref,
  workflowResearchHref,
  workflowSearchHref,
} from "./hrefs";
import type {
  CommerceWorkflowContext,
  WorkflowAction,
  WorkflowScenarioId,
} from "./types";

function a(
  id: string,
  label: string,
  kind: WorkflowAction["kind"],
  href: string,
  priority: WorkflowAction["priority"],
  chainHint?: string
): WorkflowAction {
  return { id, label, kind, href, priority, chainHint };
}

export function buildScenarioActions(
  scenario: WorkflowScenarioId,
  ctx: CommerceWorkflowContext,
  extras?: {
    researchHref?: string | null;
    workspaceHref?: string | null;
    productDiagnosisHref?: string | null;
  }
): WorkflowAction[] {
  const search = workflowSearchHref(ctx);
  const research = workflowResearchHref(ctx, extras?.researchHref || extras?.workspaceHref);
  const create = workflowCreateHref(ctx);
  const qa = workflowQaHref(ctx);
  const compliance = workflowComplianceHref(ctx);
  const listing = workflowListingHref(ctx);
  const ads = workflowAdsHref(ctx);
  const inventory = workflowInventoryHref();
  const profit = workflowProfitHref();
  const save = appendReturnNav(
    extras?.workspaceHref || "/workspace",
    ctx.platform
  );

  switch (scenario) {
    case "product_research_loop":
      return [
        a(
          "pr_research",
          "深入研究机会",
          "research",
          research,
          "primary",
          "Research → Creation"
        ),
        a(
          "pr_create",
          "生成商品页 / 内容",
          "create",
          create,
          "secondary",
          "Creation → QA → Publish"
        ),
        a("pr_search", "搜索竞品证据", "search", search, "inline"),
        a("pr_save", "保存到工作区", "save", save, "inline"),
      ];

    case "listing_optimize":
      return [
        a(
          "ls_compliance",
          "合规检查",
          "compliance",
          compliance,
          "primary",
          "商品页 → 合规 → QA"
        ),
        a(
          "ls_qa",
          "内容 QA",
          "qa",
          qa,
          "secondary",
          "QA → Publish"
        ),
        a("ls_create", "进入创作", "create", create, "inline"),
        a("ls_search", "搜索竞品商品页", "search", search, "inline"),
      ];

    case "ads_anomaly":
      return [
        a(
          "ad_search",
          "搜索优化方法",
          "search",
          search,
          "primary",
          "Diagnosis → Search → Creation"
        ),
        a(
          "ad_create",
          "生成承接内容",
          "create",
          create,
          "secondary",
          "Creation"
        ),
        a("ad_research", "深入研究", "research", research, "inline"),
        a("ad_inv", "查看库存约束", "inventory", inventory, "inline"),
        a("ad_ads", "返回广告页", "ads", ads, "inline"),
      ];

    case "customer_pain":
      return [
        a(
          "cu_diag",
          "查看商品诊断",
          "diagnosis",
          extras?.productDiagnosisHref || listing,
          "primary",
          "Pain Point → Product Diagnosis"
        ),
        a(
          "cu_create",
          "生成 FAQ / 卖点",
          "create",
          create,
          "secondary",
          "Creation"
        ),
        a("cu_search", "搜索用户反馈", "search", search, "inline"),
        a("cu_research", "深入研究痛点", "research", research, "inline"),
      ];

    case "inventory_risk":
      return [
        a(
          "inv_profit",
          "利润联动诊断",
          "profit",
          profit,
          "primary",
          "Inventory → Sales → Profit → Decision"
        ),
        a(
          "inv_ads",
          "广告决策（受库存约束）",
          "ads",
          ads,
          "secondary",
          "Ads gated by inventory"
        ),
        a("inv_create", "生成促销 / 种草", "create", create, "inline"),
        a("inv_search", "搜索清货策略", "search", search, "inline"),
        a("inv_list", "商品页", "listing", listing, "inline"),
      ];

    case "compliance_issue":
      return [
        a(
          "cp_research",
          "检索政策证据",
          "research",
          research,
          "primary",
          "Compliance → Research → QA"
        ),
        a(
          "cp_qa",
          "合规改写后 QA",
          "qa",
          qa,
          "secondary",
          "QA → Publish"
        ),
        a("cp_create", "按建议改写", "create", create, "inline"),
        a("cp_search", "搜索政策原文", "search", search, "inline"),
      ];

    default:
      return [
        a("fb_search", "继续搜索", "search", search, "primary"),
        a("fb_create", "生成内容", "create", create, "secondary"),
      ];
  }
}

/** Guarantee ≥1 action — never leave Insight without a next step. */
export function ensureWorkflowActions(
  actions: WorkflowAction[]
): WorkflowAction[] {
  if (actions.length > 0) return actions;
  return [
    a("fallback_search", "搜索相关信息", "search", "/search", "primary"),
    a(
      "fallback_create",
      "进入创作",
      "create",
      appendReturnNav("/create?mode=commerce", undefined),
      "secondary"
    ),
  ];
}
