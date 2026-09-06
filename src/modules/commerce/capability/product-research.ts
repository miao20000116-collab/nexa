/**
 * Product Research (V4.5-A) — AI 选品调研 Capability.
 *
 * Real Search evidence → selection_analysis AI → Product Opportunity
 * (+ optional profit from user costs, optional A/B/C compare)
 * → Search / Research / Workspace / Creation handoffs.
 *
 * Never invents market numbers, costs, or platform rules.
 */

import { getSearchOrchestrator } from "@/modules/search/services/search-orchestrator";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { withStoreCreateFields } from "@/modules/commerce/lib/with-store-create-fields";
import { applyCommerceSkills } from "@/modules/commerce/skills";
import {
  buildWorkflowBundle,
  buildWorkflowContext,
} from "@/modules/commerce/workflow";
import { computeProfitAnalysis } from "@/modules/commerce/capability/profit";
import type {
  ClaimWithEvidence,
  OpportunityRecommendation,
  ProductCompareResult,
  ProductCompareRow,
  ProductOpportunity,
  ProductResearchEvidence,
  ProductResearchInput,
  ProductResearchResult,
} from "@/modules/commerce/capability/types";

/** Bill as selection_analysis (Credits label: 选品调研) */
const CAPABILITY_KEY = "selection_analysis";

function pickMarketplace(raw?: string) {
  const t = (raw || "Amazon US").trim();
  return t || "Amazon US";
}

function inferCountry(marketplace: string, country?: string) {
  if (country?.trim()) return country.trim();
  if (marketplace.includes("UK")) return "UK";
  if (marketplace.includes("DE") || marketplace.includes("Germany")) return "DE";
  return "US";
}

function parseRecommendation(s: string): OpportunityRecommendation {
  const u = s.toUpperCase();
  if (u.includes("HIGH")) return "HIGH";
  if (u.includes("LOW")) return "LOW";
  if (u.includes("MEDIUM") || u.includes("MID")) return "MEDIUM";
  return "UNKNOWN";
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

function asStringList(v: unknown, max = 8): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean).slice(0, max);
  }
  if (typeof v === "string" && v.trim()) {
    return v
      .split(/[;；\n|]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max);
  }
  return [];
}

function sourceLabel(r: {
  source?: string;
  platform?: string | null;
  url: string;
}): string {
  if (r.source?.trim()) return r.source.trim();
  if (r.platform) return String(r.platform);
  try {
    return new URL(r.url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

async function searchEvidence(
  searchQuery: string
): Promise<ProductResearchEvidence[]> {
  const retrievedAt = new Date().toISOString();
  const orchestrator = getSearchOrchestrator();
  const response = await orchestrator.search(searchQuery, {
    includeOverview: false,
  });
  return (response.results ?? []).slice(0, 14).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    snippet: r.snippet ?? r.content?.slice(0, 280) ?? null,
    source: sourceLabel(r),
    timestamp: r.publishedAt || retrievedAt,
    platform: r.platform ?? null,
    sourceType: r.sourceType ?? null,
  }));
}

function emptyClaims(keys: string[]): ClaimWithEvidence[] {
  return keys.map((claim) => ({
    claim,
    status: "insufficient" as const,
    evidenceIndexes: [],
    note: "Insufficient Evidence",
  }));
}

