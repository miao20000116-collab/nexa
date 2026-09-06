/**
 * Compliance Intelligence (V4.5-E).
 *
 * Real Search for policy / IP public sources → Risk / Evidence / Reason / Recommendation.
 * Never claims "100% legal" or platform approval. Insufficient evidence → INSUFFICIENT EVIDENCE.
 */

import { getSearchOrchestrator } from "@/modules/search/services/search-orchestrator";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  commerceCreateHref,
  commerceSearchHref,
} from "@/modules/commerce/intelligence/types";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import { withStoreCreateFields } from "@/modules/commerce/lib/with-store-create-fields";
import { applyCommerceSkills } from "@/modules/commerce/skills";
import type {
  ComplianceCheckTarget,
  ComplianceEvidence,
  ComplianceIntelligenceInput,
  ComplianceIntelligenceResult,
  ComplianceRiskItem,
  ComplianceRiskType,
  ComplianceVerdict,
} from "@/modules/commerce/capability/compliance-types";
import type { CommerceCapabilityInsight } from "@/modules/commerce/capability/listing-types";

const BILLING = "compliance_check";

const FORBIDDEN_ASSURANCE =
  /100%\s*合法|保证不会侵权|平台一定允许|绝对合规|guaranteed\s*legal|will\s*not\s*infringe|platform\s*will\s*approve/i;

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

function asStringList(v: unknown, max = 6): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean).slice(0, max);
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

function scrubAssurance(text: string): string {
  if (!FORBIDDEN_ASSURANCE.test(text)) return text;
  return `${text.replace(FORBIDDEN_ASSURANCE, "[已移除不当保证]")} · Requires Review — not a legal conclusion.`;
}

function parseVerdict(raw: string): ComplianceVerdict | "INSUFFICIENT_EVIDENCE" {
  const u = raw.toUpperCase().replace(/\s+/g, "_");
  if (u.includes("INSUFFICIENT")) return "INSUFFICIENT_EVIDENCE";
  if (u.includes("HIGH")) return "HIGH_RISK";
  if (u.includes("PASS") && !u.includes("NEEDS")) return "PASS";
  if (u.includes("NEEDS") || u.includes("REVIEW")) return "NEEDS_REVIEW";
  return "NEEDS_REVIEW";
}

function parseRiskType(raw: string): ComplianceRiskType {
  const t = raw.toLowerCase();
  if (t.includes("trademark")) return "Trademark Risk";
  if (t.includes("copyright")) return "Copyright Risk";
  if (t.includes("infring")) return "Potential Infringement";
  if (t.includes("restrict")) return "Restricted Product Risk";
  if (t.includes("advert")) return "Advertising Risk";
  if (t.includes("local")) return "Localization Risk";
  return "Platform Policy Risk";
}

function parseTarget(raw: string): ComplianceCheckTarget {
  const t = raw.toLowerCase();
  if (t.includes("title")) return "Title";
  if (t.includes("desc")) return "Description";
  if (t.includes("keyword")) return "Keywords";
  if (t.includes("ad")) return "Ads";
  if (t.includes("image")) return "Image";
  if (t.includes("video")) return "Video";
  if (t.includes("list")) return "商品页";
  return "Product";
}

async function searchPolicyEvidence(
  query: string
): Promise<ComplianceEvidence[]> {
  const retrievedAt = new Date().toISOString();
  const orchestrator = getSearchOrchestrator();
  const response = await orchestrator.search(query, { includeOverview: false });
  return (response.results ?? []).slice(0, 10).map((r) => ({
    title: r.title || r.url,
    url: r.url,
    source: sourceLabel(r),
    timestamp: r.publishedAt || retrievedAt,
    snippet: r.snippet ?? r.content?.slice(0, 240) ?? null,
  }));
}

