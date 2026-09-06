/**
 * Refine an existing commerce smart-analysis insight per user instruction.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import type { CommerceAnalysisInsightSlice } from "@/modules/commerce/lib/analysis-context";

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

export type RefineAnalysisInput = {
  instruction: string;
  insight: CommerceAnalysisInsightSlice;
  kind?: string;
  title?: string;
  confirm?: boolean;
  jobId?: string;
};

export type RefineAnalysisResult =
  | {
      ok: true;
      insight: CommerceAnalysisInsightSlice;
      jobId: string;
      estimatedCredits: number | null;
    }
  | {
      ok: false;
      code:
        | "confirm_required"
        | "login_required"
        | "insufficient_credits"
        | "ai_unavailable"
        | "invalid_input";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
    };

export async function refineCommerceAnalysis(
  input: RefineAnalysisInput
): Promise<RefineAnalysisResult> {
  const instruction = input.instruction.trim();
  if (!instruction) {
    return {
      ok: false,
      code: "invalid_input",
      message: "请说明希望如何修改或优化这份智能分析。",
    };
  }
  if (!input.insight?.diagnosis) {
    return {
      ok: false,
      code: "invalid_input",
      message: "当前没有可优化的智能分析，请先打开利润 / 库存 / 广告等模块。",
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
    capability: "financial_analysis",
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

  bootstrapAIProviders();
  if (!AIGateway.isAvailable("generateText")) {
    return {
      ok: false,
      code: "ai_unavailable",
      message: "AI 暂不可用，无法改写分析。可稍后重试。",
      jobId: gate.jobId,
    };
  }

  const prompt = `你是跨境电商经营顾问。用户希望按意愿修改/优化「已有智能分析」，不要另起无关新分析。
硬规则：
- 仍基于演示数据语境，不得编造未给出的精确财务数字
- 不得建议在库存不足时盲目加投
- 输出必须是对现有结论的改写或深化，呼应用户指令

分析标题：${input.title || input.kind || "智能分析"}
用户指令：${instruction}

现有分析：
现状：${input.insight.situation}
证据：
${(input.insight.evidence || []).slice(0, 8).join("\n")}
诊断：${input.insight.diagnosis}
机会：${input.insight.opportunity}
建议：${input.insight.recommendation}
备注：${input.insight.dataNotice || ""}

输出 JSON：
{
  "situation": "",
  "diagnosis": "",
  "opportunity": "",
  "recommendation": "",
  "dataNotice": "提及演示数据；说明已按用户意愿改写",
  "evidence": ["可选：1-6条补充证据要点"]
}`;

  try {
    const gen = await AIGateway.generateText(
      { prompt, maxTokens: 1100 },
      {
        accountId: account.accountId,
        jobId: gate.jobId,
        billingCapability: "financial_analysis",
        referenceType: "commerce_refine_analysis",
        quality: "balanced",
      }
    );
    const parsed = extractJsonObject(gen.text || "");
    if (!parsed) {
      return {
        ok: false,
        code: "ai_unavailable",
        message: "AI 未能解析改写结果，请换一种说法再试。",
        jobId: gate.jobId,
      };
    }

    const evidenceRaw = parsed.evidence;
    const evidence = Array.isArray(evidenceRaw)
      ? evidenceRaw.map((e) => String(e).slice(0, 200)).filter(Boolean).slice(0, 8)
      : input.insight.evidence;

    return {
      ok: true,
      jobId: gate.jobId,
      estimatedCredits: gate.estimatedCredits,
      insight: {
        situation: String(parsed.situation || input.insight.situation).slice(
          0,
          500
        ),
        evidence:
          evidence.length > 0 ? evidence : input.insight.evidence || [],
        diagnosis: String(parsed.diagnosis || input.insight.diagnosis).slice(
          0,
          800
        ),
        opportunity: String(
          parsed.opportunity || input.insight.opportunity
        ).slice(0, 600),
        recommendation: String(
          parsed.recommendation || input.insight.recommendation
        ).slice(0, 600),
        dataNotice: String(
          parsed.dataNotice ||
            "演示数据 · 已按你的意愿改写智能分析（非财务审计）。"
        ).slice(0, 400),
        aiAssisted: true,
      },
    };
  } catch (err) {
    console.error("[refine-analysis]", err);
    return {
      ok: false,
      code: "ai_unavailable",
      message: "改写失败，请稍后重试。",
      jobId: gate.jobId,
    };
  }
}