function buildFallbackOpportunity(opts: {
  query: string;
  marketplace: string;
  country: string;
  category?: string | null;
  evidence: ProductResearchEvidence[];
  profit: ProductOpportunity["profit"];
  aiText?: string | null;
}): ProductOpportunity {
  const hasEvidence = opts.evidence.length > 0;
  const idx = hasEvidence ? opts.evidence.map((_, i) => i).slice(0, 3) : [];
  return {
    product: opts.query.slice(0, 80),
    marketplace: opts.marketplace,
    country: opts.country,
    category: opts.category || null,
    market: hasEvidence
      ? `基于 ${opts.evidence.length} 条公开检索结果做初步判断；细节需结合原链接核对。`
      : "Insufficient Evidence",
    marketOpportunity: hasEvidence
      ? `基于 ${opts.evidence.length} 条公开检索结果做初步判断；细节需结合原链接核对。`
      : "数据暂缺：未能检索到可用公开来源。",
    targetAudience: hasEvidence
      ? "需结合证据人工判断目标客群"
      : "Insufficient Evidence",
    priceRange: "Insufficient Evidence",
    competition: hasEvidence ? "需结合证据人工判断" : "Insufficient Evidence",
    competitionLevel: hasEvidence ? "需结合证据人工判断" : "数据暂缺",
    demandSignals: hasEvidence ? ["见 Evidence 列表"] : [],
    sellingPoints: hasEvidence ? ["请从证据中提炼卖点，勿编造"] : [],
    painPoints: [],
    estimatedMargin:
      opts.profit?.status === "complete" && opts.profit.grossMarginPct != null
        ? `用户成本毛利率约 ${opts.profit.grossMarginPct.toFixed(1)}%`
        : "Incomplete Data",
    potentialProfit:
      opts.profit?.status === "complete" && opts.profit.estimatedProfit != null
        ? `用户成本单位利润约 ${opts.profit.estimatedProfit.toFixed(2)}`
        : "Incomplete Data / 数据暂缺",
    mainRisks: [
      hasEvidence
        ? "公开网页证据有限，可能遗漏平台规则与侵权风险"
        : "缺少市场证据",
    ],
    risks: [
      hasEvidence
        ? "公开网页证据有限，可能遗漏平台规则与侵权风险"
        : "缺少市场证据",
    ],
    opportunity: hasEvidence
      ? "可继续搜索与深入研究后再决策"
      : "Insufficient Evidence — 暂无法判断机会",
    recommendation: hasEvidence ? "UNKNOWN" : "LOW",
    claims: emptyClaims([
      "市场需求",
      "竞争强度",
      "价格带",
      "利润空间",
      "用户需求",
      "合规/风险",
    ]).map((c, i) =>
      hasEvidence && i < 2
        ? {
            ...c,
            status: "backed" as const,
            evidenceIndexes: idx,
            note: "基于公开检索摘要，非平台官方数据",
          }
        : c
    ),
    profit: opts.profit,
    dataNotice: hasEvidence
      ? "基于公开市场证据（公开检索）。非平台官方数据。"
      : "数据暂缺 / 证据不足",
    evidence: opts.evidence,
    aiAssisted: Boolean(opts.aiText),
    createdAt: new Date().toISOString(),
  };
}