function buildSeedRisks(
  input: ComplianceIntelligenceInput,
  evidence: ComplianceEvidence[]
): ComplianceRiskItem[] {
  const scenario = input.scenario || "auto";
  const flags = input.demoFlags ?? [];
  const claims = input.demoClaimRisks ?? [];
  const listingBlob = [
    input.title,
    input.description,
    input.listingText,
    input.keywords,
    input.adsNotes,
    input.imageNotes,
    input.videoNotes,
    ...claims,
  ]
    .filter(Boolean)
    .join("\n");

  const items: ComplianceRiskItem[] = [];
  const attachEvidence = (n: number) => evidence.slice(0, n);

  if (scenario === "insufficient" || (scenario === "auto" && evidence.length === 0 && !listingBlob.trim() && !flags.length)) {
    return [
      {
        risk: "Platform Policy Risk",
        target: "Product",
        verdict: "INSUFFICIENT_EVIDENCE",
        evidence: [],
        reason: "INSUFFICIENT EVIDENCE — 无足够公开政策来源或待检文案。",
        recommendation: "补充 商品页 / 广告文案，并搜索平台官方政策后再审。",
      },
    ];
  }

  if (scenario === "high" || flags.includes("ip_risk") || /logo|商标|patent|侵权/i.test(listingBlob)) {
    items.push({
      risk: "Trademark Risk",
      target: "Image",
      verdict: "HIGH_RISK",
      evidence: attachEvidence(3),
      reason:
        claims.find((c) => /商标|logo|专利/i.test(c)) ||
        "演示/用户材料提示商标或外观近似风险（非法律结论）。",
      recommendation: "暂停使用争议图文；深入研究官方商标/IP 公开库与平台 IP 政策。",
    });
  }

  if (
    scenario === "high" ||
    scenario === "mid" ||
    flags.includes("restricted_claim") ||
    /cure|治疗|FDA|medical|guarantee/i.test(listingBlob)
  ) {
    items.push({
      risk: "Restricted Product Risk",
      target: "Description",
      verdict: scenario === "high" ? "HIGH_RISK" : "NEEDS_REVIEW",
      evidence: attachEvidence(3),
      reason:
        claims.find((c) => /宣称|claim|医疗|FDA/i.test(c)) ||
        "文案可能含受限功效宣称，需对照平台与监管公开规则。",
      recommendation: "删除或改写受限宣称；用 QA 再检，勿保证过审。",
    });
  }

  if (flags.includes("image_policy") || scenario === "mid") {
    items.push({
      risk: "Platform Policy Risk",
      target: "Image",
      verdict: "NEEDS_REVIEW",
      evidence: attachEvidence(2),
      reason: "图片政策 / 展示规范可能不适配目标市场（演示信号或用户备注）。",
      recommendation: "对照平台官方图片政策修订主图与对比图。",
    });
  }

  if (input.adsNotes?.trim() || /广告|ads|PPC/i.test(listingBlob)) {
    items.push({
      risk: "Advertising Risk",
      target: "Ads",
      verdict: "NEEDS_REVIEW",
      evidence: attachEvidence(2),
      reason: "广告文案需单独对照广告政策；当前仅为筛查建议。",
      recommendation: "广告上线前人工复核；证据不足处标 INSUFFICIENT EVIDENCE。",
    });
  }

  if (scenario === "low" && items.length === 0) {
    items.push({
      risk: "Localization Risk",
      target: "商品页",
      verdict: evidence.length ? "PASS" : "NEEDS_REVIEW",
      evidence: attachEvidence(2),
      reason: evidence.length
        ? "公开检索未见明显高风险命中；仍非「保证合法」。"
        : "INSUFFICIENT EVIDENCE for full clearance.",
      recommendation: "低风险仍建议抽检 Title/Claims；Creation → Compliance → QA → Publish。",
    });
  }

  if (items.length === 0) {
    items.push({
      risk: "Platform Policy Risk",
      target: "商品页",
      verdict: evidence.length ? "NEEDS_REVIEW" : "INSUFFICIENT_EVIDENCE",
      evidence: attachEvidence(2),
      reason: evidence.length
        ? "有公开政策线索但不足以出具通过结论。"
        : "INSUFFICIENT EVIDENCE",
      recommendation: "补充材料并深入研究平台官方政策。",
    });
  }

  // Acceptance: never return all PASS when mid/high/demo risks present
  if (scenario === "low" && items.every((i) => i.verdict === "PASS") === false) {
    /* ok */
  }

  return items.map((i) => ({
    ...i,
    reason: scrubAssurance(i.reason),
    recommendation: scrubAssurance(i.recommendation),
  }));
}

