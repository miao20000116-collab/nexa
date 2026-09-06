/**
 * Listing Intelligence (V4.5-B) — Commerce Capability.
 *
 * Modes: generate | review | partial (title|bullets|description)
 * + keyword_intelligence companion.
 * Localization ≠ translation. Never fake platform approval / keyword volume.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import { withStoreCreateFields } from "@/modules/commerce/lib/with-store-create-fields";
import { routeCapabilityWithSkills } from "@/modules/ai/router/capability-router";
import type { AppliedKnowledgeSummary } from "@/modules/commerce/skills/types";
import { runKeywordIntelligence } from "@/modules/commerce/capability/keyword-intelligence";
import type {
  CommerceCapabilityInsight,
  KeywordIntelligence,
  ListingIntelligenceInput,
  ListingIntelligenceResult,
  ListingRecommendation,
  ListingReview,
} from "@/modules/commerce/capability/listing-types";

const BILLING_CAPABILITY = "listing_intelligence";

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

function emptyListing(title: string): ListingRecommendation {
  return {
    title: title.slice(0, 120) || "数据暂缺",
    bulletPoints: [],
    description: "数据暂缺",
    searchKeywords: [],
    positioning: "数据暂缺",
    cta: "数据暂缺",
    localizedCopy: "数据暂缺",
    localizationNotes:
      "Localization ≠ translation. Without market evidence, only generic AI Recommendation.",
    complianceNotes:
      "Requires Review — not a legal conclusion; no platform approval claimed.",
    risks: ["缺少足够商品页 / 市场证据"],
    regeneratedFields: ["full"],
  };
}

function mergePartial(
  base: ListingRecommendation,
  patch: Partial<ListingRecommendation>,
  field: "title" | "bullets" | "description"
): ListingRecommendation {
  const next = { ...base };
  if (field === "title" && patch.title) next.title = patch.title;
  if (field === "bullets" && patch.bulletPoints?.length) {
    next.bulletPoints = patch.bulletPoints;
  }
  if (field === "description" && patch.description) {
    next.description = patch.description;
  }
  if (patch.localizationNotes) next.localizationNotes = patch.localizationNotes;
  if (patch.complianceNotes) next.complianceNotes = patch.complianceNotes;
  next.regeneratedFields = [field];
  return next;
}

function baseFromInput(
  input: ListingIntelligenceInput,
  productTitle: string
): ListingRecommendation {
  const seed = input.baseListing;
  return {
    title:
      seed?.title ||
      input.currentTitle ||
      productTitle.slice(0, 120) ||
      "数据暂缺",
    bulletPoints:
      seed?.bulletPoints ||
      input.currentBullets ||
      [],
    description:
      seed?.description ||
      input.currentDescription ||
      input.currentListing?.slice(0, 4000) ||
      "数据暂缺",
    searchKeywords: seed?.searchKeywords || [],
    positioning: seed?.positioning || "数据暂缺",
    cta: seed?.cta || "数据暂缺",
    localizedCopy: seed?.localizedCopy || "数据暂缺",
    localizationNotes:
      seed?.localizationNotes ||
      "Localization ≠ translation.",
    complianceNotes:
      seed?.complianceNotes ||
      "Requires Review — Potential Policy Risk.",
    risks: seed?.risks || [],
    regeneratedFields: [],
  };
}

async function loadSoftContext(input: ListingIntelligenceInput): Promise<{
  researchExtra: string[];
  memoryExtra: string[];
}> {
  const researchExtra: string[] = [];
  const memoryExtra: string[] = [];

  if (input.productResearchSummary?.trim()) {
    researchExtra.push(
      `Product Research: ${input.productResearchSummary.trim().slice(0, 600)}`
    );
  }
  if (input.researchNotes?.trim()) {
    researchExtra.push(
      `Research notes: ${input.researchNotes.trim().slice(0, 600)}`
    );
  }

  if (input.workspaceId?.trim()) {
    try {
      const { getWorkspaceContext } = await import(
        "@/modules/workspace/services/context-service"
      );
      const ctx = await getWorkspaceContext(input.workspaceId.trim());
      for (const item of (ctx?.items ?? []).slice(0, 6)) {
        if (
          item.kind === "commerce_diagnosis" ||
          item.title?.includes("选品") ||
          item.title?.includes("Listing")
        ) {
          researchExtra.push(
            `Workspace「${item.title}」: ${(item.summary || "").slice(0, 200)}`
          );
        }
      }
    } catch {
      /* soft fail */
    }
  }

  try {
    const { resolveCreditsAccount } = await import(
      "@/modules/account/credits/account"
    );
    const account = await resolveCreditsAccount();
    if (account.userId) {
      const { listActiveMemories } = await import(
        "@/modules/memory/services/memory-service"
      );
      const memories = await listActiveMemories(account.userId);
      for (const m of memories.slice(0, 4)) {
        const text = `${m.label || ""} ${m.value || ""}`.trim();
        if (/listing|amazon|tiktok|选品|偏好|marketplace|品牌/i.test(text)) {
          memoryExtra.push(text.slice(0, 180));
        }
      }
    }
  } catch {
    /* soft fail */
  }

  return { researchExtra, memoryExtra };
}