function mapParsedOpportunity(
  parsed: Record<string, unknown>,
  opts: {
    query: string;
    marketplace: string;
    country: string;
    category?: string | null;
    evidence: ProductResearchEvidence[];
    profit: ProductOpportunity["profit"];
  }
): ProductOpportunity {
  const evidence = opts.evidence;
  const maxIdx = Math.max(0, evidence.length - 1);

  const rawClaims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const claims: ClaimWithEvidence[] =
    rawClaims.length > 0
      ? rawClaims.slice(0, 8).map((c) => {
          const row = (c && typeof c === "object" ? c : {}) as Record<
            string,
            unknown
          >;
          const indexes = asStringList(row.evidenceIndexes ?? row.evidence, 6)
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n) && n >= 0 && n <= maxIdx);
          const statusRaw = String(row.status || "").toLowerCase();
          const insufficient =
            statusRaw.includes("insuff") ||
            indexes.length === 0 ||
            String(row.note || "")
              .toLowerCase()
              .includes("insuff");
          return {
            claim: String(row.claim || row.topic || "判断").slice(0, 120),
            status: insufficient ? ("insufficient" as const) : ("backed" as const),
            evidenceIndexes: insufficient ? [] : indexes.slice(0, 4),
            note: insufficient
              ? "Insufficient Evidence"
              : String(row.note || "").slice(0, 200) || undefined,
          };
        })
      : emptyClaims([
          "市场需求",
          "竞争强度",
          "价格带",
          "利润空间",
          "用户需求",
          "合规/风险",
        ]);

  const market = String(
    parsed.market || parsed.marketOpportunity || "Insufficient Evidence"
  ).slice(0, 800);
  const competition = String(
    parsed.competition || parsed.competitionLevel || "Insufficient Evidence"
  ).slice(0, 400);
  const risks = asStringList(parsed.risks ?? parsed.mainRisks);
  const profitNote =
    opts.profit?.status === "complete" && opts.profit.estimatedProfit != null
      ? `用户成本单位利润约 ${opts.profit.estimatedProfit.toFixed(2)}（非市场推断）`
      : String(parsed.estimatedMargin || parsed.potentialProfit || "Incomplete Data").slice(
          0,
          200
        );

  return {
    product: String(parsed.product || opts.query).slice(0, 120),
    marketplace: opts.marketplace,
    country: opts.country,
    category: opts.category || null,
    market,
    marketOpportunity: market,
    targetAudience: String(
      parsed.targetAudience || "Insufficient Evidence"
    ).slice(0, 400),
    priceRange: String(parsed.priceRange || "Insufficient Evidence").slice(
      0,
      200
    ),
    competition,
    competitionLevel: competition,
    demandSignals: asStringList(parsed.demandSignals),
    sellingPoints: asStringList(parsed.sellingPoints),
    painPoints: asStringList(parsed.painPoints),
    estimatedMargin: profitNote,
    potentialProfit: profitNote,
    mainRisks: risks,
    risks,
    opportunity: String(
      parsed.opportunity || "需结合证据与成本再决策"
    ).slice(0, 500),
    recommendation: parseRecommendation(
      String(parsed.recommendation || "UNKNOWN")
    ),
    claims,
    profit: opts.profit,
    dataNotice: String(
      parsed.dataNotice ||
        "基于公开市场证据（公开检索）。非演示店铺指标，非平台官方数据。"
    ).slice(0, 400),
    evidence,
    aiAssisted: true,
    createdAt: new Date().toISOString(),
  };
}