function overallFromRisks(
  risks: ComplianceRiskItem[]
): ComplianceVerdict | "INSUFFICIENT_EVIDENCE" {
  if (risks.some((r) => r.verdict === "HIGH_RISK")) return "HIGH_RISK";
  if (risks.every((r) => r.verdict === "INSUFFICIENT_EVIDENCE")) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (risks.some((r) => r.verdict === "NEEDS_REVIEW" || r.verdict === "INSUFFICIENT_EVIDENCE")) {
    return "NEEDS_REVIEW";
  }
  if (risks.length && risks.every((r) => r.verdict === "PASS")) return "PASS";
  return "NEEDS_REVIEW";
}

function parseAiRisks(
  parsed: Record<string, unknown>,
  fallback: ComplianceRiskItem[],
  evidence: ComplianceEvidence[]
): ComplianceRiskItem[] {
  const raw = Array.isArray(parsed.risks) ? parsed.risks : [];
  if (!raw.length) return fallback;

  return raw.slice(0, 8).map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<
      string,
      unknown
    >;
    const idxs = asStringList(r.evidenceIndexes ?? r.evidenceIds, 4)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n >= 0 && n < evidence.length);
    const ev =
      idxs.length > 0
        ? idxs.map((i) => evidence[i])
        : Array.isArray(r.evidenceUrls)
          ? evidence.filter((e) =>
              (r.evidenceUrls as unknown[]).map(String).includes(e.url)
            )
          : evidence.slice(0, 2);

    return {
      risk: parseRiskType(String(r.risk || r.type || "")),
      target: parseTarget(String(r.target || "Product")),
      verdict: parseVerdict(String(r.verdict || "NEEDS_REVIEW")),
      evidence: ev.length ? ev : [],
      reason: scrubAssurance(
        String(r.reason || "INSUFFICIENT EVIDENCE").slice(0, 500)
      ),
      recommendation: scrubAssurance(
        String(r.recommendation || "Requires Review").slice(0, 500)
      ),
    };
  });
}