function parseListingFields(
  parsed: Record<string, unknown>,
  fallbackTitle: string
): ListingRecommendation {
  return {
    title: String(parsed.title || fallbackTitle).slice(0, 200),
    bulletPoints: asStringList(parsed.bulletPoints, 7),
    description: String(parsed.description || "数据暂缺").slice(
      0,
      4000
    ),
    searchKeywords: asStringList(
      parsed.searchKeywords ?? parsed.keywords,
      20
    ),
    positioning: String(parsed.positioning || "数据暂缺").slice(
      0,
      400
    ),
    cta: String(parsed.cta || "Shop now / Learn more").slice(0, 200),
    localizedCopy: String(
      parsed.localizedCopy || parsed.description || "数据暂缺"
    ).slice(0, 4000),
    localizationNotes: String(
      parsed.localizationNotes ||
        "Localization ≠ translation. AI Recommendation only."
    ).slice(0, 600),
    complianceNotes: String(
      parsed.complianceNotes ||
        "Requires Review — Potential Policy Risk. Not a legal conclusion."
    ).slice(0, 600),
    risks: asStringList(parsed.risks, 6),
    regeneratedFields: ["full"],
  };
}

function parseReview(parsed: Record<string, unknown>): ListingReview {
  const scoresRaw =
    (parsed.scores && typeof parsed.scores === "object"
      ? (parsed.scores as Record<string, unknown>)
      : parsed) || {};
  return {
    scores: {
      clarity: String(scoresRaw.clarity || "数据暂缺").slice(0, 200),
      relevance: String(scoresRaw.relevance || "数据暂缺").slice(
        0,
        200
      ),
      keywordCoverage: String(
        scoresRaw.keywordCoverage || "数据暂缺"
      ).slice(0, 200),
      persuasiveness: String(
        scoresRaw.persuasiveness || "数据暂缺"
      ).slice(0, 200),
      localization: String(
        scoresRaw.localization || "数据暂缺"
      ).slice(0, 200),
      potentialComplianceRisk: String(
        scoresRaw.potentialComplianceRisk ||
          scoresRaw.complianceRisk ||
          "Requires Review"
      ).slice(0, 300),
    },
    strengths: asStringList(parsed.strengths, 8),
    problems: asStringList(parsed.problems, 8),
    recommendations: asStringList(
      parsed.recommendations ?? parsed.recommendationList,
      8
    ),
    dataNotice: String(
      parsed.dataNotice ||
        "商品页审阅 = AI Recommendation，非平台官方质检。"
    ).slice(0, 400),
  };
}

