/**
 * Build / serialize / parse Commerce Workflow Context for cross-module continuity.
 */

import type { CommerceWorkflowContext, WorkflowStage } from "./types";

const MAX_EVIDENCE = 8;
const MAX_FIELD = 500;

function clip(s: string | null | undefined, n = MAX_FIELD): string | null {
  if (!s?.trim()) return null;
  return s.trim().slice(0, n);
}

export function buildWorkflowContext(
  partial: Omit<CommerceWorkflowContext, "version" | "evidence"> & {
    evidence?: string[];
  }
): CommerceWorkflowContext {
  return {
    version: 1,
    stage: partial.stage,
    storeId: clip(partial.storeId, 80),
    storeLabel: clip(partial.storeLabel, 120),
    platform: partial.platform,
    marketplace: clip(partial.marketplace, 80),
    country: clip(partial.country, 16),
    currency: clip(partial.currency, 8),
    productTitle: (partial.productTitle || "Unknown product").slice(0, 200),
    productId: clip(partial.productId, 80),
    audience: clip(partial.audience, 300),
    researchSummary: clip(partial.researchSummary, 800),
    evidence: (partial.evidence || []).filter(Boolean).slice(0, MAX_EVIDENCE),
    diagnosis: clip(partial.diagnosis, 500),
    opportunity: clip(partial.opportunity, 500),
    contentGoal: clip(partial.contentGoal, 300),
    source: partial.source,
  };
}

/** Structured text for /create commerceContext — Creation must not re-ask Product. */
export function serializeWorkflowContext(
  ctx: CommerceWorkflowContext
): string {
  const lines = [
    `nexa_workflow: v1`,
    `stage: ${ctx.stage}`,
    `source: ${ctx.source}`,
    `platform: ${ctx.platform}`,
    `product: ${ctx.productTitle}`,
  ];
  if (ctx.productId) lines.push(`productId: ${ctx.productId}`);
  if (ctx.storeId) {
    lines.push(
      `store: ${ctx.storeId} · ${ctx.storeLabel ?? ""} · ${ctx.marketplace ?? ""} · ${ctx.country ?? ""} · ${ctx.currency ?? ""}`
    );
  } else if (ctx.marketplace || ctx.country) {
    lines.push(
      `market: ${ctx.marketplace ?? ""} · ${ctx.country ?? ""} · ${ctx.currency ?? ""}`
    );
  }
  if (ctx.audience) lines.push(`audience: ${ctx.audience}`);
  if (ctx.diagnosis) lines.push(`diagnosis: ${ctx.diagnosis}`);
  if (ctx.opportunity) lines.push(`opportunity: ${ctx.opportunity}`);
  if (ctx.researchSummary) lines.push(`research: ${ctx.researchSummary}`);
  if (ctx.contentGoal) lines.push(`contentGoal: ${ctx.contentGoal}`);
  if (ctx.evidence.length) {
    lines.push(`evidence: ${ctx.evidence.join("；")}`);
  }
  lines.push(
    `continuity: Store/Product/Market/Audience/Research/Evidence/Diagnosis/Opportunity/ContentGoal — do not ask user to re-enter known Product.`
  );
  return lines.join("\n");
}

export function parseWorkflowContextFromText(
  text: string | null | undefined
): Partial<CommerceWorkflowContext> | null {
  if (!text?.trim()) return null;
  const get = (key: string) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
    const m = text.match(re);
    return m?.[1]?.trim() || null;
  };
  const product = get("product");
  if (!product && !get("platform")) return null;
  const storeLine = get("store");
  let storeId: string | null = null;
  let marketplace: string | null = get("market")?.split("·")[0]?.trim() || null;
  let country: string | null = null;
  if (storeLine) {
    const parts = storeLine.split("·").map((p) => p.trim());
    storeId = parts[0] || null;
    marketplace = parts[2] || marketplace;
    country = parts[3] || null;
  }
  const platformRaw = get("platform") || "Amazon";
  const platform = platformRaw.toLowerCase().includes("tiktok")
    ? ("TikTok Shop" as const)
    : platformRaw.toLowerCase().includes("cross")
      ? ("Cross-border" as const)
      : ("Amazon" as const);

  return {
    version: 1,
    productTitle: product || undefined,
    productId: get("productId"),
    platform,
    storeId,
    marketplace,
    country,
    audience: get("audience"),
    diagnosis: get("diagnosis"),
    opportunity: get("opportunity"),
    researchSummary: get("research"),
    contentGoal: get("contentGoal"),
    evidence: get("evidence")?.split(/[；;]/).map((s) => s.trim()).filter(Boolean),
    stage: (get("stage") as WorkflowStage) || undefined,
  };
}

export function extractProductFromCommerceContext(
  text: string | null | undefined
): string | null {
  const parsed = parseWorkflowContextFromText(text);
  return parsed?.productTitle?.trim() || null;
}
