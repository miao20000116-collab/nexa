/**
 * V4.2 — AI Decision Engine
 * Situation → Evidence → Options → Recommendation → Impact → Risk → Next Action
 * Never invent market/sales/user/competition data.
 */

import { promises as fs } from "fs";
import path from "path";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "decisions");

export type DecisionDomain = "commerce" | "content" | "product";

export interface DecisionOption {
  id: "A" | "B" | "C";
  title: string;
  pros: string[];
  risks: string[];
  cost: string;
  expectedEffect: string;
}

export interface DecisionRecord {
  id: string;
  userId: string;
  domain: DecisionDomain;
  situation: string;
  evidence: string[];
  options: DecisionOption[];
  recommendation: string;
  expectedImpact: string;
  risk: string;
  nextAction: { label: string; href: string };
  dataHonesty: "grounded" | "insufficient_evidence";
  createdAt: string;
}

function uid() {
  return `dec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function buildFallbackDecision(input: {
  userId: string;
  domain: DecisionDomain;
  situation: string;
  evidence: string[];
}): DecisionRecord {
  const evidence = input.evidence.filter(Boolean);
  const grounded = evidence.length > 0;
  const options: DecisionOption[] = [
    {
      id: "A",
      title: "稳健优化现有方案",
      pros: ["改动小", "可快速验证"],
      risks: ["提升幅度有限"],
      cost: "低 Credits / 低执行成本",
      expectedEffect: "在已有证据方向上小步改进",
    },
    {
      id: "B",
      title: "加大研究后再行动",
      pros: ["证据更充分", "降低误判"],
      risks: ["时间成本更高"],
      cost: "中 Credits（Research）",
      expectedEffect: "形成更清晰的机会判断",
    },
    {
      id: "C",
      title: "直接生成新内容方案",
      pros: ["产出快", "可马上进入创作"],
      risks: grounded ? ["可能覆盖不全"] : ["证据不足时容易跑偏"],
      cost: "中 Credits（Creation）",
      expectedEffect: "得到可测试的内容版本",
    },
  ];

  return {
    id: uid(),
    userId: input.userId,
    domain: input.domain,
    situation: input.situation,
    evidence: grounded
      ? evidence
      : ["证据不足：未提供可核验的 Search/Research/Commerce/Performance 数据，不会编造。"],
    options,
    recommendation: grounded
      ? "建议先选 A 或 B：基于现有证据小步验证，或补齐研究后再放大投入。"
      : "当前证据不足，不给出强推荐。请先补充真实数据或研究报告。",
    expectedImpact: grounded
      ? "有望降低误判并提升下一轮内容/运营决策质量"
      : "Insufficient Evidence — 无法估算真实业务影响",
    risk: grounded
      ? "若证据时效性不足，建议复核来源时间"
      : "在无证据情况下行动可能导致错误决策",
    nextAction: grounded
      ? {
          label: "进入创作验证",
          href: `/create?mode=idea&goal=${encodeURIComponent(input.situation)}`,
        }
      : {
          label: "先去做研究",
          href: `/workspace?action=research&goal=${encodeURIComponent(input.situation)}`,
        },
    dataHonesty: grounded ? "grounded" : "insufficient_evidence",
    createdAt: new Date().toISOString(),
  };
}

export async function makeDecision(input: {
  userId: string;
  domain: DecisionDomain;
  situation: string;
  evidence?: string[];
  contextText?: string;
}): Promise<DecisionRecord> {
  await ensureDir();
  const evidence = [...(input.evidence ?? [])];
  if (input.contextText?.trim()) {
    evidence.push(input.contextText.trim().slice(0, 2000));
  }

  const record = buildFallbackDecision({
    userId: input.userId,
    domain: input.domain,
    situation: input.situation,
    evidence,
  });

  if (evidence.length && AIGateway.isAvailable("generateText")) {
    try {
      const out = await AIGateway.generateText(
        {
          system: `你是决策助手。只根据给定证据输出 JSON，禁止编造市场/销售/用户/竞争数据。
字段：recommendation, expectedImpact, risk, options(数组，含 id/title/pros/risks/cost/expectedEffect)。
用简体中文。不要输出思维链。`,
          prompt: `领域：${input.domain}\n处境：${input.situation}\n证据：\n${evidence.join("\n")}`,
          temperature: 0.3,
          maxTokens: 1600,
        },
        { userId: input.userId, referenceId: record.id }
      );
      const m = out.text.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as Partial<DecisionRecord>;
        if (parsed.recommendation) record.recommendation = String(parsed.recommendation);
        if (parsed.expectedImpact) record.expectedImpact = String(parsed.expectedImpact);
        if (parsed.risk) record.risk = String(parsed.risk);
        if (Array.isArray(parsed.options) && parsed.options.length >= 2) {
          record.options = parsed.options.slice(0, 3) as DecisionOption[];
        }
      }
    } catch {
      /* keep grounded fallback — never fake */
    }
  }

  await fs.writeFile(
    path.join(DATA_DIR, `${record.id}.json`),
    JSON.stringify(record, null, 2)
  );
  return record;
}

export async function getDecision(
  id: string,
  userId: string
): Promise<DecisionRecord | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${id}.json`), "utf-8");
    const rec = JSON.parse(raw) as DecisionRecord;
    return rec.userId === userId ? rec : null;
  } catch {
    return null;
  }
}
