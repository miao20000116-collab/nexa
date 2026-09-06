/**
 * Profit helpers for Product Research (V4.5-A §8).
 * Never invent costs — Incomplete Data when inputs missing.
 */

import type { ProfitAnalysis, ProfitInputs } from "./types";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function computeProfitAnalysis(
  input?: ProfitInputs | null
): ProfitAnalysis {
  const sellPrice = num(input?.sellPrice);
  const productCost = num(input?.productCost);
  const shippingCost = num(input?.shippingCost);
  const platformFees = num(input?.platformFees);
  const adCost = num(input?.adCost);

  const missing: string[] = [];
  if (sellPrice == null) missing.push("售价");
  if (productCost == null) missing.push("产品成本");
  if (shippingCost == null) missing.push("物流");
  if (platformFees == null) missing.push("平台费用");
  if (adCost == null) missing.push("广告成本");

  if (missing.length > 0 || sellPrice == null) {
    return {
      status: "incomplete",
      label: "Incomplete Data",
      sellPrice,
      productCost,
      shippingCost,
      platformFees,
      adCost,
      grossMarginPct: null,
      estimatedProfit: null,
      breakEvenNote: "Incomplete Data — 未假设真实成本，无法计算盈亏平衡。",
      missingFields: missing,
    };
  }

  const cogs =
    (productCost ?? 0) +
    (shippingCost ?? 0) +
    (platformFees ?? 0);
  const gross = sellPrice - cogs;
  const grossMarginPct = sellPrice > 0 ? (gross / sellPrice) * 100 : null;
  const estimatedProfit = gross - (adCost ?? 0);
  const unitContribution = estimatedProfit;

  let breakEvenNote: string;
  if (unitContribution <= 0) {
    breakEvenNote =
      "单位贡献 ≤ 0，当前成本结构下无法靠销量摊平（基于用户输入，非市场预测）。";
  } else {
    breakEvenNote = `单位贡献约 ${unitContribution.toFixed(2)}；固定成本未知时不估算盈亏销量。`;
  }

  return {
    status: "complete",
    label: "Based on user-provided costs",
    sellPrice,
    productCost,
    shippingCost,
    platformFees,
    adCost,
    grossMarginPct,
    estimatedProfit,
    breakEvenNote,
    missingFields: [],
  };
}

export function parseProfitFromBody(body: Record<string, unknown>): ProfitInputs {
  const nested =
    body.profit && typeof body.profit === "object"
      ? (body.profit as Record<string, unknown>)
      : body;
  return {
    sellPrice: num(nested.sellPrice ?? nested.sell_price),
    productCost: num(nested.productCost ?? nested.product_cost),
    shippingCost: num(nested.shippingCost ?? nested.shipping_cost),
    platformFees: num(nested.platformFees ?? nested.platform_fees),
    adCost: num(nested.adCost ?? nested.ad_cost),
  };
}