async function synthesizeOpportunity(opts: {
  query: string;
  marketplace: string;
  country: string;
  category?: string | null;
  keywords?: string;
  existingProduct?: string;
  targetPrice?: number | null;
  targetProfit?: number | null;
  evidence: ProductResearchEvidence[];
  profit: ProductOpportunity["profit"];
  accountId: string | null;
  jobId: string;
}): Promise<ProductOpportunity> {
  const {
    query,
    marketplace,
    country,
    category,
    evidence,
    profit,
    accountId,
    jobId,
  } = opts;

  if (!AIGateway.isAvailable("generateText")) {
    const o = buildFallbackOpportunity({
      query,
      marketplace,
      country,
      category,
      evidence,
      profit,
    });
    o.dataNotice =
      "检索证据可用，但 AI 未配置。以下为证据清单，不含 AI 推断利润/价带。";
    o.aiAssisted = false;
    return o;
  }

  const evidenceBlock = evidence
    .map(
      (e, i) =>
        `[${i}] ${e.title}\nSource: ${e.source} · ${e.timestamp}\nURL: ${e.url}\n${(e.snippet || "").slice(0, 260)}`
    )
    .join("\n\n");

  const constraints = [
    opts.keywords ? `keywords=${opts.keywords}` : null,
    opts.existingProduct ? `existing_product=${opts.existingProduct}` : null,
    opts.targetPrice != null ? `target_price=${opts.targetPrice}` : null,
    opts.targetProfit != null ? `target_profit=${opts.targetProfit}` : null,
    profit?.status === "complete"
      ? `user_unit_profit=${profit.estimatedProfit}; gross_margin_pct=${profit.grossMarginPct}`
      : "user_costs=Incomplete Data（禁止假设成本）",
  ]
    .filter(Boolean)
    .join("; ");

  const { appliedKnowledge, promptBlock: skillsBlock } = applyCommerceSkills({
    capabilityKey: "selection_analysis",
    platform: marketplace.toLowerCase().includes("tiktok")
      ? "TikTok Shop"
      : "Amazon",
    marketplace,
    country,
    category,
    task: "product_research",
  });

  const prompt = `${skillsBlock ? `${skillsBlock}\n` : ""}你是跨境电商选品分析助手。只能基于下方「公开检索证据」做市场/竞争/需求/风险判断。
禁止编造销量、BSR、精确利润、平台官方规则。证据不足的字段写 "Insufficient Evidence" 或 "数据暂缺"。
利润：若用户未提供完整成本，estimatedMargin 必须写 "Incomplete Data"，不要假设进货价。

marketplace=${marketplace}; country=${country}; category=${category || "n/a"}; user_query=${query}
${constraints}

请只输出 JSON：
{
  "product": "建议关注的产品方向",
  "market": "市场分析",
  "targetAudience": "目标用户",
  "priceRange": "价带或 Insufficient Evidence",
  "competition": "竞争分析",
  "demandSignals": ["需求信号"],
  "sellingPoints": ["卖点"],
  "painPoints": ["痛点"],
  "estimatedMargin": "利润判断或 Incomplete Data",
  "risks": ["风险"],
  "opportunity": "机会判断",
  "recommendation": "HIGH|MEDIUM|LOW|UNKNOWN",
  "claims": [
    {"claim":"市场需求","status":"backed|insufficient","evidenceIndexes":[0,1],"note":"..."}
  ],
  "dataNotice": "证据局限说明"
}

【公开检索证据】
${evidenceBlock || "(无)"}`;

  try {
    const gen = await AIGateway.generateText(
      { prompt, maxTokens: 1800 },
      {
        accountId,
        jobId,
        billingCapability: CAPABILITY_KEY,
        referenceType: "selection_analysis",
        quality: "balanced",
      }
    );
    const text = gen.text || "";
    const parsed = extractJsonObject(text);
    if (parsed) {
      return mapParsedOpportunity(parsed, {
        query,
        marketplace,
        country,
        category,
        evidence,
        profit,
      });
    }
    const fallback = buildFallbackOpportunity({
      query,
      marketplace,
      country,
      category,
      evidence,
      profit,
      aiText: text,
    });
    fallback.market = text.slice(0, 600).trim() || fallback.market;
    fallback.marketOpportunity = fallback.market;
    fallback.dataNotice =
      "AI 未返回结构化 JSON；已保留原文摘要与证据链接。";
    return fallback;
  } catch (err) {
    console.error("[product-research] AI failed", err);
    const fallback = buildFallbackOpportunity({
      query,
      marketplace,
      country,
      category,
      evidence,
      profit,
    });
    fallback.dataNotice =
      "AI 调用失败；仅返回检索证据。请检查 AI 配置后重试。";
    return fallback;
  }
}

async function runCompare(opts: {
  products: string[];
  marketplace: string;
  country: string;
  accountId: string | null;
  jobId: string;
}): Promise<ProductCompareResult | null> {
  const names = opts.products.map((p) => p.trim()).filter(Boolean).slice(0, 3);
  if (names.length < 2) return null;

  const rows: ProductCompareRow[] = [];
  for (const name of names) {
    const q = `${name} ${opts.marketplace} market competition pricing`;
    let evidence: ProductResearchEvidence[] = [];
    try {
      evidence = await searchEvidence(q);
    } catch {
      evidence = [];
    }
    const opp = await synthesizeOpportunity({
      query: name,
      marketplace: opts.marketplace,
      country: opts.country,
      evidence,
      profit: computeProfitAnalysis(null),
      accountId: opts.accountId,
      jobId: opts.jobId,
    });
    rows.push({
      product: opp.product,
      market: opp.market.slice(0, 160),
      price: opp.priceRange,
      competition: opp.competition.slice(0, 120),
      margin: opp.estimatedMargin,
      risk: opp.risks.slice(0, 2).join("；") || "Insufficient Evidence",
      opportunity: opp.opportunity.slice(0, 160),
      recommendation: opp.recommendation,
      evidenceCount: opp.evidence.length,
    });
  }

  return {
    rows,
    summary: `已对比 ${rows.length} 个方向（各基于独立公开检索）。非平台官方排名。`,
    dataNotice:
      "Product A/B/C 比较仅使用公开检索 + AI Recommendation；缺证据处为 Insufficient Evidence。",
  };
}

