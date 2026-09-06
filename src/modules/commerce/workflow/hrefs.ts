/**
 * Workflow href builders — preserve continuity query params.
 */

import { appendReturnNav, applyReturnNavParams } from "@/modules/commerce/lib/return-nav";
import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";
import { serializeWorkflowContext } from "./context";
import type { CommerceWorkflowContext } from "./types";

function wfParam(ctx: CommerceWorkflowContext): string {
  // Keep under typical URL limits — serialize is already clipped
  return encodeURIComponent(serializeWorkflowContext(ctx).slice(0, 1800));
}

export function workflowCreateHref(
  ctx: CommerceWorkflowContext,
  goalOverride?: string
): string {
  const goal =
    goalOverride?.trim() ||
    ctx.contentGoal ||
    `基于「${ctx.productTitle}」生成跨境内容（${ctx.marketplace || ctx.platform}）`;
  const context = serializeWorkflowContext(ctx);
  const params = new URLSearchParams({
    mode: "commerce",
    goal,
    commerceContext: context,
    product: ctx.productTitle,
  });
  if (ctx.storeId) params.set("storeId", ctx.storeId);
  if (ctx.marketplace) params.set("marketplace", ctx.marketplace);
  if (ctx.platform) params.set("commercePlatform", ctx.platform);
  if (ctx.stage === "qa") params.set("stage", "qa");
  applyReturnNavParams(params, ctx.platform);
  return `/create?${params.toString()}`;
}

export function workflowSearchHref(
  ctx: CommerceWorkflowContext,
  query?: string
): string {
  const q =
    query?.trim() ||
    `${ctx.productTitle} ${ctx.marketplace || ctx.platform} ${ctx.diagnosis || "market competitor"}`.trim();
  const params = new URLSearchParams({ q });
  params.set("from", "commerce");
  params.set("product", ctx.productTitle);
  if (ctx.marketplace) params.set("marketplace", ctx.marketplace);
  if (ctx.storeId) params.set("storeId", ctx.storeId);
  // Soft continuity for Search UI (optional consumers)
  params.set("wf", wfParam(ctx).slice(0, 1200));
  return `/search?${params.toString()}`;
}

export function workflowResearchHref(
  ctx: CommerceWorkflowContext,
  workspaceHref?: string | null
): string {
  if (workspaceHref?.includes("/research")) {
    return appendReturnNav(workspaceHref, ctx.platform);
  }
  const goal = encodeURIComponent(
    `${ctx.productTitle} ${ctx.marketplace || ""} ${ctx.diagnosis || ctx.opportunity || "research"}`.trim()
  );
  if (workspaceHref) {
    return appendReturnNav(
      `${workspaceHref.replace(/\/$/, "")}/research?goal=${goal}`,
      ctx.platform
    );
  }
  return appendReturnNav(
    `/workspace?goal=${goal}&action=research&from=commerce&product=${encodeURIComponent(ctx.productTitle)}`,
    ctx.platform
  );
}

export function workflowQaHref(ctx: CommerceWorkflowContext): string {
  return workflowCreateHref(
    {
      ...ctx,
      stage: "qa",
      contentGoal:
        ctx.contentGoal ||
        `对「${ctx.productTitle}」内容做 QA（对照诊断与证据）`,
    },
    `对「${ctx.productTitle}」做内容 QA`
  );
}

export function workflowPublishHref(ctx: CommerceWorkflowContext): string {
  // A publish operation must belong to a concrete creation project. Before a
  // project exists, route through QA; the project workbench owns final publish.
  return workflowQaHref(ctx);
}

export function workflowComplianceHref(ctx: CommerceWorkflowContext): string {
  const base =
    ctx.platform === "TikTok Shop"
      ? "/commerce/tiktok/compliance"
      : "/commerce/amazon/compliance";
  const params = new URLSearchParams();
  if (ctx.productTitle) params.set("product", ctx.productTitle);
  if (ctx.productId) params.set("productId", ctx.productId);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function workflowListingHref(ctx: CommerceWorkflowContext): string {
  if (ctx.productId) {
    return commerceProductExpandHref(
      ctx.platform === "TikTok Shop" ? "tiktok" : "amazon",
      ctx.productId
    );
  }
  return ctx.platform === "TikTok Shop"
    ? "/commerce/tiktok#products"
    : "/commerce/amazon#products";
}

export function workflowAdsHref(ctx: CommerceWorkflowContext): string {
  const base =
    ctx.platform === "TikTok Shop"
      ? "/commerce/tiktok/content"
      : "/commerce/amazon/ads";
  const params = new URLSearchParams();
  if (ctx.productTitle) params.set("product", ctx.productTitle);
  if (ctx.storeId) params.set("storeId", ctx.storeId);
  if (ctx.diagnosis?.includes("库存") || ctx.source === "inventory") {
    params.set("inventoryBlocked", "1");
  }
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function workflowInventoryHref(): string {
  return "/commerce/amazon/inventory";
}

export function workflowProfitHref(): string {
  return "/commerce/amazon/profit";
}