export async function runComplianceIntelligence(
  input: ComplianceIntelligenceInput
): Promise<ComplianceIntelligenceResult> {
  const productTitle =
    input.productTitle?.trim() ||
    input.title?.trim() ||
    "";
  if (!productTitle && !(input.listingText || input.description || input.demoFlags?.length)) {
    return {
      ok: false,
      code: "invalid_input",
      message: "请提供商品名称或 商品页 / 广告待检文案",
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
  const title = productTitle || "（未命名商品）";

  // Load demo seed risks when productId present and flags not passed
  let demoFlags = input.demoFlags ?? [];
  let demoClaimRisks = input.demoClaimRisks ?? [];
  if ((!demoFlags.length || !demoClaimRisks.length) && input.channel === "amazon") {
    try {
      const { getComplianceOverview } = await import(
        "@/modules/commerce/amazon/service"
      );
      const overview = await getComplianceOverview();
      const row = input.productId
        ? overview.rows.find((r) => r.productId === input.productId)
        : overview.rows[0];
      if (row) {
        if (!demoFlags.length) demoFlags = row.flags;
        if (!demoClaimRisks.length) demoClaimRisks = row.claimRisks;
      }
    } catch {
      /* soft */
    }
  }
  if ((!demoFlags.length || !demoClaimRisks.length) && input.channel === "tiktok") {
    try {
      const { getTikTokComplianceOverview } = await import(
        "@/modules/commerce/tiktok/service"
      );
      const overview = await getTikTokComplianceOverview();
      const row = input.productId
        ? overview.rows.find((r) => r.productId === input.productId)
        : overview.rows[0];
      if (row) {
        if (!demoFlags.length) demoFlags = row.flags;
        if (!demoClaimRisks.length) demoClaimRisks = row.claimRisks;
      }
    } catch {
      /* soft */
    }
  }

  const enrichedInput: ComplianceIntelligenceInput = {
    ...input,
    demoFlags,
    demoClaimRisks,
    productTitle: title,
  };

  let evidence: ComplianceEvidence[] = [];
  let searchFailed = false;
  if (input.scenario !== "insufficient") {
    try {
      const q = [
        platform,
        marketplace,
        country,
        title,
        "official policy prohibited claims trademark IP advertising rules",
      ]
        .filter(Boolean)
        .join(" ");
      evidence = await searchPolicyEvidence(q);
    } catch (err) {
      console.error("[compliance-check] search failed", err);
      searchFailed = true;
    }
  }

  let risks = buildSeedRisks(enrichedInput, evidence);
  let aiAssisted = false;
  let dataNotice =
    "Requires Review — AI / rule screening only. Not a legal opinion. Never guarantees platform approval.";

  bootstrapAIProviders();
  if (
    AIGateway.isAvailable("generateText") &&
    input.scenario !== "insufficient"
  ) {
    const evidenceBlock = evidence
      .map(
        (e, i) =>
          `[${i}] ${e.title}\nSource: ${e.source} · ${e.timestamp}\nURL: ${e.url}\n${(e.snippet || "").slice(0, 200)}`
      )
      .join("\n\n");

    const material = [
      `Title: ${input.title || title}`,
      input.description ? `Description: ${input.description.slice(0, 600)}` : null,
      input.listingText ? `商品页：${input.listingText.slice(0, 600)}` : null,
      input.keywords ? `Keywords: ${input.keywords}` : null,
      input.adsNotes ? `Ads: ${input.adsNotes}` : null,
      input.imageNotes ? `Images: ${input.imageNotes}` : null,
      input.videoNotes ? `Video: ${input.videoNotes}` : null,
      demoFlags.length ? `演示标记: ${demoFlags.join(", ")}` : null,
      demoClaimRisks.length
        ? `演示宣称风险: ${demoClaimRisks.join("；")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `${
      applyCommerceSkills({
        capabilityKey: "compliance_check",
        platform,
        marketplace,
        country,
        task: "compliance_check",
      }).promptBlock
    }\n你是跨境电商合规筛查助手（非律师）。只能基于公开检索证据与用户材料标记风险。
禁止输出：「100%合法」「保证不会侵权」「平台一定允许」。
证据不足的条目 verdict 必须为 INSUFFICIENT_EVIDENCE。
verdict 只能是：PASS | NEEDS_REVIEW | HIGH_RISK | INSUFFICIENT_EVIDENCE
不要把所有项都标 PASS。

平台：${platform} · ${marketplace} · ${country}
商品：${title}

【待检材料】
${material || "none"}

【公开检索证据】
${evidenceBlock || "(无 — 请多用 INSUFFICIENT_EVIDENCE)"}

输出 JSON：
{
  "overallVerdict": "PASS|NEEDS_REVIEW|HIGH_RISK|INSUFFICIENT_EVIDENCE",
  "risks": [
    {
      "risk": "Trademark Risk|Copyright Risk|Potential Infringement|Platform Policy Risk|Restricted Product Risk|Advertising Risk|Localization Risk",
      "target": "Product|Listing|Title|Description|Keywords|Ads|Image|Video",
      "verdict": "PASS|NEEDS_REVIEW|HIGH_RISK|INSUFFICIENT_EVIDENCE",
      "evidenceIndexes": [0],
      "reason": "",
      "recommendation": ""
    }
  ],
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": "必须声明非法律结论"
}`;

    try {
      const gen = await AIGateway.generateText(
        { prompt, maxTokens: 1800 },
        {
          accountId: account.accountId,
          jobId: gate.jobId,
          billingCapability: BILLING,
          referenceType: "compliance_check",
          quality: "balanced",
        }
      );
      const parsed = extractJsonObject(gen.text || "");
      aiAssisted = true;
      if (parsed) {
        risks = parseAiRisks(parsed, risks, evidence);
        if (parsed.dataNotice) {
          dataNotice = scrubAssurance(String(parsed.dataNotice).slice(0, 400));
        }
      }
    } catch (err) {
      console.error("[compliance-check] AI failed", err);
      dataNotice = `${dataNotice} · AI 增强失败，保留规则筛查。`;
    }
  } else if (!AIGateway.isAvailable("generateText")) {
    dataNotice = `${dataNotice} · AI 未配置，规则 + 公开检索筛查。`;
  }

  // Force diversity: if somehow all PASS with demo high flags, escalate
  if (
    (demoFlags.includes("ip_risk") || enrichedInput.scenario === "high") &&
    risks.every((r) => r.verdict === "PASS")
  ) {
    risks = buildSeedRisks(
      { ...enrichedInput, scenario: "high" },
      evidence
    );
  }

  const overallVerdict =
    input.scenario === "insufficient"
      ? "INSUFFICIENT_EVIDENCE"
      : overallFromRisks(risks);

  const high = risks.filter((r) => r.verdict === "HIGH_RISK");
  const diagnosis =
    overallVerdict === "INSUFFICIENT_EVIDENCE"
      ? "INSUFFICIENT EVIDENCE — 无法出具合规通过结论。"
      : overallVerdict === "HIGH_RISK"
        ? `发现 ${high.length || risks.length} 项高风险信号（非法律判决）。`
        : overallVerdict === "PASS"
          ? "公开证据下未见明显高风险；仍非保证合法 / 过审。"
          : "存在需人工复核的合规信号（NEEDS_REVIEW）。";

  const topRisk = high[0] || risks[0];
  const searchHref = commerceSearchHref(
    `${platform} ${title} ${topRisk?.risk || "policy"} official`
  );

  const createHref = commerceCreateHref({
    goal: `按合规建议改写「${title}」商品页 / 广告文案（${platform}）`,
    context: buildCommerceCreateContext(
      await withStoreCreateFields(platform, {
        source:
          input.channel === "tiktok" ? "tiktok_diagnosis" : "amazon_diagnosis",
        platform,
        productTitle: title,
        conclusion: diagnosis,
        evidence: risks.slice(0, 5).map(
          (r) =>
            `${r.verdict} · ${r.risk} · ${r.target}：${r.reason.slice(0, 120)}`
        ),
        suggestion: topRisk?.recommendation || "先改高风险项再 QA",
        complianceRisks: risks.map((r) => `${r.risk}:${r.verdict}`),
      })
    ),
    platform,
  });

  const qaHref = appendReturnNav(
    `/create?mode=commerce&goal=${encodeURIComponent(
      `对「${title}」做合规改写后的内容 QA`
    )}&commerceContext=${encodeURIComponent(
      [
        `overall: ${overallVerdict}`,
        ...risks.slice(0, 4).map((r) => `${r.risk}: ${r.reason}`),
        dataNotice,
      ].join("\n")
    )}`,
    platform
  );

  let researchHref: string | null = null;
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
          (w.name.includes("合规") || w.name.includes("Compliance"))
      );
      if (hit) wsId = hit.id;
      else wsId = (await createWorkspace("合规研究", title)).id;
    }
    await addContextItem(wsId, {
      kind: "commerce_diagnosis",
      title: `Compliance · ${title}`,
      summary: diagnosis.slice(0, 160),
      url: searchHref,
      payload: {
        type: "compliance_check",
        overallVerdict,
        risks,
        product: title,
        platform,
        country,
        evidence,
      },
      includedInContext: true,
    });
    researchHref = `/workspace/${wsId}/research?goal=${encodeURIComponent(
      `${title} ${platform} ${country} ${topRisk?.risk || "compliance"} risk evidence`
    )}`;
  } catch (err) {
    console.error("[compliance-check] workspace attach failed", err);
  }

  const dataLabel =
    overallVerdict === "INSUFFICIENT_EVIDENCE"
      ? ("INSUFFICIENT EVIDENCE" as const)
      : evidence.length
        ? ("SEARCH EVIDENCE" as const)
        : demoFlags.length || demoClaimRisks.length
          ? ("演示数据" as const)
          : ("用户输入" as const);

  const insight: CommerceCapabilityInsight = {
    situation: `${platform} · Compliance · ${overallVerdict}`,
    evidence: [
      `Overall: ${overallVerdict}`,
      ...risks.slice(0, 4).map((r) => `${r.verdict} · ${r.risk} · ${r.target}`),
      evidence[0]
        ? `Source: ${evidence[0].source} · ${evidence[0].url}`
        : searchFailed
          ? "公开检索失败"
          : "无公开证据 URL",
    ],
    diagnosis,
    opportunity:
      overallVerdict === "HIGH_RISK"
        ? "优先处理高风险项并深入研究官方政策 / IP 来源"
        : "合规改写后进入 QA 与发布预览",
    recommendation: scrubAssurance(
      topRisk?.recommendation || "Creation → Compliance → QA → Publish"
    ),
    actions: [
      { label: "搜索官方政策 / IP", kind: "search", href: searchHref },
      ...(researchHref
        ? [
            {
              label: "深入研究",
              kind: "workspace" as const,
              href: researchHref,
            },
          ]
        : []),
      { label: "合规改写创作", kind: "create", href: createHref },
      { label: "内容 QA", kind: "qa", href: qaHref },
      { label: "发布预览", kind: "publish", href: "/publish" },
    ],
    dataNotice,
    aiAssisted,
    createdAt: new Date().toISOString(),
  };

  void searchFailed;

  const { appliedKnowledge } = applyCommerceSkills({
    capabilityKey: "compliance_check",
    platform,
    marketplace,
    country,
    task: "compliance_check",
  });

  const { buildWorkflowBundle, buildWorkflowContext } = await import(
    "@/modules/commerce/workflow"
  );
  const wf = buildWorkflowBundle({
    scenario: "compliance_issue",
    ctx: buildWorkflowContext({
      stage: "compliance",
      platform,
      marketplace,
      country,
      productTitle: title,
      productId: input.productId,
      evidence: insight.evidence,
      diagnosis: insight.diagnosis,
      opportunity: insight.opportunity,
      contentGoal: `按合规建议改写「${title}」`,
      source: "compliance",
    }),
    researchHref,
  });

  return {
    ok: true,
    overallVerdict,
    insight: {
      ...insight,
      appliedKnowledge,
      actions: wf.workflowActions.map((a) => ({
        label: a.label,
        kind:
          a.kind === "create"
            ? ("create" as const)
            : a.kind === "qa"
              ? ("qa" as const)
              : a.kind === "publish"
                ? ("publish" as const)
                : a.kind === "search"
                  ? ("search" as const)
                  : ("link" as const),
        href: a.href,
      })),
    },
    risks,
    researchHref: wf.researchHref,
    createHref: wf.createHref,
    qaHref: wf.qaHref,
    publishHref: wf.publishHref,
    searchHref: wf.searchHref,
    dataLabel,
    jobId: gate.jobId,
    estimatedCredits: gate.estimatedCredits,
    appliedKnowledge,
    workflowActions: wf.workflowActions,
    chainLabel: wf.chainLabel,
  };
}