export async function runListingIntelligence(
  input: ListingIntelligenceInput
): Promise<ListingIntelligenceResult> {
  const productTitle = input.productTitle?.trim();
  if (!productTitle) {
    return {
      ok: false,
      code: "invalid_input",
      message: "缺少商品名称",
    };
  }

  const mode = input.mode || "generate";
  if (mode === "partial" && !input.partialField) {
    return {
      ok: false,
      code: "invalid_input",
      message: "部分修改需指定字段：title / bullets / description",
    };
  }

  const { resolveCreditsAccount } = await import(
    "@/modules/account/credits/account"
  );
  const { gateAiUsage } = await import(
    "@/modules/account/credits/usage-guard"
  );
  const account = await resolveCreditsAccount();
  const gate = await gateAiUsage({
    account,
    capability: BILLING_CAPABILITY,
    confirm: Boolean(input.confirm),
    jobId: input.jobId,
  });

  if (!gate.ok) {
    const code =
      gate.code === "confirm_required" ||
      gate.code === "login_required" ||
      gate.code === "insufficient_credits"
        ? gate.code
        : ("invalid_input" as const);
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
    };
  }

  const marketplace =
    input.marketplace?.trim() ||
    (input.platform === "TikTok Shop" ? "TikTok US" : "Amazon US");
  const country = input.country?.trim() || "US";
  const features = (input.features ?? []).filter(Boolean);
  const weaknesses = (input.listingWeaknesses ?? []).filter(Boolean);
  const checklist = (input.listingChecklist ?? []).filter(Boolean);
  const images = (input.imageNotes ?? []).filter(Boolean);

  const { appliedKnowledge, skillPromptBlock } = routeCapabilityWithSkills({
    capability: "generateText",
    skills: {
      capabilityKey: "listing_intelligence",
      platform: input.platform,
      marketplace,
      country,
      category: input.category,
      task:
        mode === "review" ? "listing_review" : "listing_optimization",
    },
  });
  const skillsBlock = skillPromptBlock
    ? `\n【Applied Knowledge / Skills】\n${skillPromptBlock}\n`
    : "";

  const soft = await loadSoftContext(input);

  const evidenceLines = [
    `Platform: ${input.platform} · ${marketplace} · ${country}`,
    input.sku ? `SKU: ${input.sku}` : null,
    input.category ? `Category: ${input.category}` : null,
    features.length ? `Features: ${features.join("；")}` : null,
    input.productDescription
      ? `Product description: ${input.productDescription.slice(0, 400)}`
      : null,
    images.length ? `Images/notes: ${images.slice(0, 5).join("；")}` : null,
    weaknesses.length
      ? `Known listing weaknesses (DEMO seed): ${weaknesses.join("；")}`
      : null,
    checklist.length ? `Checklist (DEMO seed): ${checklist.join("；")}` : null,
    input.currentListing?.trim()
      ? `Current listing: ${input.currentListing.trim().slice(0, 800)}`
      : null,
    ...soft.researchExtra.slice(0, 4),
    ...soft.memoryExtra.slice(0, 3).map((m) => `Memory/pref: ${m}`),
  ].filter(Boolean) as string[];

  const searchHref = commerceSearchHref(
    `${productTitle} ${marketplace} listing keywords competitor`
  );

  bootstrapAIProviders();

  let listing = baseFromInput(input, productTitle);
  let review: ListingReview | null = null;
  let keywords: KeywordIntelligence | null = null;
  let aiAssisted = false;
  let dataNotice =
    "AI Recommendation · Localization ≠ translation. Not official platform rules.";

  const existingText = [
    input.currentTitle,
    ...(input.currentBullets || []),
    input.currentDescription,
    input.currentListing,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2500);

  if (!AIGateway.isAvailable("generateText")) {
    dataNotice =
      "AI 未配置。无法生成商品页；仅返回已有草稿 / 演示弱点。数据暂缺。";
    if (weaknesses.length) listing.risks = weaknesses;
  } else {
    let prompt = "";

    if (mode === "review") {
      prompt = `${skillsBlock}你是跨境电商 商品页审阅顾问。对已有商品页 做评审（非平台官方质检）。
Localization ≠ 直译。合规只能写 Potential Risk / Requires Review，禁止保证过审。

市场：${marketplace}（${country}）平台：${input.platform}
类目：${input.category || "unknown"}
商品：${productTitle}
SKU：${input.sku || "n/a"}

【Context】
${evidenceLines.join("\n")}

【现有商品页】
${existingText || "（空）"}

请只输出 JSON：
{
  "scores": {
    "clarity": "",
    "relevance": "",
    "keywordCoverage": "",
    "persuasiveness": "",
    "localization": "",
    "potentialComplianceRisk": ""
  },
  "strengths": [],
  "problems": [],
  "recommendations": [],
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": ""
}`;
    } else if (mode === "partial") {
      const field = input.partialField!;
      const fieldLabel =
        field === "title"
          ? "Title"
          : field === "bullets"
            ? "Bullet Points"
            : "Description";
      prompt = `${skillsBlock}你是跨境电商 商品页顾问。用户只要你改写「${fieldLabel}」，不要重写整个商品页。
Localization ≠ 直译。面向 ${marketplace}（${country}）。

商品：${productTitle}
特点：${features.join("；") || "none"}
保留的现有商品页：
标题：${listing.title}
Bullets：${listing.bulletPoints.join(" | ") || "none"}
描述：${listing.description.slice(0, 800)}

Context：
${evidenceLines.join("\n")}

请只输出 JSON（只填需要改的字段，其他可省略）：
{
  "title": "${field === "title" ? "新标题" : listing.title.replace(/"/g, "'")}",
  "bulletPoints": ${field === "bullets" ? '["..."]' : "[]"},
  "description": "${field === "description" ? "新描述" : ""}",
  "localizationNotes": "",
  "complianceNotes": "Requires Review…",
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "仅改了 ${fieldLabel}"
}`;
    } else {
      prompt = `${skillsBlock}你是跨境电商 商品页顾问。输出面向 ${marketplace}（${country}）的本土化商品页。
Localization ≠ 直译：按目标市场、受众、品类调整表达，禁止中式直译腔。
禁止假装「平台官方规则」或「保证过审」。信息不足写 "数据暂缺"。

商品：${productTitle}
SKU：${input.sku || "n/a"}
平台：${input.platform}
类目：${input.category || "unknown"}
特点：${features.join("；") || "none"}
产品说明：${(input.productDescription || "").slice(0, 500) || "none"}
图片备注：${images.join("；") || "none"}
已知弱点：${weaknesses.join("；") || "none"}
现有草稿：${existingText.slice(0, 600) || "none"}

【Context — Research / Memory】
${[...soft.researchExtra, ...soft.memoryExtra].join("\n") || "none"}

请只输出 JSON：
{
  "title": "",
  "bulletPoints": ["","","","",""],
  "description": "",
  "searchKeywords": [],
  "positioning": "",
  "cta": "",
  "localizedCopy": "面向目标市场的完整本土化文案（可与 description 同向但不等于中文直译）",
  "localizationNotes": "说明做了哪些本土化调整（非翻译）",
  "complianceNotes": "Potential Risk / Requires Review",
  "risks": [],
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": ""
}`;
    }

    try {
      const gen = await AIGateway.generateText(
        { prompt, maxTokens: mode === "review" ? 1400 : 1800 },
        {
          accountId: account.accountId,
          jobId: gate.jobId,
          billingCapability: BILLING_CAPABILITY,
          referenceType: "listing_intelligence",
          quality: "balanced",
        }
      );
      const text = gen.text || "";
      const parsed = extractJsonObject(text);
      aiAssisted = true;

      if (parsed) {
        if (mode === "review") {
          review = parseReview(parsed);
          dataNotice = review.dataNotice;
        } else if (mode === "partial" && input.partialField) {
          const patch = parseListingFields(parsed, listing.title);
          listing = mergePartial(listing, patch, input.partialField);
          dataNotice =
            `Partial rewrite · 仅更新 ${input.partialField}。Localization ≠ translation.`;
        } else {
          listing = parseListingFields(parsed, productTitle);
          dataNotice =
            "AI Recommendation · Based on product notes / Research / DEMO seed. Not official platform approval.";
        }

        const insight: CommerceCapabilityInsight = {
          situation: String(parsed.situation || evidenceLines[0] || "").slice(
            0,
            500
          ),
          evidence: evidenceLines,
          diagnosis: String(
            parsed.diagnosis ||
              (mode === "review"
                ? "已有商品页 需按审阅建议优化"
                : "商品页承接与关键词表达可能偏弱")
          ).slice(0, 500),
          opportunity: String(
            parsed.opportunity || "可通过本土化卖点与关键词改善转化"
          ).slice(0, 500),
          recommendation: String(
            parsed.recommendation ||
              (mode === "partial"
                ? `已按请求仅改 ${input.partialField}`
                : "先改标题与前 3 条 Bullet，再进 QA / Compliance")
          ).slice(0, 500),
          actions: [],
          dataNotice,
          aiAssisted: true,
          createdAt: new Date().toISOString(),
          appliedKnowledge: appliedKnowledge ?? undefined,
        };

        if (mode === "generate" || mode === "partial") {
          try {
            keywords = await runKeywordIntelligence({
              productTitle,
              marketplace,
              country,
              category: input.category,
              features,
              accountId: account.accountId,
              jobId: gate.jobId,
            });
            if (keywords.primary.length && listing.searchKeywords.length === 0) {
              listing.searchKeywords = keywords.primary.map((k) => k.term);
            }
          } catch (err) {
            console.error("[listing-intelligence] keywords failed", err);
          }
        }

        return await finalize(
          input,
          listing,
          insight,
          searchHref,
          gate,
          keywords,
          review,
          appliedKnowledge
        );
      }

      dataNotice = "AI 未返回结构化 JSON；请人工核对后使用。";
      if (mode !== "review") {
        listing.description = text.slice(0, 2000) || listing.description;
      }
    } catch (err) {
      console.error("[listing-intelligence] AI failed", err);
      dataNotice = "AI 调用失败。生成文案数据暂缺。";
      aiAssisted = false;
    }
  }

  const insight: CommerceCapabilityInsight = {
    situation: `${input.platform} · ${productTitle}`,
    evidence: evidenceLines.length
      ? evidenceLines
      : ["数据暂缺：缺少商品特征与现有商品页"],
    diagnosis: weaknesses.length
      ? `演示弱点：${weaknesses.slice(0, 2).join("；")}`
      : "缺少足够商品页 证据做深度诊断",
    opportunity: "补齐卖点与关键词后可进入创作、QA、合规与发布",
    recommendation: "提供更多产品特点后再生成；或先搜索竞品商品页",
    actions: [],
    dataNotice,
    aiAssisted,
    createdAt: new Date().toISOString(),
    appliedKnowledge: appliedKnowledge ?? undefined,
  };

  return await finalize(
    input,
    listing,
    insight,
    searchHref,
    gate,
    keywords,
    review,
    appliedKnowledge
  );
}

