/**
 * Advertising Intelligence (V4.5-C).
 *
 * Data (DEMO / real connector later) → Diagnosis → Recommendation → Action.
 * Inventory insufficient → never recommend increasing ads.
 * Keyword classes from ad search-term evidence — no fake volumes.
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
  AdKeywordInsight,
  AdvertisingAnalysisInput,
  AdvertisingAnalysisResult,
  InventoryAdConstraint,
} from "@/modules/commerce/capability/advertising-types";
import type { CommerceCapabilityInsight } from "@/modules/commerce/capability/listing-types";

const BILLING = "advertising_analysis";

function pctDelta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function fmtPct(n: number | null, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "数据暂缺";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
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

function classifyAmazonTerms(
  terms: Array<{
    term: string;
    spend: number;
    orders: number;
    acos: number | null;
  }>
): AdKeywordInsight[] {
  const sorted = [...terms].sort((a, b) => b.spend - a.spend);
  const out: AdKeywordInsight[] = [];

  for (const t of sorted.slice(0, 25)) {
    if (t.spend <= 0 && t.orders <= 0) continue;

    let classification: AdKeywordInsight["classification"] = "low_value";
    let evidence = "";

    if (t.spend > 20 && t.orders === 0) {
      classification = "potential_negative";
      evidence = `花费 $${t.spend.toFixed(2)}，订单 0`;
    } else if (t.spend > 30 && (t.acos ?? 1) > 0.55) {
      classification = "high_spend";
      evidence = `高花费 $${t.spend.toFixed(2)}，广告成本比 ${
        t.acos == null ? "—" : `${(t.acos * 100).toFixed(1)}%`
      }`;
    } else if (t.spend > 15 && t.orders > 0 && (t.acos ?? 1) > 0.45) {
      classification = "low_conversion";
      evidence = `花费 $${t.spend.toFixed(2)}，订单 ${t.orders}，效率偏低`;
    } else if (t.orders >= 2 && (t.acos ?? 1) <= 0.35) {
      classification = "high_value";
      evidence = `订单 ${t.orders}，广告成本比 ${
        t.acos == null ? "—" : `${(t.acos * 100).toFixed(1)}%`
      }`;
    } else {
      classification = "low_value";
      evidence = `花费 $${t.spend.toFixed(2)}，订单 ${t.orders}`;
    }

    out.push({
      term: t.term,
      classification,
      spend: t.spend,
      orders: t.orders,
      acos: t.acos,
      evidence,
      source: "演示数据",
    });
  }

  return out;
}

function sanitizeRecommendation(
  text: string,
  inventoryBlocked: boolean
): string {
  if (!inventoryBlocked) return text;
  const blocked =
    /增加广告|加投|提高预算|提高出价|加大投放|scale\s*up|increase\s*(ads|budget|spend)/i.test(
      text
    );
  if (!blocked) return text;
  return `${text.replace(
    /建议[^。；;]*?(增加广告|加投|提高预算|提高出价|加大投放)[^。；;]*/gi,
    "库存不足，暂缓加投"
  )}｜库存约束：不得建议增加广告。`;
}

async function analyzeAmazon(range?: string): Promise<{
  headline: string;
  insight: Omit<CommerceCapabilityInsight, "actions" | "createdAt">;
  keywords: AdKeywordInsight[];
  inventoryConstraints: InventoryAdConstraint[];
  metricsSummary: string[];
  dataLabel: "演示数据";
}> {
  const { getAdsDiagnosis, getInventoryView, getStoreOverview } = await import(
    "@/modules/commerce/amazon/service"
  );

  const ads = await getAdsDiagnosis(range);
  const inventory = await getInventoryView();
  let sessionsDelta: number | null = null;
  let cvrDelta: number | null = null;
  let aovDelta: number | null = null;
  let salesDelta: number | null = null;

  try {
    const overview = await getStoreOverview(range);
    sessionsDelta = overview.totals.sessions.deltaPct;
    cvrDelta = overview.totals.cvr.deltaPct;
    aovDelta = overview.totals.aov.deltaPct;
    salesDelta = overview.totals.sales.deltaPct;
  } catch {
    /* optional enrich */
  }

  const spend = ads.overview.spend;
  const orders = ads.overview.orders;
  const adSales = ads.overview.sales;
  const acos = ads.overview.acos;
  const roas = ads.overview.roas;

  const spendDelta = spend.deltaPct;
  const ordersDelta = orders.deltaPct;

  const inventoryConstraints: InventoryAdConstraint[] = inventory.rows.map(
    (r) => ({
      productId: r.productId,
      title: r.title,
      risk: r.risk,
      riskLabel: r.riskLabel,
      daysOfCover: r.daysOfCover,
      blockIncreaseAds: r.risk === "high" || (r.daysOfCover != null && r.daysOfCover < 14),
    })
  );
  const inventoryBlocked = inventoryConstraints.some((c) => c.blockIncreaseAds);
  const lowStockTitles = inventoryConstraints
    .filter((c) => c.blockIncreaseAds)
    .map((c) => c.title)
    .slice(0, 3);

  const keywords = classifyAmazonTerms(ads.searchTerms);
  const negatives = keywords.filter((k) => k.classification === "potential_negative");
  const highValue = keywords.filter((k) => k.classification === "high_value");

  const metricsSummary = [
    `广告花费 ${spend.current.toFixed(2)}（${fmtPct(spendDelta)}）· 演示数据`,
    `Ad Sales ${adSales.current.toFixed(2)}（${fmtPct(adSales.deltaPct)}）`,
    `Orders ${orders.current.toFixed(0)}（${fmtPct(ordersDelta)}）`,
    `广告成本比 ${(acos.current * 100).toFixed(1)}%（${fmtPct(acos.deltaPct)}）`,
    `广告回报 ${roas.current.toFixed(2)}x（${fmtPct(roas.deltaPct)}）`,
    sessionsDelta != null
      ? `Sessions Δ ${fmtPct(sessionsDelta)}（店铺概览 DEMO）`
      : "访问量 · 数据暂缺（本页未绑店铺会话时可忽略）",
    cvrDelta != null ? `转化率 Δ ${fmtPct(cvrDelta)}` : "转化率 · 见商品诊断",
    aovDelta != null ? `AOV Δ ${fmtPct(aovDelta)}` : "AOV · 见店铺概览",
    salesDelta != null ? `Store Sales Δ ${fmtPct(salesDelta)}` : null,
  ].filter(Boolean) as string[];

  let headline: string;
  if (
    spendDelta != null &&
    ordersDelta != null &&
    spendDelta > 5 &&
    ordersDelta < spendDelta / 2
  ) {
    headline = `广告支出增加 ${spendDelta.toFixed(0)}%，但订单仅增长 ${ordersDelta.toFixed(0)}%。`;
  } else if ((acos.deltaPct ?? 0) > 8) {
    headline = `广告成本比走高 ${fmtPct(acos.deltaPct)}，广告效率承压。`;
  } else if (negatives.length > 0) {
    headline = `发现 ${negatives.length} 个高花费零订单搜索词，优先排查否定与承接。`;
  } else {
    headline = "本期广告效率相对平稳，仍建议核对高花费词与库存覆盖。";
  }

  const evidence = [
    ...metricsSummary.slice(0, 6),
    negatives[0]
      ? `低效词示例：${negatives[0].term}（${negatives[0].evidence}）`
      : null,
    highValue[0]
      ? `高价值词示例：${highValue[0].term}（${highValue[0].evidence}）`
      : null,
    inventoryBlocked
      ? `库存约束：${lowStockTitles.join("；") || "存在覆盖不足商品"} — 不得建议加投`
      : "库存：未发现强制阻断加投的高风险覆盖（仍请人工复核）",
  ].filter(Boolean) as string[];

  let diagnosis = headline;
  if (negatives.length) {
    diagnosis += ` 另有 ${negatives.length} 个 建议否定 搜索词。`;
  }

  const opportunity = highValue.length
    ? `可把预算重心挪向高价值词（如「${highValue[0].term}」），并同步优化商品页承接。`
    : "通过搜索竞品词与 商品页优化提升点击后转化，再谈扩量。";

  let recommendation = inventoryBlocked
    ? `优先处理库存覆盖不足（${lowStockTitles[0] || "相关商品"}），暂停加投建议；先否定低效词、优化商品页。`
    : negatives.length
      ? "先否定 / 收紧高花费零转化词，再观察广告成本比 与订单是否改善。"
      : "保持观察；对高花费词做人工复核，并准备 商品页承接内容。";

  recommendation = sanitizeRecommendation(recommendation, inventoryBlocked);

  return {
    headline,
    insight: {
      situation: `Amazon Ads · 演示数据 · ${ads.period.currentStart}–${ads.period.currentEnd}`,
      evidence,
      diagnosis,
      opportunity,
      recommendation,
      dataNotice:
        "演示数据 — 演示店广告聚合。非 Amazon Ads API 实时账号。库存不足时禁止加投建议。",
      aiAssisted: false,
    },
    keywords,
    inventoryConstraints,
    metricsSummary,
    dataLabel: "演示数据",
  };
}

async function analyzeTikTok(range?: string): Promise<{
  headline: string;
  insight: Omit<CommerceCapabilityInsight, "actions" | "createdAt">;
  keywords: AdKeywordInsight[];
  inventoryConstraints: InventoryAdConstraint[];
  metricsSummary: string[];
  dataLabel: "演示数据";
}> {
  const { getTikTokContentView, getTikTokOverview } = await import(
    "@/modules/commerce/tiktok/service"
  );

  const content = await getTikTokContentView(range);
  let gmvDelta: number | null = null;
  let ordersDelta: number | null = null;
  let exposureDelta: number | null = null;
  let cvrDelta: number | null = null;

  try {
    const overview = await getTikTokOverview(range);
    gmvDelta = overview.totals.gmv.deltaPct;
    ordersDelta = overview.totals.orders.deltaPct;
    exposureDelta = overview.totals.exposure.deltaPct;
    cvrDelta = overview.totals.cvr.deltaPct;
  } catch {
    /* optional */
  }

  const videos = content.videos ?? [];
  const views = videos.reduce((s, v) => s + (v.views || 0), 0);
  const clicks = videos.reduce((s, v) => s + (v.productClicks || 0), 0);
  const orders = videos.reduce((s, v) => s + (v.orders || 0), 0);
  const gmv = videos.reduce((s, v) => s + (v.gmv || 0), 0);
  const ctr = views > 0 ? clicks / views : null;
  const cvr = clicks > 0 ? orders / clicks : null;

  const metricsSummary = [
    `Views ${views.toFixed(0)} · 演示数据（内容归因）`,
    `Clicks ${clicks.toFixed(0)}`,
    `点击率 ${ctr == null ? "数据暂缺" : `${(ctr * 100).toFixed(2)}%`}`,
    `转化率 ${cvr == null ? "数据暂缺" : `${(cvr * 100).toFixed(2)}%`}`,
    `Orders ${orders.toFixed(0)}${ordersDelta != null ? `（店铺 Δ ${fmtPct(ordersDelta)}）` : ""}`,
    `成交额 ${gmv.toFixed(2)}${gmvDelta != null ? `（店铺 Δ ${fmtPct(gmvDelta)}）` : ""}`,
    "广告花费 · 数据暂缺（演示店未接 TikTok Ads API）",
    exposureDelta != null ? `Exposure Δ ${fmtPct(exposureDelta)}` : null,
    cvrDelta != null ? `店铺转化率 Δ ${fmtPct(cvrDelta)}` : null,
  ].filter(Boolean) as string[];

  // Content titles as weak "keyword" proxies — labeled honestly
  const keywords: AdKeywordInsight[] = videos.slice(0, 8).map((v) => {
    const spendProxy = null;
    let classification: AdKeywordInsight["classification"] = "low_value";
    if ((v.orders || 0) >= 3 && (v.cvr || 0) > 0.02) {
      classification = "high_value";
    } else if ((v.views || 0) > 5000 && (v.orders || 0) === 0) {
      classification = "low_conversion";
    } else if ((v.views || 0) > 8000 && (v.cvr || 0) < 0.01) {
      classification = "high_spend";
    }
    return {
      term: v.title || v.id,
      classification,
      spend: spendProxy,
      orders: v.orders ?? null,
      acos: null,
      evidence: `播放 ${v.views ?? 0} · 点击 ${v.productClicks ?? 0} · 订单 ${v.orders ?? 0}`,
      source: "演示数据",
    };
  });

  let headline: string;
  if (
    exposureDelta != null &&
    ordersDelta != null &&
    exposureDelta > 8 &&
    ordersDelta < exposureDelta / 2
  ) {
    headline = `曝光增加 ${exposureDelta.toFixed(0)}%，但订单仅增长 ${ordersDelta.toFixed(0)}%（内容侧 DEMO）。`;
  } else if (ctr != null && ctr < 0.02) {
    headline = `内容 点击率 约 ${(ctr * 100).toFixed(2)}%，点击承接偏弱。`;
  } else {
    headline =
      "TikTok 侧以内容归因指标诊断投放效率；正式广告花费 数据暂缺。";
  }

  const evidence = [...metricsSummary.slice(0, 7)];
  const diagnosis = `${headline} 广告花费 无真实连接，不推断付费广告 ROI。`;
  const opportunity =
    "复制高转化率 内容主题，并用搜索验证竞品脚本；勿在缺少库存/供给时盲目加投。";
  const recommendation =
    "先优化高播放低转化内容的承接与卖点；付费加投需待 Ads 连接与库存确认。";

  return {
    headline,
    insight: {
      situation: "TikTok Shop · 内容投放视角 · 演示数据",
      evidence,
      diagnosis,
      opportunity,
      recommendation,
      dataNotice:
        "演示数据（内容/店铺）· 广告花费 = 数据暂缺。非 TikTok Ads 实时账号。",
      aiAssisted: false,
    },
    keywords,
    inventoryConstraints: [],
    metricsSummary,
    dataLabel: "演示数据",
  };
}

export async function runAdvertisingAnalysis(
  input: AdvertisingAnalysisInput
): Promise<AdvertisingAnalysisResult> {
  const depth = input.depth === "deep" ? "deep" : "baseline";

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
    jobId: `baseline_ads_${Date.now()}`,
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
      capability: BILLING,
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

  let base: Awaited<ReturnType<typeof analyzeAmazon>>;
  try {
    base =
      input.channel === "tiktok"
        ? await analyzeTikTok(input.range)
        : await analyzeAmazon(input.range);
  } catch (err) {
    console.error("[advertising-analysis] data load failed", err);
    return {
      ok: false,
      code: "data_unavailable",
      message: "广告数据暂时不可用（数据暂缺）",
      jobId: gate.jobId,
    };
  }

  const inventoryBlocked = base.inventoryConstraints.some(
    (c) => c.blockIncreaseAds
  );

  bootstrapAIProviders();
  let aiAssisted = false;

  if (depth === "deep" && AIGateway.isAvailable("generateText")) {
    const { appliedKnowledge: _ak, promptBlock: skillsBlock } =
      applyCommerceSkills({
        capabilityKey: "advertising_analysis",
        platform: input.channel === "tiktok" ? "TikTok Shop" : "Amazon",
        task: "advertising_analysis",
      });
    const prompt = `${skillsBlock ? `${skillsBlock}\n` : ""}你是跨境广告诊断顾问。只能基于下方 DEMO/已知指标说话，禁止编造未给出的花费、ROAS、搜索量。
