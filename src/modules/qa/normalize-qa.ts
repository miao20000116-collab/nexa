/**
 * Normalize QA model output: strip CoT / meta, keep only results.
 */

import type {
  ContentQAReport,
  QACheckItem,
  QAIssue,
  QAVerdict,
  QACategory,
} from "./types";
import { QA_CATEGORY_LABELS } from "./types";

const COT_KEYS = /reasoning|chain.?of.?thought|thought|analysis|scratchpad|内部思考|思考过程/i;

export function stripCotObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (COT_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function normalizeVerdict(
  passed?: boolean,
  verdict?: string | null
): QAVerdict {
  if (verdict === "PASS" || verdict === "通过") return "PASS";
  if (
    verdict === "NEEDS_REVISION" ||
    verdict === "需要修改" ||
    verdict === "FAIL"
  ) {
    return "NEEDS_REVISION";
  }
  if (typeof passed === "boolean") return passed ? "PASS" : "NEEDS_REVISION";
  return "NEEDS_REVISION";
}

export function verdictLabel(v: QAVerdict): "通过" | "需要修改" {
  return v === "PASS" ? "通过" : "需要修改";
}

function asCategory(raw: string): QACategory | null {
  const map: Record<string, QACategory> = {
    fact: "fact",
    事实: "fact",
    source: "source",
    来源: "source",
    asset: "asset",
    素材: "asset",
    copyright: "copyright",
    版权: "copyright",
    版权风险: "copyright",
    platform: "platform",
    平台: "platform",
    平台规范: "platform",
    safety: "safety",
    安全: "safety",
    commerce: "commerce",
    商业: "commerce",
    商业信息: "commerce",
  };
  return map[raw] ?? (map[raw.toLowerCase()] ?? null);
}

/** Merge AI JSON issues into structured QAIssue[] (no CoT). */
export function issuesFromAiPayload(payload: Record<string, unknown>): QAIssue[] {
  const clean = stripCotObject(payload);
  const issues: QAIssue[] = [];

  const rawIssues = Array.isArray(clean.issues)
    ? clean.issues
    : Array.isArray(clean.reasons)
      ? clean.reasons
      : [];

  rawIssues.forEach((item, i) => {
    if (typeof item === "string") {
      issues.push({
        id: `ai_${i}`,
        category: "fact",
        where: "正文内容",
        why: item,
        how: "请根据建议修改对应字段后重新质检。",
        severity: "error",
      });
      return;
    }
    if (!item || typeof item !== "object") return;
    const obj = stripCotObject(item);
    const category =
      asCategory(String(obj.category ?? obj.id ?? "fact")) ?? "fact";
    issues.push({
      id: String(obj.id ?? `ai_${i}`),
      category,
      where: String(obj.where ?? obj.field ?? QA_CATEGORY_LABELS[category]),
      why: String(obj.why ?? obj.reason ?? obj.detail ?? obj.message ?? "存在风险"),
      how: String(
        obj.how ?? obj.fix ?? obj.suggestion ?? "请修改后重新质检。"
      ),
      severity: obj.severity === "warning" ? "warning" : "error",
    });
  });

  return issues;
}

export function checksFromIssues(
  allCategories: QACategory[],
  issues: QAIssue[]
): QACheckItem[] {
  return allCategories.map((id) => {
    const related = issues.filter((i) => i.category === id);
    const hasError = related.some((i) => i.severity === "error");
    return {
      id,
      label: QA_CATEGORY_LABELS[id],
      ok: !hasError,
      detail: hasError
        ? related
            .filter((i) => i.severity === "error")
            .map((i) => i.why)
            .join("；")
        : related.length
          ? related.map((i) => i.why).join("；")
          : "未发现明显问题",
    };
  });
}

export function buildSummary(report: Pick<ContentQAReport, "verdict" | "issues">): string {
  if (report.verdict === "PASS") {
    return "质检通过：可进入预览与发布确认。";
  }
  const n = report.issues.filter((i) => i.severity === "error").length;
  return `需要修改：发现 ${n} 个需处理问题。请按「哪里 / 为什么 / 怎么改」逐项修正后再发布。`;
}
