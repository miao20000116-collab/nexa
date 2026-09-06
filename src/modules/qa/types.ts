/** V2.6 Content QA — user-facing results only (no chain-of-thought). */

export type QAVerdict = "PASS" | "NEEDS_REVISION";

export type QACategory =
  | "fact"
  | "source"
  | "asset"
  | "copyright"
  | "platform"
  | "safety"
  | "commerce";

export interface QAIssue {
  id: string;
  category: QACategory;
  /** 哪里有问题 */
  where: string;
  /** 为什么 */
  why: string;
  /** 怎么修改 */
  how: string;
  severity: "error" | "warning";
}

export interface QACheckItem {
  id: QACategory;
  label: string;
  ok: boolean;
  detail: string;
}

export interface ContentQAReport {
  projectId: string;
  platform?: string | null;
  verdict: QAVerdict;
  /** Chinese label for UI */
  verdictLabel: "通过" | "需要修改";
  checks: QACheckItem[];
  issues: QAIssue[];
  suggestions: string[];
  /** true if AI model path was unavailable; local rules still applied */
  aiAssisted: boolean;
  blockedAi: boolean;
  summary: string;
  createdAt: string;
}

export const QA_CATEGORY_LABELS: Record<QACategory, string> = {
  fact: "事实",
  source: "来源",
  asset: "素材",
  copyright: "版权风险",
  platform: "平台规范",
  safety: "安全",
  commerce: "商业信息",
};

export const QA_FLOW = ["Creation", "QA", "Preview", "Publish"] as const;
