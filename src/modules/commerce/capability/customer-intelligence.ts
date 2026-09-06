/**
 * Customer Intelligence (V4.5-D).
 *
 * Reviews / messages → pain points → reply drafts → Product Diagnosis / Creation.
 * Not a ticket desk. Localization ≠ translation.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import { withStoreCreateFields } from "@/modules/commerce/lib/with-store-create-fields";
import { applyCommerceSkills } from "@/modules/commerce/skills";
import type {
  CustomerIntelligenceInput,
  CustomerIntelligenceResult,
  CustomerPainPoint,
  CustomerReplyDraft,
  CustomerReplyKind,
  CustomerReplyLanguage,
} from "@/modules/commerce/capability/customer-types";
import { DEMO_CUSTOMER_SAMPLES } from "@/modules/commerce/capability/customer-types";
import type { CommerceCapabilityInsight } from "@/modules/commerce/capability/listing-types";

const BILLING = "customer_intelligence";

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

function splitFeedback(text: string): string[] {
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 40);
}

function collectCorpus(input: CustomerIntelligenceInput): {
  lines: string[];
  dataLabel: "演示数据" | "用户输入" | "数据暂缺";
} {
  const lines = [
    ...splitFeedback(input.reviewsText || ""),
    ...splitFeedback(input.messagesText || ""),
    ...splitFeedback(input.emailsText || ""),
  ];
  if (lines.length > 0) {
    return { lines, dataLabel: "用户输入" };
  }
  if (input.useDemoSamples !== false) {
    return { lines: [...DEMO_CUSTOMER_SAMPLES], dataLabel: "演示数据" };
  }
  return { lines: [], dataLabel: "数据暂缺" };
}

function heuristicPainPoints(lines: string[]): CustomerPainPoint[] {
  const buckets: Array<{
    theme: string;
    category: string;
    keys: RegExp;
    product: boolean;
  }> = [
    {
      theme: "电池续航差",
      category: "Product Quality",
      keys: /battery|续航|没电|drains?|dies after/i,
      product: true,
    },
    {
      theme: "说明书 / 翻译不清",
      category: "Documentation",
      keys: /manual|instruction|翻译|unclear|poorly translated/i,
      product: false,
    },
    {
      theme: "配对 / App 问题",
      category: "Software",
      keys: /pairing|app|蓝牙|connect|reset/i,
      product: true,
    },
    {
      theme: "客服响应慢",
      category: "Customer Service",
      keys: /customer service|email|ignored|warranty|客服/i,
      product: false,
    },
    {
      theme: "退货意向",
      category: "Returns",
      keys: /return|returning|refund|退货/i,
      product: false,
    },
  ];

  const points: CustomerPainPoint[] = [];
  for (const b of buckets) {
    const hits = lines.filter((l) => b.keys.test(l));
    if (!hits.length) continue;
    points.push({
      theme: b.theme,
      category: b.category,
      sentiment: "negative",
      frequency: hits.length,
      frequencyLabel: `${hits.length}/${lines.length}`,
      evidenceSnippets: hits.slice(0, 3),
      likelyProductProblem: b.product,
      recommendation: b.product
        ? "可能不仅是客服问题，建议进入商品诊断核对商品页 宣称与产品表现。"
        : "优先用本土化回复安抚，并沉淀 FAQ / 内容说明。",
    });
  }

  points.sort((a, b) => b.frequency - a.frequency);
  return points.slice(0, 6);
}

function parsePainPoints(
  parsed: Record<string, unknown>,
  fallback: CustomerPainPoint[]
): CustomerPainPoint[] {
  const raw = Array.isArray(parsed.painPoints) ? parsed.painPoints : [];
  if (!raw.length) return fallback;
  return raw.slice(0, 8).map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<
      string,
      unknown
    >;
    const sentimentRaw = String(r.sentiment || "negative").toLowerCase();
    const sentiment =
      sentimentRaw.includes("pos")
        ? ("positive" as const)
        : sentimentRaw.includes("mix")
          ? ("mixed" as const)
          : sentimentRaw.includes("neu")
            ? ("neutral" as const)
            : ("negative" as const);
    return {
      theme: String(r.theme || r.pain || "Unknown").slice(0, 120),
      category: String(r.category || "General").slice(0, 80),
      sentiment,
      frequency: Number(r.frequency) || 1,
      frequencyLabel: String(r.frequencyLabel || r.frequency || "n/a").slice(
        0,
        40
      ),
      evidenceSnippets: asStringList(r.evidenceSnippets ?? r.evidence, 4),
      likelyProductProblem: Boolean(r.likelyProductProblem ?? r.productProblem),
      recommendation: String(r.recommendation || "").slice(0, 300),
    };
  });
}

function parseReply(
  parsed: Record<string, unknown>,
  kind: CustomerReplyKind,
  language: CustomerReplyLanguage
): CustomerReplyDraft {
  return {
    kind,
    language,
    subject: parsed.subject ? String(parsed.subject).slice(0, 200) : undefined,
    body: String(parsed.body || parsed.reply || "数据暂缺").slice(
      0,
      4000
    ),
    localizationNotes: String(
      parsed.localizationNotes ||
        "Localization ≠ translation — adjusted for market & platform tone."
    ).slice(0, 400),
  };
}

export async function runCustomerIntelligence(
  input: CustomerIntelligenceInput
): Promise<CustomerIntelligenceResult> {
  const mode = input.mode || "analyze";
  const { lines, dataLabel } = collectCorpus(input);

  if (lines.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      message:
        "请粘贴评价 / 消息 / 邮件，或开启 DEMO 样本后再分析（数据暂缺）",
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
    capability: BILLING,
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

  const platform =
    input.platform ||
    (input.channel === "tiktok" ? "TikTok Shop" : "Amazon");
  const marketplace =
    input.marketplace?.trim() ||
    (input.channel === "tiktok" ? "TikTok US" : "Amazon US");
  const country = input.country?.trim() || "US";
  const productTitle = input.productTitle?.trim() || "（未指定商品）";

  const heuristic = heuristicPainPoints(lines);
  let painPoints = heuristic;
  let clusters = heuristic.map((p) => ({
    label: p.theme,
    count: p.frequency,
    examples: p.evidenceSnippets.slice(0, 2),
  }));
  let reply: CustomerReplyDraft | null = null;
  let aiAssisted = false;
  let diagnosis =
    heuristic[0]
      ? `Top pain：${heuristic[0].theme}（${heuristic[0].frequencyLabel}）`
      : "反馈已收集，主题不明显";
  let opportunity =
    "将高频痛点沉淀为 常见问题 / 商品页 卖点修正 / 内容方向";
  let recommendation = heuristic[0]?.recommendation || "先核对证据原文再回复";
  let dataNotice =
    dataLabel === "演示数据"
      ? "演示数据 — 内置测试评论，非卖家后台实时收件箱。"
      : dataLabel === "用户输入"
        ? "Based on user-provided feedback text. Not a live CS inbox sync."
        : "数据暂缺";

  const corpusBlock = lines.map((l, i) => `[${i}] ${l}`).join("\n");

  bootstrapAIProviders();

  if (AIGateway.isAvailable("generateText")) {
    if (mode === "reply") {
      const kind = input.replyKind || "review_reply";
      const language = input.replyLanguage || "English";
      const focus =
        input.focusTheme || heuristic[0]?.theme || "general concern";
      const prompt = `${
        applyCommerceSkills({
          capabilityKey: "customer_intelligence",
          platform,
          marketplace: input.marketplace,
          country: input.country,
          task: "customer_review_analysis",
        }).promptBlock
      }\n你是跨境电商客户沟通顾问。写一封本土化回复（Localization ≠ 直译）。
平台：${platform} · 市场：${marketplace} · 国家：${country}
商品：${productTitle}
回复类型：${kind}
语言：${language}
焦点痛点：${focus}
订单上下文：${(input.orderContext || "none").slice(0, 300)}

规则：
- 按目标市场表达习惯，不要中式直译腔
- 不要承诺无法兑现的退款/保修法律结论
- 语气专业、共情、可执行

输出 JSON：
{
  "subject": "仅 email 需要",
  "body": "完整回复正文",
  "localizationNotes": "做了哪些本土化调整",
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": ""
}

【客户原文摘录】
${corpusBlock.slice(0, 2500)}`;

      try {
        const gen = await AIGateway.generateText(
          { prompt, maxTokens: 1200 },
          {
            accountId: account.accountId,
            jobId: gate.jobId,
            billingCapability: BILLING,
            referenceType: "customer_intelligence",
            quality: "balanced",
          }
        );
        const parsed = extractJsonObject(gen.text || "");
        aiAssisted = true;
        if (parsed) {
          reply = parseReply(parsed, kind, language);
          diagnosis = String(parsed.diagnosis || diagnosis).slice(0, 500);
          opportunity = String(parsed.opportunity || opportunity).slice(0, 500);
          recommendation = String(
            parsed.recommendation || recommendation
          ).slice(0, 500);
        } else {
          reply = {
            kind,
            language,
            body: (gen.text || "").slice(0, 2000) || "数据暂缺",
            localizationNotes: "AI 未返回结构化 JSON；请人工校对。",
          };
        }
      } catch (err) {
        console.error("[customer-intelligence] reply AI failed", err);
        dataNotice = "AI 调用失败；仅保留规则痛点。";
      }
    } else {
      const prompt = `${
        applyCommerceSkills({
          capabilityKey: "customer_intelligence",
          platform,
          marketplace: input.marketplace,
          country: input.country,
          task: "customer_review_analysis",
        }).promptBlock
      }\n你是跨境电商客户洞察顾问。基于客户反馈做分类、聚类、情绪与频率分析。
禁止编造未出现的差评内容。频率用可见样本计数。
若大量用户反馈同一产品缺陷（如电池续航），标记 likelyProductProblem=true。

平台：${platform} · ${marketplace} · ${country}
商品：${productTitle}
订单上下文：${(input.orderContext || "none").slice(0, 300)}
数据标签：${dataLabel}

输出 JSON：
{
  "painPoints": [
    {
      "theme": "",
      "category": "",
      "sentiment": "negative|mixed|neutral|positive",
      "frequency": 1,
      "frequencyLabel": "3/8",
      "evidenceSnippets": [],
      "likelyProductProblem": false,
      "recommendation": ""
    }
  ],
  "clusters": [{"label":"","count":1,"examples":[]}],
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": ""
}

【反馈语料】
${corpusBlock}`;

      try {
        const gen = await AIGateway.generateText(
          { prompt, maxTokens: 1600 },
          {
            accountId: account.accountId,
            jobId: gate.jobId,
            billingCapability: BILLING,
            referenceType: "customer_intelligence",
            quality: "balanced",
          }
        );
        const parsed = extractJsonObject(gen.text || "");
        aiAssisted = true;
        if (parsed) {
          painPoints = parsePainPoints(parsed, heuristic);
          const rawClusters = Array.isArray(parsed.clusters)
            ? parsed.clusters
            : [];
          if (rawClusters.length) {
            clusters = rawClusters.slice(0, 8).map((c) => {
              const row = (c && typeof c === "object" ? c : {}) as Record<
                string,
                unknown
              >;
              return {
                label: String(row.label || "").slice(0, 80),
                count: Number(row.count) || 1,
                examples: asStringList(row.examples, 3),
              };
            });
          } else {
            clusters = painPoints.map((p) => ({
              label: p.theme,
              count: p.frequency,
              examples: p.evidenceSnippets.slice(0, 2),
            }));
          }
          diagnosis = String(parsed.diagnosis || diagnosis).slice(0, 500);
          opportunity = String(parsed.opportunity || opportunity).slice(0, 500);
          recommendation = String(
            parsed.recommendation || recommendation
          ).slice(0, 500);
          if (parsed.dataNotice) {
            dataNotice = String(parsed.dataNotice).slice(0, 400);
          }
        }
      } catch (err) {
        console.error("[customer-intelligence] analyze AI failed", err);
        dataNotice = `${dataNotice} · AI 增强失败，以下为规则聚类。`;
      }
    }
  } else {
    dataNotice = `${dataNotice} · AI 未配置，仅规则痛点聚类。`;
  }

  const topProductPain = painPoints.find((p) => p.likelyProductProblem);
  const productDiagnosisHref = input.productId
    ? commerceProductExpandHref(
        input.channel === "tiktok" ? "tiktok" : "amazon",
        input.productId
      )
    : input.channel === "tiktok"
      ? "/commerce/tiktok#products"
      : "/commerce/amazon#products";

  const searchHref = commerceSearchHref(
    `${productTitle} ${topProductPain?.theme || "customer reviews"} pain points`
  );

  const createHref = commerceCreateHref({
    goal: `根据客户痛点「${topProductPain?.theme || painPoints[0]?.theme || "反馈"}」生成 FAQ / 卖点 / 内容方向（${platform}）`,
    context: buildCommerceCreateContext(
      await withStoreCreateFields(platform, {
        source:
          input.channel === "tiktok" ? "tiktok_diagnosis" : "amazon_diagnosis",
        platform,
        productTitle,
        conclusion: diagnosis,
        evidence: [
          ...painPoints.slice(0, 4).map(
            (p) =>
              `痛点：${p.theme}（${p.frequencyLabel}）${p.likelyProductProblem ? "·可能产品问题" : ""}`
          ),
          ...painPoints
            .flatMap((p) => p.evidenceSnippets)
            .slice(0, 4)
            .map((e) => `原文：${e}`),
          dataNotice,
        ],
        suggestion: recommendation,
      })
    ),
    platform,
  });

  const insight: CommerceCapabilityInsight = {
    situation: `${platform} · Customer Intelligence · ${dataLabel}`,
    evidence: [
      `样本数 ${lines.length}`,
      ...painPoints
        .slice(0, 3)
        .map((p) => `${p.theme} ×${p.frequency} · ${p.category}`),
      input.orderContext
        ? `Order context: ${input.orderContext.slice(0, 160)}`
        : null,
    ].filter(Boolean) as string[],
    diagnosis,
    opportunity,
    recommendation,
    actions: [
      { label: "搜索相关差评/竞品反馈", kind: "search", href: searchHref },
      {
        label: topProductPain ? "分析产品（商品诊断）" : "打开商品列表",
        kind: "link",
        href: productDiagnosisHref,
      },
      { label: "生成 FAQ / 内容 / 卖点", kind: "create", href: createHref },
      {
        label: "打开工作区",
        kind: "workspace",
        href: appendReturnNav("/workspace", platform),
      },
    ],
    dataNotice,
    aiAssisted,
    createdAt: new Date().toISOString(),
  };

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
          (w.name.includes("客户") || w.name.includes("Customer"))
      );
      if (hit) wsId = hit.id;
      else wsId = (await createWorkspace("客户洞察", productTitle)).id;
    }
    await addContextItem(wsId, {
      kind: "commerce_diagnosis",
      title: `Customer · ${productTitle}`,
      summary: diagnosis.slice(0, 160),
      payload: {
        type: "customer_intelligence",
        painPoints,
        clusters,
        reply,
        insight,
      },
      includedInContext: true,
    });
  } catch (err) {
    console.error("[customer-intelligence] workspace attach failed", err);
  }

  const { appliedKnowledge } = applyCommerceSkills({
    capabilityKey: "customer_intelligence",
    platform,
    marketplace: input.marketplace,
    country: input.country,
    task: "customer_review_analysis",
  });

  const { buildWorkflowBundle, buildWorkflowContext } = await import(
    "@/modules/commerce/workflow"
  );
  const wf = buildWorkflowBundle({
    scenario: "customer_pain",
    ctx: buildWorkflowContext({
      stage: "customer",
      platform,
      marketplace: input.marketplace,
      country: input.country,
      productTitle,
      productId: input.productId,
      evidence: insight.evidence,
      diagnosis: insight.diagnosis,
      opportunity: insight.opportunity,
      contentGoal: `根据客户痛点生成 FAQ / 卖点（${platform}）`,
      source: "customer",
    }),
    productDiagnosisHref,
  });

  return {
    ok: true,
    insight: {
      ...insight,
      appliedKnowledge,
      actions: wf.workflowActions.map((a) => ({
        label: a.label,
        kind:
          a.kind === "create"
            ? ("create" as const)
            : a.kind === "search"
              ? ("search" as const)
              : ("link" as const),
        href: a.href,
      })),
    },
    painPoints,
    clusters,
    reply,
    productDiagnosisHref,
    createHref: wf.createHref,
    searchHref: wf.searchHref,
    dataLabel,
    jobId: gate.jobId,
    estimatedCredits: gate.estimatedCredits,
    appliedKnowledge,
    workflowActions: wf.workflowActions,
    chainLabel: wf.chainLabel,
  };
}