export async function runProductResearch(
  input: ProductResearchInput
): Promise<ProductResearchResult> {
  const query = input.query?.trim();
  if (!query || query.length < 2) {
    return {
      ok: false,
      code: "invalid_query",
      message: "请输入选品方向，例如：适合 Amazon US 的便携式厨房产品",
    };
  }

  const marketplace = pickMarketplace(input.marketplace);
  const country = inferCountry(marketplace, input.country);
  const category = input.category?.trim() || null;

  const searchQuery = [
    query,
    marketplace,
    category,
    input.keywords?.trim(),
    "market demand competition pricing reviews",
  ]
    .filter(Boolean)
    .join(" ");

  const searchHref = commerceSearchHref(searchQuery);
  const profit = computeProfitAnalysis(input.profit);

  const { resolveCreditsAccount } = await import(
    "@/modules/account/credits/account"
  );
  const { gateAiUsage } = await import(
    "@/modules/account/credits/usage-guard"
  );
  const account = await resolveCreditsAccount();
  const gate = await gateAiUsage({
    account,
    capability: CAPABILITY_KEY,
    confirm: Boolean(input.confirm),
    jobId: input.jobId,
  });

  if (!gate.ok) {
    const code =
      gate.code === "confirm_required" ||
      gate.code === "login_required" ||
      gate.code === "insufficient_credits"
        ? gate.code
        : ("invalid_query" as const);
    return {
      ok: false,
      code,
      message: gate.message,
      estimate: gate.estimate
        ? {
            available: gate.estimate.available,
            estimatedCredits: gate.estimate.estimatedCredits ?? null,
            message: gate.estimate.message,
          }
        : undefined,
      jobId: gate.jobId,
      searchHref,
    };
  }

  bootstrapAIProviders();

  let evidence: ProductResearchEvidence[] = [];
  try {
    evidence = await searchEvidence(searchQuery);
  } catch (err) {
    console.error("[product-research] search failed", err);
    return {
      ok: false,
      code: "search_unavailable",
      message: "公开检索暂时不可用，选品调研需要真实来源证据，请稍后重试。",
      searchHref,
      jobId: gate.jobId,
    };
  }

  const opportunity = await synthesizeOpportunity({
    query,
    marketplace,
    country,
    category,
    keywords: input.keywords,
    existingProduct: input.existingProduct,
    targetPrice: input.targetPrice,
    targetProfit: input.targetProfit,
    evidence,
    profit,
    accountId: account.accountId,
    jobId: gate.jobId,
  });

  let compare: ProductCompareResult | null = null;
  const compareList = (input.compareProducts ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  if (compareList.length >= 2) {
    compare = await runCompare({
      products: compareList,
      marketplace,
      country,
      accountId: account.accountId,
      jobId: gate.jobId,
    });
  }

  return finalizeResult({
    opportunity,
    compare,
    searchQuery,
    searchHref,
    workspaceId: input.workspaceId,
    jobId: gate.jobId,
    estimatedCredits: gate.estimatedCredits,
    marketplace,
    country,
    category,
  });
}

async function finalizeResult(opts: {
  opportunity: ProductOpportunity;
  compare: ProductCompareResult | null;
  searchQuery: string;
  searchHref: string;
  workspaceId?: string | null;
  jobId: string;
  estimatedCredits: number | null;
  marketplace: string;
  country: string;
  category?: string | null;
}): Promise<Extract<ProductResearchResult, { ok: true }>> {
  const { appliedKnowledge } = applyCommerceSkills({
    capabilityKey: "selection_analysis",
    platform: opts.marketplace.toLowerCase().includes("tiktok")
      ? "TikTok Shop"
      : "Amazon",
    marketplace: opts.marketplace,
    country: opts.country,
    category: opts.category,
    task: "product_research",
  });
  const o = opts.opportunity;
  const evidenceLines = [
    `机会：${o.opportunity}`,
    `受众：${o.targetAudience}`,
    ...o.sellingPoints.slice(0, 4).map((s) => `卖点：${s}`),
    ...o.painPoints.slice(0, 2).map((p) => `痛点：${p}`),
    `竞争：${o.competition}`,
    `价带：${o.priceRange}`,
    `利润：${o.estimatedMargin}`,
    ...o.evidence.slice(0, 5).map(
      (e) => `证据：${e.title}｜${e.source}｜${e.timestamp}｜${e.url}`
    ),
    o.dataNotice,
  ];

  const platform = o.marketplace.toLowerCase().includes("tiktok")
    ? ("TikTok Shop" as const)
    : ("Amazon" as const);

  const storeFields = await withStoreCreateFields(platform, {
    source: "amazon_diagnosis",
    platform,
    productTitle: o.product,
    conclusion: `推荐：${o.recommendation}｜${o.opportunity.slice(0, 120)}`,
    evidence: evidenceLines,
    suggestion:
      "上下文已携带 Product / Opportunity / Audience / Selling Points / Search Evidence；勿让用户重新填写。先核对证据链接再生成。",
    audience: o.targetAudience,
    opportunity: o.opportunity,
    diagnosis: `推荐：${o.recommendation}`,
    contentGoal: `基于选品机会「${o.product}」写商品页 / 短视频卖点（${o.marketplace}）`,
    researchSummary: o.market,
  });

  let researchHref: string | null = null;
  let workspaceHref: string | null = null;
  let workspaceItemId: string | null = null;

  try {
    const { createWorkspace, listWorkspaces } = await import(
      "@/modules/workspace/services/workspace-service"
    );
    const { addContextItem } = await import(
      "@/modules/workspace/services/context-service"
    );

    let wsId = opts.workspaceId?.trim() || "";
    if (!wsId) {
      const list = await listWorkspaces();
      const existing = list.find(
        (w) =>
          w.status === "active" &&
          (w.name === "选品调研" || w.name.includes("选品"))
      );
      if (existing) wsId = existing.id;
      else {
        const created = await createWorkspace("选品调研", o.product);
        wsId = created.id;
      }
    }

    const added = await addContextItem(wsId, {
      kind: "commerce_diagnosis",
      title: `选品机会 · ${o.product}`,
      summary: `${o.recommendation}｜${o.opportunity.slice(0, 160)}`,
      url: opts.searchHref,
      payload: {
        type: "product_opportunity",
        opportunity: o,
        compare: opts.compare,
        searchQuery: opts.searchQuery,
      },
      includedInContext: true,
    });
    workspaceItemId = added?.item.id ?? null;
    workspaceHref = `/workspace/${wsId}`;
    researchHref = `/workspace/${wsId}/research?goal=${encodeURIComponent(
      `${o.product} ${o.marketplace} Opportunity`
    )}`;
  } catch (err) {
    console.error("[product-research] workspace attach failed", err);
  }

  const wf = buildWorkflowBundle({
    scenario: "product_research_loop",
    ctx: buildWorkflowContext({
      stage: "product_research",
      platform,
      marketplace: o.marketplace || storeFields.storeMarketplace,
      country: o.country || storeFields.storeCountry,
      currency: storeFields.storeCurrency,
      storeId: storeFields.storeId,
      storeLabel: storeFields.storeMarketplace,
      productTitle: o.product,
      audience: o.targetAudience,
      researchSummary: o.market,
      evidence: evidenceLines,
      diagnosis: `推荐：${o.recommendation}`,
      opportunity: o.opportunity,
      contentGoal: storeFields.contentGoal,
      source: "product_research",
    }),
    researchHref,
    workspaceHref,
    searchQuery: opts.searchQuery,
  });

  return {
    ok: true,
    opportunity: o,
    compare: opts.compare,
    searchQuery: opts.searchQuery,
    searchHref: wf.searchHref,
    researchHref: wf.researchHref,
    workspaceHref,
    createHref: wf.createHref,
    workspaceItemId,
    jobId: opts.jobId,
    estimatedCredits: opts.estimatedCredits,
    appliedKnowledge,
    workflowActions: wf.workflowActions,
    chainLabel: wf.chainLabel,
  };
}
