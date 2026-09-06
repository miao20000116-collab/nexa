/**
 * Enrich rule-based commerce intelligence with optional AI (no fake accounts).
 */

import type { CommerceIntelligenceReport } from "./types";
import { stripCotObject } from "@/modules/qa/normalize-qa";

export async function maybeEnrichWithAI(
  base: Omit<CommerceIntelligenceReport, "aiAssisted" | "blockedAi" | "createdAt">
): Promise<CommerceIntelligenceReport> {
  const createdAt = new Date().toISOString();
  try {
    const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
    if (!AIGateway.isAvailable("generateText")) {
      return {
        ...base,
        aiAssisted: false,
        blockedAi: true,
        createdAt,
      };
    }

    const out = await AIGateway.generateText({
      system: `你是跨境电商经营分析助手。基于给定指标结论，用简体中文补充 1-3 条 actionable 建议。
只输出 JSON：{"diagnosis":"...","extraSuggestions":["..."]}
禁止输出思考过程。禁止声称已连接真实店铺账号。必须保留演示店语境。`,
      prompt: JSON.stringify({
        channel: base.channel,
        isDemo: true,
        demoStoreLabel: base.demoStoreLabel,
        product: base.productTitle,
        diagnosis: base.diagnosis,
        findings: base.findings.map((f) => ({
          dimension: f.dimension,
          problem: f.problem,
          evidence: f.evidence,
          suggestion: f.suggestion,
        })),
      }).slice(0, 6000),
      temperature: 0.3,
      maxTokens: 800,
    });

    const match = out.text.match(/\{[\s\S]*\}/);
    if (match) {
      const json = stripCotObject(JSON.parse(match[0]) as Record<string, unknown>);
      const diagnosis =
        typeof json.diagnosis === "string" && json.diagnosis.trim()
          ? json.diagnosis.trim()
          : base.diagnosis;
      const extras = Array.isArray(json.extraSuggestions)
        ? json.extraSuggestions.map(String).filter(Boolean).slice(0, 3)
        : [];
      const findings = [...base.findings];
      for (const s of extras) {
        findings.push({
          id: `ai_extra_${findings.length}`,
          dimension: "product",
          problem: "AI 补充建议",
          evidence: [base.diagnosis],
          suggestion: s,
          severity: "medium",
        });
      }
      return {
        ...base,
        diagnosis,
        findings,
        aiAssisted: true,
        blockedAi: false,
        createdAt,
      };
    }

    return { ...base, aiAssisted: true, blockedAi: false, createdAt };
  } catch {
    return {
      ...base,
      aiAssisted: false,
      blockedAi: true,
      createdAt,
    };
  }
}