async function finalize(
  input: ListingIntelligenceInput,
  listing: ListingRecommendation,
  insight: CommerceCapabilityInsight,
  searchHref: string,
  gate: { jobId: string; estimatedCredits: number | null },
  keywords: KeywordIntelligence | null,
  review: ListingReview | null,
  appliedKnowledge: AppliedKnowledgeSummary | null
): Promise<Extract<ListingIntelligenceResult, { ok: true }>> {
  const createHref = commerceCreateHref({
    goal: `按商品页建议改写「${input.productTitle}」标题与卖点（${input.platform}）`,
    context: buildCommerceCreateContext(
      await withStoreCreateFields(input.platform, {
        source:
          input.channel === "tiktok" ? "tiktok_diagnosis" : "amazon_diagnosis",
        platform: input.platform,
        productTitle: input.productTitle,
        conclusion: insight.diagnosis,
        evidence: [
          `建议标题：${listing.title}`,
          ...listing.bulletPoints.slice(0, 3).map((b) => `Bullet：${b}`),
          `定位：${listing.positioning}`,
          `CTA：${listing.cta}`,
          listing.localizedCopy
            ? `本土化文案：${listing.localizedCopy.slice(0, 200)}`
            : "",
          ...(keywords?.primary.slice(0, 3).map((k) => `KW：${k.term}`) ?? []),
          insight.dataNotice,
        ].filter(Boolean),
        suggestion: insight.recommendation,
        listingWeaknesses: input.listingWeaknesses,
      })
    ),
    platform: input.platform,
  });

  const qaHref = appendReturnNav(
    `/create?mode=commerce&goal=${encodeURIComponent(
      `对「${input.productTitle}」商品页做内容 QA`
    )}&commerceContext=${encodeURIComponent(
      [
        `title: ${listing.title}`,
        `bullets: ${listing.bulletPoints.join(" | ")}`,
        `description: ${listing.description.slice(0, 500)}`,
        `compliance: ${listing.complianceNotes}`,
      ].join("\n")
    )}`,
    input.platform
  );

  const complianceHref =
    input.channel === "tiktok"
      ? "/commerce/tiktok/compliance"
      : "/commerce/amazon/compliance";

  const publishHref = "/publish";

  const qaHint =
    "商品页 → 合规 → QA → Creation → Publish。QA / Compliance 不保证过审。";

  let workspaceHref: string | null = null;
  try {
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
          (w.name.includes("商品页") || w.name.includes("Listing"))
      );
      if (hit) wsId = hit.id;
      else wsId = (await createWorkspace("商品页优化", input.productTitle)).id;
    }
    workspaceHref = `/workspace/${wsId}`;
    await addContextItem(wsId, {
      kind: "commerce_diagnosis",
      title: `商品页 · ${input.productTitle}`,
      summary: insight.diagnosis.slice(0, 160),
      payload: {
        type: "listing_intelligence",
        listing,
        keywords,
        review,
        insight,
      },
      includedInContext: true,
    });
  } catch (err) {
    console.error("[listing-intelligence] workspace attach failed", err);
  }

  const { buildWorkflowBundle, buildWorkflowContext } = await import(
    "@/modules/commerce/workflow"
  );
  const { getActiveStoreContext } = await import(
    "@/modules/commerce/store/active-store"
  );
  const store = await getActiveStoreContext(
    input.platform === "TikTok Shop" ? "TikTok Shop" : "Amazon"
  );

  const wf = buildWorkflowBundle({
    scenario: "listing_optimize",
    ctx: buildWorkflowContext({
      stage: "listing",
      platform: input.platform,
      marketplace: input.marketplace || store.marketplace,
      country: input.country || store.country,
      currency: store.currency,
      storeId: store.storeId,
      storeLabel: store.label,
      productTitle: input.productTitle,
      productId: input.productId,
      evidence: insight.evidence,
      diagnosis: insight.diagnosis,
      opportunity: insight.opportunity,
      contentGoal: `按商品页建议改写「${input.productTitle}」`,
      researchSummary: listing.positioning,
      source: "listing",
    }),
    workspaceHref,
  });

  insight.actions = wf.workflowActions.map((a) => ({
    label: a.label,
    kind:
      a.kind === "qa"
        ? ("qa" as const)
        : a.kind === "compliance"
          ? ("compliance" as const)
          : a.kind === "publish"
            ? ("publish" as const)
            : a.kind === "create"
              ? ("create" as const)
              : a.kind === "search"
                ? ("search" as const)
                : ("link" as const),
    href: a.href,
  }));

  return {
    ok: true,
    insight,
    listing,
    keywords,
    review,
    createHref: wf.createHref,
    qaHref: wf.qaHref,
    complianceHref: wf.complianceHref || complianceHref,
    publishHref: wf.publishHref || publishHref,
    qaHint,
    jobId: gate.jobId,
    estimatedCredits: gate.estimatedCredits,
    appliedKnowledge: appliedKnowledge ?? insight.appliedKnowledge,
    workflowActions: wf.workflowActions,
    chainLabel: wf.chainLabel,
  };
}