${inventoryBlocked ? "硬约束：库存不足，禁止建议增加广告/加投/提高预算。" : ""}
渠道：${input.channel}
Headline: ${base.headline}
Evidence:
${base.insight.evidence.join("\n")}
Keywords sample:
${base.keywords
  .slice(0, 8)
  .map((k) => `${k.classification}: ${k.term} — ${k.evidence}`)
  .join("\n")}

输出 JSON：
{
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": "必须提及 演示数据 或 数据暂缺"
}`;

    try {
      const gen = await AIGateway.generateText(
        { prompt, maxTokens: 900 },
        {
          accountId: account.accountId,
          jobId: gate.jobId,
          billingCapability: BILLING,
          referenceType: "advertising_analysis",
          quality: "balanced",
        }
      );
      const parsed = extractJsonObject(gen.text || "");
      if (parsed) {
        aiAssisted = true;
        base.insight.diagnosis = String(
          parsed.diagnosis || base.insight.diagnosis
        ).slice(0, 600);
        base.insight.opportunity = String(
          parsed.opportunity || base.insight.opportunity
        ).slice(0, 500);
        base.insight.recommendation = sanitizeRecommendation(
          String(parsed.recommendation || base.insight.recommendation).slice(
            0,
            500
          ),
          inventoryBlocked
        );
        base.insight.dataNotice = String(
          parsed.dataNotice || base.insight.dataNotice
        ).slice(0, 400);
      }
    } catch (err) {
      console.error("[advertising-analysis] AI enrich failed", err);
    }
  }

  if (depth === "baseline") {
    base.insight.situation = `${base.insight.situation} · 今日基线分析`;
    base.insight.dataNotice =
      "演示数据 · 今日基线智能分析（规则引擎，打开即就绪）。点击「运行深度分析」可进一步 AI 深化；也可在 AI 工作台对话改写。";
  }

  const searchHref = commerceSearchHref(
    input.channel === "tiktok"
      ? "TikTok Shop 内容投放 点击率 转化率 优化 竞品"
      : "亚马逊广告 广告成本比 低效词 否定 竞品"
  );

  const adPlatform =
    input.channel === "tiktok" ? ("TikTok Shop" as const) : ("Amazon" as const);

  const createHref = commerceCreateHref({
    goal:
      input.channel === "tiktok"
        ? "根据广告/内容诊断写种草脚本与卖点承接"
        : "根据广告诊断写商品页承接与购买理由",
    context: buildCommerceCreateContext(
      await withStoreCreateFields(adPlatform, {
        source:
          input.channel === "tiktok" ? "tiktok_diagnosis" : "amazon_diagnosis",
        platform: adPlatform,
        productTitle: "Advertising Intelligence",
        conclusion: base.insight.diagnosis,
        evidence: base.insight.evidence.slice(0, 8),
        suggestion: base.insight.recommendation,
        adsNotes: [
          base.headline,
          ...base.keywords
            .filter((k) => k.classification === "potential_negative")
            .slice(0, 3)
            .map((k) => `Negative候选：${k.term}`),
          inventoryBlocked ? "库存不足：禁止加投" : "",
        ].filter(Boolean),
      })
    ),
    platform: adPlatform,
  });

  let researchHref: string | null = null;
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
            (w.name.includes("广告") || w.name.includes("Ads"))
        );
        if (hit) wsId = hit.id;
        else wsId = (await createWorkspace("广告诊断", base.headline)).id;
      }
      await addContextItem(wsId, {
        kind: "commerce_diagnosis",
        title: `Ads · ${input.channel}`,
        summary: base.insight.diagnosis.slice(0, 160),
        payload: {
          type: "advertising_analysis",
          headline: base.headline,
          keywords: base.keywords,
          inventoryConstraints: base.inventoryConstraints,
          insight: base.insight,
        },
        includedInContext: true,
      });
      researchHref = `/workspace/${wsId}/research?goal=${encodeURIComponent(
        `${input.channel} advertising efficiency ${base.headline}`
      )}`;
    }
  } catch (err) {
    console.error("[advertising-analysis] workspace attach failed", err);
  }

  const { appliedKnowledge } = applyCommerceSkills({
    capabilityKey: "advertising_analysis",
    platform: input.channel === "tiktok" ? "TikTok Shop" : "Amazon",
    task: "advertising_analysis",
  });

  const { buildWorkflowBundle, buildWorkflowContext } = await import(
    "@/modules/commerce/workflow"
  );
  const platform =
    input.channel === "tiktok" ? ("TikTok Shop" as const) : ("Amazon" as const);
  const wf = buildWorkflowBundle({
    scenario: "ads_anomaly",
    ctx: buildWorkflowContext({
      stage: "advertising",
      platform,
      marketplace: platform === "TikTok Shop" ? "TikTok US" : "Amazon US",
      productTitle: "Advertising Intelligence",
      evidence: base.insight.evidence,
      diagnosis: base.insight.diagnosis || base.headline,
      opportunity: base.insight.opportunity,
      contentGoal:
        platform === "TikTok Shop"
          ? "根据广告/内容诊断写种草脚本与卖点承接"
          : "根据广告诊断写商品页承接与购买理由",
      source: "advertising",
    }),
    researchHref,
  });

  const insight: CommerceCapabilityInsight = {
    ...base.insight,
    aiAssisted,
    createdAt: new Date().toISOString(),
    appliedKnowledge,
    actions: wf.workflowActions.map((a) => ({
      label: a.label,
      kind:
        a.kind === "create"
          ? ("create" as const)
          : a.kind === "search"
            ? ("search" as const)
            : a.kind === "research" || a.kind === "workspace"
              ? ("workspace" as const)
              : ("link" as const),
      href: a.href,
    })),
  };

  return {
    ok: true,
    insight,
    headline: base.headline,
    keywords: base.keywords,
    inventoryConstraints: base.inventoryConstraints,
    metricsSummary: base.metricsSummary,
    dataLabel: base.dataLabel,
    analysisDepth: depth,
    searchHref: wf.searchHref,
    researchHref: wf.researchHref,
    createHref: wf.createHref,
    jobId: gate.jobId,
    estimatedCredits: gate.estimatedCredits,
    appliedKnowledge,
    workflowActions: wf.workflowActions,
    chainLabel: wf.chainLabel,
  };
}
