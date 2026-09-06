/**
 * Financial & Inventory Intelligence (V4.5-F).
 *
 * Profit / Inventory DEMO data → Situation / Evidence / Diagnosis / Opportunity / Recommendation.
 * No fake FX rates. Inventory gates ads recommendations.
 * Joint Business Diagnosis across Sales + Ads + Inventory + Profit.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { withStoreCreateFields } from "@/modules/commerce/lib/with-store-create-fields";
import { applyCommerceSkills } from "@/modules/commerce/skills";
import type {
  BusinessDiagnosisScenario,
  FinancialInventoryInput,
  FinancialInventoryResult,
  FinancialSnapshot,
  InventoryRiskItem,
  SupportedCurrency,
} from "@/modules/commerce/capability/financial-types";
import type { CommerceCapabilityInsight } from "@/modules/commerce/capability/listing-types";

const BILLING_FINANCIAL = "financial_analysis";
const BILLING_INVENTORY = "inventory_intelligence";

function pctDelta(cur: number, prev: number | null): number | null {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function fmtPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "数据暂缺";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveFx(
  base: SupportedCurrency,
  display: SupportedCurrency
): Pick<FinancialSnapshot, "fxStatus" | "fxNote"> {
  if (base === display) {
    return {
      fxStatus: "Same Currency",
      fxNote: "展示币种与店铺币种一致，无需换算。",
    };
  }
  return {
    fxStatus: "Rate Unavailable",
    fxNote: `无真实汇率 API：不得伪造 ${base}→${display} 实时汇率。金额仍按店铺原币 ${base} 展示。`,
  };
}

function buildInventoryRisks(
  rows: Array<{
    productId: string;
    title: string;
    unitsOnHand: number;
    avgDailyUnits: number;
    daysOfCover: number | null;
    risk: "low" | "medium" | "high";
    riskLabel: string;
  }>,
  leadTimeDays: number | null
): InventoryRiskItem[] {
  return rows.map((r) => {
    let recommendation = "保持观察补货节奏。";
    if (r.risk === "high" || (r.daysOfCover != null && r.daysOfCover < 14)) {
      recommendation =
        "库存覆盖不足：优先补货；不得建议扩大广告。";
    } else if (
      r.unitsOnHand > 200 &&
      r.avgDailyUnits < 2 &&
      (r.daysOfCover == null || r.daysOfCover > 60)
    ) {
      recommendation =
        "高库存 + 低销售：建议 促销 / 商品页优化 / 内容创作。";
    } else if (r.risk === "medium") {
      recommendation = "关注在途与提前期，避免断货。";
    }

    return {
      productId: r.productId,
      title: r.title,
      stock: r.unitsOnHand,
      salesVelocity: r.avgDailyUnits,
      daysOfInventory: r.daysOfCover,
      leadTimeDays,
      risk: r.risk,
      riskLabel: r.riskLabel,
      recommendation,
    };
  });
}

function classifyScenario(opts: {
  revenueDelta: number | null;
  profitDelta: number | null;
  acos: number | null;
  acosDelta: number | null;
  lowStock: boolean;
  highStockLowSales: boolean;
  salesUp: boolean;
}): BusinessDiagnosisScenario {
  if (opts.lowStock && (opts.salesUp || (opts.revenueDelta ?? 0) > 5)) {
    return "high_sales_low_stock";
  }
  if (opts.highStockLowSales) return "low_sales_high_stock";
  if ((opts.acos != null && opts.acos > 0.4) || (opts.acosDelta ?? 0) > 10) {
    return "high_acos";
  }
  if (
    (opts.profitDelta ?? 0) < -5 ||
    ((opts.revenueDelta ?? 0) > 3 && (opts.profitDelta ?? 0) < 0)
  ) {
    return "profit_down";
  }
  if (
    opts.lowStock ||
    opts.highStockLowSales ||
    (opts.acosDelta ?? 0) > 5
  ) {
    return "mixed";
  }
  return "healthy";
}

function adsPolicy(opts: {
  lowStock: boolean;
  highProfit: boolean;
  highStock: boolean;
  scenario: BusinessDiagnosisScenario;
}): { mayIncreaseAds: boolean; reason: string } {
  if (opts.lowStock || opts.scenario === "high_sales_low_stock") {
    return {
      mayIncreaseAds: false,
      reason: "库存不足：业务规则禁止建议扩大广告。",
    };
  }
  if (opts.scenario === "high_acos") {
    return {
      mayIncreaseAds: false,
      reason: "广告成本比偏高：先优化低效词与承接，不宜加投。",
    };
  }
  if (opts.highStock && opts.highProfit) {
    return {
      mayIncreaseAds: true,
      reason: "库存相对充足且利润健康：可谨慎建议增加广告（仍需人工确认）。",
    };
  }
  if (opts.scenario === "low_sales_high_stock") {
    return {
      mayIncreaseAds: false,
      reason:
        "高库存低销售：优先 促销 / 商品页 / 内容，而非盲目加投。",
    };
  }
  return {
    mayIncreaseAds: false,
    reason: "默认不鼓励加投；先完成利润与库存复核。",
  };
}

export async function runFinancialInventoryIntelligence(
  input: FinancialInventoryInput
): Promise<FinancialInventoryResult> {
  const mode = input.mode || "joint";
  const depth = input.depth === "deep" ? "deep" : "baseline";
  const billing =
    mode === "inventory" ? BILLING_INVENTORY : BILLING_FINANCIAL;

  let account: import("@/modules/account/types").CreditsAccountContext = {
    accountId: "demo_baseline",
    userId: null,
    isGuest: true,
  };
  let gate: {
    ok: true;
    jobId: string;
    estimatedCredits: number | null;
  } = {
    ok: true,
    jobId: `baseline_fin_${Date.now()}`,
    estimatedCredits: null,
  };

  if (depth === "deep") {
    const { resolveCreditsAccount } = await import(
      "@/modules/account/credits/account"
    );
    const { gateAiUsage } = await import(
      "@/modules/account/credits/usage-guard"
    );
    account = await resolveCreditsAccount();
    const gated = await gateAiUsage({
      account,
      capability: billing,
      confirm: Boolean(input.confirm),
      jobId: input.jobId,
    });

    if (!gated.ok) {
      const code =
        gated.code === "confirm_required" ||
        gated.code === "login_required" ||
        gated.code === "insufficient_credits"
          ? gated.code
          : ("invalid_input" as const);
      return {
        ok: false,
        code,
        message: gated.message,
        estimate: gated.estimate
          ? {
              available: gated.estimate.available,
              estimatedCredits: gated.estimate.estimatedCredits ?? null,
              message: gated.estimate.message,
            }
          : undefined,
        jobId: gated.jobId,
      };
    }
    gate = {
      ok: true,
      jobId: gated.jobId,
      estimatedCredits: gated.estimatedCredits,
    };
  }

  try {
    const {
      getProfitBreakdown,
      getInventoryView,
      getAdsDiagnosis,
      getStoreOverview,
      getDemoStoreMeta,
    } = await import("@/modules/commerce/amazon/service");

    const range = input.range || "7";
    const [profit, inventory, ads, overview, store] = await Promise.all([
      getProfitBreakdown(range),
      getInventoryView(),
      getAdsDiagnosis(range),
      getStoreOverview(range),
      getDemoStoreMeta(),
    ]);

    const baseCurrency = (store.currency || "USD").toUpperCase() as SupportedCurrency;
    const displayCurrency = (input.displayCurrency ||
      baseCurrency) as SupportedCurrency;
    const fx = resolveFx(
      ["USD", "EUR", "GBP", "CNY"].includes(baseCurrency)
        ? baseCurrency
        : "USD",
      displayCurrency
    );

    const shipping = profit.logistics + profit.fba;
    const otherCost = profit.refund;
    const previousProfit = profit.previousEstimatedProfit;
    const previousRevenue =
      overview.totals.sales.previous ?? null;
    const revenueDelta =
      profit.revenue && previousRevenue != null
        ? pctDelta(profit.revenue, previousRevenue)
        : overview.totals.sales.deltaPct;
    const profitDelta = profit.deltaPct;

    const financial: FinancialSnapshot = {
      currency: ["USD", "EUR", "GBP", "CNY"].includes(baseCurrency)
        ? baseCurrency
        : "USD",
      displayCurrency,
      fxStatus: fx.fxStatus,
      fxNote: fx.fxNote,
      revenue: profit.revenue,
      cogs: profit.cogs,
      platformFee: profit.platformFee,
      adSpend: profit.adSpend,
      shipping,
      otherCost,
      profit: profit.estimatedProfit,
      previousRevenue,
      previousProfit,
      revenueDeltaPct: revenueDelta,
      profitDeltaPct: profitDelta,
    };

    const leadTime =
      input.leadTimeDays != null && Number.isFinite(input.leadTimeDays)
        ? input.leadTimeDays
        : 21; // Estimated default lead time — labeled in notes

    const inventoryRisks = buildInventoryRisks(inventory.rows, leadTime);
    const lowStock = inventoryRisks.some(
      (r) => r.risk === "high" || (r.daysOfInventory != null && r.daysOfInventory < 14)
    );
    const highStockLowSales = inventoryRisks.some(
      (r) =>
        r.stock > 200 &&
        r.salesVelocity < 2 &&
        (r.daysOfInventory == null || r.daysOfInventory > 60)
    );
    const highStock = inventoryRisks.some(
      (r) => r.daysOfInventory != null && r.daysOfInventory > 45 && r.risk === "low"
    );
    const highProfit =
      financial.profit > 0 && (financial.profitDeltaPct == null || financial.profitDeltaPct > -5);

    const acos = ads.overview.acos.current;
    const acosDelta = ads.overview.acos.deltaPct;
    const salesUp = (overview.totals.orders.deltaPct ?? 0) > 5;

    const businessScenario = classifyScenario({
      revenueDelta: financial.revenueDeltaPct,
      profitDelta: financial.profitDeltaPct,
      acos,
      acosDelta,
      lowStock,
      highStockLowSales,
      salesUp,
    });

    const adsRecommendation = adsPolicy({
      lowStock,
      highProfit,
      highStock,
      scenario: businessScenario,
    });

    // Cost drivers when profit down / revenue up
    const costShare = [
      { name: "广告花费", value: financial.adSpend },
      { name: "COGS", value: financial.cogs },
      { name: "Platform Fee", value: financial.platformFee },
      { name: "Shipping (FBA+物流)", value: financial.shipping },
      { name: "Other (退款等)", value: financial.otherCost },
    ].sort((a, b) => b.value - a.value);

    let headline: string;
    if (
      (financial.revenueDeltaPct ?? 0) > 3 &&
      (financial.profitDeltaPct ?? 0) < 0
    ) {
      headline = `Revenue ↑（${fmtPct(financial.revenueDeltaPct)}）但 Profit ↓（${fmtPct(financial.profitDeltaPct)}）。`;
    } else if (businessScenario === "high_sales_low_stock") {
      headline = "高销量 / 低库存：存在断货风险，不宜加投。";
    } else if (businessScenario === "low_sales_high_stock") {
      headline = "低销量 / 高库存：需促销、商品页 与内容拉动。";
    } else if (businessScenario === "high_acos") {
      headline = `广告成本比承压（${(acos * 100).toFixed(1)}%，Δ ${fmtPct(acosDelta)}）。`;
    } else if (businessScenario === "profit_down") {
      headline = `预计利润下降 ${fmtPct(financial.profitDeltaPct)}。`;
    } else {
      headline = "利润与库存整体相对平稳，仍建议核对成本结构。";
    }

    const evidence = [
      `Revenue ${financial.revenue.toFixed(2)}（${fmtPct(financial.revenueDeltaPct)}）· 演示数据`,
      `Profit ${financial.profit.toFixed(2)}（${fmtPct(financial.profitDeltaPct)}）`,
      `广告花费 ${financial.adSpend.toFixed(2)} · COGS ${financial.cogs.toFixed(2)} · Platform Fee ${financial.platformFee.toFixed(2)} · Shipping ${financial.shipping.toFixed(2)}`,
      `广告成本比 ${(acos * 100).toFixed(1)}%（${fmtPct(acosDelta)}）`,
      `库存高风险 SKU：${inventoryRisks.filter((r) => r.risk === "high").length}`,
      `Lead Time：${leadTime} 天（Estimated，非承运商实时）`,
      `FX：${financial.fxStatus} — ${financial.fxNote}`,
      `成本占比 Top：${costShare
        .slice(0, 3)
        .map((c) => `${c.name} ${c.value.toFixed(0)}`)
        .join(" / ")}`,
    ];

    let diagnosis = headline;
    let opportunity =
      businessScenario === "low_sales_high_stock"
        ? "通过促销与内容消耗库存，避免资金占用。"
        : businessScenario === "high_sales_low_stock"
          ? "补货优先，保护销量与评分。"
          : "优化广告与成本结构以改善利润质量。";
    let recommendation = adsRecommendation.mayIncreaseAds
      ? "在库存充足前提下，可小幅测试加投高转化词；同步监控广告成本比。"
      : businessScenario === "low_sales_high_stock"
        ? "建议：促销 · 商品页优化 · 内容创作；暂缓扩大广告。"
        : lowStock
          ? "先补货 / 控制在途；禁止建议扩大广告。"
          : businessScenario === "high_acos"
            ? "收紧低效词，改善 商品页承接，再谈扩量。"
            : "复核 Ad / COGS / Shipping / Platform Fee 占比后制定下一步。";

    // Mode-specific focus
    if (mode === "financial") {
      opportunity = `成本结构洞察：优先关注 ${costShare[0]?.name || "广告"}。`;
    }
    if (mode === "inventory") {
      const top = inventoryRisks.find((r) => r.risk === "high") || inventoryRisks[0];
      diagnosis = top
        ? `Inventory Risk：${top.title} — ${top.riskLabel}（覆盖 ${top.daysOfInventory?.toFixed(1) ?? "—"} 天）`
        : diagnosis;
      recommendation = top?.recommendation || recommendation;
    }

    bootstrapAIProviders();
    let aiAssisted = false;
    if (depth === "deep" && AIGateway.isAvailable("generateText")) {
      const prompt = `${
        applyCommerceSkills({
          capabilityKey:
            mode === "inventory"
              ? "inventory_intelligence"
              : "financial_analysis",
          platform: "Amazon",
          task:
            mode === "inventory" ? "inventory_analysis" : "profit_analysis",
        }).promptBlock
      }\n你是跨境电商经营顾问（非财务审计）。仅基于 DEMO 指标输出诊断。
硬规则：${adsRecommendation.mayIncreaseAds ? "可谨慎建议加投" : "禁止建议扩大广告"}。
不得伪造汇率。Scenario=${businessScenario}

Headline: ${headline}
Evidence:
${evidence.join("\n")}
Ads policy: ${adsRecommendation.reason}

输出 JSON：
{
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": "必须提及 演示数据 / 非财务审计"
}`;
      try {
        const gen = await AIGateway.generateText(
          { prompt, maxTokens: 900 },
          {
            accountId: account.accountId,
            jobId: gate.jobId,
            billingCapability: billing,
            referenceType:
              mode === "inventory"
                ? "inventory_intelligence"
                : "financial_analysis",
            quality: "balanced",
          }
        );
        const parsed = extractJsonObject(gen.text || "");
        if (parsed) {
          aiAssisted = true;
          diagnosis = String(parsed.diagnosis || diagnosis).slice(0, 600);
          opportunity = String(parsed.opportunity || opportunity).slice(0, 500);
          let rec = String(parsed.recommendation || recommendation).slice(
            0,
            500
          );
          if (
            !adsRecommendation.mayIncreaseAds &&
            /增加广告|加投|提高预算|扩大投放|increase\s*ads/i.test(rec)
          ) {
            rec = `${rec.replace(
              /建议[^。；;]*?(增加广告|加投|提高预算|扩大投放)[^。；;]*/gi,
              "暂缓加投"
            )}｜${adsRecommendation.reason}`;
          }
          recommendation = rec;
        }
      } catch (err) {
        console.error("[financial-inventory] AI failed", err);
      }
    }

    const searchHref = commerceSearchHref(
      businessScenario === "low_sales_high_stock"
        ? "Amazon inventory clearance promotion listing optimization"
        : "Amazon FBA profit 广告成本比 inventory days of cover"
    );
    const createHref = commerceCreateHref({
      goal:
        businessScenario === "low_sales_high_stock"
          ? "为高库存低销售商品写促销与种草内容"
          : "根据利润与库存诊断写经营简报与 商品页优化建议",
      context: buildCommerceCreateContext(
        await withStoreCreateFields("Amazon", {
          source: "amazon_diagnosis",
          platform: "Amazon",
          productTitle: "Financial & Inventory Intelligence",
          conclusion: diagnosis,
          evidence: evidence.slice(0, 8),
          suggestion: recommendation,
          adsNotes: [
            adsRecommendation.reason,
            `mayIncreaseAds=${adsRecommendation.mayIncreaseAds}`,
          ],
        })
      ),
      platform: "Amazon",
    });

    try {
      if (depth === "deep") {
        const { createWorkspace, listWorkspaces } = await import(
          "@/modules/workspace/services/workspace-service"
        );
        const { addContextItem } = await import(
          "@/modules/workspace/services/context-service"
        );
        let wsId = input.workspaceId?.trim() || "";
        if (!wsId) {
          const list = await listWorkspaces();
          const hit = list.find(
            (w) =>
              w.status === "active" &&
              (w.name.includes("利润") ||
                w.name.includes("库存") ||
                w.name.includes("经营"))
          );
          if (hit) wsId = hit.id;
          else wsId = (await createWorkspace("经营诊断", headline)).id;
        }
        await addContextItem(wsId, {
          kind: "commerce_diagnosis",
          title: `Finance/Inventory · ${mode}`,
          summary: diagnosis.slice(0, 160),
          payload: {
            type: "financial_inventory_intelligence",
            mode,
            financial,
            inventoryRisks,
            businessScenario,
            adsRecommendation,
          },
          includedInContext: true,
        });
      }
    } catch (err) {
      console.error("[financial-inventory] workspace attach failed", err);
    }

    const insight: CommerceCapabilityInsight = {
      situation: `Amazon · ${mode} · 演示数据 · ${financial.currency}${
        depth === "baseline" ? " · 今日基线分析" : " · 深度分析"
      }`,
      evidence,
      diagnosis,
      opportunity,
      recommendation,
      actions: [
        { label: "搜索经营优化方法", kind: "search", href: searchHref },
        { label: "生成内容 / 促销文案", kind: "create", href: createHref },
        {
          label: "广告诊断",
          kind: "link",
          href: "/commerce/amazon/ads",
        },
        {
          label: "商品页 / 商品",
          kind: "link",
          href: "/commerce/amazon/products",
        },
        {
          label: mode === "inventory" ? "查看利润" : "查看库存",
          kind: "link",
          href:
            mode === "inventory"
              ? "/commerce/amazon/profit"
              : "/commerce/amazon/inventory",
        },
      ],
      dataNotice:
        depth === "baseline"
          ? "演示数据 · 今日基线智能分析（规则引擎，打开即就绪）。点击「运行深度分析」可进一步 AI 深化；也可在 AI 工作台对话改写。"
          : "演示数据 — 演示店预计利润与库存，非财务审计 / 非实时 ERP。汇率无 API 时为 Rate Unavailable。",
      aiAssisted,
      createdAt: new Date().toISOString(),
    };

    return {
      ok: true,
      mode,
      insight,
      financial: mode === "inventory" ? financial : financial,
      inventoryRisks,
      businessScenario,
      adsRecommendation,
      adsHref: "/commerce/amazon/ads",
      listingHref: "/commerce/amazon/products",
      dataLabel: "演示数据",
      analysisDepth: depth,
      jobId: gate.jobId,
      estimatedCredits: gate.estimatedCredits,
      ...(await (async () => {
        const { buildWorkflowBundle, buildWorkflowContext } = await import(
          "@/modules/commerce/workflow"
        );
        const { applyCommerceSkills: applySkills } = await import(
          "@/modules/commerce/skills"
        );
        const applied = applySkills({
          capabilityKey:
            mode === "inventory"
              ? "inventory_intelligence"
              : "financial_analysis",
          platform: "Amazon",
          task:
            mode === "inventory" ? "inventory_analysis" : "profit_analysis",
        }).appliedKnowledge;
        const wf = buildWorkflowBundle({
          scenario: "inventory_risk",
          ctx: buildWorkflowContext({
            stage: mode === "inventory" ? "inventory" : "financial",
            platform: "Amazon",
            marketplace: "Amazon US",
            productTitle: "Business Diagnosis",
            evidence: insight.evidence,
            diagnosis: insight.diagnosis,
            opportunity: insight.opportunity,
            contentGoal: "根据利润与库存诊断写经营简报与促销内容",
            source: mode === "inventory" ? "inventory" : "financial",
          }),
        });
        return {
          appliedKnowledge: applied,
          workflowActions: wf.workflowActions,
          chainLabel: wf.chainLabel,
          createHref: wf.createHref,
          searchHref: wf.searchHref,
        };
      })()),
    };
  } catch (err) {
    console.error("[financial-inventory] data load failed", err);
    return {
      ok: false,
      code: "data_unavailable",
      message: "利润 / 库存数据暂时不可用（数据暂缺）",
      jobId: gate.jobId,
    };
  }
}
